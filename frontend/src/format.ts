/** Small formatting helpers shared by the shell and the panels. */

/** Simulated minute as T+hh:mm. */
export function formatClock(min: number): string {
  const total = Math.floor(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function patientCount(n: number): string {
  return `${n} ${n === 1 ? 'patient' : 'patients'}`;
}

/** A figure a service cannot currently report is null: say so, never show it as zero. */
export const NOT_CURRENT = 'Not current';

export function fig(v: number | null | undefined, fallback = 0): number | string {
  return v === null ? NOT_CURRENT : (v ?? fallback);
}

export function ofTotal(v: number | null | undefined, total: number): string {
  return v === null || v === undefined ? NOT_CURRENT : `${v} of ${total}`;
}

export function clockOrDash(min: number | null | undefined): string {
  return min === null || min === undefined ? '—' : formatClock(min);
}
