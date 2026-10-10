import type { PatientDot, Phase, Snapshot, Urgency } from './types';

/** Maximum number of dots drawn; beyond this an exact overflow count is shown (never silent). */
export const RENDER_BUDGET = 200;

export const PLATFORM_SIZE = 6;
/** Front-to-back depth: zone 2 needs four evenly spaced waiting and work rows. */
export const PLATFORM_DEPTH = 8;
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
  text: string;
}

/** Rows that fit between an area's origin and the next area's label. */
const ROWS_PER_LAYER = 2;
/** Height of one stacked layer of dots once an area's two rows are full. */
const LAYER_HEIGHT = 0.6;

/** Dot areas. Phases that share one waiting line or one doctor share one area (see PHASE_AREA). */
const AREAS = {
  in_triage: { zone: 1, origin: [-2.1, -1.9], cols: 1, step: 0.7, text: 'At triage desk' },
  awaiting_triage: { zone: 1, origin: [-2.1, 0.4], cols: 8, step: 0.62, text: 'Triage queue' },
  awaiting_space: { zone: 2, origin: [-2.1, -2.8], cols: 8, step: 0.62, text: 'Awaiting space' },
  clinician_queue: { zone: 2, origin: [-2.1, -0.9], cols: 8, step: 0.62, text: 'Awaiting clinician' },
  care_wait: { zone: 2, origin: [-2.1, 1.0], cols: 8, step: 0.62, text: 'Awaiting care completion' },
  with_clinician: { zone: 2, origin: [-1.8, 2.9], cols: 4, step: 1.2, text: 'With clinician' },
  lab_queue: { zone: 3, origin: [-2.1, -2.8], cols: 8, step: 0.62, text: 'Lab queue' },
  in_lab: { zone: 3, origin: [-1.8, -0.9], cols: 2, step: 1.2, text: 'In lab' },
  imaging_queue: { zone: 3, origin: [-2.1, 1.0], cols: 8, step: 0.62, text: 'Imaging queue' },
  in_imaging: { zone: 3, origin: [-1.8, 2.9], cols: 1, step: 1.2, text: 'In imaging' },
  discharge: { zone: 4, origin: [-2.1, -3.0], cols: 8, step: 0.62, text: 'Discharge' },
  boarding: { zone: 4, origin: [-2.1, -1.1], cols: 8, step: 0.62, text: 'Awaiting ward/ICU bed' },
  allocation: { zone: 4, origin: [-2.1, 0.8], cols: 8, step: 0.62, text: 'Ward allocation' },
  transport: { zone: 4, origin: [-2.1, 2.7], cols: 8, step: 0.62, text: 'Transport' },
} satisfies Record<string, Area>;

type AreaKey = keyof typeof AREAS;

const PHASE_AREA: Record<Phase, AreaKey> = {
  in_triage: 'in_triage',
  awaiting_triage: 'awaiting_triage',
  awaiting_space: 'awaiting_space',
  awaiting_clinician: 'clinician_queue',
  awaiting_result_review: 'clinician_queue',
  assessment_active: 'with_clinician',
  result_review_active: 'with_clinician',
  awaiting_care_completion: 'care_wait',
  awaiting_lab: 'lab_queue',
  in_lab: 'in_lab',
  awaiting_imaging: 'imaging_queue',
  in_imaging: 'in_imaging',
  awaiting_discharge: 'discharge',
  disposition_processing: 'discharge',
  awaiting_ward_bed: 'boarding',
  awaiting_ward_allocation: 'allocation',
  ward_allocation_active: 'allocation',
  awaiting_transport: 'transport',
  in_transport: 'transport',
};

// Each label starts just behind the first dot of its own row and stays on its own platform. Rows
// run down-right on screen, so the row's dots stay below the left-aligned text.
export const AREA_LABELS: { key: AreaKey; zone: number; text: string; local: [number, number] }[] = (
  Object.keys(AREAS) as AreaKey[]
).map((key) => {
  const a: Area = AREAS[key];
  return { key, zone: a.zone, text: a.text, local: [a.origin[0], a.origin[1] - 0.9] };
});

export type { AreaKey };

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
  /** Exact patients per area from received state (all patients, not only the drawn ones). */
  perArea: Record<string, number>;
}

/** Two rows per layer; further patients stack upward at the same slots, never into the next area. */
function slot(area: Area, index: number): { x: number; z: number; layer: number } {
  const perLayer = area.cols * ROWS_PER_LAYER;
  const layer = Math.floor(index / perLayer);
  const within = index % perLayer;
  const col = within % area.cols;
  const row = Math.floor(within / area.cols);
  return { x: area.origin[0] + col * area.step, z: area.origin[1] + row * area.step, layer };
}

/** Builds the dot list from received state only. App and Scene both use this one result. */
export function buildScene(snap: Snapshot | null): RenderedScene {
  const perZone: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const perArea: Record<string, number> = {};
  for (const key of Object.keys(AREAS)) perArea[key] = 0;
  if (!snap) return { dots: [], overflow: 0, perZone, perArea };
  for (const p of snap.patients) perArea[PHASE_AREA[p.phase]] += 1;
  const ordered: PatientDot[] = [...snap.patients].sort((a, b) =>
    a.arrival_min === b.arrival_min ? a.id.localeCompare(b.id) : a.arrival_min - b.arrival_min,
  );
  const drawn = ordered.slice(0, RENDER_BUDGET);
  const overflow = ordered.length - drawn.length;
  const counters: Record<string, number> = {};
  const dots: DotTarget[] = [];
  for (const p of drawn) {
    const areaKey = PHASE_AREA[p.phase];
    const area: Area = AREAS[areaKey];
    const idx = (counters[areaKey] = (counters[areaKey] ?? -1) + 1);
    const { x: lx, z: lz, layer } = slot(area, idx);
    const [cx, cz] = ZONE_CENTERS[area.zone];
    dots.push({
      id: p.id,
      urgency: p.urgency,
      phase: p.phase,
      zone: area.zone,
      position: [cx + lx, 0.5 + layer * LAYER_HEIGHT, cz + lz],
    });
    perZone[area.zone] += 1;
  }
  return { dots, overflow, perZone, perArea };
}
