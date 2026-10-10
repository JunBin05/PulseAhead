import type { ForecastView } from '../Forecast';
import { IconOctagon, IconTriangle } from '../icons';
import type { Snapshot } from '../types';

const KIND_LABEL: Record<string, string> = {
  forecast_risk: 'Forecast risk',
  building: 'Building',
  overloaded: 'Overloaded now',
};

/**
 * One line over the map that carries the headline of the forecast: which zone, how likely, when,
 * and the way into the action comparison. It only restates the strongest alert already in the
 * forecast for this exact state; it never computes or invents one.
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
  const f = view.data && view.data.source.version === snap.version ? view.data : null;
  if (!f || f.status !== 'ok') return null;
  const risks = f.alerts.actionable
    .filter((a) => a.kind === 'forecast_risk')
    .sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0));
  const top = risks[0] ?? f.alerts.actionable[0] ?? f.alerts.recovery[0];
  if (!top) return null;
  const hot = top.kind === 'overloaded';
  const inMin = top.onset
    ? Math.max(0, Math.round(top.onset.expected_in_min - (snap.sim_time_min - f.forecast_time_min)))
    : null;
  return (
    <div className="alert-spine" data-tone={hot ? 'overload' : 'pressure'} data-testid="alert-spine" role="status">
      <span className="alert-spine-icon">{hot ? <IconOctagon /> : <IconTriangle />}</span>
      <strong>
        Zone {top.zone} · {top.name}
      </strong>
      <span className="alert-spine-kind">{KIND_LABEL[top.kind] ?? top.kind}</span>
      {top.chance !== null && top.chance !== undefined && <span>{Math.round(top.chance * 100)}% chance</span>}
      {inMin !== null && top.onset && (
        <span>
          starts in ~{inMin} min ({Math.round(top.onset.low_in_min ?? 0)}–{Math.round(top.onset.high_in_min ?? 0)})
        </span>
      )}
      <button className="btn btn-primary" onClick={() => onCompare(top.zone)} data-testid="alert-spine-compare">
        Compare actions
      </button>
    </div>
  );
}
