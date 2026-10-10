import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { IconCheck, IconTriangle, IconUnknown } from './icons';
import type { AnalysisResult, AnalystCause, ComparisonRow, Snapshot } from './types';

const CONFIDENCE: Record<AnalystCause['confidence'], string> = {
  supported: 'Supported by cited evidence',
  possible: 'Possible',
  unknown: 'Unknown: evidence does not establish this',
};

/** Evidence keys are the model's own citations; showing them lets staff check each claim. */
function Cited({ keys }: { keys: string[] }) {
  if (keys.length === 0) return <span className="muted">No evidence cited.</span>;
  return (
    <ul className="analyst-cites" aria-label="Cited evidence">
      {keys.map((k) => (
        <li key={k}>
          <code>{k}</code>
        </li>
      ))}
    </ul>
  );
}

/**
 * The LLM analyst: cited causes, proposals the simulator has priced, and untested ideas. It is asked for
 * on demand and always describes one state version. Numbers and rank labels on a proposal come from the
 * comparison above; the model's own text carries none, and untested ideas have no approval path.
 */
export function AnalystPanel({
  snap,
  samples,
  cmpRows,
  stale,
  busy,
  onRequest,
}: {
  snap: Snapshot;
  samples: number;
  cmpRows: ComparisonRow[];
  stale: boolean;
  busy: boolean;
  onRequest: (row: ComparisonRow) => void;
}) {
  const [res, setRes] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // A different replay or run can never be described by this analysis.
  useEffect(() => {
    setRes(null);
    setError(null);
  }, [snap.replay_id, snap.run_number]);

  const sameRun = !!res && res.source.replay_id === snap.replay_id && res.source.run_number === snap.run_number;
  const old = !!res && (!sameRun || res.source.version !== snap.version);

  const ask = () => {
    const s = snapRef.current;
    setLoading(true);
    setError(null);
    api
      .analysis(s.replay_id, samples, s.version)
      .then((r) => {
        if (snapRef.current.replay_id === r.source.replay_id && snapRef.current.run_number === r.source.run_number) {
          setRes(r);
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'The analysis could not be computed.'))
      .finally(() => setLoading(false));
  };

  return (
    <section className="analyst" aria-labelledby="analyst-h" data-testid="analyst-panel">
      <h3 id="analyst-h">Analyst: causes and proposals</h3>
      <p className="muted" data-testid="analyst-label">
        AI-generated analysis of a synthetic demo. It reads only received data. The simulation prices each
        proposal; the model never supplies a number, a forecast or a rank.
      </p>
      <button className="btn" onClick={ask} disabled={loading} data-testid="analyst-ask">
        {loading ? 'Analysing…' : res ? 'Analyse again' : 'Ask the analyst'}
      </button>
      {error && (
        <p className="request-message" role="alert" data-testid="analyst-error">
          <IconTriangle /> {error}
        </p>
      )}
      {old && (
        <p className="banner" data-tone="pending" role="status" data-testid="analyst-stale">
          This analysis is from {res?.source.sim_time_min} min; the state has moved on. Analyse again before acting.
        </p>
      )}
      {res && res.status === 'cannot_assess' && (
        <p data-testid="analyst-cannot-assess">
          <IconTriangle /> Cannot assess: essential data is missing or stale. No analysis is shown.
        </p>
      )}
      {res && res.status === 'unavailable' && (
        <p data-testid="analyst-unavailable">
          <IconTriangle /> Analyst unavailable. The comparison above is unaffected. {res.reason}
        </p>
      )}
      {res && res.status === 'recorded' && (
        <p className="banner" data-tone="pending" role="status" data-testid="analyst-recorded">
          Recorded analysis, not live. {res.reason}
        </p>
      )}
      {res && (res.status === 'ok' || res.status === 'recorded') && (
        <div data-testid="analyst-result" data-stale={old}>
          <p className="muted">Model: {res.model}</p>
          <h4>Likely causes</h4>
          {res.causes.length === 0 && <p className="muted">No cause could be established from the evidence.</p>}
          <ul className="analyst-list" data-testid="analyst-causes">
            {res.causes.map((c, i) => (
              <li key={i} data-confidence={c.confidence}>
                <p>
                  {c.confidence === 'unknown' ? <IconUnknown /> : <IconCheck />} {c.statement}
                </p>
                <p className="muted">{CONFIDENCE[c.confidence]}</p>
                <Cited keys={c.cited} />
                {c.note && <p className="muted">{c.note}</p>}
              </li>
            ))}
          </ul>

          <h4>Proposals the simulation priced</h4>
          {res.structured_proposals.length === 0 && (
            <p className="muted">No proposal maps to a declared reserve that is feasible now.</p>
          )}
          {res.structured_proposals.map((p) => {
            const row = cmpRows.find((r) => r.id === p.catalog_id);
            const good = p.rank?.label === 'best_action' || p.rank?.label === 'supported_not_top';
            return (
              <article key={p.catalog_id} className="cmp-action" data-testid={`analyst-proposal-${p.catalog_id}`}>
                <h3>{p.title}</h3>
                <p>{p.rationale}</p>
                <Cited keys={p.cited} />
                {p.rank && (
                  <p className="status" data-tone={good ? 'normal' : 'pressure'} data-label={p.rank.label}>
                    {good ? <IconCheck /> : <IconTriangle />}
                    <span>{p.rank.text}</span>
                  </p>
                )}
                <p className="muted">
                  Simulated numbers and checks are in the comparison above ({p.catalog_id}). Approval needed from{' '}
                  <strong>{p.owners.join(', ')}</strong>.
                </p>
                <button
                  className="btn btn-primary"
                  disabled={!row || !row.feasible || stale || old || busy}
                  onClick={() => row && onRequest(row)}
                  data-testid={`analyst-request-${p.catalog_id}`}
                >
                  Request this action
                </button>
              </article>
            );
          })}

          <h4>Untested ideas, not simulated</h4>
          <p className="muted">
            These cannot be priced or approved here. They are prompts for staff judgement, not recommendations.
          </p>
          {res.untested_ideas.length === 0 && <p className="muted">None.</p>}
          <ul className="analyst-list untested" data-testid="analyst-ideas">
            {res.untested_ideas.map((d, i) => (
              <li key={i}>
                <p>
                  <strong>Untested:</strong> {d.title}
                </p>
                {d.rationale && <p>{d.rationale}</p>}
                <p className="muted">Why untested: {d.reason_untested}</p>
                <Cited keys={d.cited} />
              </li>
            ))}
          </ul>
          {res.rejected.length > 0 && (
            <details className="muted">
              <summary>{res.rejected.length} model item(s) were not shown</summary>
              <ul>
                {res.rejected.map((r, i) => (
                  <li key={i}>
                    {r.item}: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
