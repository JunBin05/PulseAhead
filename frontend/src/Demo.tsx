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
interface BeatView {
  id: string;
  title: string;
  at: string;
  lines: Line[];
  cards?: Card[];
  close?: string;
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
  svc === 'allocation' ? s.resources.disposition.allocation.servers : s.resources.diagnostics[svc as 'lab' | 'imaging'].servers;
const queueOf = (s: Snapshot, svc: string): number | null =>
  svc === 'allocation'
    ? s.resources.disposition.allocation.waiting
    : s.resources.diagnostics[svc as 'lab' | 'imaging'].waiting;

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
  const phase = service === 'lab' ? 'awaiting_lab' : service === 'imaging' ? 'awaiting_imaging' : null;
  const out: Line[] = [];
  if (phase) {
    const rows = w.diagnostic.filter((r) => r.phase === phase);
    if (!rows.length) {
      out.push({ tag: 'Predicted', text: `No patient is waiting to start ${service}, so no ${service} wait is predicted.` });
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
          `${g} group, ${plural(rs.length, 'patient')} waiting for ${service}: predicted wait to test start ` +
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

export function DemoBar({ ctl, onRunning }: { ctl: DemoController; onRunning?: (r: boolean) => void }) {
  const [done, setDone] = useState(0); // beats completed
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [views, setViews] = useState<BeatView[]>([]);
  const [pace, setPace] = useState<Pace>('pitch');
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  const stop = (text: string, id: string, title: string, at: string): BeatView => {
    stoppedRef.current = true;
    return { id, title, at, lines: [{ tag: 'Note', text }] };
  };

  const doBeat = useCallback(
    async (n: number, draft: (v: BeatView) => void): Promise<BeatView> => {
      const c = ctx.current;
      if (n > 0 && c.snap && ctl.currentReplayId() !== c.snap.replay_id) {
        return stop('The replay was changed outside the demo. Press Reset demo to start again.', BEATS[n].id, BEATS[n].name, '');
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
          return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines };
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
          return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines };
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
          return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines };
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
          push({
            tag: 'Outcome',
            text:
              `${clock(approved)}: ${owner} approved ${rowName(top)} (the owner of the resource, not the clicked zone). ` +
              `Review ${top.review_min} min, then setup ${top.setup_min} min. Capacity is still ${c.servers0}, ${top.service} queue ${c.queue0 ?? 'n/a'}.`,
          });
          await pause();
          let guard = 0;
          while (s.actions.in_flight && s.actions.in_flight.stage !== 'active' && guard++ < 20) s = await advanceTo(5);
          if (!s.actions.in_flight || s.actions.in_flight.stage === 'blocked') {
            push({ tag: 'Outcome', text: 'The action was blocked at activation: no capacity was added.' });
            return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines };
          }
          push({
            tag: 'Outcome',
            text:
              `${clock(s.sim_time_min)}: capacity added after review and setup: ${top.service} ${c.servers0} to ${serversOf(s, top.service)}. ` +
              `Observed ${top.service} queue ${c.queue0 ?? 'n/a'} at approval, ${queueOf(s, top.service) ?? 'n/a'} now.`,
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
              `${used ? `, and ${c.unit} completed ${plural(used, 'test')}` : ''}. Observed ${top.service} queue now ${queueOf(s, top.service) ?? 'n/a'}.`,
          });
          push({
            tag: 'Model estimate',
            text:
              `Estimate made at decision time over ${sv.n} paired futures: ${num(sv.mean)} patient-min of total ED time saved ` +
              `(90% lower bound ${num(sv.lower_90)}), ${supported ? 'a supported saving' : 'not a supported saving'}. ` +
              'It is a model estimate. The queue above is one observed replay and does not prove it.',
          });
          return { id: B.id, title: B.name, at: clock(s.sim_time_min), lines };
        }
        default: {
          const s = c.snap!;
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
                '2 of 6 interventions are modeled. Not deployed; no timed rehearsal yet.',
            });
          }
          const a = c.alert;
          const cards: Card[] = [
            {
              title: 'Predict',
              text: a
                ? `${a.name}: ${pct(a.chance)} chance within 90 min${a.onset ? `, expected in about ${num(a.onset.expected_in_min, 0)} min (${num(a.onset.low_in_min, 0)} to ${num(a.onset.high_in_min, 0)})` : ''}.`
                : 'No forecast in this run.',
            },
            {
              title: 'Explain',
              text: a
                ? `${a.category_label}${c.drivers && c.drivers.drivers.length ? `, with ${c.drivers.drivers.map((d) => d.label.toLowerCase()).join(' and ')}` : ''}.`
                : 'No bottleneck in this run.',
            },
            {
              title: 'Act',
              text: c.acted
                ? `${c.acted.name}, approved by ${c.acted.owner}; modeled saving ${c.acted.saving}.`
                : 'No action was started: none was shown to help.',
            },
          ];
          return { id: BEATS[5].id, title: BEATS[5].name, at: clock(s.sim_time_min), lines, cards, close: 'Act before the queue.' };
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
      doneRef.current = n + 1;
      setDone(n + 1);
      setViews((vs) => [...vs.slice(0, n), view]);
      setViewIdx(n);
      // A beat that stopped honestly leaves the evidence beat reachable.
      if (stoppedRef.current && n < BEATS.length - 1) setNotice('The story stopped here honestly; nothing further is invented.');
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

  return (
    <section className="panel demo-bar" aria-labelledby="demo-h" data-testid="demo-bar">
      <h2 id="demo-h">Guided demo</h2>
      <p className="muted" data-testid="demo-progress">
        {finished
          ? 'Demo finished'
          : `Next: beat ${nextBeat!.id} of ${BEATS.length}, ${nextBeat!.name}`}
        {' · '}Synthetic data, live backend. Demo case from a development seed, not held-out evidence.
      </p>
      <nav className="demo-beats" aria-label="Demo beats">
        {BEATS.map((b, i) => (
          <button
            key={b.id}
            className="btn demo-beat-chip"
            aria-current={viewIdx === i ? 'step' : undefined}
            aria-label={`Beat ${b.id}: ${b.name}${i < done ? '' : ' (not reached)'}`}
            disabled={i >= done}
            onClick={() => setViewIdx(i)}
            data-testid={`demo-beat-${b.id}`}
          >
            {b.id}
          </button>
        ))}
      </nav>
      <div className="demo-caption" data-testid="demo-caption" aria-busy={busy}>
        {busy && !shown && <p>Working…</p>}
        {!busy && !shown && (
          <p>
            Six beats of the real simulation: the current condition, the received pressures, the prediction and its
            explanation, the fix to start first, the owner's approval and its delayed effect, then the measured
            evidence and its limits. Press Next, or Auto-play.
          </p>
        )}
        {shown && (
          <div data-testid="demo-beat" data-beat={shown.id}>
            <p className="demo-beat-title" role="status" aria-live="polite" data-testid="demo-beat-title">
              Beat {shown.id}: {shown.title}
              {shown.at ? ` at ${shown.at}` : ''}
              {busy ? ' (working…)' : ''}
            </p>
            <ul className="demo-lines">
              {shown.lines.map((l, i) => (
                <li key={i} data-tag={l.tag}>
                  <span className="demo-tag">{l.tag}</span> {l.text}
                </li>
              ))}
            </ul>
            {shown.cards && (
              <div className="demo-cards" data-testid="demo-cards">
                {shown.cards.map((c) => (
                  <div key={c.title} className="demo-card">
                    <h3>{c.title}</h3>
                    <p>{c.text}</p>
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
      {notice && <p className="muted">{notice}</p>}
      {remaining !== null && auto && !busy && (
        <p className="muted" data-testid="demo-countdown">
          Next beat in {remaining} s
        </p>
      )}
      {error && (
        <p className="request-message" role="alert" data-testid="demo-error">
          {error}
        </p>
      )}
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
      <p className="muted">{paceNote}</p>
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
