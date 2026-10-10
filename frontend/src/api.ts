import type { Snapshot } from './types';

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
  /** Applies only at `expectedVersion`; a 409 means the replay moved on and the caller should reload. */
  advance: (id: string, minutes: number, expectedVersion: number) =>
    request<Snapshot>(`/replays/${id}/advance`, {
      method: 'POST',
      body: JSON.stringify({ minutes, expected_version: expectedVersion }),
    }),
  reset: (id: string) =>
    request<Snapshot>(`/replays/${id}/reset`, { method: 'POST', body: JSON.stringify({}) }),
};
