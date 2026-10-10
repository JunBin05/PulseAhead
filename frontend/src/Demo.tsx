import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { clock } from './Forecast';
import { IconPlay, IconReset, IconStep } from './icons';
import type { ComparisonResult, ComparisonRow, Forecast, ForecastAlert, Snapshot } from './types';

/**
 * Guided, narrated run of the real backend: detect a bottleneck early, see the priority list, ask
 * "what if A instead of B", have the owner approve, watch the delayed effect. Every figure in a
 * caption is read from an API response; nothing here simulates, forces a label or invents a number.
 */
export interface DemoController {
  /** Show a snapshot in the app. `fresh` starts a new replay view (clears selection and panels). */
  adopt: (s: Snapshot, fresh: boolean) => void;
  focusZone: (zone: number) => void;
  setRole: (role: string) => void;
  openCompare: () => void;
  currentReplayId: () => string | null;
}

const SCENARIO = 'diagnostic-delay';
const SEED = 7;
const SAMPLES = 50;
const DETECT_CAP_MIN = 240;
const COORDINATOR = 'ED shift coordinator';

const STEPS = [
  'Start the replay',
  'Early detection',
  'A second bottleneck',
  'Priority list',
  'What if A instead of B',
  'Owner approves',
  'Capacity added',
  'Window ends',
] as const;

const num = (x: number | null | undefined, d = 1): string => (x === null || x === undefined ? 'n/a' : x.toFixed(d));
const pctText = (x: number | null | undefined): string => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
const rowName = (r: ComparisonRow): string =>
  `${r.name}${r.preset === 'diagnostic_reserve' ? ` (${r.target})` : ''}`;

interface Ctx {
  snap: Snapshot | null;
  cmp: ComparisonResult | null;
  top: ComparisonRow | null;
  requestId: string | null;
  servers0: number | null;
  queue0: number | null;
  unit: string | null;
}

function alertLine(a: ForecastAlert, t: number): string {
  const when =
    a.onset && a.kind === 'forecast_risk'
      ? ` Expected start in about ${num(a.onset.expected_in_min, 0)} min (range ${num(a.onset.low_in_min, 0)} to ${num(a.onset.high_in_min, 0)}).`
      : '';
  const what =
    a.kind === 'forecast_risk'
      ? `forecast warning, ${pctText(a.chance)} chance of overload within 90 min`
      : a.kind === 'building'
        ? `overload is building, ${pctText(a.chance)} chance it is confirmed`
        : 'already overloaded';
  return `${a.name} in zone ${a.zone} at ${clock(t)}: ${what}.${when} ${a.affected_patients ?? 'unknown'} patients waiting, ${a.urgent_group_waiting} in the urgent group.`;
}

export function DemoBar({ ctl, onRunning }: { ctl: DemoController; onRunning?: (r: boolean) => void }) {
  const [step, setStep] = useState(0); // completed steps
  const [caption, setCaption] = useState(
    'A guided run of the real simulation: early warning, a priority list, "what if A instead of B", owner approval and the delayed effect. Synthetic data only.',
  );
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctx = useRef<Ctx>({ snap: null, cmp: null, top: null, requestId: null, servers0: null, queue0: null, unit: null });
  const busyRef = useRef(false);
  const stepRef = useRef(0);
  const stoppedRef = useRef(false); // an honest end: nothing more to show
  const finished = step >= STEPS.length || stoppedRef.current;

  const advanceTo = useCallback(
    async (minutes: number): Promise<Snapshot> => {
      const c = ctx.current;
      const s = await api.advance(c.snap!.replay_id, minutes, c.snap!.version);
      c.snap = s;
      ctl.adopt(s, false);
      return s;
    },
    [ctl],
  );

  const refresh = useCallback(async (): Promise<Snapshot> => {
    const c = ctx.current;
    const s = await api.state(c.snap!.replay_id);
    c.snap = s;
    ctl.adopt(s, false);
    return s;
  }, [ctl]);

  const forecastNow = useCallback(async (): Promise<Forecast> => {
    const c = ctx.current;
    return api.forecast(c.snap!.replay_id, SAMPLES);
  }, []);

  const zone3Alert = (f: Forecast): ForecastAlert | undefined =>
    [...f.alerts.actionable, ...f.alerts.recovery].find((a) => a.zone === 3);

  /** Performs one step and returns its caption. Throws ApiError on a backend refusal. */
  const doStep = useCallback(
    async (n: number): Promise<string> => {
      const c = ctx.current;
      if (n > 0 && c.snap && ctl.currentReplayId() !== c.snap.replay_id) {
        stoppedRef.current = true;
        return 'The replay was changed outside the demo. Press Reset demo to start again.';
      }
      switch (n) {
        case 0: {
          const s = await api.create(SCENARIO, SEED);
          c.snap = s;
          ctl.adopt(s, true);
          return `Diagnostic-delay shift, seed ${SEED}. At ${clock(s.sim_time_min)} the ED is ${s.overall_status.label.toLowerCase()}. Imaging is about to back up.`;
        }
        case 1: {
          let s = c.snap!;
          let f = await forecastNow();
          let a = zone3Alert(f);
          while (!a && s.sim_time_min < DETECT_CAP_MIN) {
            s = await advanceTo(5);
            f = await forecastNow();
            a = zone3Alert(f);
          }
          if (!a) {
            stoppedRef.current = true;
            return `No zone 3 alert appeared by ${clock(s.sim_time_min)}: there is nothing to act on, so the demo ends here instead of inventing one.`;
          }
          ctl.focusZone(3);
          return `Zone 3 diagnostics: queue is building. ${alertLine(a, s.sim_time_min)}`;
        }
        case 2: {
          let s = c.snap!;
          const feasible = () => s.actions.catalog.filter((x) => x.feasible).length;
          while (feasible() < 2 && s.sim_time_min < DETECT_CAP_MIN) s = await advanceTo(5);
          const f = await forecastNow();
          const alerts = [...f.alerts.actionable, ...f.alerts.recovery].filter((a) => a.zone === 3);
          if (feasible() < 2) {
            return `At ${clock(s.sim_time_min)} only ${feasible()} action can help, so there is no choice to compare. The priority list will show that one.`;
          }
          return `Now ${clock(s.sim_time_min)}: ${alerts.length} diagnostic bottleneck${alerts.length === 1 ? '' : 's'} (${alerts.map((a) => a.name.toLowerCase()).join(', ')}). ${feasible()} actions are feasible, but only one can run at a time, so the order matters.`;
        }
        case 3: {
          ctl.openCompare();
          const r = await api.compare(c.snap!.replay_id, SAMPLES, c.snap!.version);
          c.cmp = r;
          if (r.status !== 'ok') return 'Cannot assess: essential data is missing or stale, so no actions are compared.';
          const listed = r.actions.filter((x) => x.comparison);
          c.top = listed[0] ?? null;
          if (!listed.length) return 'No action is feasible right now, so there is no priority list.';
          return (
            'Priority list (from paired futures, no action vs each action): ' +
            listed
              .map(
                (x) =>
                  `#${x.order} ${rowName(x)}: ${x.rank?.label.replace(/_/g, ' ')}, impact ${num(x.impact_per_resource_hour?.mean, 0)} patient-min per reserve unit-hour, owner ${x.owners[0]}`,
              )
              .join('; ') +
            '.'
          );
        }
        case 4: {
          const r = c.cmp;
          if (!r || !r.what_if) return 'Only one action is feasible, so there is no A-versus-B choice at this moment.';
          const a = r.actions.find((x) => x.id === r.what_if!.a)!;
          const b = r.actions.find((x) => x.id === r.what_if!.b)!;
          const d = r.what_if.difference_patient_min;
          return `What if ${rowName(a)} first instead of ${rowName(b)}? It changes the total ED time saved by ${num(d.mean)} patient-min (90% lower bound ${num(d.lower_90)}) on the same ${d.n} futures. Urgent initial wait change: ${num(a.comparison!.urgent_initial_wait_change_min.mean, 2)} vs ${num(b.comparison!.urgent_initial_wait_change_min.mean, 2)} min.`;
        }
        case 5: {
          const top = c.top;
          const lab = top?.rank?.label;
          if (!top || (lab !== 'best_action' && lab !== 'supported_not_top')) {
            stoppedRef.current = true;
            return `${top ? rowName(top) : 'No action'} is not shown to help (${top?.rank?.label.replace(/_/g, ' ') ?? 'no feasible action'}). The demo stops here: no request is made and nothing changes.`;
          }
          const owner = top.owners[0];
          ctl.setRole(owner);
          const diag = c.snap!.resources.diagnostics;
          c.servers0 = top.service === 'imaging' ? diag.imaging.servers : top.service === 'lab' ? diag.lab.servers : c.snap!.resources.disposition.allocation.servers;
          c.queue0 = top.service === 'imaging' ? diag.imaging.waiting : top.service === 'lab' ? diag.lab.waiting : null;
          c.unit = top.reserve.unit;
          const rq = await api.requestAction(c.snap!.replay_id, top.preset, top.target, COORDINATOR, c.snap!.version);
          c.requestId = rq.request.id;
          await api.decide(c.snap!.replay_id, rq.request.id, owner, 'approve', `demo-${rq.request.id}`, rq.state_version);
          await refresh();
          return `${owner} approved ${rowName(top)} (approvers come from resource ownership, not the zone). Review ${top.review_min} min, setup ${top.setup_min} min: nothing changes yet, capacity is still ${c.servers0}.`;
        }
        case 6: {
          let s = c.snap!;
          const top = c.top!;
          let guard = 0;
          while (s.actions.in_flight && s.actions.in_flight.stage !== 'active' && guard++ < 20) s = await advanceTo(5);
          const diag = s.resources.diagnostics;
          const now = top.service === 'imaging' ? diag.imaging.servers : top.service === 'lab' ? diag.lab.servers : s.resources.disposition.allocation.servers;
          const q = top.service === 'imaging' ? diag.imaging.waiting : top.service === 'lab' ? diag.lab.waiting : null;
          if (s.actions.in_flight?.stage === 'blocked' || !s.actions.in_flight) {
            return 'The action was blocked at activation: no capacity was added.';
          }
          return `Capacity added after setup: ${top.service} ${c.servers0} to ${now} at ${clock(s.sim_time_min)}.${q !== null && c.queue0 !== null ? ` Waiting ${c.queue0} before, ${q} now.` : ''} Patients move onto the extra slot.`;
        }
        default: {
          let s = c.snap!;
          const top = c.top!;
          let guard = 0;
          while (s.actions.in_flight && guard++ < 40) s = await advanceTo(5);
          const ev = await api.events(s.replay_id);
          const used = ev.events.filter((e) => e.type === 'test_completed' && e.payload.unit === c.unit).length;
          const diag = s.resources.diagnostics;
          const now = top.service === 'imaging' ? diag.imaging.servers : top.service === 'lab' ? diag.lab.servers : s.resources.disposition.allocation.servers;
          const sv = top.comparison!.total_saving_patient_min;
          const qEnd = top.service === 'imaging' ? diag.imaging.waiting : top.service === 'lab' ? diag.lab.waiting : null;
          const queueNote = qEnd !== null && c.queue0 !== null ? ` Observed in this replay: ${top.service} queue ${c.queue0} waiting at approval, ${qEnd} now.` : '';
          const supported = sv.lower_90 !== null && sv.lower_90 > 0;
          return (
            `Window ended at ${clock(s.sim_time_min)}: the slot closed after its work, capacity is back to ${now}` +
            `${used ? `, and ${c.unit} completed ${used} test${used === 1 ? '' : 's'}` : ''}. ` +
            `Estimate made at decision time over ${sv.n} paired futures: ${num(sv.mean)} patient-min of total ED time saved (90% lower bound ${num(sv.lower_90)}), ${supported ? 'a supported saving' : 'not a supported saving'}. ` +
            `This is a model estimate, not an observed outcome.${queueNote}`
          );
        }
      }
    },
    [advanceTo, ctl, forecastNow, refresh],
  );

  const next = useCallback(async () => {
    if (busyRef.current || stepRef.current >= STEPS.length || stoppedRef.current) return;
    busyRef.current = true;
    setBusy(true);
    onRunning?.(true);
    setError(null);
    try {
      const text = await doStep(stepRef.current);
      stepRef.current += 1;
      setStep(stepRef.current);
      setCaption(text);
    } catch (e) {
      const m = e instanceof ApiError ? e.message : 'The demo step failed.';
      setError(m);
      setAuto(false);
      if (e instanceof ApiError && e.status === 409) {
        try {
          await refresh();
        } catch {
          /* the next press tries again */
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      onRunning?.(false);
    }
  }, [doStep, onRunning, refresh]);

  const skip = useCallback(async () => {
    setAuto(false);
    // Run every remaining step now; the result is the last caption.
    while (!busyRef.current && stepRef.current < STEPS.length && !stoppedRef.current) {
      const before = stepRef.current;
      await next();
      if (stepRef.current === before) break; // a refusal or a stop: do not loop
    }
  }, [next]);

  const reset = useCallback(() => {
    setAuto(false);
    stepRef.current = 0;
    stoppedRef.current = false;
    ctx.current = { snap: null, cmp: null, top: null, requestId: null, servers0: null, queue0: null, unit: null };
    setStep(0);
    setError(null);
    setCaption('Demo reset. Press Next to start a fresh replay of the diagnostic-delay shift.');
  }, []);

  // Auto-play: one step about every four seconds, until the end or an error.
  useEffect(() => {
    if (!auto || finished) {
      if (auto && finished) setAuto(false);
      return;
    }
    const t = window.setTimeout(() => void next(), 4000);
    return () => window.clearTimeout(t);
  }, [auto, step, finished, next]);

  const label = step < STEPS.length ? STEPS[step] : 'Finished';
  return (
    <section className="panel demo-bar" aria-labelledby="demo-h" data-testid="demo-bar">
      <h2 id="demo-h">Guided demo</h2>
      <p className="muted" data-testid="demo-progress">
        {finished ? 'Demo finished' : `Next: step ${step + 1} of ${STEPS.length}, ${label}`} · synthetic data, live backend
      </p>
      <p className="demo-caption" role="status" aria-live="polite" data-testid="demo-caption">
        {busy ? 'Working…' : caption}
      </p>
      {error && (
        <p className="request-message" role="alert" data-testid="demo-error">
          {error}
        </p>
      )}
      <div className="btn-row demo-buttons">
        <button className="btn btn-primary" onClick={() => void next()} disabled={busy || finished} data-testid="demo-next">
          <IconStep /> Next
        </button>
        <button
          className="btn"
          aria-pressed={auto}
          onClick={() => setAuto((a) => !a)}
          disabled={finished && !auto}
          data-testid="demo-auto"
        >
          <IconPlay /> Auto-play {auto ? 'on' : 'off'}
        </button>
        <button className="btn" onClick={() => void skip()} disabled={busy || finished} data-testid="demo-skip">
          Skip to result
        </button>
        <button className="btn" onClick={reset} data-testid="demo-reset">
          <IconReset /> Reset demo
        </button>
      </div>
    </section>
  );
}
