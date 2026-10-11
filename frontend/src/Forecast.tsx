import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { targetSuffix } from './format';
import { IconClock, IconOctagon, IconTriangle, IconUnknown } from './icons';
import type { ComparisonResult, Forecast, ForecastAlert, ForecastExplanation, ForecastOnset, Snapshot } from './types';

export const FORECAST_REFRESH_MIN = 5;
export type ForecastSamples = 50 | 100;

export function clock(min: number): string {
  const total = Math.floor(min);
  return `T+${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const pct = (x: number | null | undefined): string => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);

export interface ForecastView {
  status: 'idle' | 'pending' | 'ready' | 'error';
  data: Forecast | null;
  message: string | null;
}

/**
 * Keeps one forecast for the replay on screen, refreshed when simulated time passes the next
 * five-minute mark. Only one request is in flight; a response for another replay or run is dropped.
 * The forecast keeps the state version it was computed from, so it is never shown as current for a
 * newer state.
 */
export function useForecast(snap: Snapshot | null, samples: ForecastSamples) {
  const [view, setView] = useState<ForecastView>({ status: 'idle', data: null, message: null });
  const [tick, setTick] = useState(0);
  const inflight = useRef(false);
  const dataRef = useRef<Forecast | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const failedKey = useRef('');
  snapRef.current = snap;

  useEffect(() => {
    if (!snap) {
      dataRef.current = null;
      setView({ status: 'idle', data: null, message: null });
      return;
    }
    const cur = dataRef.current;
    const sameRun = !!cur && cur.source.replay_id === snap.replay_id && cur.source.run_number === snap.run_number;
    if (cur && !sameRun) {
      dataRef.current = null;
      setView({ status: 'pending', data: null, message: null });
    }
    const have = sameRun ? cur : null;
    const due =
      !have ||
      have.model.settings.samples !== samples ||
      snap.sim_time_min >= have.forecast_time_min + FORECAST_REFRESH_MIN - 1e-9 ||
      snap.sim_time_min < have.forecast_time_min - 1e-9;
    const key = `${snap.replay_id}:${snap.run_number}:${snap.sim_time_min}:${samples}`;
    if (!due || inflight.current || failedKey.current === key) return;
    inflight.current = true;
    setView({ status: 'pending', data: have, message: null });
    const { replay_id: id, run_number: run } = snap;
    api
      .forecast(id, samples)
      .then((f) => {
        const s = snapRef.current;
        if (!s || s.replay_id !== id || s.run_number !== run) return;
        if (dataRef.current && dataRef.current.source.replay_id === id && dataRef.current.source.version > f.source.version) {
          return;
        }
        dataRef.current = f;
        setView({ status: 'ready', data: f, message: null });
      })
      .catch((e) => {
        failedKey.current = key;
        setView({
          status: 'error',
          data: dataRef.current,
          message: e instanceof ApiError ? e.message : 'The forecast could not be computed.',
        });
      })
      .finally(() => {
        inflight.current = false;
        setTick((t) => t + 1);
      });
  }, [snap?.replay_id, snap?.run_number, snap?.sim_time_min, samples, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => {
    failedKey.current = '';
    setTick((t) => t + 1);
  };
  return { view, retry };
}

export interface ExplanationView {
  key: string;
  status: 'pending' | 'ready' | 'error';
  data: ForecastExplanation | null;
}

/** Fetches the explanation of one zone for the forecast on screen; the previous one stays visible,
 * labelled with its own source time, while a new one is computed. */
export function useExplanation(fc: Forecast | null, zone: number | null) {
  // The explanation belongs to the forecast on screen, so it uses that forecast's own sample count; the
  // requested setting can already differ while a new forecast is still being computed.
  const samples = (fc?.model.settings.samples ?? 50) as ForecastSamples;
  const [exp, setExp] = useState<ExplanationView | null>(null);
  useEffect(() => {
    if (!fc || fc.status !== 'ok' || zone === null) {
      setExp(null);
      return;
    }
    const key = `${fc.source.replay_id}:${fc.source.version}:${zone}:${samples}`;
    let cancelled = false;
    setExp((prev) => ({ key, status: 'pending', data: prev && prev.data?.zone === zone ? prev.data : null }));
    api
      .explain(fc.source.replay_id, zone, samples, fc.source.version)
      .then((d) => {
        if (!cancelled) setExp({ key, status: 'ready', data: d });
      })
      .catch(() => {
        if (!cancelled) setExp((prev) => ({ key, status: 'error', data: prev?.data ?? null }));
      });
    return () => {
      cancelled = true;
    };
  }, [fc?.source.replay_id, fc?.source.version, zone, samples]); // eslint-disable-line react-hooks/exhaustive-deps
  return exp;
}

function range(o: ForecastOnset | null): string {
  return o && o.low_in_min !== undefined && o.high_in_min !== undefined
    ? `${Math.max(0, o.low_in_min)} to ${o.high_in_min}`
    : '';
}

/** The estimate at the moment on screen, or null once it has expired (no zero or negative countdown). */
export function remaining(fc: Forecast, onset: ForecastOnset | null, now: number): number | null {
  if (!onset) return null;
  const left = fc.forecast_time_min + onset.expected_in_min - now;
  return left > 0 ? Math.round(left * 10) / 10 : null;
}

function SourceLine({
  snap,
  view,
  testid = 'fc-source',
}: {
  snap: Snapshot;
  view: ForecastView;
  testid?: string;
}) {
  const f = view.data;
  if (!f) {
    return (
      <p className="muted" data-testid={testid} data-status={view.status}>
        {view.status === 'error'
          ? `Forecast unavailable: ${view.message}`
          : 'Computing the first forecast from the received state…'}
      </p>
    );
  }
  const age = Math.max(0, snap.sim_time_min - f.forecast_time_min);
  const behind = f.source.version !== snap.version;
  return (
    <p className="muted" data-testid={testid} data-status={view.status} data-version={f.source.version}>
      Forecast from {clock(f.forecast_time_min)} (state v{f.source.version}) · {f.model.settings.samples} sampled
      futures · model {f.model.version} · computed in {f.compute.ms} ms
      {behind && ` · ${age.toFixed(0)} simulated min older than the state on screen`}
      {view.status === 'pending' && ' · refreshing…'}
      {view.status === 'error' && ` · refresh failed: ${view.message}`}
    </p>
  );
}

/** Compact status strip: congestion chance, expected start, awaiting a space, available staffed spaces. */
export function ForecastStrip({
  snap,
  view,
  onRetry,
}: {
  snap: Snapshot | null;
  view: ForecastView;
  onRetry: () => void;
}) {
  if (!snap) {
    return (
      <section className="fc-strip" aria-label="Forecast" data-testid="fc-strip" data-empty="true">
        <p className="muted">
          Forecast: Congestion chance and Expected start appear once the simulation has started.
        </p>
      </section>
    );
  }
  const f = view.data;
  const o = f?.overall ?? null;
  const sp = snap.resources.ed_spaces;
  let chance: ReactNode = view.status === 'error' ? 'Unavailable' : 'Computing…';
  let expected: ReactNode = '—';
  let tone = 'unknown';
  if (f && f.status === 'cannot_assess') {
    chance = 'Cannot assess';
    expected = 'Not shown while essential data is missing or stale';
  } else if (f && o) {
    const left = remaining(f, o.onset, snap.sim_time_min);
    if (o.kind === 'new_onset') {
      tone = (o.chance ?? 0) >= f.model.settings.warning_threshold ? 'pressure' : 'normal';
      chance = `${pct(o.chance)} within ${f.model.settings.horizon_min} min`;
      if (o.onset && left !== null) {
        expected = (
          <>
            about {left} simulated min · 90% range {range(o.onset)} min · from {clock(f.forecast_time_min)}
          </>
        );
      } else if (o.onset) {
        expected = `Estimate expired (from ${clock(f.forecast_time_min)}); refresh pending`;
      } else {
        expected = `No onset in ${o.samples} sampled futures`;
      }
    } else if (o.kind === 'confirmation') {
      tone = 'pressure';
      chance = `Building congestion: ${pct(o.chance)} chance of confirmation`;
      expected = `Interval underway for ${o.elapsed_min} simulated min; no new-onset countdown`;
    } else {
      tone = 'overload';
      chance = `Congested now: ${pct(o.chance)} chance it clears within ${f.model.settings.horizon_min} min`;
      expected = o.onset
        ? `Typical clearing in about ${Math.max(0, o.onset.expected_in_min)} simulated min`
        : 'No recovery sampled within the horizon';
    }
  }
  return (
    <section className="fc-strip" aria-label="Forecast" data-testid="fc-strip" data-state={tone}>
      <dl className="fc-grid">
        <div>
          <dt>Congestion chance</dt>
          <dd data-testid="fc-chance">{chance}</dd>
        </div>
        <div>
          <dt>Expected start</dt>
          <dd data-testid="fc-expected">{expected}</dd>
        </div>
        <div>
          <dt>Patients awaiting a space</dt>
          <dd data-testid="fc-awaiting">{sp.awaiting_space ?? 'Not current'}</dd>
        </div>
        <div>
          <dt>Available staffed spaces</dt>
          <dd data-testid="fc-available">
            {sp.available_staffed === null ? 'Not current' : `${sp.available_staffed} of ${sp.total}`}
          </dd>
        </div>
      </dl>
      {f && f.status === 'ok' && (
        <p data-testid="fc-next">
          <strong>Next step:</strong> {f.next_step.text}
        </p>
      )}
      {f && f.status === 'cannot_assess' && (
        <p data-testid="fc-next">
          <strong>Next step:</strong> {f.next_step.text} {f.reasons.join(' ')}
        </p>
      )}
      <details className="fc-details" data-testid="fc-more">
        <summary>Predicted waits and forecast source</summary>
        <SourceLine snap={snap} view={view} />
        {f && f.status === 'ok' && f.waits && <PredictedWaits f={f} />}
      </details>
      {view.status === 'error' && (
        <button className="btn" onClick={onRetry} data-testid="fc-retry">
          Retry forecast
        </button>
      )}
      {f && f.limitations.length > 0 && (
        <details className="fc-details" data-testid="fc-limitations">
          <summary>Limitations of this forecast</summary>
          <ul>
            {f.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const URGENCY_WORD: Record<string, string> = { urgent: 'Urgent', medium: 'Medium', lower: 'Lower' };

/** Predicted waits from the forecast's own futures: first assessment and, for a diagnostic queue, the test start. */
function PredictedWaits({ f }: { f: Forecast }) {
  const w = f.waits!;
  const s = w.summary;
  const cell = (r: { median_min: number | null; p90_min: number | null; starts_in_run_chance: number | null }) =>
    r.median_min === null
      ? `not within ${w.run_min} min (${pct(r.starts_in_run_chance)} of futures start in the run)`
      : `about ${r.median_min} min${r.p90_min !== null ? ` (90% by ${r.p90_min} min)` : ' (90th percentile beyond the run)'}`;
  if (!s.waiting_for_first_assessment && !s.waiting_for_a_test) {
    return (
      <p className="muted" data-testid="fc-waits">
        Predicted wait: nobody is waiting for a first assessment or a test right now.
      </p>
    );
  }
  return (
    <details className="fc-details" data-testid="fc-waits" open>
      <summary>
        Predicted wait · {s.waiting_for_first_assessment} waiting for first assessment ({s.urgent_waiting} urgent)
        {s.longest_median_min !== null ? `, longest median about ${s.longest_median_min} min` : ''}
        {s.waiting_for_a_test ? ` · ${s.waiting_for_a_test} waiting for a test` : ''}
      </summary>
      <p className="muted">
        Minutes from {clock(f.forecast_time_min)}, from {f.model.settings.samples} sampled futures. {w.basis}
      </p>
      {w.first_assessment.length > 0 && (
        <ul data-testid="fc-waits-first">
          {w.first_assessment.slice(0, 6).map((r) => (
            <li key={r.id} data-testid={`fc-wait-${r.id}`}>
              {r.id} ({URGENCY_WORD[r.urgency] ?? r.urgency}, waiting {Math.round(r.minutes_in_phase)} min so far): first
              assessment {cell(r)}
            </li>
          ))}
        </ul>
      )}
      {w.diagnostic.length > 0 && (
        <ul data-testid="fc-waits-diagnostic">
          {w.diagnostic.slice(0, 6).map((r) => (
            <li key={r.id} data-testid={`fc-testwait-${r.id}`}>
              {r.id} ({URGENCY_WORD[r.urgency] ?? r.urgency}, {r.phase === 'awaiting_imaging' ? 'imaging' : 'lab'}
              queue): test starts {cell(r)}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function alertText(a: ForecastAlert, f: Forecast, now: number): string {
  if (a.kind === 'overloaded') return `Overloaded now · ${pct(a.chance)} chance it clears within ${f.model.settings.horizon_min} min`;
  if (a.kind === 'building') return `Building · ${pct(a.chance)} chance of confirmation`;
  const left = remaining(f, a.onset, now);
  const when = a.onset
    ? left !== null
      ? ` · about ${left} simulated min (90% range ${range(a.onset)})`
      : ' · estimate expired, refresh pending'
    : '';
  return `Forecast risk ${pct(a.chance)}${when}`;
}

function deadlineText(a: ForecastAlert, now: number): string {
  const d = a.deadline;
  if (d.status === 'recovery') return 'Recovery: action supports recovery, not prevention';
  if (d.status === 'unavailable' || d.latest_start_min === null) return 'Deadline unavailable (no onset range)';
  if (d.status === 'too_late') return `May be too late to prevent (latest start was about ${clock(d.latest_start_min)})`;
  const inMin = Math.max(0, Math.round(d.latest_start_min - now));
  return `Latest start about ${clock(d.latest_start_min)} (in ${inMin} simulated min)`;
}

function impactText(service: string, cmp: ComparisonResult | null): string {
  if (!cmp) return 'Impact: unavailable (no action comparison yet)';
  const rows = cmp.actions.filter((r) => r.service === service && r.comparison);
  if (!rows.length) return 'Impact: no feasible action serves this service now';
  const r = rows[0];
  const sv = r.comparison!.total_saving_patient_min;
  const lb = sv.lower_90 === null ? 'n/a' : sv.lower_90.toFixed(1);
  const when =
    r.deadline?.status === 'open' && r.deadline.latest_start_min !== null
      ? `; latest start ${clock(r.deadline.latest_start_min)}`
      : '';
  return `Impact: ${r.name}${targetSuffix(r.preset, r.target)} saves ${sv.mean?.toFixed(1)} patient-min (90% lower bound ${lb}), ${r.rank?.label.replace(/_/g, ' ')}${when}`;
}

export function AlertList({
  snap,
  view,
  onSelect,
  selectedZone,
  onCompare,
  comparison,
}: {
  snap: Snapshot;
  view: ForecastView;
  onSelect: (zone: number) => void;
  selectedZone: number | null;
  onCompare?: (zone: number) => void;
  comparison?: ComparisonResult | null;
}) {
  // An action comparison made for exactly this state's time fills the alert's impact and deadline.
  const cmp =
    comparison &&
    comparison.status === 'ok' &&
    comparison.source.replay_id === snap.replay_id &&
    comparison.source.run_number === snap.run_number &&
    comparison.source.sim_time_min === snap.sim_time_min
      ? comparison
      : null;
  const f = view.data;
  if (!f || f.status !== 'ok') return null;
  const { actionable, recovery, unknown } = f.alerts;
  if (!actionable.length && !recovery.length && !unknown.length) {
    return (
      <p className="muted" data-testid="fc-no-alerts">
        No forecast alerts: no service is above its warning level and none is building or overloaded.
      </p>
    );
  }
  const item = (a: ForecastAlert) => (
    <li key={a.id}>
      <button
        className="fc-alert"
        aria-pressed={selectedZone === a.zone}
        onClick={() => onSelect(a.zone)}
        data-testid={`fc-alert-${a.service}`}
        data-kind={a.kind}
        data-zone={a.zone}
      >
        <span className="fc-alert-head">
          <strong>
            Zone {a.zone} · {a.name}
          </strong>
          <span className="status" data-tone={a.kind === 'overloaded' ? 'overload' : 'pressure'}>
            {a.kind === 'overloaded' ? <IconOctagon /> : <IconTriangle />}
            <span>
              {a.kind === 'forecast_risk' ? 'Forecast warning' : a.kind === 'building' ? 'Building' : 'Overloaded'}
            </span>
          </span>
        </span>
        <span>{a.category_label}{a.mixed ? ` · mixed: also ${a.also_active.join(', ')}` : ''}</span>
        <span data-testid={`fc-alert-${a.service}-text`}>{alertText(a, f, snap.sim_time_min)}</span>
        <span data-testid={`fc-alert-${a.service}-deadline`}>{deadlineText(a, snap.sim_time_min)}</span>
        <span className="muted">
          {a.deadline.basis}: {a.deadline.action} ({a.deadline.setup_min} min setup, {a.deadline.review_min} min review,{' '}
          {a.deadline.margin_min} min margin)
        </span>
        <span className="muted" data-testid={`fc-alert-${a.service}-impact`}>
          Affected patients: {a.affected_patients ?? 'unknown'} · urgent group waiting: {a.urgent_group_waiting} ·{' '}
          {impactText(a.service, cmp)}
        </span>
      </button>
      {onCompare && (
        <button className="btn" onClick={() => onCompare(a.zone)} data-testid={`compare-open-${a.service}`}>
          Compare actions for this alert
        </button>
      )}
    </li>
  );
  return (
    <div className="fc-alerts" data-testid="fc-alerts">
      {actionable.length > 0 && (
        <>
          <h3>Alerts by intervention deadline</h3>
          <ul data-testid="fc-alerts-actionable">{actionable.map(item)}</ul>
        </>
      )}
      {recovery.length > 0 && (
        <>
          <h3>Recovery (already overloaded)</h3>
          <ul data-testid="fc-alerts-recovery">{recovery.map(item)}</ul>
        </>
      )}
      {unknown.length > 0 && (
        <>
          <h3>Cannot assess</h3>
          <ul data-testid="fc-alerts-unknown">
            {unknown.map((u) => (
              <li key={u.service}>
                <button className="fc-alert" onClick={() => onSelect(u.zone)} data-testid={`fc-alert-${u.service}`} data-kind="unknown">
                  <span className="fc-alert-head">
                    <strong>
                      Zone {u.zone} · {u.name}
                    </strong>
                    <span className="status" data-tone="unknown">
                      <IconUnknown />
                      <span>Cannot assess</span>
                    </span>
                  </span>
                  <span>{u.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The selected zone's forecast: local overload kept apart from overall ED congestion, and why. */
export function ZoneForecast({
  snap,
  view,
  zone,
  explanation,
}: {
  snap: Snapshot;
  view: ForecastView;
  zone: number;
  explanation: ExplanationView | null;
}) {
  const f = view.data;
  const header = (
    <h3 id="forecast-h" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--s-2)' }}>
      Forecast for zone {zone}
    </h3>
  );
  if (!f) {
    return (
      <section data-testid="fc-zone" aria-labelledby="forecast-h" style={{ marginBottom: 'var(--s-4)' }}>
        {header}
        <p className="muted" role="status">
          {view.status === 'error' ? `Forecast unavailable: ${view.message}` : 'Computing the forecast…'}
        </p>
      </section>
    );
  }
  if (f.status === 'cannot_assess') {
    return (
      <section data-testid="fc-zone" aria-labelledby="forecast-h" style={{ marginBottom: 'var(--s-4)' }}>
        {header}
        <p data-testid="fc-zone-cannot">
          <span className="status" data-tone="unknown">
            <IconUnknown />
            <span>Cannot assess</span>
          </span>{' '}
          {f.reasons.join(' ')} No forecast is shown, and low risk is not implied.
        </p>
      </section>
    );
  }
  const z = f.zones.find((q) => q.zone === zone)!;
  const svc = f.services[z.top_service];
  const o = f.overall!;
  const now = snap.sim_time_min;
  let local: ReactNode;
  if (svc.kind === 'unknown') {
    local = 'Cannot assess: inputs for this service are missing or stale.';
  } else if (svc.kind === 'new_onset') {
    const left = remaining(f, svc.onset, now);
    local = svc.onset
      ? left !== null
        ? `${pct(svc.chance)} chance · about ${left} simulated min · 90% range ${range(svc.onset)} min`
        : `${pct(svc.chance)} chance · estimate expired, refresh pending`
      : `No overload sampled in ${svc.samples} futures (${pct(svc.chance)})`;
  } else if (svc.kind === 'confirmation') {
    local = `Building: ${pct(svc.chance)} chance of confirmation (interval underway ${svc.elapsed_min} simulated min)`;
  } else {
    local = `Overloaded now: ${pct(svc.chance)} chance it clears within ${f.model.settings.horizon_min} min`;
  }
  let overall: ReactNode;
  if (o.kind === 'new_onset') {
    const left = remaining(f, o.onset, now);
    overall = o.onset
      ? left !== null
        ? `${pct(o.chance)} chance · about ${left} simulated min · 90% range ${range(o.onset)} min`
        : `${pct(o.chance)} chance · estimate expired, refresh pending`
      : `No onset sampled in ${o.samples} futures`;
  } else if (o.kind === 'confirmation') {
    overall = `Building congestion: ${pct(o.chance)} chance of confirmation`;
  } else {
    overall = `Congested now: ${pct(o.chance)} chance it clears within ${f.model.settings.horizon_min} min`;
  }
  const why = explanation?.data?.zone === zone ? explanation.data : null;
  const w = why?.why_this_alert;
  // Only a zone that has an alert (building, overloaded, Cannot assess or a forecast warning) is explained
  // as an alert; any other zone shows the same facts as plain forecast detail.
  const alerting = z.state !== 'normal' || z.warning;
  return (
    <section data-testid="fc-zone" aria-labelledby="forecast-h" style={{ marginBottom: 'var(--s-4)' }}>
      {header}
      <SourceLine snap={snap} view={view} testid="fc-zone-source" />
      <dl className="kv" style={{ marginBottom: 'var(--s-3)' }}>
        <dt>Local overload expected (this zone)</dt>
        <dd data-testid="fc-local" data-kind={svc.kind}>
          {local}
        </dd>
        <dt>Overall ED congestion expected</dt>
        <dd data-testid="fc-overall" data-kind={o.kind}>
          {overall}
        </dd>
      </dl>
      <p className="muted" data-testid="fc-separation">
        A local zone overload is not overall ED congestion. The two forecasts use the same sampled futures but
        different rules.
      </p>
      {z.warning && (
        <p data-testid="fc-zone-warning">
          <span className="status" data-tone="pressure">
            <IconTriangle />
            <span>Forecast warning</span>
          </span>{' '}
          This zone is Normal now; the chance of a local overload is at or above the warning level (
          {pct(f.model.settings.warning_threshold)}).
        </p>
      )}
      <div className="callout" data-state="normal" data-testid="fc-explain">
        <p>
          <strong data-testid="fc-explain-title">
            {alerting ? 'Why this alert appeared' : 'Forecast detail for this zone (no alert)'}
          </strong>
        </p>
        {!w && (
          <p className="muted" role="status">
            {explanation?.status === 'error'
              ? 'The explanation could not be computed for this forecast.'
              : 'Computing the explanation…'}
          </p>
        )}
        {w && (
          <>
            {why!.source.version !== f.source.version && (
              <p className="muted">Explanation from {clock(why!.forecast_time_min)} (state v{why!.source.version}); refreshing.</p>
            )}
            <p>
              <strong>Observed now (received):</strong>
            </p>
            <ul data-testid="fc-observed">
              {w.observed.map((x) => (
                <li key={x.label}>
                  {x.label}: {x.value}
                </li>
              ))}
            </ul>
            <p>
              <strong>Model estimate ({why!.technical.samples} sampled futures):</strong>
            </p>
            <ul data-testid="fc-model">
              {w.model.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {w.sensitivity && (
              <p className="muted" data-testid="fc-sensitivity">
                {w.sensitivity.note}
              </p>
            )}
            <details className="fc-details" data-testid="fc-tech">
              <summary>Technical details</summary>
              <ul>
                <li>
                  Model {why!.technical.model_version} · seed {why!.technical.seed} · horizon {why!.technical.horizon_min} min plus{' '}
                  {why!.technical.tail_min} min tail
                </li>
                <li>Arrival adjustment: {JSON.stringify(why!.technical.arrival_adjustment)}</li>
                <li>Turnaround scale: {JSON.stringify(why!.technical.turnaround_scale)}</li>
                {Object.entries(f.model.assumptions).map(([k, v]) => (
                  <li key={k}>
                    <strong>{k.replace(/_/g, ' ')}:</strong> {v}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
      <p className="muted">
        <IconClock /> Estimates describe simulation sampling under disclosed assumptions, not hospital
        confidence.
      </p>
    </section>
  );
}

/** One short forecast line for a zone button. */
export function zoneForecastLine(view: ForecastView, zone: number): string {
  const f = view.data;
  if (!f) return view.status === 'error' ? 'Forecast unavailable' : 'Forecast: computing';
  if (f.status === 'cannot_assess') return 'Forecast: cannot assess';
  const q = f.zones.find((x) => x.zone === zone);
  if (!q) return '';
  const top = f.services[q.top_service];
  if (q.state === 'unknown') return 'Forecast: cannot assess';
  if (q.state === 'overloaded') return 'Overloaded now';
  if (q.state === 'building') return `Building: ${pct(top.chance)} to confirm`;
  return `Forecast risk ${pct(q.new_overload_chance)}${q.warning ? ' (warning)' : ''}`;
}
