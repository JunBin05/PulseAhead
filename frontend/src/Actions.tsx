import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { clock } from './Forecast';
import { IconCheck, IconClock, IconOctagon, IconTriangle } from './icons';
import type {
  ActionComparison,
  ActionRecord,
  ActionRequest,
  BranchSummary,
  ComparisonResult,
  ComparisonRow,
  Snapshot,
  Stat,
} from './types';

const fmt = (x: number | null | undefined, digits = 1): string =>
  x === null || x === undefined ? '—' : x.toFixed(digits);

const STAGES: { id: ActionRecord['stage']; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'setup', label: 'Setup' },
  { id: 'active', label: 'Active' },
  { id: 'draining', label: 'Draining' },
  { id: 'completed', label: 'Completed' },
];

const STAGE_WORD: Record<ActionRecord['stage'], string> = {
  review: 'In review',
  setup: 'Setup',
  active: 'Active',
  draining: 'Draining',
  completed: 'Completed',
  blocked: 'Blocked',
};

/** The demo-role switcher: which staff member the screen is acting as (a demo role, not a login). */
export function RoleSwitcher({
  roles,
  value,
  onChange,
}: {
  roles: string[];
  value: string;
  onChange: (role: string) => void;
}) {
  return (
    <div className="meta">
      <label className="meta-label" htmlFor="demo-role">
        Demo role
      </label>
      <select
        id="demo-role"
        className="role-select"
        data-testid="demo-role"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Status of the action in flight, with text and an icon, for the zone the action serves. */
export function ActionChip({ snap, zone }: { snap: Snapshot | null; zone: number }) {
  const fl = snap?.actions?.in_flight;
  if (!fl) return null;
  const item = snap.actions.catalog.find((c) => c.service === fl.service);
  if (!item || item.zone !== zone) return null;
  const tone = fl.stage === 'active' ? 'normal' : 'pressure';
  return (
    <span className="status action-chip" data-tone={tone} data-testid={`zone-${zone}-action`} data-stage={fl.stage}>
      {fl.stage === 'active' ? <IconCheck /> : <IconClock />}
      <span>
        Action: {STAGE_WORD[fl.stage]} · {item.name}
      </span>
    </span>
  );
}

export function ActionProgress({ rec, now }: { rec: ActionRecord; now: number }) {
  const reached = (s: ActionRecord['stage']) => {
    const order = ['review', 'setup', 'active', 'draining', 'completed'];
    if (rec.stage === 'blocked') return s === 'review' || s === 'setup';
    return order.indexOf(s) <= order.indexOf(rec.stage);
  };
  const when: Record<string, string> = {
    review: `${clock(rec.approved_min)} to ${clock(rec.review_end_min)}`,
    setup: `${clock(rec.review_end_min)} to ${clock(rec.setup_end_min)}`,
    active: `${clock(rec.setup_end_min)} to ${clock(rec.active_end_min)}`,
    draining: `from ${clock(rec.active_end_min)} until its last task ends`,
    completed: rec.closed_min !== null ? clock(rec.closed_min) : 'not yet',
  };
  return (
    <div className="action-progress" data-testid="action-progress" data-stage={rec.stage}>
      <p>
        <strong>
          {STAGE_WORD[rec.stage]} · {rec.unit}
        </strong>{' '}
        <span className="muted">(now {clock(now)})</span>
      </p>
      <ol>
        {STAGES.map((s) => (
          <li key={s.id} data-reached={reached(s.id)} data-current={rec.stage === s.id}>
            <span>{s.label}</span>
            <span className="muted">{when[s.id]}</span>
          </li>
        ))}
      </ol>
      {rec.stage === 'blocked' && (
        <p data-testid="action-blocked" className="muted">
          <IconOctagon /> Blocked: {rec.reason} No capacity was added.
        </p>
      )}
    </div>
  );
}

function statCell(s: Stat, unit = '', digits = 1): string {
  if (s.mean === null) return '—';
  const lb = s.lower_90 !== null ? ` (90% lower bound ${fmt(s.lower_90, digits)})` : '';
  return `${fmt(s.mean, digits)}${unit}${lb}`;
}

function CompareTable({ row, c }: { row: ComparisonRow; c: ActionComparison }) {
  const na: BranchSummary = c.no_action;
  const ac: BranchSummary | null = c.action;
  const line = (label: string, a: number | null | undefined, b: number | null | undefined, s: Stat, tid: string,
    word: string) => (
    <tr data-testid={`${tid}-${row.id}`}>
      <th scope="row">{label}</th>
      <td>{fmt(a)}</td>
      <td>{fmt(b)}</td>
      <td>
        <span className="muted">{word} </span>
        {statCell(s)}
      </td>
    </tr>
  );
  return (
    <table className="cmp-table">
      <caption className="muted">
        Means over {c.samples} paired futures. A saving is no action minus action (positive helps); a change is
        action minus no action (positive is worse).
      </caption>
      <thead>
        <tr>
          <th scope="col">Cohort total</th>
          <th scope="col">No action</th>
          <th scope="col">With action</th>
          <th scope="col">Difference</th>
        </tr>
      </thead>
      <tbody>
        {line('Total ED time (patient-min)', na.total_ed_patient_min_mean, ac?.total_ed_patient_min_mean,
          c.total_saving_patient_min, 'cmp-total', 'saving')}
        {line('Initial wait (patient-min)', na.initial_wait_patient_min_mean, ac?.initial_wait_patient_min_mean,
          c.part_saving_patient_min.initial_wait, 'cmp-initial', 'saving')}
        {line('Care and tests (patient-min)', na.care_and_tests_patient_min_mean,
          ac?.care_and_tests_patient_min_mean, c.part_saving_patient_min.care_and_tests, 'cmp-care', 'saving')}
        {line('Awaiting departure (patient-min)', na.awaiting_departure_patient_min_mean,
          ac?.awaiting_departure_patient_min_mean, c.part_saving_patient_min.awaiting_departure, 'cmp-await',
          'saving')}
        {line('Diagnostic wait (patient-min)', na.diagnostic_wait_patient_min_mean,
          ac?.diagnostic_wait_patient_min_mean, c.part_saving_patient_min.diagnostic_wait, 'cmp-diag', 'saving')}
        {line('Urgent initial wait (mean min)', na.urgent_initial_wait_min_mean, ac?.urgent_initial_wait_min_mean,
          c.urgent_initial_wait_change_min, 'cmp-urgent', 'change')}
        {line('Urgent waits over 15 min (count)', na.overdue_urgent_mean, ac?.overdue_urgent_mean,
          c.overdue_urgent_change, 'cmp-overdue', 'change')}
        <tr data-testid={`cmp-unfinished-${row.id}`}>
          <th scope="row">Unfinished stays (mean count)</th>
          <td>{fmt(na.unfinished_stays_mean)}</td>
          <td>{fmt(ac?.unfinished_stays_mean)}</td>
          <td className="muted">
            {c.futures_with_unfinished_stays} of {c.samples} futures have one; counted apart, accrued minutes only
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** "What if I do A instead of B": the paired difference on the same futures, with each action's parts. */
function WhatIf({
  cmp,
  a,
  b,
  onA,
  onB,
}: {
  cmp: ComparisonResult;
  a: string | null;
  b: string | null;
  onA: (id: string) => void;
  onB: (id: string) => void;
}) {
  const rows = cmp.actions.filter((r) => r.comparison !== null);
  if (rows.length < 2) {
    return (
      <p className="muted" data-testid="what-if-none">
        What if: fewer than two actions are feasible now, so there is nothing to compare against each other.
      </p>
    );
  }
  const idA = a && rows.some((r) => r.id === a) ? a : (cmp.what_if?.a ?? rows[0].id);
  const idB = b && rows.some((r) => r.id === b) && b !== idA ? b : (rows.find((r) => r.id !== idA)?.id ?? rows[1].id);
  const ra = rows.find((r) => r.id === idA)!;
  const rb = rows.find((r) => r.id === idB)!;
  const ca = ra.comparison!;
  const cb = rb.comparison!;
  const diff = cmp.pair_diff[idA]?.[idB];
  const label = (r: ComparisonRow) => `${r.name}${r.preset === 'diagnostic_reserve' ? ` (${r.target})` : ''}`;
  const line = (name: string, x: Stat, y: Stat, tid: string) => (
    <tr data-testid={`whatif-${tid}`}>
      <th scope="row">{name}</th>
      <td>{statCell(x)}</td>
      <td>{statCell(y)}</td>
    </tr>
  );
  return (
    <section className="what-if" data-testid="what-if" aria-labelledby="whatif-h">
      <h3 id="whatif-h">What if I do one instead of the other?</h3>
      <div className="whatif-pick">
        <label>
          Do{' '}
          <select value={idA} onChange={(e) => onA(e.target.value)} data-testid="whatif-a">
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
        <label>
          instead of{' '}
          <select value={idB} onChange={(e) => onB(e.target.value)} data-testid="whatif-b">
            {rows.filter((r) => r.id !== idA).map((r) => (
              <option key={r.id} value={r.id}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {diff && (
        <p data-testid="whatif-text">
          Doing <strong>{label(ra)}</strong> instead of <strong>{label(rb)}</strong> changes the total ED time saved by{' '}
          <strong>{statCell(diff)}</strong> patient-min, on the same {diff.n} paired futures. Only one action can run at a
          time, so this is the choice for the first slot.
        </p>
      )}
      <table className="cmp-table">
        <thead>
          <tr>
            <th scope="col">Saved vs no action (patient-min)</th>
            <th scope="col">{label(ra)}</th>
            <th scope="col">{label(rb)}</th>
          </tr>
        </thead>
        <tbody>
          {line('Total ED time', ca.total_saving_patient_min, cb.total_saving_patient_min, 'total')}
          {line('Initial wait', ca.part_saving_patient_min.initial_wait, cb.part_saving_patient_min.initial_wait, 'initial')}
          {line('Care and tests', ca.part_saving_patient_min.care_and_tests, cb.part_saving_patient_min.care_and_tests, 'care')}
          {line('Awaiting departure', ca.part_saving_patient_min.awaiting_departure, cb.part_saving_patient_min.awaiting_departure, 'await')}
          {line('Diagnostic wait', ca.part_saving_patient_min.diagnostic_wait, cb.part_saving_patient_min.diagnostic_wait, 'diag')}
          {line('Urgent initial wait change (min, positive is worse)', ca.urgent_initial_wait_change_min, cb.urgent_initial_wait_change_min, 'urgent')}
          <tr data-testid="whatif-impact">
            <th scope="row">Impact per reserve unit-hour</th>
            <td>{fmt(ra.impact_per_resource_hour?.mean)}</td>
            <td>{fmt(rb.impact_per_resource_hour?.mean)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function RequestCard({
  snap,
  req,
  role,
  onChanged,
}: {
  snap: Snapshot;
  req: ActionRequest;
  role: string;
  onChanged: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = req.status === 'pending' || req.status === 'deferred';
  const decide = async (decision: 'approve' | 'reject' | 'defer') => {
    setBusy(true);
    setMsg(null);
    try {
      const id = `${role.replace(/\W+/g, '-')}-${decision}-${Date.now()}`;
      await api.decide(snap.replay_id, req.id, role, decision, id, snap.version);
      onChanged();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'The decision could not be sent.');
      if (e instanceof ApiError && e.status === 409) onChanged();
    } finally {
      setBusy(false);
    }
  };
  const isOwner = req.owners.includes(role);
  return (
    <section className="request-card" data-testid="request-card" data-status={req.status} aria-label="Action request">
      <h4>
        Request {req.id}: {req.name}
        {req.target !== 'allocation' && req.target !== 'space' ? ` (${req.target})` : ''}
      </h4>
      <dl className="kv">
        <dt>Status</dt>
        <dd data-testid="request-status">{req.status}</dd>
        <dt>Requires approval from</dt>
        <dd data-testid="request-owners">{req.owners.join(', ')}</dd>
        <dt>Approved by</dt>
        <dd>{Object.keys(req.grants).length ? Object.keys(req.grants).join(', ') : 'nobody yet'}</dd>
      </dl>
      <p data-testid="request-next-step">{req.next_step}</p>
      {open && (
        <>
          <p className="muted">
            Acting as <strong>{role}</strong>
            {isOwner ? '.' : `. This role is not a required owner: a decision will be refused. Switch the demo role to ${req.owners.join(', ')}.`}
          </p>
          <div className="btn-row">
            <button className="btn btn-primary" disabled={busy} onClick={() => void decide('approve')}
              data-testid="decision-approve">
              Approve
            </button>
            <button className="btn" disabled={busy} onClick={() => void decide('reject')} data-testid="decision-reject">
              Reject
            </button>
            <button className="btn" disabled={busy} onClick={() => void decide('defer')} data-testid="decision-defer">
              Defer
            </button>
          </div>
        </>
      )}
      {msg && (
        <p className="request-message" role="alert" data-testid="request-message">
          <IconTriangle /> {msg}
        </p>
      )}
    </section>
  );
}

/**
 * Compare actions with no action for the state on screen, route the request to the resource owner,
 * and show the action's progress. It opens with the replay paused and keeps the comparison it
 * computed; when time moves on it says so and offers a refresh.
 */
export function ComparePanel({
  snap,
  role,
  samples,
  onClose,
  onChanged,
  onResult,
}: {
  snap: Snapshot;
  role: string;
  samples: number;
  onClose: () => void;
  onChanged: () => void;
  onResult?: (r: ComparisonResult) => void;
}) {
  const [cmp, setCmp] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [whatA, setWhatA] = useState<string | null>(null);
  const [whatB, setWhatB] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const load = useCallback(() => {
    const s = snapRef.current;
    setLoading(true);
    setError(null);
    api
      .compare(s.replay_id, samples, s.version)
      .then((r) => {
        if (snapRef.current.replay_id === r.source.replay_id && snapRef.current.run_number === r.source.run_number) {
          setCmp(r);
          onResult?.(r);
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'The comparison could not be computed.'))
      .finally(() => setLoading(false));
  }, [samples]);

  useEffect(() => {
    load();
    ref.current?.focus();
  }, [load]);

  // A different replay or run drops the comparison: it can no longer describe what is on screen.
  const sameRun = !!cmp && cmp.source.replay_id === snap.replay_id && cmp.source.run_number === snap.run_number;
  const stale = !!cmp && (!sameRun || cmp.source.sim_time_min !== snap.sim_time_min);
  const requests = snap.actions.requests;
  const openReq = requests.find((r) => r.status === 'pending' || r.status === 'deferred');
  const lastReq = openReq ?? requests[requests.length - 1];
  const fl = snap.actions.in_flight;

  const request = async (row: ComparisonRow) => {
    setSending(true);
    setNote(null);
    try {
      await api.requestAction(snap.replay_id, row.preset, row.target, role, snap.version);
      onChanged();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'The request could not be sent.');
      if (e instanceof ApiError && e.status === 409) onChanged();
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      className="panel compare-panel"
      aria-labelledby="compare-h"
      data-testid="compare-panel"
      tabIndex={-1}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="compare-head">
        <h2 id="compare-h">Compare actions</h2>
        <button className="btn" onClick={onClose} data-testid="compare-close">
          Close
        </button>
      </div>
      <p className="muted" data-testid="compare-source">
        {cmp && sameRun
          ? `Compared at ${clock(cmp.source.sim_time_min)} (state v${cmp.source.version}), ${cmp.samples} paired futures from received data only.`
          : 'Comparing no action with each action on the same futures…'}{' '}
        The replay is paused while you compare.
      </p>
      {stale && (
        <p className="banner" data-tone="pending" role="status" data-testid="compare-stale">
          This comparison is from {cmp ? clock(cmp.source.sim_time_min) : ''}; the replay is now at{' '}
          {clock(snap.sim_time_min)}. An old comparison cannot be approved.{' '}
          <button className="btn" onClick={load} data-testid="compare-refresh">
            Refresh comparison
          </button>
        </p>
      )}
      {!stale && (
        <button className="btn" onClick={load} disabled={loading} data-testid="compare-refresh">
          {loading ? 'Computing…' : 'Refresh comparison'}
        </button>
      )}
      {error && (
        <p className="request-message" role="alert" data-testid="compare-error">
          <IconTriangle /> {error}
        </p>
      )}
      {cmp?.status === 'cannot_assess' && (
        <p data-testid="compare-cannot-assess">
          <IconTriangle /> Cannot assess: essential data is missing or stale. No comparison is shown.
        </p>
      )}
      {cmp?.status === 'ok' &&
        cmp.actions.map((row) => (
          <article key={row.id} className="cmp-action" data-testid={`compare-action-${row.id}`} data-feasible={row.feasible}>
            <h3>
              {row.order ? `#${row.order} ` : ''}
              {row.name}
              {row.preset === 'diagnostic_reserve' ? ` · ${row.target}` : ''}
            </h3>
            <p className="muted">{row.effect}</p>
            <p>
              Approval needed from <strong>{row.owners.join(', ')}</strong> · review {row.review_min} min, setup{' '}
              {row.setup_min} min, active {row.active_min} min.
            </p>
            {row.rank && (
              <p
                className="status"
                data-tone={
                  row.rank.label === 'best_action' || row.rank.label === 'supported_not_top'
                    ? 'normal'
                    : row.rank.label === 'urgent_delay_check_failed'
                      ? 'overload'
                      : 'pressure'
                }
                data-testid={`rank-${row.id}`}
                data-label={row.rank.label}
              >
                {row.rank.label === 'best_action' || row.rank.label === 'supported_not_top' ? <IconCheck /> : <IconTriangle />}
                <span>{row.rank.text}</span>
              </p>
            )}
            {row.comparison && row.impact_per_resource_hour && row.impact_per_resource_hour.mean !== null && (
              <p data-testid={`impact-${row.id}`}>
                Impact: <strong>{fmt(row.impact_per_resource_hour.mean)}</strong> patient-min saved per reserve unit-hour
                (90% lower bound {fmt(row.impact_per_resource_hour.lower_90)}), over {row.resource_hours} unit-hours committed.
              </p>
            )}
            {row.feasible && row.deadline && (
              <p data-testid={`deadline-${row.id}`}>
                {row.deadline.status === 'open' && row.deadline.latest_start_min !== null
                  ? `Latest start ${clock(row.deadline.latest_start_min)} (in ${row.deadline.in_min} min): onset low bound minus ${row.deadline.review_min} min review, ${row.deadline.setup_min} min setup and ${row.deadline.margin_min} min margin.`
                  : row.deadline.status === 'too_late'
                    ? 'Too late to act before the earliest forecast onset: act now to limit the effect.'
                    : row.deadline.status === 'recovery'
                      ? 'This service is already overloaded: the action aims at recovery, so there is no start deadline.'
                      : 'No start deadline: there is no forecast onset for this service right now.'}
              </p>
            )}
            {!row.feasible && (
              <p data-testid={`infeasible-${row.id}`}>
                <IconTriangle /> Not feasible now: {row.reasons.join(' ')}
              </p>
            )}
            {row.comparison && <CompareTable row={row} c={row.comparison} />}
            {row.comparison && (
              <p className="muted" data-testid={`cmp-resource-${row.id}`}>
                Resource: {row.comparison.resource.reserve_unit} for {row.comparison.resource.active_unit_hours} unit-hour
                active. {row.comparison.resource.note}
              </p>
            )}
            <button
              className="btn btn-primary"
              disabled={!row.feasible || stale || sending || !!openReq || !!fl}
              onClick={() => void request(row)}
              data-testid={`request-${row.id}`}
            >
              Request this action
            </button>
            {row.feasible && (openReq || fl) && (
              <span className="muted"> One action at a time: finish or decide the current one first.</span>
            )}
          </article>
        ))}
      {cmp?.status === 'ok' && <WhatIf cmp={cmp} a={whatA} b={whatB} onA={setWhatA} onB={setWhatB} />}
      {note && (
        <p className="request-message" role="alert" data-testid="request-note">
          <IconTriangle /> {note}
        </p>
      )}
      {lastReq && <RequestCard snap={snap} req={lastReq} role={role} onChanged={onChanged} />}
      {fl && <ActionProgress rec={fl} now={snap.sim_time_min} />}
      {!fl && snap.actions.history.length > 0 && (
        <ActionProgress rec={snap.actions.history[snap.actions.history.length - 1]} now={snap.sim_time_min} />
      )}
      {cmp && (
        <details className="muted">
          <summary>Not modeled in this build</summary>
          <ul data-testid="not-modeled">
            {cmp.not_modeled.map((n) => (
              <li key={n.id}>
                {n.name}: {n.reason}
              </li>
            ))}
          </ul>
          <p>{cmp.cohort_rule}</p>
        </details>
      )}
    </section>
  );
}
