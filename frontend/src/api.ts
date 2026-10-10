import type { Forecast, ForecastExplanation, SavedSummary, ScenarioCatalog, Snapshot, ZoneDetail } from './types';

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
  create: (scenario?: string) =>
    request<Snapshot>('/replays', {
      method: 'POST',
      body: JSON.stringify(scenario === undefined ? {} : { scenario }),
    }),
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
  save: (
    id: string,
    body: {
      ui: { selected_zone: number | null; camera: string };
      settings: { speed: number; step_min: number };
      forecast: { samples: number };
    },
  ) => request<SavedSummary>(`/replays/${id}/save`, { method: 'POST', body: JSON.stringify(body) }),
  saved: () => request<{ saved: SavedSummary[] }>('/saved'),
  load: (savedId: string) =>
    request<Snapshot>(`/saved/${savedId}/load`, { method: 'POST', body: JSON.stringify({}) }),
};
