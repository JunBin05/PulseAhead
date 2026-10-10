import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { clock } from './Forecast';
import { IconPlay, IconReset, IconStep } from './icons';
import type {
  ComparisonResult,
  ComparisonRow,
  DemoCase,
  DemoDrivers,
  Forecast,
  ForecastAlert,
  SavedEvaluation,
  Snapshot,
} from './types';

/**
 * Guided, narrated run of the real backend in the six beats of the problem-and-solution brief:
 * A current condition, B received pressures, C predict and explain, D fix first, E act and watch,
 * F evidence and limits. The case comes from the backend scan (a development/tuning seed, a demo case,
 * not held-out evidence). Every figure on screen is read from an API response at the version shown;
 * nothing here simulates, forces a label or invents a number.
 */
export interface DemoController {
  /** Show a snapshot in the app. `fresh` starts a new replay view (clears selection and panels). */
  adopt: (s: Snapshot, fresh: boolean) => void;
  focusZone: (zone: number) => void;
  setRole: (role: string) => void;
  openCompare: () => void;
  currentReplayId: () => string | null;
}

const SAMPLES = 50;
const COORDINATOR = 'ED shift coordinator';
const PACE_MS = { pitch: 25000, quick: 4000 } as const;
type Pace = keyof typeof PACE_MS;

const BEATS = [
  { id: 'A', name: 'Current condition' },
  { id: 'B', name: 'Received pressures' },
  { id: 'C', name: 'Predict and explain' },
  { id: 'D', name: 'Fix first' },
  { id: 'E', name: 'Act and watch' },
  { id: 'F', name: 'Evidence and limits' },
] as const;

type Tag = 'Observed' | 'Predicted' | 'Retrospective' | 'Model estimate' | 'Outcome' | 'Limit' | 'Note';

interface Line {
  tag: Tag;
  text: string;
}
interface Card {
  title: string;
  text: string;
}
/** A small chart drawn from numbers already in an API response (never a new number). */
export type Chart =
  | { kind: 'onset'; label: string; low: number; expected: number; high: number; horizon: number; marker?: { at: number; label: string } }
  | { kind: 'band'; label: string; points: { p10: number; p50: number; p90: number }[]; stepMin: number; unit: string }
  | { kind: 'steps'; label: string; points: { label: string; value: number }[]; unit: string }
  | { kind: 'bars'; label: string; items: { name: string; value: number; tone: string; text: string }[] };
interface Stat {
  value: string;
  label: string;
  tone?: 'normal' | 'pressure' | 'overload' | 'unknown' | 'accent';
}
interface BeatView {
  id: string;
  title: string;
  at: string;
  lines: Line[];
  stats?: Stat[];
  charts?: Chart[];
  cards?: Card[];
  close?: string;
  /** The story cannot continue honestly: the remaining story beats are skipped, the evidence beat stays. */
  halt?: boolean;
}

const num = (x: number | null | undefined, d = 1): string => (x === null || x === undefined ? 'n/a' : x.toFixed(d));
const pct = (x: number | null | undefined): string => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const rowName = (r: ComparisonRow): string =>
  `${r.name}${r.preset === 'diagnostic_reserve' ? ` (${r.target})` : ''}`;
const labelText = (l: string | undefined): string => (l ? l.replace(/_/g, ' ') : 'no label');

interface Ctx {
  demo: DemoCase | null;
  snap: Snapshot | null;
  forecast: Forecast | null;
  drivers: DemoDrivers | null;
  alert: ForecastAlert | null;
  cmp: ComparisonResult | null;
  top: ComparisonRow | null;
  servers0: number | null;
  queue0: number | null;
  unit: string | null;
  acted: { owner: string; name: string; saving: string } | null;
}
const emptyCtx = (): Ctx => ({
  demo: null, snap: null, forecast: null, drivers: null, alert: null, cmp: null, top: null,
  servers0: null, queue0: null, unit: null, acted: null,
});

const serversOf = (s: Snapshot, svc: string): number =>
  svc === 'allocation'
    ? s.resources.disposition.allocation.servers
    : svc === 'space'
      ? s.resources.ed_spaces.general_total
      : s.resources.diagnostics[svc as 'lab' | 'imaging'].servers;
const queueOf = (s: Snapshot, svc: string): number | null =>
  svc === 'allocation'
    ? s.resources.disposition.allocation.waiting
    : svc === 'space'
      ? s.resources.ed_spaces.awaiting_space
      : s.resources.diagnostics[svc as 'lab' | 'imaging'].waiting;
/** Plain words for a service in captions (never relabels imaging as lab). */
const svcWord = (svc: string): string =>
  svc === 'space' ? 'staffed general spaces' : svc === 'allocation' ? 'ward allocation' : svc;

function deadlineText(r: ComparisonRow): string {
  const d = r.deadline;
  if (!d) return 'deadline not available';
  if (d.status === 'open' && d.latest_start_min !== null)
    return `start by ${clock(d.latest_start_min)} (in ${num(d.in_min, 0)} min)`;
  if (d.status === 'too_late')
    return `the latest start ${d.latest_start_min !== null ? clock(d.latest_start_min) : ''} (earliest plausible onset minus review, setup and margin) has already passed, so it may take effect after the earliest onset`;
  if (d.status === 'recovery') return 'service is already overloaded: recovery, not prevention';
  return 'no onset forecast, so no deadline';
}

function waitLines(f: Forecast, service: string): Line[] {
  const w = f.waits;
  if (!w) return [{ tag: 'Predicted', text: 'No wait forecast is available for this state.' }];
  const run = w.run_min;
  const phase =
    service === 'lab' ? 'awaiting_lab' : service === 'imaging' ? 'awaiting_imaging' : service === 'space' ? 'awaiting_space' : null;
  const out: Line[] = [];
  if (phase) {
    const rows = (service === 'space' ? w.first_assessment : w.diagnostic).filter((r) => r.phase === phase);
    const what = service === 'space' ? 'a staffed space' : service;
    if (!rows.length) {
      out.push({ tag: 'Predicted', text: `No patient is waiting for ${what} now, so no wait for it is predicted.` });
    }
    for (const g of ['urgent', 'medium', 'lower'] as const) {
      const rs = rows.filter((r) => r.urgency === g);
      if (!rs.length) continue;
      const meds = rs.map((r) => r.median_min).filter((x): x is number => x !== null);
      const p90s = rs.map((r) => r.p90_min).filter((x): x is number => x !== null);
      const cens = rs.length - meds.length;
      out.push({
        tag: 'Predicted',
        text:
          `${g} group, ${plural(rs.length, 'patient')} waiting for ${what}: predicted wait to ${service === 'space' ? 'first assessment' : 'test start'} ` +
          `${meds.length ? `up to ${num(Math.max(...meds), 0)} min (median)` : 'not reached within the run'}` +
          `${p90s.length ? `, up to ${num(Math.max(...p90s), 0)} min (90th percentile)` : ''}` +
          `${cens ? `; ${cens} not started within the ${run}-min run, so no number is given` : ''}. ` +
          `Simulated minutes from now, from ${SAMPLES} futures.`,
      });
    }
  } else {
    out.push({
      tag: 'Predicted',
      text: `A predicted wait is not built for ${service}; only time to first assessment and to test start are predicted.`,
    });
  }
  const s = w.summary;
  out.push({
    tag: 'Predicted',
    text:
      `Time to first assessment (all groups): ${plural(s.waiting_for_first_assessment, 'patient')} waiting, ` +
      `${s.urgent_waiting} urgent, longest median ${num(s.longest_median_min, 0)} min` +
      `${s.not_started_within_run ? `, ${s.not_started_within_run} not started within the run` : ''}.`,
  });
  return out;
}

export function DemoBar({ ctl, onRunning, kick = 0 }: { ctl: DemoController; onRunning?: (r: boolean) => void; kick?: number }) {
  const [done, setDone] = useState(0); // beats completed
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [views, setViews] = useState<BeatView[]>([]);
  const [pace, setPace] = useState<Pace>('pitch');
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const ctx = useRef<Ctx>(emptyCtx());
  const busyRef = useRef(false);
  const doneRef = useRef(0);
  const stoppedRef = useRef(false);
  const fastRef = useRef(false);
  const paceRef = useRef<Pace>('pitch');
  paceRef.current = pace;
  const finished = done >= BEATS.length || stoppedRef.current;

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

  const stop = (text: string, id: string, title: string, at: string): BeatView => ({
    id, title, at, halt: true, lines: [{ tag: 'Note', text }],
  });

  const doBeat = useCallback(
    async (n: number, draft: (v: BeatView) => void): Promise<BeatView> => {
      const c = ctx.current;
      if (n > 0 && c.snap && ctl.currentReplayId() !== c.snap.replay_id) {
        stoppedRef.current = true;
        return { id: BEATS[n].id, title: BEATS[n].name, at: '', lines: [{ tag: 'Note', text: 'The replay was changed outside the demo. Press Reset demo to start again.' }] };
      }
      const B = BEATS[n];
      switch (n) {
        case 0: {
          const demo = await api.demoCase();
          c.demo = demo;
          if (!demo.available || !demo.scenario || demo.seed === undefined || demo.alert_time_min === undefined) {
            return stop(
              demo.reason ?? 'No demo case is available, so there is no early-warning story to tell. Nothing is invented.',
              B.id, B.name, '',
            );
          }
          let s = await api.create(demo.scenario, demo.seed);
          c.snap = s;
          ctl.adopt(s, true);
          while (s.sim_time_min < demo.alert_time_min - 1e-6) {
            s = await advanceTo(Math.min(30, demo.alert_time_min - s.sim_time_min));
          }
          const f = await api.forecast(s.replay_id, SAMPLES);
          c.forecast = f;
          const alert = f.alerts.actionable.find((a) => a.service === demo.service && a.kind === 'forecast_risk') ?? null;
          c.alert = alert;
          if (!alert) {
            return stop(
              `At ${clock(s.sim_time_min)} the forecast shows no forecast-risk alert for ${demo.service_name}. ` +
                'There is no early warning to show, so the demo stops instead of inventing one.',
              B.id, B.name, clock(s.sim_time_min),
            );
          }
          const sp = s.resources.ed_spaces;
          return {
            id: B.id,
            title: B.name,
            at: clock(s.sim_time_min),
            stats: [
              { value: `${s.counts.in_ed}`, label: 'patients in the ED', tone: 'accent' },
              { value: `${sp.available_staffed ?? 'n/a'} / ${sp.staffed_total}`, label: 'staffed spaces free', tone: 'normal' },
              { value: s.overall_status.label, label: 'overall status, as received', tone: s.overall_status.state === 'stable' ? 'normal' : 'pressure' },
            ],
            lines: [
              { tag: 'Observed', text: `${plural(s.counts.in_ed, 'patient')} in the ED; ${sp.awaiting_space ?? 'n/a'} waiting for a space.` },
              { tag: 'Observed', text: `${sp.available_staffed ?? 'n/a'} of ${sp.staffed_total} staffed spaces are free.` },
              { tag: 'Observed', text: `Overall ED status as received: ${s.overall_status.label}.` },
              {
                tag: 'Note',
                text:
                  `Demo case: ${demo.scenario_name}, ${demo.partition} seed ${demo.seed}, chosen by scan. ` +
                  'A demo case, not held-out evidence.',
              },
            ],
          };
        }
        case 1: {
          const s = c.snap!;
          const d = await api.demoDrivers(s.replay_id, s.version);
          c.drivers = d;
          const k = d.supported_count;
          const lines: Line[] = [
            {
              tag: 'Observed',
              text:
                k === 0
                  ? 'No received pressure meets the disclosed driver rules.'
                  : `${k === 1 ? 'One pressure is' : k === 2 ? 'Two pressures are' : 'Three pressures are'} supported by received evidence under the disclosed rules.`,
            },
          ];
          for (const dr of d.drivers) {
            const e = dr.evidence as Record<string, unknown>;
            if (dr.id === 'boarding') {
              const wb = e.waiting_for_suitable_bed as { ward: number; icu: number };
              const fb = e.free_beds as { ward: number; icu: number };
              lines.push({
                tag: 'Observed',
                text:
                  `${dr.label}: ${e.boarding_patients} Ward/ICU patients boarding; waiting for a bed: ${wb.ward} ward ` +
                  `(free ward beds ${fb.ward}), ${wb.icu} ICU (free ICU beds ${fb.icu}).`,
              });
            } else if (dr.id === 'diagnostics') {
              const svcs = e.services as {
                name: string; queue: number; servers: number; received_per_hour: number | null; capacity_per_hour: number | null;
                demand_above_capacity: boolean; turnaround_scale: number | null; median_turnaround_min: number | null;
              }[];
              for (const sv of svcs) {
                lines.push({
                  tag: 'Observed',
                  text:
                    `${sv.name}: ${sv.queue} waiting, ${plural(sv.servers, 'unit')}; received demand ` +
                    `${num(sv.received_per_hour)}/h against capacity ${num(sv.capacity_per_hour)}/h` +
                    `${sv.demand_above_capacity ? ' (demand above capacity)' : ''}` +
                    `${sv.turnaround_scale && sv.turnaround_scale > 1 ? `; received turnaround ${num(sv.turnaround_scale, 2)}x the model prior` : ''}` +
                    `${sv.median_turnaround_min !== null ? `; disclosed median turnaround ${sv.median_turnaround_min} min` : ''}.`,
                });
              }
            } else if (dr.id === 'arrivals') {
              lines.push({
                tag: 'Observed',
                text:
                  `${dr.label}: ${plural(e.patients as number, 'patient')} on ${plural(e.ambulances as number, 'announced ambulance')} ` +
                  `due within ${e.window_min} min (ETAs in ${(e.etas_in_min as number[]).join(', ')} min).`,
              });
            }
          }
          lines.push({
            tag: 'Note',
            text: `Rules: ${d.drivers.map((x) => x.rule).join(' ')}`,
          });
          const stats: Stat[] = d.drivers.map((dr): Stat => {
            const e = dr.evidence as Record<string, unknown>;
            if (dr.id === 'boarding') return { value: `${e.boarding_patients}`, label: 'boarding, no suitable bed', tone: 'overload' };
            if (dr.id === 'diagnostics') {
              const sv = (e.services as { name: string; queue: number }[])[0];
              return { value: `${sv.queue}`, label: `waiting for ${sv.name.toLowerCase()}`, tone: 'pressure' };
            }
            return { value: `${e.patients}`, label: `announced arrivals in ${e.window_min} min`, tone: 'pressure' };
          });
          return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines, stats };
        }
        case 2: {
          const s = c.snap!;
          const f = c.forecast!;
          const a = c.alert!;
          const demo = c.demo!;
          if (f.source.version !== s.version) throw new ApiError('The forecast no longer matches the state shown.', 409);
          ctl.focusZone(a.zone);
          const retro = demo.retrospective;
          const lines: Line[] = [
            {
              tag: 'Predicted',
              text:
                `${a.name} (zone ${a.zone}): ${pct(a.chance)} chance of confirmed overload within 90 min` +
                `${a.onset ? `; expected in about ${num(a.onset.expected_in_min, 0)} min, 90% range ${num(a.onset.low_in_min, 0)} to ${num(a.onset.high_in_min, 0)} min` : ''}` +
                ` (${a.events ?? 'n/a'} of ${a.samples} futures).`,
            },
            {
              tag: 'Predicted',
              text:
                `Scope: local, ${a.name} in zone ${a.zone}. Overall ED: ${s.overall_status.label} now` +
                `${f.overall && f.overall.kind === 'new_onset' ? `, ${pct(f.overall.chance)} chance of overall congestion within 90 min` : ''}. ` +
                'A local overload is not ED-wide congestion.',
            },
            {
              tag: 'Predicted',
              text: `Bottleneck within the model: ${a.category_label}. This is a model explanation, not proof of cause in a hospital.`,
            },
            ...waitLines(f, a.service),
          ];
          if (retro && retro.onset_min !== null && c.demo!.alert_time_min !== undefined) {
            const lead = retro.onset_min - s.sim_time_min;
            lines.push({
              tag: 'Retrospective',
              text:
                `Counts-based alarm (queue at the local threshold, the episode's own onset) in a no-action replay of the same seed: ${clock(retro.onset_min)}` +
                `${retro.confirmed_min !== null ? `, confirmed ${clock(retro.confirmed_min)}` : ''}. ` +
                `This forecast-risk alert came at ${clock(s.sim_time_min)}, ${num(lead, 0)} min before that onset. ` +
                'Retrospective simulation result, not information the operator had at that moment.',
            });
          } else {
            lines.push({
              tag: 'Retrospective',
              text: 'No counts-based onset was found in the no-action replay of this seed, so there is no baseline time to compare. A Building or already-overloaded alert is not early detection.',
            });
          }
          const charts: Chart[] = [];
          if (a.onset && a.onset.low_in_min !== undefined && a.onset.high_in_min !== undefined) {
            charts.push({
              kind: 'onset', label: `When the ${a.name.toLowerCase()} overload may start (minutes from now)`,
              low: a.onset.low_in_min, expected: a.onset.expected_in_min, high: a.onset.high_in_min,
              horizon: f.model.settings.horizon_min,
              marker: retro && retro.onset_min !== null ? { at: retro.onset_min - s.sim_time_min, label: 'counts alarm (retrospective)' } : undefined,
            });
          }
          const band = f.series?.bands?.[a.service];
          if (band && band.length > 2) {
            charts.push({ kind: 'band', label: `${a.name} queue across ${a.samples} futures (10th-90th percentile, median line)`, points: band, stepMin: 5, unit: 'patients' });
          }
          const leadMin = retro && retro.onset_min !== null ? retro.onset_min - s.sim_time_min : null;
          const stats: Stat[] = [
            { value: pct(a.chance), label: `chance of ${a.name.toLowerCase()} overload in 90 min`, tone: 'overload' },
            { value: a.onset ? `~${num(a.onset.expected_in_min, 0)} min` : 'n/a', label: a.onset ? `time left (range ${num(a.onset.low_in_min, 0)}-${num(a.onset.high_in_min, 0)})` : 'no onset range', tone: 'pressure' },
            { value: leadMin !== null ? `${num(leadMin, 0)} min` : 'n/a', label: 'before the counts alarm (retrospective)', tone: 'accent' },
          ];
          return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines, stats, charts };
        }
        case 3: {
          const s = c.snap!;
          ctl.openCompare();
          const r = await api.compare(s.replay_id, SAMPLES, s.version);
          c.cmp = r;
          if (r.status !== 'ok') {
            return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines: [{ tag: 'Note', text: 'Cannot assess: essential data is missing or stale, so no actions are compared.' }] };
          }
          const listed = r.actions.filter((x) => x.comparison);
          c.top = listed[0] ?? null;
          const lines: Line[] = [];
          if (!listed.length) lines.push({ tag: 'Note', text: 'No action is feasible right now, so there is no priority list.' });
          for (const x of listed) {
            lines.push({
              tag: 'Model estimate',
              text:
                `#${x.order} ${rowName(x)}: ${labelText(x.rank?.label)}. Impact ${num(x.impact_per_resource_hour?.mean, 0)} patient-min per reserve unit-hour ` +
                `(operational efficiency, not ROI); ${deadlineText(x)}; owner ${x.owners[0]}; review ${x.review_min} + setup ${x.setup_min} min before capacity changes.`,
            });
          }
          const bedBlocked = s.actions.catalog.find(
            (x) => !x.feasible && x.service === 'allocation' && x.reasons.some((m) => m.includes('suitable bed')),
          );
          if (bedBlocked) {
            lines.push({
              tag: 'Observed',
              text:
                `Unresolved bed constraint: ${bedBlocked.reasons.find((m) => m.includes('suitable bed'))} ` +
                `Escalate to ${s.resources.disposition.beds.owner}; no action in this build creates a bed.`,
            });
          }
          if (r.what_if) {
            const a = r.actions.find((x) => x.id === r.what_if!.a)!;
            const b = r.actions.find((x) => x.id === r.what_if!.b)!;
            const d = r.what_if.difference_patient_min;
            lines.push({
              tag: 'Model estimate',
              text:
                `What if ${rowName(a)} first instead of ${rowName(b)}? Total ED time saved changes by ${num(d.mean)} patient-min ` +
                `(90% lower bound ${num(d.lower_90)}) on the same ${d.n} futures.`,
            });
          }
          for (const x of r.not_modeled.slice(0, 1)) {
            lines.push({ tag: 'Note', text: `${r.not_modeled.length} further interventions are not modeled in this build (for example ${x.name}).` });
          }
          const best = listed[0];
          const stats: Stat[] = best
            ? [
                { value: rowName(best), label: labelText(best.rank?.label), tone: best.rank?.label === 'best_action' ? 'normal' : 'unknown' },
                { value: `${num(best.comparison?.total_saving_patient_min.mean, 0)}`, label: `patient-min saved, model (90% lower bound ${num(best.comparison?.total_saving_patient_min.lower_90, 0)})`, tone: 'accent' },
                { value: best.owners[0], label: `approves it · capacity in ${best.review_min + best.setup_min} min`, tone: 'accent' },
              ]
            : [];
          const charts: Chart[] = listed.length
            ? [{
                kind: 'bars', label: 'Modeled total ED time saved per action (patient-min, paired futures)',
                items: listed.map((x) => ({
                  name: rowName(x), value: Math.max(0, x.comparison?.total_saving_patient_min.mean ?? 0),
                  tone: x.rank?.label === 'best_action' ? 'normal' : x.rank?.label === 'supported_not_top' ? 'accent' : 'unknown',
                  text: `${num(x.comparison?.total_saving_patient_min.mean, 0)} (lb ${num(x.comparison?.total_saving_patient_min.lower_90, 0)}) · ${labelText(x.rank?.label)}`,
                })),
              }]
            : [];
          return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines, stats, charts };
        }
        case 4: {
          const top = c.top;
          const lab = top?.rank?.label;
          let s = c.snap!;
          if (!top || (lab !== 'best_action' && lab !== 'supported_not_top')) {
            return {
              id: B.id, title: B.name, at: clock(s.sim_time_min),
              lines: [{
                tag: 'Note',
                text: `${top ? rowName(top) : 'No action'} is not shown to help (${labelText(lab)}). No request is made and nothing changes.`,
              }],
            };
          }
          const owner = top.owners[0];
          ctl.setRole(owner);
          c.servers0 = serversOf(s, top.service);
          c.queue0 = queueOf(s, top.service);
          c.unit = top.reserve.unit;
          const sv = top.comparison!.total_saving_patient_min;
          const supported = sv.lower_90 !== null && sv.lower_90 > 0;
          c.acted = { owner, name: rowName(top), saving: `${num(sv.mean)} patient-min (90% lower bound ${num(sv.lower_90)})` };
          const lines: Line[] = [];
          const push = (l: Line) => {
            lines.push(l);
            draft({ id: B.id, title: B.name, at: clock(c.snap!.sim_time_min), lines: [...lines] });
          };
          const pause = async () => {
            if (!fastRef.current) await sleep(paceRef.current === 'pitch' ? 5000 : 700);
          };
          const rq = await api.requestAction(s.replay_id, top.preset, top.target, COORDINATOR, s.version);
          await api.decide(s.replay_id, rq.request.id, owner, 'approve', `demo-${rq.request.id}`, rq.state_version);
          s = await refresh();
          const approved = s.sim_time_min;
          const timeline: { label: string; value: number }[] = [{ label: `approved ${clock(approved)}`, value: c.servers0 ?? 0 }];
          const queues: { label: string; value: number }[] = [{ label: `approved ${clock(approved)}`, value: c.queue0 ?? 0 }];
          push({
            tag: 'Outcome',
            text:
              `${clock(approved)}: ${owner} approved ${rowName(top)} (the owner of the resource, not the clicked zone). ` +
              `Review ${top.review_min} min, then setup ${top.setup_min} min. Capacity is still ${c.servers0}, ${svcWord(top.service)} queue ${c.queue0 ?? 'n/a'}.`,
          });
          await pause();
          let guard = 0;
          while (s.actions.in_flight && s.actions.in_flight.stage !== 'active' && guard++ < 20) s = await advanceTo(5);
          if (!s.actions.in_flight || s.actions.in_flight.stage === 'blocked') {
            push({ tag: 'Outcome', text: 'The action was blocked at activation: no capacity was added.' });
            return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines };
          }
          timeline.push({ label: `active ${clock(s.sim_time_min)}`, value: serversOf(s, top.service) });
          queues.push({ label: `active ${clock(s.sim_time_min)}`, value: queueOf(s, top.service) ?? 0 });
          push({
            tag: 'Outcome',
            text:
              `${clock(s.sim_time_min)}: capacity added after review and setup: ${svcWord(top.service)} ${c.servers0} to ${serversOf(s, top.service)}. ` +
              `Observed ${svcWord(top.service)} queue ${c.queue0 ?? 'n/a'} at approval, ${queueOf(s, top.service) ?? 'n/a'} now.`,
          });
          await pause();
          guard = 0;
          while (s.actions.in_flight && guard++ < 40) s = await advanceTo(5);
          const ev = await api.events(s.replay_id);
          const used = ev.events.filter((e) => e.type === 'test_completed' && e.payload.unit === c.unit).length;
          push({
            tag: 'Outcome',
            text:
              `${clock(s.sim_time_min)}: the slot closed after its work; capacity back to ${serversOf(s, top.service)}` +
              `${used ? `, and ${c.unit} completed ${plural(used, 'test')}` : ''}. Observed ${svcWord(top.service)} queue now ${queueOf(s, top.service) ?? 'n/a'}.`,
          });
          timeline.push({ label: `end ${clock(s.sim_time_min)}`, value: serversOf(s, top.service) });
          queues.push({ label: `end ${clock(s.sim_time_min)}`, value: queueOf(s, top.service) ?? 0 });
          push({
            tag: 'Model estimate',
            text:
              `Estimate made at decision time over ${sv.n} paired futures: ${num(sv.mean)} patient-min of total ED time saved ` +
              `(90% lower bound ${num(sv.lower_90)}), ${supported ? 'a supported saving' : 'not a supported saving'}. ` +
              'It is a model estimate. The queue above is one observed replay and does not prove it.',
          });
          const stats: Stat[] = [
            { value: timeline.map((x) => x.value).join(' → '), label: `${svcWord(top.service)}, observed`, tone: 'accent' },
            { value: queues.map((x) => x.value).join(' → '), label: `${svcWord(top.service)} queue, observed`, tone: 'normal' },
            { value: `${num(sv.mean, 0)}`, label: `patient-min saved, model estimate (lb ${num(sv.lower_90, 0)})`, tone: 'accent' },
          ];
          const charts: Chart[] = [
            { kind: 'steps', label: `Observed ${svcWord(top.service)} capacity`, points: timeline, unit: 'slots' },
            { kind: 'steps', label: `Observed ${svcWord(top.service)} queue`, points: queues, unit: 'waiting' },
          ];
          return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines, stats, charts };
        }
        default: {
          const s = c.snap;
          let ev: SavedEvaluation | null = null;
          try {
            ev = await api.latestEvaluation();
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 404)) throw e;
          }
          const lines: Line[] = [];
          if (!ev) {
            lines.push({
              tag: 'Note',
              text: 'No saved evaluation exists yet. Run the evaluation from the Evaluation panel; nothing is shown here until real results exist.',
            });
          } else {
            const g = ev.results.aggregate;
            const set = ev.results.settings;
            const pol = g.policies ?? {};
            const fw = g.false_warnings_per_shift ?? 0;
            const tg = g.target_false_warnings_per_shift ?? 1;
            lines.push({
              tag: 'Outcome',
              text:
                `Latest saved evaluation (${ev.created.slice(0, 16).replace('T', ' ')} UTC, ${g.shifts} shifts): ${g.episodes} confirmed episodes; ` +
                `${g.early_warned} warned early (${g.early_30_min_or_more} with 30+ min lead), ${g.late_only} late only, ${g.missed} missed` +
                `${g.lead_min ? `; lead min ${g.lead_min.min}, median ${g.lead_min.median}, max ${g.lead_min.max} min` : ''}.`,
            });
            lines.push({
              tag: 'Outcome',
              text: `False warnings: ${fw} per shift against a target of at most ${tg}: ${fw > tg ? 'not met' : 'met'}. Warning threshold ${set.warning_threshold}, tuned: ${set.threshold_tuned ? 'yes' : 'no'}.`,
            });
            const p = pol.pulseahead, r = pol.reactive, n0 = pol.no_action;
            if (p && r && n0) {
              const vsR = p.total_ed_patient_min - r.total_ed_patient_min;
              lines.push({
                tag: 'Outcome',
                text:
                  `Total ED patient-min over the scored shifts: PulseAhead ${num(p.total_ed_patient_min)}, reactive baseline ${num(r.total_ed_patient_min)}, ` +
                  `no action ${num(n0.total_ed_patient_min)}. PulseAhead is ${vsR > 0 ? `${num(vsR)} higher than` : vsR < 0 ? `${num(-vsR)} lower than` : 'equal to'} the reactive baseline ` +
                  `(${vsR > 0 ? 'it did not beat it' : 'descriptive only'}).`,
              });
            }
            const sv = g.saving_vs_no_action_by_shift?.pulseahead;
            if (sv) {
              lines.push({
                tag: 'Outcome',
                text: `PulseAhead against no action: better in ${sv.better}, worse in ${sv.worse}, same in ${sv.same} of ${g.shifts} shifts.`,
              });
            }
            lines.push({ tag: 'Limit', text: set.exposure ?? 'Test seed exposure is not recorded for this evaluation.' });
            lines.push({
              tag: 'Limit',
              text:
                'Synthetic fictional hospital, one shift per family: no clinical outcome, ROI or validated hospital performance is claimed. ' +
                `${c.cmp ? c.cmp.actions.length : 'Four'} reserve actions are modeled, ${c.cmp ? c.cmp.not_modeled.length : 'four'} interventions are not. Not deployed; no timed rehearsal yet.`,
            });
          }
          const stats: Stat[] = [];
          const charts: Chart[] = [];
          if (ev) {
            const g = ev.results.aggregate;
            const tgt = g.target_false_warnings_per_shift ?? 1;
            stats.push(
              { value: `${g.early_warned}/${g.episodes}`, label: 'episodes warned early (held-out run)', tone: 'normal' },
              { value: `${g.false_warnings_per_shift}`, label: `false warnings per shift (target at most ${tgt})`, tone: (g.false_warnings_per_shift ?? 0) <= tgt ? 'normal' : 'overload' },
              { value: g.lead_min ? `${g.lead_min.median} min` : 'n/a', label: 'median warning lead', tone: 'accent' },
            );
            charts.push({
              kind: 'bars', label: 'Confirmed episodes in the held-out run',
              items: [
                { name: 'Warned early', value: g.early_warned ?? 0, tone: 'normal', text: `${g.early_warned}` },
                { name: 'Late only', value: g.late_only ?? 0, tone: 'pressure', text: `${g.late_only}` },
                { name: 'Missed', value: g.missed ?? 0, tone: 'overload', text: `${g.missed}` },
              ],
            });
            const pol = g.policies ?? {};
            if (pol.no_action && pol.reactive && pol.pulseahead) {
              charts.push({
                kind: 'bars', label: 'Total ED patient-min on the same shifts (lower is better)',
                items: [
                  { name: 'No action', value: pol.no_action.total_ed_patient_min, tone: 'unknown', text: num(pol.no_action.total_ed_patient_min, 0) },
                  { name: 'Reactive baseline', value: pol.reactive.total_ed_patient_min, tone: 'pressure', text: num(pol.reactive.total_ed_patient_min, 0) },
                  { name: 'PulseAhead', value: pol.pulseahead.total_ed_patient_min, tone: 'accent', text: num(pol.pulseahead.total_ed_patient_min, 0) },
                ],
              });
            }
          }
          const a = c.alert;
          const cards: Card[] = [
            {
              title: 'Predict',
              text: a
                ? `${a.name}: ${pct(a.chance)} chance within 90 min${a.onset ? `, expected in about ${num(a.onset.expected_in_min, 0)} min (${num(a.onset.low_in_min, 0)} to ${num(a.onset.high_in_min, 0)})` : ''}.`
                : 'No prediction was shown: the demo story stopped before it (no qualifying case or alert).',
            },
            {
              title: 'Explain',
              text: a
                ? `${a.category_label}${c.drivers && c.drivers.drivers.length ? `, with ${c.drivers.drivers.map((d) => d.label.toLowerCase()).join(' and ')}` : ''}.`
                : 'No bottleneck was explained in this run.',
            },
            {
              title: 'Act',
              text: c.acted
                ? `${c.acted.name}, approved by ${c.acted.owner}; modeled saving ${c.acted.saving}.`
                : a
                  ? 'No action was started: none was shown to help.'
                  : 'No action was started: the story stopped before the decision beat.',
            },
          ];
          return { id: BEATS[5].id, title: BEATS[5].name, at: s ? clock(s.sim_time_min) : '', lines, cards, stats, charts, close: 'Act before the queue.' };
        }
      }
    },
    [advanceTo, ctl, refresh],
  );

  const next = useCallback(async () => {
    if (busyRef.current || doneRef.current >= BEATS.length || stoppedRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setRemaining(null);
    onRunning?.(true);
    setError(null);
    const n = doneRef.current;
    try {
      const view = await doBeat(n, (v) => {
        setViews((vs) => [...vs.slice(0, n), v]);
        setViewIdx(n);
      });
      const last = BEATS.length - 1;
      if (view.halt && n < last) {
        // The story stops honestly here. The beats that need it are marked, and the evidence beat stays reachable.
        const pads: BeatView[] = [];
        for (let k = n + 1; k < last; k++) {
          pads.push({
            id: BEATS[k].id, title: BEATS[k].name, at: '',
            lines: [{ tag: 'Note', text: `Not shown: beat ${BEATS[n].id} could not be told truthfully, so there is nothing real to show here.` }],
          });
        }
        doneRef.current = last;
        setDone(last);
        setViews((vs) => [...vs.slice(0, n), view, ...pads]);
        setViewIdx(n);
        setNotice('The story stopped here honestly; nothing is invented. Press Next for the measured evidence and limits.');
      } else {
        doneRef.current = n + 1;
        setDone(n + 1);
        setViews((vs) => [...vs.slice(0, n), view]);
        setViewIdx(n);
      }
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
  }, [doBeat, onRunning, refresh]);

  const skip = useCallback(async () => {
    setAuto(false);
    fastRef.current = true;
    try {
      while (!busyRef.current && doneRef.current < BEATS.length && !stoppedRef.current) {
        const before = doneRef.current;
        await next();
        if (doneRef.current === before) break;
      }
    } finally {
      fastRef.current = false;
    }
  }, [next]);

  const reset = useCallback(() => {
    setAuto(false);
    doneRef.current = 0;
    stoppedRef.current = false;
    ctx.current = emptyCtx();
    setDone(0);
    setViews([]);
    setViewIdx(null);
    setRemaining(null);
    setNotice(null);
    setError(null);
  }, []);

  // "Start guided demo" in the run bar runs the first beat (only from a fresh story).
  useEffect(() => {
    if (kick > 0 && doneRef.current === 0) void next();
  }, [kick, next]);

  // Auto-play: the next beat starts after the pace interval, with a visible text countdown.
  useEffect(() => {
    if (!auto || finished || busy) {
      if (auto && finished && !busy) setAuto(false);
      return;
    }
    const ms = done === 0 ? 0 : PACE_MS[pace];
    let left = Math.round(ms / 1000);
    setRemaining(left > 0 ? left : null);
    const tick = left > 0 ? window.setInterval(() => setRemaining((r) => (r !== null && r > 1 ? r - 1 : r)), 1000) : null;
    const t = window.setTimeout(() => void next(), ms);
    return () => {
      window.clearTimeout(t);
      if (tick !== null) window.clearInterval(tick);
    };
  }, [auto, done, finished, busy, pace, next]);

  const shown = viewIdx !== null ? views[viewIdx] : undefined;
  const nextBeat = done < BEATS.length ? BEATS[done] : null;
  const paceNote =
    pace === 'pitch'
      ? `Pitch pace: ${PACE_MS.pitch / 1000} s per beat, about ${Math.floor((PACE_MS.pitch * BEATS.length) / 60000)}:${String(Math.round(((PACE_MS.pitch * BEATS.length) / 1000) % 60)).padStart(2, '0')} for six beats plus compute time.`
      : `Quick pace: about ${PACE_MS.quick / 1000} s per beat.`;

  const progress = Math.round((done / BEATS.length) * 100);
  return (
    <section className="story-stage" aria-labelledby="demo-h" data-testid="demo-bar" data-open={open}>
      <header className="story-head">
        <div className="story-title">
          <h2 id="demo-h">Guided demo</h2>
          <p className="muted" data-testid="demo-progress">
            {finished ? 'Demo finished' : `Next: beat ${nextBeat!.id} of ${BEATS.length}, ${nextBeat!.name}`}
            {' · '}live backend, synthetic data, demo case from a non-test seed (not held-out evidence)
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="demo-toggle">
          {open ? 'Minimise' : 'Show story'}
        </button>
      </header>
      <div className="story-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <nav className="story-steps" aria-label="Demo beats">
        {BEATS.map((b, i) => (
          <button
            key={b.id}
            className="story-step"
            data-state={viewIdx === i ? 'current' : i < done ? 'done' : 'todo'}
            aria-current={viewIdx === i ? 'step' : undefined}
            aria-label={`Beat ${b.id}: ${b.name}${i < done ? '' : ' (not reached)'}`}
            disabled={i >= done}
            onClick={() => setViewIdx(i)}
            data-testid={`demo-beat-${b.id}`}
          >
            <span className="story-step-id">{b.id}</span>
            <span className="story-step-name">{b.name}</span>
          </button>
        ))}
      </nav>
      <div className="story-body" hidden={!open} data-testid="demo-caption" aria-busy={busy}>
        {busy && !shown && <p className="story-empty">Working…</p>}
        {!busy && !shown && (
          <p className="story-empty">
            Six beats of the real simulation: the current condition, the pressures the feeds report, the prediction
            and its explanation, the fix to start first, the owner's approval and its delayed effect, then the
            measured evidence and its limits. Press <strong>Next</strong>, or <strong>Auto-play</strong>.
          </p>
        )}
        {shown && (
          <div className="story-beat" data-testid="demo-beat" data-beat={shown.id}>
            <p className="story-beat-title" role="status" aria-live="polite" data-testid="demo-beat-title">
              <span className="story-beat-id">{shown.id}</span>
              {shown.title}
              {shown.at ? <span className="story-beat-at"> at {shown.at}</span> : null}
              {busy ? <span className="story-beat-at"> (working…)</span> : null}
            </p>
            {shown.stats && shown.stats.length > 0 && (
              <div className="story-stats">
                {shown.stats.map((st) => (
                  <div key={st.label} className="story-stat" data-tone={st.tone ?? 'accent'}>
                    <span className="story-stat-value">{st.value}</span>
                    <span className="story-stat-label">{st.label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="story-grid">
              {shown.charts && shown.charts.length > 0 && (
                <div className="story-charts">
                  {shown.charts.map((ch) => (
                    <ChartView key={ch.label} chart={ch} />
                  ))}
                </div>
              )}
              <ul className="demo-lines">
                {shown.lines.map((l, i) => (
                  <li key={i} data-tag={l.tag}>
                    <span className="demo-tag">{l.tag}</span> {l.text}
                  </li>
                ))}
              </ul>
            </div>
            {shown.cards && (
              <div className="demo-cards" data-testid="demo-cards">
                {shown.cards.map((cd) => (
                  <div key={cd.title} className="demo-card">
                    <h3>{cd.title}</h3>
                    <p>{cd.text}</p>
                  </div>
                ))}
              </div>
            )}
            {shown.close && (
              <p className="demo-close" data-testid="demo-close">
                {shown.close}
              </p>
            )}
          </div>
        )}
      </div>
      {notice && <p className="muted story-note">{notice}</p>}
      {error && (
        <p className="request-message" role="alert" data-testid="demo-error">
          {error}
        </p>
      )}
      <footer className="story-controls">
        <div className="btn-row demo-buttons">
          <button className="btn btn-primary" onClick={() => void next()} disabled={busy || finished} data-testid="demo-next">
            <IconStep /> Next
          </button>
          <button className="btn" aria-pressed={auto} onClick={() => setAuto((a) => !a)} disabled={finished && !auto} data-testid="demo-auto">
            <IconPlay /> Auto-play {auto ? 'on' : 'off'}
          </button>
          <button className="btn" onClick={() => void skip()} disabled={busy || finished} data-testid="demo-skip">
            Skip to result
          </button>
          <button className="btn" onClick={reset} data-testid="demo-reset">
            <IconReset /> Reset demo
          </button>
        </div>
        <fieldset className="demo-pace">
          <legend>Pace</legend>
          <label>
            <input type="radio" name="demo-pace" checked={pace === 'pitch'} onChange={() => setPace('pitch')} data-testid="demo-pace-pitch" />
            Pitch
          </label>
          <label>
            <input type="radio" name="demo-pace" checked={pace === 'quick'} onChange={() => setPace('quick')} data-testid="demo-pace-quick" />
            Quick
          </label>
        </fieldset>
        <span className="muted story-pace-note">
          {remaining !== null && auto && !busy ? (
            <span data-testid="demo-countdown">Next beat in {remaining} s · </span>
          ) : null}
          {paceNote}
        </span>
      </footer>
    </section>
  );
}

/** Inline SVG charts. Every coordinate comes from the numbers in the chart object. */
function ChartView({ chart }: { chart: Chart }) {
  const W = 360;
  if (chart.kind === 'onset') {
    const H = 64;
    const x = (m: number) => 12 + (Math.max(0, Math.min(chart.horizon, m)) / chart.horizon) * (W - 24);
    return (
      <figure className="chart">
        <figcaption>{chart.label}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chart.label}: ${Math.round(chart.low)} to ${Math.round(chart.high)}, expected ${Math.round(chart.expected)}`}>
          <line x1={12} x2={W - 12} y1={30} y2={30} className="chart-axis" />
          <rect x={x(chart.low)} y={20} width={Math.max(3, x(chart.high) - x(chart.low))} height={20} rx={6} className="chart-range" />
          <circle cx={x(chart.expected)} cy={30} r={7} className="chart-dot" />
          {chart.marker && chart.marker.at <= chart.horizon && (
            <g>
              <line x1={x(chart.marker.at)} x2={x(chart.marker.at)} y1={10} y2={50} className="chart-marker" />
              <text x={Math.min(W - 70, x(chart.marker.at) + 4)} y={12} className="chart-note">{chart.marker.label}</text>
            </g>
          )}
          <text x={12} y={60} className="chart-tick">now</text>
          <text x={x(chart.expected) - 14} y={60} className="chart-tick">~{Math.round(chart.expected)} min</text>
          <text x={W - 44} y={60} className="chart-tick">{chart.horizon} min</text>
        </svg>
      </figure>
    );
  }
  if (chart.kind === 'band') {
    const H = 96;
    const n = chart.points.length;
    const max = Math.max(1, ...chart.points.map((p) => p.p90));
    const x = (i: number) => 12 + (i / Math.max(1, n - 1)) * (W - 24);
    const y = (v: number) => H - 16 - (v / max) * (H - 30);
    const upper = chart.points.map((p, i) => `${x(i)},${y(p.p90)}`).join(' ');
    const lower = chart.points.map((p, i) => `${x(i)},${y(p.p10)}`).reverse().join(' ');
    const mid = chart.points.map((p, i) => `${x(i)},${y(p.p50)}`).join(' ');
    return (
      <figure className="chart">
        <figcaption>{chart.label}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chart.label}, peak 90th percentile ${max} ${chart.unit}`}>
          <polygon points={`${upper} ${lower}`} className="chart-band" />
          <polyline points={mid} className="chart-line" />
          <line x1={12} x2={W - 12} y1={H - 16} y2={H - 16} className="chart-axis" />
          <text x={12} y={H - 3} className="chart-tick">now</text>
          <text x={W - 70} y={H - 3} className="chart-tick">+{(n - 1) * chart.stepMin} min</text>
          <text x={14} y={12} className="chart-tick">{max} {chart.unit}</text>
        </svg>
      </figure>
    );
  }
  if (chart.kind === 'steps') {
    const H = 84;
    const n = chart.points.length;
    const max = Math.max(1, ...chart.points.map((p) => p.value));
    const bw = (W - 24) / n;
    return (
      <figure className="chart">
        <figcaption>{chart.label}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chart.label}: ${chart.points.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
          {chart.points.map((p, i) => {
            const h = (p.value / max) * (H - 36);
            return (
              <g key={p.label}>
                <rect x={12 + i * bw + 6} y={H - 20 - h} width={bw - 12} height={Math.max(2, h)} rx={5} className="chart-bar" data-tone={i === 1 ? 'accent' : 'unknown'} />
                <text x={12 + i * bw + bw / 2} y={H - 24 - h} textAnchor="middle" className="chart-value">{p.value}</text>
                <text x={12 + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="chart-tick">{p.label}</text>
              </g>
            );
          })}
        </svg>
      </figure>
    );
  }
  const max = Math.max(1, ...chart.items.map((it) => it.value));
  return (
    <figure className="chart">
      <figcaption>{chart.label}</figcaption>
      <div className="hbars" role="img" aria-label={`${chart.label}: ${chart.items.map((it) => `${it.name} ${it.text}`).join('; ')}`}>
        {chart.items.map((it) => (
          <div key={it.name} className="hbar">
            <span className="hbar-name">{it.name}</span>
            <span className="hbar-track">
              <span className="hbar-fill" data-tone={it.tone} style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
            </span>
            <span className="hbar-text">{it.text}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
