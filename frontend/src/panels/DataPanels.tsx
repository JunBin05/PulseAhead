import type { ReactNode } from 'react';
import { formatClock, patientCount } from '../format';
import { IconCheck, IconClock, IconTriangle, IconUnknown } from '../icons';
import type { Feed, Snapshot } from '../types';

const FEED_ORDER = ['queues', 'spaces', 'staffing', 'diagnostics', 'disposition', 'ambulance'] as const;

const FEED_LOOK: Record<Feed['status'], { tone: string; icon: ReactNode; word: string }> = {
  fresh: { tone: 'normal', icon: <IconCheck />, word: 'Current' },
  stale: { tone: 'pressure', icon: <IconClock />, word: 'Stale' },
  missing: { tone: 'unknown', icon: <IconUnknown />, word: 'Missing' },
};

const AMB_STATUS: Record<'en_route' | 'delayed', string> = {
  en_route: 'En route',
  delayed: 'Delayed, ETA overdue',
};

export function FeedsPanel({ snap }: { snap: Snapshot | null }) {
  if (!snap) return null;
  const q = snap.data_quality;
  return (
    <section className="panel" aria-labelledby="feeds-h">
      <h2 id="feeds-h">Data feeds</h2>
      <p className="feed-summary" data-testid="feeds-summary" data-assessable={q.assessable}>
        <span className="status" data-tone={q.assessable ? 'normal' : 'unknown'}>
          {q.assessable ? <IconCheck /> : <IconUnknown />}
          <span>{q.assessable ? 'Essential feeds current' : 'Cannot assess'}</span>
        </span>
      </p>
      {!q.assessable && (
        <p data-testid="feeds-reasons" style={{ marginBottom: 'var(--s-3)' }}>
          {q.reasons.join(' ')}
        </p>
      )}
      <p className="muted">
        Replay clock <span data-testid="replay-heartbeat">{formatClock(snap.feeds.replay.last_update_min ?? 0)}</span>
        . It does not refresh any feed below. A feed whose newest valid update is older than{' '}
        {q.stale_after_min} simulated minutes is stale.
      </p>
      <ul className="feed-list" data-testid="feed-list">
        {FEED_ORDER.map((id) => snap.feeds[id]).filter(Boolean).map((f) => {
          const look = FEED_LOOK[f.status];
          return (
            <li key={f.id} data-testid={`feed-${f.id}`} data-status={f.status} data-essential={f.essential}>
              <div className="feed-row">
                <strong>{f.label}</strong>
                <span className="feed-status" data-tone={look.tone} data-testid={`feed-${f.id}-status`}>
                  {look.icon}
                  {look.word}
                </span>
              </div>
              <div className="muted" data-testid={`feed-${f.id}-age`}>
                {f.essential ? 'Essential' : 'Optional'} ·{' '}
                {f.last_update_min === null
                  ? 'no valid update received'
                  : `last valid update ${formatClock(f.last_update_min)} · ${f.age_min} min old`}
              </div>
              {f.limitation && (
                <div className="muted" data-testid={`feed-${f.id}-limit`}>
                  {f.limitation}
                </div>
              )}
              {f.status === 'fresh' && f.resumed_at_min != null && (
                <div className="muted" data-testid={`feed-${f.id}-resumed`}>
                  Resumed at {formatClock(f.resumed_at_min)}; assessment restored.
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const KIND_LABEL: Record<string, string> = {
  duplicate: 'Duplicate ignored',
  out_of_order: 'Out of order, newer state kept',
  quarantined: 'Invalid, quarantined',
  outlier_kept: 'Extreme but valid, kept',
};

export function DataQualityPanel({ snap }: { snap: Snapshot | null }) {
  if (!snap) return null;
  const { counts, recent, sequence_gaps: gaps } = snap.data_quality;
  const missing = gaps.reduce((n, g) => n + g.missing, 0);
  return (
    <section className="panel" aria-labelledby="dq-h">
      <h2 id="dq-h">Data quality</h2>
      <dl className="kv">
        <dt>Events accepted</dt>
        <dd data-testid="dq-accepted">{counts.accepted}</dd>
        <dt>Duplicates ignored</dt>
        <dd data-testid="dq-duplicates">{counts.duplicates}</dd>
        <dt>Out of order, ignored</dt>
        <dd data-testid="dq-out-of-order">{counts.out_of_order}</dd>
        <dt>Invalid, quarantined</dt>
        <dd data-testid="dq-quarantined">{counts.quarantined}</dd>
        <dt>Extreme but valid, kept</dt>
        <dd data-testid="dq-outliers">{counts.outliers_kept}</dd>
        <dt>Event ids not received</dt>
        <dd data-testid="dq-gaps">{missing}</dd>
      </dl>
      {recent.length === 0 ? (
        <p className="muted" data-testid="dq-empty" style={{ marginTop: 'var(--s-3)' }}>
          Nothing has been ignored, refused or flagged.
        </p>
      ) : (
        <details style={{ marginTop: 'var(--s-3)' }}>
          <summary>Latest {recent.length} items</summary>
          <ul className="feed-list" data-testid="dq-list">
            {recent.map((it, i) => (
              <li key={`${it.id}-${i}`} data-testid="dq-item" data-kind={it.kind} data-id={it.id ?? ''}>
                <div className="feed-row">
                  <strong>{it.id ?? 'no id'}</strong>
                  <span className="feed-status" data-tone={it.kind === 'outlier_kept' ? 'normal' : 'unknown'}>
                    {it.kind === 'outlier_kept' ? <IconCheck /> : <IconTriangle />}
                    {KIND_LABEL[it.kind] ?? it.kind}
                  </span>
                </div>
                <div className="muted">
                  {it.source} feed · received {formatClock(it.received_min)}
                  {it.subject ? ` · ${it.subject}` : ''}
                </div>
                <div>{it.reason}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function AmbulancePanel({ snap }: { snap: Snapshot | null }) {
  const inbound = snap?.inbound_ambulances ?? [];
  const summary = snap?.inbound_summary;
  return (
    <section className="panel" aria-labelledby="amb-h">
      <h2 id="amb-h">Inbound ambulances</h2>
      <dl className="kv">
        <dt>Ambulances en route</dt>
        <dd data-testid="amb-count">{summary ? summary.ambulances : '—'}</dd>
        <dt>Announced inbound patients</dt>
        <dd data-testid="amb-patients">{summary ? summary.patients : '—'}</dd>
      </dl>
      {!snap ? (
        <p className="muted" style={{ marginTop: 'var(--s-3)' }}>
          Announcements appear once the simulation has started.
        </p>
      ) : inbound.length === 0 ? (
        <p className="muted" style={{ marginTop: 'var(--s-3)' }} data-testid="amb-empty">
          No ambulances are currently announced.
          {summary?.feed_last_update_min != null &&
            ` Last ambulance update at ${formatClock(summary.feed_last_update_min)}.`}
        </p>
      ) : (
        <ul className="amb-list" data-testid="amb-list">
          {inbound.map((a) => {
            const critical = a.acuity?.filter((x) => x.critical_bypass).length ?? 0;
            return (
              <li key={a.id} data-testid={`amb-${a.id}`} data-status={a.status}>
                <div className="amb-row">
                  <strong>{a.id}</strong>
                  <span className="amb-status" data-tone={a.status === 'delayed' ? 'pressure' : 'unknown'}>
                    {a.status === 'delayed' ? <IconTriangle /> : <IconClock />}
                    {AMB_STATUS[a.status as 'en_route' | 'delayed']}
                  </span>
                </div>
                <div className="muted">
                  ETA {formatClock(a.eta_min)} ±{a.eta_uncertainty_min} min ·{' '}
                  {patientCount(a.patient_count)}
                  {a.minutes_overdue !== null && ` · ${Math.round(a.minutes_overdue)} min overdue`}
                </div>
                <div className="muted">
                  {a.acuity
                    ? `Supplied acuity: ${a.acuity.map((x) => x.acuity).join(', ')}${
                        critical ? ` · ${critical} critical bypass` : ''
                      }`
                    : 'Acuity not yet reported'}
                  {` · updated ${formatClock(a.source_updated_min)}`}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
