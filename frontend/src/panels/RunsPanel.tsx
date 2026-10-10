import { formatClock } from '../format';
import { IconCheck, IconClock } from '../icons';
import type { ForecastSamples } from '../Forecast';
import type { SavedSummary, ScenarioInfo, Snapshot } from '../types';

function partitionOf(info: ScenarioInfo | undefined, seed: number): string {
  if (!info) return 'unknown';
  for (const [name, seeds] of Object.entries(info.seed_partitions)) if (seeds.includes(seed)) return name;
  return 'custom';
}

/** Presenter controls and the evidence record: scenario family, its warm-up and scored duration, the
 * seed partition, and saved runs. Kept apart from the staff controls above. */
export function RunsPanel({
  snap,
  scenarios,
  scenarioId,
  onScenario,
  fixtureLocked,
  onSave,
  saveNote,
  saved,
  onLoad,
  fcSamples,
  onFcSamples,
}: {
  snap: Snapshot | null;
  scenarios: ScenarioInfo[];
  scenarioId: string;
  onScenario: (id: string) => void;
  fixtureLocked: boolean;
  onSave: () => void;
  saveNote: string | null;
  saved: SavedSummary[];
  onLoad: (savedId: string) => void;
  fcSamples: ForecastSamples;
  onFcSamples: (n: ForecastSamples) => void;
}) {
  const info = scenarios.find((s) => s.id === scenarioId);
  const runInfo = snap ? scenarios.find((s) => s.id === snap.scenario) : undefined;
  const pending = snap !== null && snap.scenario !== scenarioId;
  return (
    <section className="panel" aria-labelledby="runs-h">
      <h2 id="runs-h">Scenario and saved runs</h2>
      <label className="field-label" htmlFor="scenario-select">
        Scenario
      </label>
      <select
        id="scenario-select"
        className="select"
        data-testid="scenario-select"
        value={scenarioId}
        disabled={fixtureLocked || scenarios.length === 0}
        onChange={(e) => onScenario(e.target.value)}
      >
        {scenarios.length === 0 && <option value={scenarioId}>Normal shift</option>}
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.demo ? ` (${s.demo})` : ''}
          </option>
        ))}
      </select>
      {info && (
        <p className="muted" data-testid="scenario-desc" style={{ marginTop: 'var(--s-2)' }}>
          {info.description} {info.workload_variant}
        </p>
      )}
      {pending && (
        <p data-testid="scenario-pending" style={{ marginTop: 'var(--s-2)' }}>
          The running replay is “{snap?.scenario_name}”. Reset to run {info?.name ?? scenarioId}.
        </p>
      )}
      {snap?.saved_run && (
        <p className="synthetic-chip" data-testid="loaded-run" style={{ marginTop: 'var(--s-3)' }}>
          Loaded saved run {snap.saved_run.id}: {snap.saved_run.label}
        </p>
      )}
      {snap && runInfo && (
        <dl className="kv" style={{ marginTop: 'var(--s-3)' }} data-testid="run-record">
          <dt>Warm-up / scored</dt>
          <dd data-testid="run-warmup">
            {runInfo.warmup_min} min / {runInfo.scored_min} min
          </dd>
          <dt>Seed</dt>
          <dd data-testid="run-seed">
            {snap.seed} ({partitionOf(runInfo, snap.seed)})
          </dd>
          <dt>Versions</dt>
          <dd data-testid="run-versions">
            API {snap.api_version} · profile {snap.profile_id}
          </dd>
        </dl>
      )}
      <span className="field-label" id="fc-samples-l" style={{ marginTop: 'var(--s-3)' }}>
        Forecast futures per refresh
      </span>
      <div className="segmented" role="group" aria-labelledby="fc-samples-l">
        {([50, 100] as const).map((n) => (
          <button key={n} aria-pressed={fcSamples === n} onClick={() => onFcSamples(n)} data-testid={`fc-samples-${n}`}>
            {n}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 'var(--s-4)' }}>
        <button className="btn btn-block" onClick={onSave} disabled={!snap} data-testid="save-run">
          Save run
        </button>
      </div>
      <div aria-live="polite" role="status">
        {saveNote && (
          <p data-testid="save-note" className="muted" style={{ marginTop: 'var(--s-2)' }}>
            {saveNote}
          </p>
        )}
      </div>
      <h3 className="subhead">Saved runs</h3>
      {saved.length === 0 ? (
        <p className="muted" data-testid="saved-empty">
          No saved runs yet.
        </p>
      ) : (
        <ul className="feed-list" data-testid="saved-list">
          {saved.map((s) => (
            <li key={s.saved_id} data-testid={`saved-${s.saved_id}`} data-completed={s.completed}>
              <div className="feed-row">
                <strong>{s.scenario_name}</strong>
                <span className="feed-status" data-tone={s.completed ? 'normal' : 'unknown'}>
                  {s.completed ? <IconCheck /> : <IconClock />}
                  {s.completed ? 'Completed' : 'In progress'}
                </span>
              </div>
              <div className="muted">
                {s.label} · seed {s.seed} · {formatClock(s.sim_time_min)} · {s.event_count} events
              </div>
              <div className="btn-row">
                <button className="btn" onClick={() => onLoad(s.saved_id)} data-testid={`saved-load-${s.saved_id}`}>
                  Load
                </button>
                <a className="btn" href={`/api/v1/saved/${s.saved_id}`} target="_blank" rel="noreferrer">
                  Open record
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
