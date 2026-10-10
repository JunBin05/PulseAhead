import type { ReactNode } from 'react';
import type { ForecastView } from '../Forecast';
import { IconCheck, IconClock, IconOctagon, IconTriangle, IconUnknown } from '../icons';
import type { Snapshot } from '../types';

type Tone = 'normal' | 'pressure' | 'overload' | 'unknown' | 'accent';

const ICON: Record<Tone, ReactNode> = {
  normal: <IconCheck />,
  pressure: <IconTriangle />,
  overload: <IconOctagon />,
  unknown: <IconUnknown />,
  accent: <IconClock />,
};

function Tile({ label, value, sub, tone, testid }: { label: string; value: ReactNode; sub?: ReactNode; tone: Tone; testid: string }) {
  return (
    <div className="kpi" data-tone={tone} data-testid={testid}>
      <span className="kpi-label">
        {ICON[tone]}
        {label}
      </span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

/**
 * The live headline numbers, read from the current state and the forecast for that same state. A figure
 * the backend cannot currently give reads "Not current" or "Cannot assess", never zero.
 */
export function KpiRow({ snap, view }: { snap: Snapshot | null; view: ForecastView }) {
  if (!snap) return null;
  const f = view.data && view.data.source.version === snap.version ? view.data : null;
  const sp = snap.resources.ed_spaces;
  const now = snap.sim_time_min;
  const cannot = !snap.overall_status.assessable || f?.status === 'cannot_assess';
  const o = f?.status === 'ok' ? f.overall : null;
  const threshold = f?.model.settings.warning_threshold ?? 0.6;

  // Strongest risk across the overall ED and every service, so a local risk is never hidden.
  const risks = f?.status === 'ok' ? f.alerts.actionable.filter((a) => a.kind === 'forecast_risk') : [];
  const topLocal = [...risks].sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0))[0];
  const overallChance = o?.kind === 'new_onset' ? o.chance : null;

  let riskValue: ReactNode = view.status === 'error' ? 'Unavailable' : 'Computing…';
  let riskSub: ReactNode = 'overall ED, next 90 min';
  let riskTone: Tone = 'unknown';
  if (cannot) {
    riskValue = 'Cannot assess';
    riskSub = 'essential data missing or stale';
  } else if (o && o.kind === 'new_onset') {
    riskValue = `${Math.round((overallChance ?? 0) * 100)}%`;
    riskTone = (overallChance ?? 0) >= threshold ? 'overload' : 'normal';
  } else if (o && o.kind === 'confirmation') {
    riskValue = 'Building';
    riskSub = `${Math.round((o.chance ?? 0) * 100)}% chance it is confirmed`;
    riskTone = 'pressure';
  } else if (o) {
    riskValue = 'Congested';
    riskSub = `${Math.round((o.chance ?? 0) * 100)}% chance it clears in 90 min`;
    riskTone = 'overload';
  }

  let localValue: ReactNode = cannot ? 'Cannot assess' : f ? 'None' : '—';
  let localSub: ReactNode = 'no service at its warning level';
  let localTone: Tone = cannot ? 'unknown' : 'normal';
  if (topLocal && !cannot) {
    localValue = `${topLocal.name} ${Math.round((topLocal.chance ?? 0) * 100)}%`;
    localSub = topLocal.onset
      ? `starts in ~${Math.max(0, Math.round(topLocal.onset.expected_in_min - (now - (f?.forecast_time_min ?? now))))} min (${Math.round(topLocal.onset.low_in_min ?? 0)}–${Math.round(topLocal.onset.high_in_min ?? 0)})`
      : `local, zone ${topLocal.zone}`;
    localTone = 'pressure';
  }
  const overloaded = f?.status === 'ok' ? f.alerts.recovery.length : 0;
  const building = f?.status === 'ok' ? f.alerts.actionable.filter((a) => a.kind === 'building').length : 0;
  const announced = snap.inbound_ambulances.filter((a) => a.eta_min > now && a.eta_min <= now + 30).reduce((n, a) => n + a.patient_count, 0);

  return (
    <section className="kpi-row" aria-label="Live headline figures" data-testid="kpi-row">
      <Tile testid="kpi-risk" label="Congestion risk" value={riskValue} sub={riskSub} tone={riskTone} />
      <Tile testid="kpi-local" label="Earliest local warning" value={localValue} sub={localSub} tone={localTone} />
      <Tile
        testid="kpi-spaces"
        label="Free staffed spaces"
        value={sp.available_staffed === null ? 'Not current' : `${sp.available_staffed}`}
        sub={`of ${sp.total} spaces · ${sp.occupied} occupied`}
        tone={sp.available_staffed === null ? 'unknown' : sp.available_staffed === 0 ? 'overload' : sp.available_staffed <= 2 ? 'pressure' : 'normal'}
      />
      <Tile
        testid="kpi-waiting"
        label="Waiting for a space"
        value={sp.awaiting_space === null ? 'Not current' : `${sp.awaiting_space}`}
        sub={`${snap.counts.in_ed} patients in the ED`}
        tone={sp.awaiting_space === null ? 'unknown' : sp.awaiting_space >= 6 ? 'overload' : sp.awaiting_space > 0 ? 'pressure' : 'normal'}
      />
      <Tile
        testid="kpi-arrivals"
        label="Announced, next 30 min"
        value={`${announced}`}
        sub={`${snap.inbound_summary.ambulances} ambulance${snap.inbound_summary.ambulances === 1 ? '' : 's'} en route`}
        tone={announced >= 2 ? 'pressure' : 'accent'}
      />
      <Tile
        testid="kpi-alerts"
        label="Local alerts now"
        value={`${overloaded + building}`}
        sub={`${overloaded} overloaded · ${building} building`}
        tone={overloaded ? 'overload' : building ? 'pressure' : 'normal'}
      />
    </section>
  );
}
