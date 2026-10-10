import type { ForecastView } from '../Forecast';
import { IconOctagon, IconTriangle } from '../icons';
import { ZONE_NAMES, type Snapshot } from '../types';

function strongest(snap: Snapshot, view: ForecastView) {
  const f = view.data && view.data.source.version === snap.version ? view.data : null;
  if (!f || f.status !== 'ok') return null;
  const risks = f.alerts.actionable
    .filter((a) => a.kind === 'forecast_risk')
    .sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0));
  const top = risks[0] ?? f.alerts.actionable[0] ?? f.alerts.recovery[0];
  if (!top) return { f, top: null, inMin: null as number | null };
  const inMin = top.onset
    ? Math.max(0, Math.round(top.onset.expected_in_min - (snap.sim_time_min - f.forecast_time_min)))
    : null;
  return { f, top, inMin };
}

/**
 * One plain sentence over the map: which area is likely to be in trouble, how soon, how likely, and
 * the way into the fixes. It restates the strongest alert already in the forecast for this exact
 * state; it never computes or invents one.
 */
export function AlertSpine({
  snap,
  view,
  onCompare,
}: {
  snap: Snapshot;
  view: ForecastView;
  onCompare: (zone: number) => void;
}) {
  const s = strongest(snap, view);
  if (!s || !s.top) return null;
  const { top, inMin } = s;
  const hot = top.kind === 'overloaded';
  const where = ZONE_NAMES[top.zone] ?? top.name;
  const sentence = hot
    ? `${where} is overloaded now`
    : top.kind === 'building'
      ? `${where} is getting busy`
      : inMin !== null
        ? `${where} may overload in about ${inMin} min`
        : `${where} may overload soon`;
  return (
    <div className="alert-spine" data-tone={hot ? 'overload' : 'pressure'} data-testid="alert-spine" role="status">
      <span className="alert-spine-icon">{hot ? <IconOctagon /> : <IconTriangle />}</span>
      <strong>{sentence}</strong>
      {!hot && top.chance !== null && top.chance !== undefined && <span>{Math.round(top.chance * 100)}% chance</span>}
      <button className="btn btn-primary" onClick={() => onCompare(top.zone)} data-testid="alert-spine-compare">
        See the fixes
      </button>
    </div>
  );
}

/** The dock's headline: two plain lines. The full forecast stays one click away. */
export function DockSummary({
  snap,
  view,
  onCompare,
}: {
  snap: Snapshot;
  view: ForecastView;
  onCompare: () => void;
}) {
  const s = strongest(snap, view);
  const overall = s?.f.overall;
  const overallText =
    !s
      ? 'Working out the forecast…'
      : overall && overall.kind === 'new_onset'
        ? `The whole ED ${(overall.chance ?? 0) < 0.25 ? "is unlikely to overload" : "may overload"} (${Math.round((overall.chance ?? 0) * 100)}% chance in the next 90 minutes).`
        : overall && overall.kind === 'confirmation'
          ? 'The ED is getting busy. Watch it closely.'
          : overall
            ? 'The ED is overloaded right now.'
            : 'No overall forecast yet.';
  return (
    <div className="dock-summary" data-testid="dock-summary">
      <span className="eyebrow">Whole ED, next 90 minutes</span>
      <p>{overallText}</p>
      {s && s.top && (
        <button className="btn" onClick={onCompare}>
          Compare fixes
        </button>
      )}
    </div>
  );
}
