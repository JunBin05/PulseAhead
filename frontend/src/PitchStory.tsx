import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { clock } from './Forecast';
import { IconPlay, IconReset } from './icons';
import type { DemoController } from './Demo';
import { ZONE_NAMES, type ComparisonRow, type ForecastAlert } from './types';

/**
 * The pitch story in three short steps, in the same order as the deck: it looks fine, small delays
 * stack up, then the early warning appears and the story stops so the presenter can open the fixes.
 * Every figure is read from the real backend (demo case, forecast, driver evidence, action comparison);
 * if any of it is missing the story says so instead of inventing it.
 */
const SAMPLES = 50;
const STEP_MS = { surface: 2600, delays: 3000 } as const;

type Phase = 'idle' | 'loading' | 'surface' | 'delays' | 'alert' | 'fixes' | 'error';

interface Surface {
  inEd: number;
  free: string;
  status: string;
  at: string;
}
interface Delay {
  title: string;
  text: string;
}
interface AlertInfo {
  zone: number;
  zoneName: string;
  minutes: number | null;
  low: number | null;
  high: number | null;
  chance: number | null;
  bottleneck: string;
  fix: string | null;
  owner: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const rowName = (r: ComparisonRow): string => r.name;

export function PitchStory({ ctl, kick }: { ctl: DemoController; kick: number }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [surface, setSurface] = useState<Surface | null>(null);
  const [delays, setDelays] = useState<Delay[]>([]);
  const [alert, setAlert] = useState<AlertInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const runId = useRef(0);
  const lastKick = useRef(0);

  const run = useCallback(async () => {
    const id = ++runId.current;
    const live = () => runId.current === id;
    setPhase('loading');
    setSurface(null);
    setDelays([]);
    setAlert(null);
    setMessage(null);
    try {
      const demo = await api.demoCase();
      if (!demo.available || !demo.scenario || demo.seed === undefined || demo.alert_time_min === undefined) {
        setMessage(demo.reason ?? 'No demo case is available right now, so there is no early warning to show.');
        setPhase('error');
        return;
      }
      let s = await api.create(demo.scenario, demo.seed);
      ctl.adopt(s, true);
      while (live() && s.sim_time_min < demo.alert_time_min - 1e-6) {
        s = await api.advance(s.replay_id, Math.min(30, demo.alert_time_min - s.sim_time_min), s.version);
        ctl.adopt(s, false);
      }
      if (!live()) return;

      // Everything the popup needs is fetched while the first two steps are on screen.
      const forecastP = api.forecast(s.replay_id, SAMPLES);
      const driversP = api.demoDrivers(s.replay_id, s.version);
      const compareP = api.compare(s.replay_id, SAMPLES, s.version);
      const sp = s.resources.ed_spaces;
      setSurface({
        inEd: s.counts.in_ed,
        free: sp.available_staffed === null ? 'n/a' : `${sp.available_staffed}`,
        status: s.overall_status.label,
        at: clock(s.sim_time_min),
      });
      setPhase('surface');
      await sleep(STEP_MS.surface);
      if (!live()) return;

      const drivers = await driversP;
      const cards: Delay[] = [];
      for (const dr of drivers.drivers) {
        const e = dr.evidence as Record<string, unknown>;
        if (dr.id === 'boarding') {
          cards.push({ title: 'Ward is full', text: `${e.boarding_patients} admitted patients cannot leave the ED` });
        } else if (dr.id === 'diagnostics') {
          const svcs = e.services as { name: string; queue: number }[];
          const worst = [...svcs].sort((a, b) => b.queue - a.queue)[0];
          if (worst) cards.push({ title: `${worst.name} is slowing`, text: `${worst.queue} patients are waiting for it` });
        } else if (dr.id === 'arrivals') {
          cards.push({
            title: 'More arrivals coming',
            text: `${e.patients} patients on ${e.ambulances} ambulance${e.ambulances === 1 ? '' : 's'} due within ${e.window_min} min`,
          });
        }
      }
      setDelays(cards);
      setPhase('delays');
      await sleep(STEP_MS.delays);
      if (!live()) return;

      const [f, cmp] = await Promise.all([forecastP, compareP]);
      if (!live()) return;
      const a: ForecastAlert | undefined = f.alerts.actionable.find(
        (x) => x.service === demo.service && x.kind === 'forecast_risk',
      );
      if (!a) {
        setMessage('At this moment the forecast shows no early warning, so the story stops here instead of inventing one.');
        setPhase('error');
        return;
      }
      const listed = cmp.status === 'ok' ? cmp.actions.filter((x) => x.comparison) : [];
      const top = listed.find((x) => x.rank?.label === 'best_action') ?? listed.find((x) => x.rank?.label === 'supported_not_top') ?? null;
      setAlert({
        zone: a.zone,
        zoneName: ZONE_NAMES[a.zone] ?? a.name,
        minutes: a.onset ? Math.round(a.onset.expected_in_min) : null,
        low: a.onset ? Math.round(a.onset.low_in_min ?? 0) : null,
        high: a.onset ? Math.round(a.onset.high_in_min ?? 0) : null,
        chance: a.chance ?? null,
        bottleneck: a.category_label,
        fix: top ? rowName(top) : null,
        owner: top ? top.owners[0] : null,
      });
      // The story now waits for a click. The map stays on the overview so the whole department is visible.
      setPhase('alert');
    } catch (e) {
      if (!live()) return;
      setMessage(e instanceof Error ? e.message : 'The demo could not start. Please try again.');
      setPhase('error');
    }
  }, [ctl]);

  useEffect(() => {
    if (kick > 0 && kick !== lastKick.current) {
      lastKick.current = kick;
      void run();
    }
  }, [kick, run]);

  const seeFixes = () => {
    setPhase('fixes');
    if (alert) ctl.focusZone(alert.zone);
    ctl.openCompare();
  };

  const running = phase === 'loading' || phase === 'surface' || phase === 'delays';
  const stepState = (n: 1 | 2 | 3): 'todo' | 'now' | 'done' => {
    const order: Phase[] = ['loading', 'surface', 'delays', 'alert', 'fixes'];
    const i = order.indexOf(phase);
    const at = n === 1 ? 1 : n === 2 ? 2 : 3;
    if (i < 0) return 'todo';
    if (i === at) return 'now';
    return i > at ? 'done' : 'todo';
  };

  return (
    <div className="pitch" data-testid="pitch-story" data-phase={phase}>
      <div className="pitch-head">
        <h2>The story in 10 seconds</h2>
        <p className="muted">From “looks fine” to an early warning, using the live simulation.</p>
      </div>

      <ol className="pitch-steps">
        <li className="pitch-step" data-state={stepState(1)}>
          <span className="pitch-num">1</span>
          <div>
            <strong>It looks fine</strong>
            {surface ? (
              <div className="pitch-chips" data-testid="pitch-surface">
                <span>{surface.inEd} patients in the ED</span>
                <span>{surface.free} free staffed spaces</span>
                <span>Status: {surface.status}</span>
              </div>
            ) : (
              <p className="muted">What a screen on the wall would show.</p>
            )}
          </div>
        </li>
        <li className="pitch-step" data-state={stepState(2)}>
          <span className="pitch-num">2</span>
          <div>
            <strong>Small delays stack up</strong>
            {delays.length > 0 ? (
              <ul className="pitch-delays" data-testid="pitch-delays">
                {delays.map((d) => (
                  <li key={d.title}>
                    <b>{d.title}</b>
                    <span>{d.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Behind the scenes, pressures build.</p>
            )}
          </div>
        </li>
        <li className="pitch-step" data-state={stepState(3)}>
          <span className="pitch-num">3</span>
          <div>
            <strong>PulseAhead warns early</strong>
            <p className="muted">
              {phase === 'alert' || phase === 'fixes' ? 'The warning is on screen. Open it to see what to do.' : 'The alert appears before the zone turns red.'}
            </p>
          </div>
        </li>
      </ol>

      {message && (
        <p className="pitch-note" role="status">
          {message}
        </p>
      )}

      <div className="pitch-actions">
        {phase === 'idle' || phase === 'error' ? (
          <button className="btn btn-primary btn-hero" onClick={() => void run()} data-testid="pitch-start">
            <IconPlay /> Start the demo
          </button>
        ) : (
          <>
            {phase === 'alert' && (
              <button className="btn btn-primary" onClick={seeFixes} data-testid="pitch-open-alert">
                Open the warning
              </button>
            )}
            <button className="btn" onClick={() => void run()} disabled={phase === 'loading'} data-testid="pitch-restart">
              <IconReset /> Run it again
            </button>
          </>
        )}
      </div>
      {running && (
        <p className="muted pitch-wait" role="status">
          {phase === 'loading' ? 'Setting up a busy afternoon…' : 'Playing the story…'}
        </p>
      )}

      {phase === 'alert' && alert &&
        createPortal(
          <div className="alert-popup-backdrop" role="presentation">
            <section className="alert-popup" role="alertdialog" aria-labelledby="alert-popup-title" data-testid="alert-popup">
              <span className="alert-pill">ALERT</span>
              <h2 id="alert-popup-title">
                {alert.minutes !== null ? `Overload in about ${alert.minutes} min` : 'Overload is likely soon'}
              </h2>
              <p className="alert-popup-where">
                Zone {alert.zone} · {alert.zoneName}
                {alert.chance !== null ? ` · ${Math.round(alert.chance * 100)}% chance` : ''}
              </p>
              <div className="alert-popup-fix">
                <span>Fix first</span>
                <strong>{alert.fix ?? 'No action is shown to help right now'}</strong>
                {alert.owner && <em>Approved by: {alert.owner}</em>}
              </div>
              <ul className="alert-popup-points">
                {alert.low !== null && alert.high !== null && (
                  <li>Time left before overload: {alert.minutes} min (between {alert.low} and {alert.high})</li>
                )}
                <li>What is holding things up: {alert.bottleneck}</li>
                <li>The overall ED is still “{surface?.status ?? 'Stable'}”. This is a local warning.</li>
              </ul>
              <div className="alert-popup-buttons">
                <button className="btn btn-primary btn-hero" onClick={seeFixes} autoFocus data-testid="alert-popup-open">
                  See the fixes
                </button>
                <button className="btn" onClick={() => setPhase('fixes')}>
                  Not now
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
