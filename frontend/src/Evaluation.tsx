import { useCallback, useEffect, useRef, useState } from 'react';

const BASE = '/api/v1';

interface PolicyTotals {
  total_ed_patient_min: number;
  unfinished_stays: number;
  resource_hours: number;
  actions_approved: number;
  urgent_initial_wait_mean_min: number | null;
}

interface EvalAggregate {
  shifts: number;
  episodes?: number;
  early_warned?: number;
  late_only?: number;
  missed?: number;
  early_30_min_or_more?: number;
  lead_min?: { min: number; median: number; max: number; n: number } | null;
  false_warnings_per_shift?: number;
  target_false_warnings_per_shift?: number;
  policies?: Record<string, PolicyTotals>;
  saving_vs_no_action_by_shift?: Record<string, { per_shift_patient_min: number[]; better: number; worse: number; same: number }>;
}

interface EvalProgress {
  id: string;
  status: 'running' | 'done' | 'cancelled' | 'failed';
  complete: boolean;
  label: string;
  families_total: number;
  families_done: number;
  current: { family: string; stage: string; sim_time_min: number } | null;
  error: string | null;
  elapsed_s: number;
  results: {
    aggregate: EvalAggregate;
    shifts: { family: string; name: string; seed: number; policies: Record<string, PolicyTotals & { cohort_patients: number }> }[];
    settings: {
      warning_threshold: number;
      threshold_tuned: boolean;
      reactive_trigger?: string;
      limits: string[];
      matching_rule: string;
    };
  };
}

const POLICY_LABEL: Record<string, string> = {
  no_action: 'No action',
  reactive: 'Reactive (acts once overloaded)',
  pulseahead: 'PulseAhead (acts on Best action)',
};

const n1 = (x: number | null | undefined): string => (x === null || x === undefined ? 'n/a' : x.toFixed(1));

async function call<T>(path: string, post = false): Promise<T> {
  const r = await fetch(`${BASE}${path}`, post ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' } : undefined);
  const body = await r.json();
  if (!r.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : r.statusText);
  return body as T;
}

/**
 * One small held-out evaluation, run by the backend as a background job: 7 families x 1 test seed,
 * forecast quality against the replay's own episodes, and policies on matched shifts. Descriptive only.
 */
export function EvaluationPanel() {
  const [job, setJob] = useState<EvalProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const poll = useCallback(async (id: string) => {
    try {
      const p = await call<EvalProgress>(`/evaluations/${id}`);
      setJob(p);
      if (p.status === 'running') timer.current = window.setTimeout(() => void poll(id), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The evaluation status could not be read.');
    }
  }, []);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const start = async () => {
    setError(null);
    try {
      const p = await call<EvalProgress>('/evaluations', true);
      setJob(p);
      void poll(p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The evaluation could not be started.');
    }
  };
  const cancel = async () => {
    if (!job) return;
    try {
      await call(`/evaluations/${job.id}/cancel`, true);
      void poll(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed.');
    }
  };

  const agg = job?.results.aggregate;
  const running = job?.status === 'running';
  return (
    <section className="panel" aria-labelledby="eval-h" data-testid="eval-panel">
      <h2 id="eval-h">Evaluation (held-out shifts)</h2>
      <p className="muted">
        Synthetic, 7 shifts (one held-out test seed per family), descriptive only.
        {job
          ? ` Warning threshold ${job.results.settings.warning_threshold}, ${job.results.settings.threshold_tuned ? 'chosen on development/tuning seeds and frozen' : 'not tuned'}; reactive trigger ${job.results.settings.reactive_trigger ?? 'n/a'}.`
          : ''}
      </p>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => void start()} disabled={running} data-testid="eval-start">
          Run evaluation
        </button>
        {running && (
          <button className="btn" onClick={() => void cancel()} data-testid="eval-cancel">
            Cancel
          </button>
        )}
        {job && !running && (
          <a className="btn" href={`${BASE}/evaluations/${job.id}/export`} target="_blank" rel="noreferrer" data-testid="eval-export">
            Export JSON
          </a>
        )}
      </div>
      {error && (
        <p className="request-message" role="alert" data-testid="eval-error">
          {error}
        </p>
      )}
      {job && (
        <p role="status" aria-live="polite" data-testid="eval-status">
          {job.status === 'running'
            ? `Running: ${job.families_done} of ${job.families_total} shifts done${
                job.current ? ` (now ${job.current.family}, ${job.current.stage}, T+${job.current.sim_time_min})` : ''
              }. Results below are partial.`
            : job.status === 'done'
              ? `Complete in ${job.elapsed_s} s.`
              : job.status === 'cancelled'
                ? `Cancelled after ${job.families_done} of ${job.families_total} shifts. Unfinished: not a complete evaluation.`
                : `Failed: ${job.error}`}
        </p>
      )}
      {job && agg && agg.shifts > 0 && (
        <div data-testid="eval-results" data-complete={job.complete}>
          <h3>Forecast quality</h3>
          <dl className="kv">
            <dt>Episodes (confirmed)</dt>
            <dd data-testid="eval-episodes">{agg.episodes}</dd>
            <dt>Warned early</dt>
            <dd data-testid="eval-early">
              {agg.early_warned} ({agg.early_30_min_or_more} with 30+ min lead)
            </dd>
            <dt>Late only (building alert)</dt>
            <dd>{agg.late_only}</dd>
            <dt>Missed</dt>
            <dd data-testid="eval-missed">{agg.missed}</dd>
            <dt>Lead time (min)</dt>
            <dd>
              {agg.lead_min ? `min ${agg.lead_min.min}, median ${agg.lead_min.median}, max ${agg.lead_min.max}` : 'n/a'}
            </dd>
            <dt>False warnings per shift</dt>
            <dd data-testid="eval-false">
              {agg.false_warnings_per_shift} (target at most {agg.target_false_warnings_per_shift}
              {(agg.false_warnings_per_shift ?? 0) > (agg.target_false_warnings_per_shift ?? 1) ? ': not met' : ''})
            </dd>
          </dl>
          <h3>Decision policies (same seeds, same actions)</h3>
          <table className="cmp-table" data-testid="eval-policies">
            <thead>
              <tr>
                <th scope="col">Policy</th>
                <th scope="col">Total ED patient-min</th>
                <th scope="col">Urgent wait (min)</th>
                <th scope="col">Unfinished</th>
                <th scope="col">Reserve hours</th>
              </tr>
            </thead>
            <tbody>
              {(['no_action', 'reactive', 'pulseahead'] as const).map((p) =>
                agg.policies?.[p] ? (
                  <tr key={p} data-testid={`eval-policy-${p}`}>
                    <th scope="row">{POLICY_LABEL[p]}</th>
                    <td>{n1(agg.policies[p].total_ed_patient_min)}</td>
                    <td>{n1(agg.policies[p].urgent_initial_wait_mean_min)}</td>
                    <td>{agg.policies[p].unfinished_stays}</td>
                    <td>{n1(agg.policies[p].resource_hours)}</td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
          {agg.saving_vs_no_action_by_shift &&
            (['reactive', 'pulseahead'] as const).map((p) => {
              const d = agg.saving_vs_no_action_by_shift?.[p];
              return d ? (
                <p key={p} className="muted" data-testid={`eval-saving-${p}`}>
                  {POLICY_LABEL[p]} vs no action: better in {d.better}, worse in {d.worse}, same in {d.same} shifts;
                  per shift {d.per_shift_patient_min.join(', ')} patient-min saved.
                </p>
              ) : null;
            })}
          <details className="muted">
            <summary>How warnings are matched, and limits</summary>
            <p>{job.results.settings.matching_rule}</p>
            <ul>
              {job.results.settings.limits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
