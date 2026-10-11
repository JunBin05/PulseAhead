import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { clock } from './Forecast';
import type { DemoController } from './Demo';
import { ZONE_NAMES, type ComparisonRow, type Forecast, type ForecastAlert, type Snapshot } from './types';

/**
 * The pitch story in the order of the deck: it looks fine, small delays stack up, PulseAhead warns
 * early (the story stops there until someone opens it), fix first, act and watch, evidence.
 * Every figure comes from the real backend; if something is missing the story says so.
 *
 * The case is a mixed-cascade shift on a tuning seed where the forecast warns while every zone is
 * still normal. If the backend does not confirm that at run time, the backend's own demo case is used.
 */
const SAMPLES = 50;
const COORDINATOR = 'ED shift coordinator';
const PITCH_CASE = { scenario: 'mixed-cascade', seed: 1052, atMin: 120, label: 'Mixed cascade · tuning seed 1052' };
/** Time each of the first two beats stays on screen before the alert appears (about 9 s in total). */
const BEAT_MS = { surface: 4200, delays: 4800 } as const;

const BEATS = [
  { id: 'A', name: 'It looks fine' },
  { id: 'B', name: 'Small delays stack up' },
  { id: 'C', name: 'PulseAhead warns early' },
  { id: 'D', name: 'Fix first' },
  { id: 'E', name: 'Act and watch' },
  { id: 'F', name: 'Evidence and limits' },
] as const;

type Phase = 'idle' | 'loading' | 'running' | 'alert' | 'ready' | 'acting' | 'error';

interface Surface { inEd: number; free: string; status: string }
interface Delay { title: string; text: string }
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
  timing: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const redZones = (s: Snapshot): number[] => s.pressure.zones.filter((z) => z.state === 'overloaded').map((z) => z.zone);

export function PitchStory({ ctl, kick, onOpenEvidence }: { ctl: DemoController; kick: number; onOpenEvidence: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [beat, setBeat] = useState(0);
  const [surface, setSurface] = useState<Surface | null>(null);
  const [delays, setDelays] = useState<Delay[]>([]);
  const [alert, setAlert] = useState<AlertInfo | null>(null);
  const [acted, setActed] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const runId = useRef(0);
  const lastKick = useRef(0);
  const top = useRef<ComparisonRow | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const skipRef = useRef(false);

  const adopt = useCallback((s: Snapshot, fresh: boolean) => {
    snapRef.current = s;
    ctl.adopt(s, fresh);
  }, [ctl]);

  /** Advance a fresh replay to `atMin` in the 30-minute steps the API allows. */
  const play = useCallback(async (scenario: string, seed: number, atMin: number, live: () => boolean) => {
    let s = await api.create(scenario, seed);
    adopt(s, true);
    while (live() && s.sim_time_min < atMin - 1e-6) {
      s = await api.advance(s.replay_id, Math.min(30, atMin - s.sim_time_min), s.version);
      adopt(s, false);
    }
    return s;
  }, [adopt]);

  const run = useCallback(async () => {
    const id = ++runId.current;
    const live = () => runId.current === id;
    setPhase('loading');
    setBeat(0);
    setSurface(null);
    setDelays([]);
    setAlert(null);
    setActed(null);
    setMessage(null);
    setAuto(false);
    top.current = null;
    try {
      // 1. The pitch case, if the backend confirms an early warning with no red zone; else its demo case.
      let s = await play(PITCH_CASE.scenario, PITCH_CASE.seed, PITCH_CASE.atMin, live);
      if (!live()) return;
      let f: Forecast = await api.forecast(s.replay_id, SAMPLES);
      let a: ForecastAlert | undefined = f.alerts.actionable.find((x) => x.kind === 'forecast_risk');
      if (!a || redZones(s).length > 0) {
        const demo = await api.demoCase();
        if (!demo.available || !demo.scenario || demo.seed === undefined || demo.alert_time_min === undefined) {
          setMessage(demo.reason ?? 'No demo case is available right now, so there is no early warning to show.');
          setPhase('error');
          return;
        }
        s = await play(demo.scenario, demo.seed, demo.alert_time_min, live);
        if (!live()) return;
        f = await api.forecast(s.replay_id, SAMPLES);
        a = f.alerts.actionable.find((x) => x.service === demo.service && x.kind === 'forecast_risk');
      }
      if (!live()) return;
      if (!a) {
        setMessage('At this moment the forecast shows no early warning, so the story stops here instead of inventing one.');
        setPhase('error');
        return;
      }
      const alertRow = a;

      // 2. Fetch what the later beats need while the first two are on screen.
      const driversP = api.demoDrivers(s.replay_id, s.version);
      const compareP = api.compare(s.replay_id, SAMPLES, s.version);
      const sp = s.resources.ed_spaces;
      setSurface({
        inEd: s.counts.in_ed,
        free: sp.available_staffed === null ? 'n/a' : `${sp.available_staffed}`,
        status: s.overall_status.label,
      });
      setPhase('running');
      setBeat(0);
      if (!skipRef.current) await sleep(BEAT_MS.surface);
      if (!live()) return;

      const drivers = await driversP;
      const cards: Delay[] = [];
      for (const dr of drivers.drivers) {
        const e = dr.evidence as Record<string, unknown>;
        if (dr.id === 'boarding') {
          cards.push({ title: 'The ward is full', text: `${e.boarding_patients} admitted patients cannot leave the ED` });
        } else if (dr.id === 'diagnostics') {
          const svcs = e.services as { name: string; queue: number; received_per_hour: number | null; capacity_per_hour: number | null; demand_above_capacity: boolean }[];
          const worst = [...svcs].sort((x, y) => y.queue - x.queue)[0];
          if (worst) {
            const over = worst.demand_above_capacity && worst.received_per_hour !== null && worst.capacity_per_hour !== null;
            cards.push({
              title: `${worst.name} is slowing down`,
              text: over
                ? `${worst.queue} waiting. Requests arrive at ${worst.received_per_hour} an hour; it can handle ${worst.capacity_per_hour}.`
                : `${worst.queue} patients are waiting for it`,
            });
          }
        } else if (dr.id === 'arrivals') {
          cards.push({
            title: 'More arrivals are coming',
            text: `${e.patients} patients on ${e.ambulances} ambulance${e.ambulances === 1 ? '' : 's'} due within ${e.window_min} min`,
          });
        }
      }
      setDelays(cards);
      setBeat(1);
      if (!skipRef.current) await sleep(BEAT_MS.delays);
      if (!live()) return;

      const cmp = await compareP;
      if (!live()) return;
      const listed = cmp.status === 'ok' ? cmp.actions.filter((x) => x.comparison) : [];
      const best = listed.find((x) => x.rank?.label === 'best_action') ?? listed.find((x) => x.rank?.label === 'supported_not_top') ?? null;
      top.current = best;
      setAlert({
        zone: alertRow.zone,
        zoneName: ZONE_NAMES[alertRow.zone] ?? alertRow.name,
        minutes: alertRow.onset ? Math.round(alertRow.onset.expected_in_min) : null,
        low: alertRow.onset ? Math.round(alertRow.onset.low_in_min ?? 0) : null,
        high: alertRow.onset ? Math.round(alertRow.onset.high_in_min ?? 0) : null,
        chance: alertRow.chance ?? null,
        bottleneck: alertRow.category_label,
        fix: best ? best.name : null,
        owner: best ? best.owners[0] : null,
        timing: best ? `review ${best.review_min} min, setup ${best.setup_min} min` : null,
      });
      setBeat(2);
      setPhase('alert');
    } catch (e) {
      if (runId.current !== id) return;
      setMessage(e instanceof Error ? e.message : 'The demo could not start. Please try again.');
      setPhase('error');
    }
  }, [play]);

  useEffect(() => {
    if (kick > 0 && kick !== lastKick.current) {
      lastKick.current = kick;
      skipRef.current = false;
      void run();
    }
  }, [kick, run]);

  const openFixes = useCallback(() => {
    if (alert) ctl.focusZone(alert.zone);
    ctl.openCompare();
    setBeat(3);
    setPhase('ready');
  }, [alert, ctl]);

  const actAndWatch = useCallback(async () => {
    const row = top.current;
    const s0 = snapRef.current;
    if (!row || !s0) return;
    const id = runId.current;
    setPhase('acting');
    setBeat(4);
    try {
      const owner = row.owners[0];
      const rq = await api.requestAction(s0.replay_id, row.preset, row.target, COORDINATOR, s0.version);
      await api.decide(s0.replay_id, rq.request.id, owner, 'approve', `pitch-${rq.request.id}`, rq.state_version);
      let s = await api.state(s0.replay_id);
      adopt(s, false);
      setActed(`${owner} approved “${row.name}”. Watching the next hour.`);
      // A readable pace: ten simulated minutes every two seconds.
      for (let i = 0; i < 6 && runId.current === id; i += 1) {
        await sleep(2000);
        s = await api.advance(s.replay_id, 10, s.version);
        adopt(s, false);
      }
      if (runId.current !== id) return;
      const z = s.pressure.zones.find((x) => x.zone === (alert?.zone ?? 0));
      setActed(`${owner} approved “${row.name}”. At ${clock(s.sim_time_min)}, zone ${alert?.zone} is ${z ? z.state : 'unknown'}.`);
      setPhase('ready');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'That step could not be completed.');
      setPhase('ready');
    }
  }, [adopt, alert, ctl]);

  const next = useCallback(() => {
    if (phase === 'alert' || (phase === 'ready' && beat === 2)) return openFixes();
    if (phase === 'ready' && beat === 3) return void actAndWatch();
    if (phase === 'ready' && beat === 4) {
      setBeat(5);
      onOpenEvidence();
    }
  }, [phase, beat, openFixes, actAndWatch, onOpenEvidence]);

  // Auto-play keeps going after the alert, one beat every few seconds.
  useEffect(() => {
    if (!auto || (phase !== 'alert' && phase !== 'ready') || beat >= 5) return;
    const t = window.setTimeout(next, 6000);
    return () => window.clearTimeout(t);
  }, [auto, phase, beat, next]);

  const busy = phase === 'loading' || phase === 'running' || phase === 'acting';

  const body = (i: number) => {
    if (i === 0 && surface) {
      return (
        <div className="pitch-chips" data-testid="pitch-surface">
          <span>{surface.inEd} patients in the ED</span>
          <span>{surface.free} free staffed spaces</span>
          <span>Status: {surface.status}</span>
        </div>
      );
    }
    if (i === 1) {
      return delays.length > 0 ? (
        <ul className="pitch-delays" data-testid="pitch-delays">
          {delays.map((d) => (
            <li key={d.title}><b>{d.title}</b><span>{d.text}</span></li>
          ))}
        </ul>
      ) : (
        <p className="muted">Gathering what is holding things up…</p>
      );
    }
    if (i === 2) return <p className="muted">The warning is on screen, before any zone turns red.</p>;
    if (i === 3) return <p className="muted">The top suggestion is open on the right. Approve it or not.</p>;
    if (i === 4) return <p className="muted">{acted ?? 'Approving the top fix, then letting time run.'}</p>;
    return <p className="muted">Held-out results and limits are in the Runs tab.</p>;
  };

  return (
    <div className="pitch" data-testid="pitch-story" data-phase={phase}>
      <div className="pitch-top">
        <span className="eyebrow">Guided demo</span>
        <span className="muted">{PITCH_CASE.label}</span>
      </div>

      <ol className="pitch-steps">
        {BEATS.map((b, i) => {
          const started = phase !== 'idle' && phase !== 'error';
          const state = !started ? 'todo' : i < beat ? 'done' : i === beat ? 'now' : 'todo';
          return (
            <li key={b.id} className="pitch-step" data-state={state}>
              <span className="pitch-num">{b.id}</span>
              <div>
                <strong>{b.name}</strong>
                {state !== 'todo' && body(i)}
              </div>
            </li>
          );
        })}
      </ol>

      {message && <p className="pitch-note" role="status">{message}</p>}

      <div className="pitch-actions">
        {phase === 'idle' || phase === 'error' ? (
          <button className="btn btn-primary btn-hero" onClick={() => void run()} data-testid="pitch-start">
            Start the demo
          </button>
        ) : (
          <>
            <button className="btn btn-primary" onClick={next} disabled={busy || beat >= 5} data-testid="pitch-next">
              Next
            </button>
            <button className="btn" onClick={() => setAuto((v) => !v)} aria-pressed={auto}>
              {auto ? 'Auto-play on' : 'Auto-play off'}
            </button>
            <button className="btn" onClick={() => { skipRef.current = true; void run(); }} data-testid="pitch-skip">
              Skip to result
            </button>
            <button className="btn" onClick={() => { skipRef.current = false; void run(); }} data-testid="pitch-restart">
              Reset demo
            </button>
          </>
        )}
      </div>
      {busy && phase !== 'acting' && (
        <p className="muted pitch-wait" role="status">
          {phase === 'loading' ? 'Setting up the afternoon…' : 'Playing the story…'}
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
                {alert.owner && <em>Approved by: {alert.owner}{alert.timing ? ` · ${alert.timing}` : ''}</em>}
              </div>
              <ul className="alert-popup-points">
                {alert.low !== null && alert.high !== null && (
                  <li>Time left before overload: {alert.minutes} min (between {alert.low} and {alert.high})</li>
                )}
                <li>Holding things up: {alert.bottleneck}</li>
                <li>The whole ED is still “{surface?.status ?? 'Stable'}”. This is a local warning.</li>
              </ul>
              <div className="alert-popup-buttons">
                <button className="btn btn-primary btn-hero" onClick={openFixes} autoFocus data-testid="alert-popup-open">
                  See the fixes
                </button>
                <button className="btn" onClick={() => { setBeat(2); setPhase('ready'); }}>
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
