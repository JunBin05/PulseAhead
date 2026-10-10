import type { PatientDot, Phase, Snapshot, Urgency } from './types';

/** Maximum number of dots drawn; beyond this an exact overflow count is shown (never silent). */
export const RENDER_BUDGET = 200;

export const PLATFORM_SIZE = 6;
export const ZONE_CENTERS: Record<number, [number, number]> = {
  1: [-10.2, 0],
  2: [-3.4, 0],
  3: [3.4, 0],
  4: [10.2, 0],
};
export const EXITS = {
  home: { center: [16.2, -2.6] as [number, number], label: 'Home' },
  ward: { center: [16.2, 2.6] as [number, number], label: 'Ward / ICU' },
};

interface Area {
  zone: number;
  /** local origin on the platform */
  origin: [number, number];
  cols: number;
  step: number;
}

// Each area reserves a label row above its first dot row so labels never sit under dots.
const AREAS: Record<Phase, Area> = {
  arrival: { zone: 1, origin: [-2.1, -1.0], cols: 5, step: 0.85 },
  awaiting_space: { zone: 2, origin: [-2.1, -1.9], cols: 5, step: 0.7 },
  awaiting_clinician: { zone: 2, origin: [-2.1, 0.4], cols: 5, step: 0.7 },
  assessment_active: { zone: 2, origin: [-1.8, 2.6], cols: 4, step: 1.2 },
  disposition_processing: { zone: 4, origin: [-2.1, -1.0], cols: 5, step: 0.85 },
};

export const AREA_LABELS: { zone: number; text: string; local: [number, number] }[] = [
  { zone: 1, text: 'Triage queue', local: [0, -2.3] },
  { zone: 2, text: 'Awaiting space', local: [0, -2.75] },
  { zone: 2, text: 'Awaiting clinician', local: [0, -0.45] },
  { zone: 2, text: 'With clinician', local: [0, 1.9] },
  { zone: 4, text: 'Processing departure', local: [0, -2.3] },
];

export interface DotTarget {
  id: string;
  urgency: Urgency;
  phase: Phase;
  zone: number;
  position: [number, number, number];
}

export interface RenderedScene {
  dots: DotTarget[];
  overflow: number;
  perZone: Record<number, number>;
}

function slot(area: Area, index: number): [number, number] {
  const col = index % area.cols;
  const row = Math.floor(index / area.cols);
  return [area.origin[0] + col * area.step, area.origin[1] + row * area.step];
}

/** Builds the dot list from received state only. App and Scene both use this one result. */
export function buildScene(snap: Snapshot | null): RenderedScene {
  const perZone: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  if (!snap) return { dots: [], overflow: 0, perZone };
  const ordered: PatientDot[] = [...snap.patients].sort((a, b) =>
    a.arrival_min === b.arrival_min ? a.id.localeCompare(b.id) : a.arrival_min - b.arrival_min,
  );
  const drawn = ordered.slice(0, RENDER_BUDGET);
  const overflow = ordered.length - drawn.length;
  const counters: Record<string, number> = {};
  const dots: DotTarget[] = [];
  for (const p of drawn) {
    const area = AREAS[p.phase];
    const idx = (counters[p.phase] = (counters[p.phase] ?? -1) + 1);
    const [lx, lz] = slot(area, idx);
    const [cx, cz] = ZONE_CENTERS[area.zone];
    dots.push({
      id: p.id,
      urgency: p.urgency,
      phase: p.phase,
      zone: area.zone,
      position: [cx + lx, 0.5, cz + lz],
    });
    perZone[area.zone] += 1;
  }
  return { dots, overflow, perZone };
}
