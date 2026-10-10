import type {
  ActionRequest,
  ComparisonResult,
  DemoCase,
  DemoDrivers,
  SavedEvaluation,
  Forecast,
  ForecastExplanation,
  SavedSummary,
  ScenarioCatalog,
  Snapshot,
  ZoneDetail,
} from './types';

const BASE = '/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('The simulation service is not reachable.', 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
      /* keep status text */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  /** `scenario` is only set by the test-only `?fixture=` URL parameter; staff use the default. */
  create: (scenario?: string, seed?: number) =>
    request<Snapshot>('/replays', {
      method: 'POST',
      body: JSON.stringify({
        ...(scenario === undefined ? {} : { scenario }),
        ...(seed === undefined ? {} : { seed }),
      }),
    }),
  /** Received events (the replay's own record), for evidence such as which unit completed a test. */
  events: (id: string) =>
    request<{ events: { type: string; event_time_min: number; payload: Record<string, unknown> }[] }>(
      `/replays/${id}/events`,
    ),
  state: (id: string) => request<Snapshot>(`/replays/${id}/state`),
  /** One zone's roster, assigned staff, queues and capacity at the replay's current version. */
  zone: (id: string, zone: number) => request<ZoneDetail>(`/replays/${id}/zones/${zone}`),
  /** Applies only at `expectedVersion`; a 409 means the replay moved on and the caller should reload. */
  advance: (id: string, minutes: number, expectedVersion: number) =>
    request<Snapshot>(`/replays/${id}/advance`, {
      method: 'POST',
      body: JSON.stringify({ minutes, expected_version: expectedVersion }),
    }),
  /** Reset restarts the same seed; a `scenario` switches the scenario family for the new run. */
  reset: (id: string, scenario?: string) =>
    request<Snapshot>(`/replays/${id}/reset`, {
      method: 'POST',
      body: JSON.stringify(scenario === undefined ? {} : { scenario }),
    }),
  scenarios: () => request<ScenarioCatalog>('/scenarios'),
  /** Independent futures from the received state; the response carries the state version it used. */
  forecast: (id: string, samples: number) =>
    request<Forecast>(`/replays/${id}/forecast`, { method: 'POST', body: JSON.stringify({ samples }) }),
  /** Why one zone's alert appeared, for the forecast already computed at `version`. */
  explain: (id: string, zone: number, samples: number, version: number) =>
    request<ForecastExplanation>(`/replays/${id}/forecast/explain`, {
      method: 'POST',
      body: JSON.stringify({ zone, samples, expected_version: version }),
    }),
 /** No action against each feasible action on the same keyed futures, for the state at `version`. */
  compare: (id: string, samples: number, version: number) =>
    request<ComparisonResult>(`/replays/${id}/compare`, {
      method: 'POST',
      body: JSON.stringify({ samples, expected_version: version }),
    }),
  requestAction: (id: string, preset: string, target: string, role: string, version: number) =>
    request<{ request: ActionRequest; state_version: number }>(`/replays/${id}/requests`, {
      method: 'POST',
      body: JSON.stringify({ preset, target, role, expected_version: version }),
    }),
  decide: (
    id: string,
    requestId: string,
    role: string,
    decision: 'approve' | 'reject' | 'defer',
    decisionId: string,
    version: number,
  ) =>
    request<{ request: ActionRequest; state_version: number; repeat: boolean }>(
      `/replays/${id}/requests/${requestId}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({ role, decision, decision_id: decisionId, expected_version: version }),
      },
    ),
  save: (
    id: string,
    body: {
      ui: { selected_zone: number | null; camera: string };
      settings: { speed: number; step_min: number };
      forecast: { samples: number };
    },
  ) => request<SavedSummary>(`/replays/${id}/save`, { method: 'POST', body: JSON.stringify(body) }),
  /** The scanned demo case and its retrospective no-action baseline. */
  demoCase: () => request<DemoCase>('/demo/case'),
  /** Which received pressures support the alert, at one state version. */
  demoDrivers: (id: string, version: number) =>
    request<DemoDrivers>(`/replays/${id}/demo/drivers`, {
      method: 'POST',
      body: JSON.stringify({ expected_version: version, samples: 50 }),
    }),
  /** The newest finished evaluation, exactly as measured (404 when none is saved). */
  latestEvaluation: () => request<SavedEvaluation>('/evaluations/latest'),
  saved: () => request<{ saved: SavedSummary[] }>('/saved'),
  load: (savedId: string) =>
    request<Snapshot>(`/saved/${savedId}/load`, { method: 'POST', body: JSON.stringify({}) }),
};
