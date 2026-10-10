import { clockOrDash, fig, ofTotal } from '../format';
import type { Snapshot, Urgency } from '../types';

export const URGENCY_LABEL: Record<Urgency, string> = {
  urgent: 'Urgent',
  medium: 'Medium urgency',
  lower: 'Lower urgency',
};

export const URGENCY_COLOR: Record<Urgency, string> = {
  urgent: 'var(--urgency-urgent)',
  medium: 'var(--urgency-medium)',
  lower: 'var(--urgency-lower)',
};

export const URGENCY_SIZE: Record<Urgency, number> = { urgent: 18, medium: 14, lower: 12 };

/** ED resources (live counts) and the patient-dot legend. */
export function ResourcesPanel({ snap }: { snap: Snapshot | null }) {
  return (
    <>
    {snap && (
      <section className="panel" aria-labelledby="res-h">
        <h2 id="res-h">ED resources</h2>
        {Object.values(snap.feeds).some((f) => f.id !== 'replay' && f.status !== 'fresh') && (
          <p className="muted" data-testid="resources-stale" style={{ marginBottom: 'var(--s-3)' }}>
            Some figures are the last valid values from a feed that is no longer current:{' '}
            {Object.values(snap.feeds)
              .filter((f) => f.id !== 'replay' && f.status !== 'fresh')
              .map((f) => `${f.label.toLowerCase()} (last valid ${clockOrDash(f.last_update_min)})`)
              .join(', ')}
            .
          </p>
        )}
        <dl className="kv">
          <dt>Available staffed spaces</dt>
          <dd data-testid="available-spaces">
            {ofTotal(snap.resources.ed_spaces.available_staffed, snap.resources.ed_spaces.total)}
          </dd>
          <dt>Staffed spaces</dt>
          <dd data-testid="staffed-spaces">
            {snap.resources.ed_spaces.staffed_total} of {snap.resources.ed_spaces.total}
          </dd>
          <dt>Occupied spaces</dt>
          <dd data-testid="occupied-spaces">{snap.resources.ed_spaces.occupied}</dd>
          <dt>Awaiting a space</dt>
          <dd data-testid="awaiting-space">{fig(snap.resources.ed_spaces.awaiting_space)}</dd>
          <dt>Resuscitation spaces free</dt>
          <dd data-testid="resus-available">
            {snap.resources.resus_spaces.available} of {snap.resources.resus_spaces.total}
          </dd>
          <dt>Triage desk busy</dt>
          <dd data-testid="triage-busy">
            {ofTotal(snap.resources.triage_desk.busy, snap.resources.triage_desk.total)}
          </dd>
          <dt>Lab busy</dt>
          <dd data-testid="lab-busy">
            {ofTotal(snap.resources.diagnostics.lab.busy, snap.resources.diagnostics.lab.servers)}
            {(snap.resources.diagnostics.lab.waiting ?? 0) > 0 &&
              ` · ${snap.resources.diagnostics.lab.waiting} waiting`}
          </dd>
          <dt>Imaging busy</dt>
          <dd data-testid="imaging-busy">
            {ofTotal(snap.resources.diagnostics.imaging.busy, snap.resources.diagnostics.imaging.servers)}
            {(snap.resources.diagnostics.imaging.waiting ?? 0) > 0 &&
              ` · ${snap.resources.diagnostics.imaging.waiting} waiting`}
          </dd>
          <dt>Discharge processing busy</dt>
          <dd data-testid="discharge-busy">
            {ofTotal(snap.resources.disposition.discharge.busy, snap.resources.disposition.discharge.servers)}
          </dd>
          <dt>Ward allocation busy</dt>
          <dd data-testid="allocation-busy">
            {ofTotal(snap.resources.disposition.allocation.busy, snap.resources.disposition.allocation.servers)}
          </dd>
          <dt>Transport busy</dt>
          <dd data-testid="transport-busy">
            {ofTotal(snap.resources.disposition.transport.busy, snap.resources.disposition.transport.servers)}
          </dd>
          <dt>Ward beds free</dt>
          <dd data-testid="ward-beds-free">
            {snap.resources.disposition.beds.ward.free} of {snap.resources.disposition.beds.ward.total}
          </dd>
          <dt>ICU beds free</dt>
          <dd data-testid="icu-beds-free">
            {snap.resources.disposition.beds.icu.free} of {snap.resources.disposition.beds.icu.total}
          </dd>
          <dt>Doctors busy</dt>
          <dd>
            {ofTotal(snap.resources.clinician_slots.busy, snap.resources.clinician_slots.total)}
          </dd>
          <dt>Patients in the ED</dt>
          <dd data-testid="in-ed">{snap.counts.in_ed}</dd>
          <dt>Departed so far</dt>
          <dd data-testid="departed">{snap.counts.departed_total}</dd>
        </dl>
      </section>
    )}
    
    <section className="panel" aria-labelledby="leg-h">
      <h2 id="leg-h">Patient dots</h2>
      <ul className="legend">
        {(['urgent', 'medium', 'lower'] as Urgency[]).map((u) => (
          <li key={u}>
            <span
              className="swatch"
              style={{
                width: URGENCY_SIZE[u],
                height: URGENCY_SIZE[u],
                background: URGENCY_COLOR[u],
              }}
            />
            {URGENCY_LABEL[u]}
          </li>
        ))}
      </ul>
    </section>
    </>
  );
}
