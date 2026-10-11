import { useRef, type ReactNode } from 'react';
import { clock, type ForecastView } from '../Forecast';
import { IconOctagon, IconTriangle } from '../icons';
import { ZONE_NAMES, type Forecast, type Snapshot } from '../types';

/**
 * The newest forecast that still describes this replay. Between a new state arriving and its forecast
 * landing, the previous one (at most ten simulated minutes old) stays on screen instead of vanishing,
 * so the spine and dock do not flicker while playing.
 */
function useForecastFor(snap: Snapshot | null, view: ForecastView): Forecast | null {
  const last = useRef<{ replay: string; run: number; f: Forecast } | null>(null);
  if (!snap) return null;
  if (view.data && view.data.source.version === snap.version && view.data.status === 'ok') {
    last.current = { replay: snap.replay_id, run: snap.run_number, f: view.data };
  }
  const l = last.current;
  if (!l || l.replay !== snap.replay_id || l.run !== snap.run_number) return null;
  const age = snap.sim_time_min - l.f.forecast_time_min;
  return age >= 0 && age <= 10 ? l.f : null;
}

function strongest(snap: Snapshot, f: Forecast) {
  const risks = f.alerts.actionable
    .filter((a) => a.kind === 'forecast_risk')
    .sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0));
  const top = risks[0] ?? f.alerts.actionable[0] ?? f.alerts.recovery[0] ?? null;
  const inMin = top?.onset
    ? Math.max(0, Math.round(top.onset.expected_in_min - (snap.sim_time_min - f.forecast_time_min)))
    : null;
  return { top, inMin };
}

/** One line over the map: the strongest alert already in the forecast, and the way into the fixes. */
export function AlertSpine({
  snap,
  view,
  onCompare,
}: {
  snap: Snapshot;
  view: ForecastView;
  onCompare: (zone: number) => void;
}) {
  const f = useForecastFor(snap, view);
  if (!f) return null;
  const { top, inMin } = strongest(snap, f);
  if (!top) return null;
  const hot = top.kind === 'overloaded';
  const lead = hot ? 'Overloaded now' : top.kind === 'building' ? 'Getting busy' : 'Forecast alert';
  const bits: string[] = [];
  if (!hot && top.chance !== null && top.chance !== undefined) bits.push(`${Math.round(top.chance * 100)}% chance`);
  if (inMin !== null && top.onset) {
    bits.push(`~${inMin} min (${Math.round(top.onset.low_in_min ?? 0)}–${Math.round(top.onset.high_in_min ?? 0)})`);
  }
  if (top.category_label) bits.push(`bottleneck: ${top.category_label}`);
  bits.push(`local, overall stays ${snap.overall_status.label}`);
  return (
    <div className="alert-spine" data-tone={hot ? 'overload' : 'pressure'} data-testid="alert-spine" role="status">
      <span className="alert-spine-icon">{hot ? <IconOctagon /> : <IconTriangle />}</span>
      <strong className="alert-spine-lead">
        {lead} · Zone {top.zone}
      </strong>
      <span className="alert-spine-text">{bits.join(' · ')}</span>
      <button className="btn btn-primary" onClick={() => onCompare(top.zone)} data-testid="alert-spine-compare">
        Compare actions
      </button>
    </div>
  );
}

const HORIZON = 90;

/** The dock's centre and right: the onset window on a 90-minute line, and four plain facts. */
export function ForecastDock({
  snap,
  view,
  strip,
}: {
  snap: Snapshot | null;
  view: ForecastView;
  strip: ReactNode;
}) {
  const f = useForecastFor(snap, view);
  const s = snap && f ? strongest(snap, f) : null;
  const o = s?.top?.onset ?? null;
  const x = (min: number) => 40 + (Math.max(0, Math.min(HORIZON, min)) / HORIZON) * 720;
  const sp = snap?.resources.ed_spaces;
  const chance = s?.top?.chance ?? null;
  return (
    <>
      <section className="dock-chart" aria-label="When the overload may start" data-testid="dock-chart">
        <header>
          <span className="eyebrow">Forecast</span>
          <strong>
            {!snap
              ? 'Next 90 minutes'
              : !f
                ? 'Working out the forecast…'
                : s?.top
                  ? `${ZONE_NAMES[s.top.zone] ?? s.top.name}: ${Math.round((chance ?? 0) * 100)}% chance of overload in the next 90 minutes`
                  : 'No area is close to overload in the next 90 minutes'}
          </strong>
        </header>
        <svg viewBox="0 0 800 110" preserveAspectRatio="none" role="img" aria-label="Time line for the next 90 minutes">
          <line x1="40" y1="64" x2="760" y2="64" className="dc-axis" />
          {[0, 30, 60, 90].map((m) => (
            <g key={m}>
              <line x1={x(m)} y1="58" x2={x(m)} y2="70" className="dc-tick" />
              <text x={x(m)} y="92" textAnchor="middle" className="dc-label">
                {m === 0 ? (snap ? clock(snap.sim_time_min) : 'now') : `+${m} min`}
              </text>
            </g>
          ))}
          {o && (
            <>
              <rect x={x(o.low_in_min ?? 0)} y="56" width={Math.max(4, x(o.high_in_min ?? HORIZON) - x(o.low_in_min ?? 0))} height="16" rx="8" className="dc-window" />
              <line x1={x(s?.inMin ?? o.expected_in_min)} y1="22" x2={x(s?.inMin ?? o.expected_in_min)} y2="76" className="dc-mark" />
              <text x={Math.min(x(s?.inMin ?? o.expected_in_min) + 8, 700)} y="30" className="dc-mark-label">
                ~{s?.inMin ?? Math.round(o.expected_in_min)} min
              </text>
            </>
          )}
        </svg>
        <p className="dc-caption">
          {o
            ? 'The red bar is the likely window; the line is the best single guess.'
            : snap && f
              ? 'No overload is expected inside this window.'
              : ''}
        </p>
      </section>
      <section className="dock-facts" aria-label="Key facts">
        <dl>
          <div><dt>Chance of overload</dt><dd>{chance === null ? '—' : `${Math.round(chance * 100)}%`}</dd></div>
          <div><dt>Time left</dt><dd>{s?.inMin !== null && s?.inMin !== undefined ? `~${s.inMin} min` : '—'}</dd></div>
          <div><dt>Waiting for a space</dt><dd>{sp ? (sp.awaiting_space === null ? 'n/a' : sp.awaiting_space) : '—'}</dd></div>
          <div><dt>Free staffed spaces</dt><dd>{sp ? (sp.available_staffed === null ? 'n/a' : sp.available_staffed) : '—'}</dd></div>
        </dl>
        <details className="fc-more">
          <summary>Forecast details and limits</summary>
          {strip}
        </details>
      </section>
    </>
  );
}
