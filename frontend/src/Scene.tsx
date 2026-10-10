import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AREA_LABELS,
  EXITS,
  PLATFORM_DEPTH,
  PLATFORM_SIZE,
  ZONE4_ROW_PITCH,
  ZONE_CENTERS,
  type DotTarget,
  type RenderedScene,
} from './layout';
import { IconOctagon, IconUnknown } from './icons';
import { ZONE_LOOK, type ZoneDisplay } from './status';
import { ZONE_NAMES, type Urgency } from './types';

// Platform fills mirror the --status-*-tint tokens (three.js needs literal colours). The state comes
// from the received queues and resources, never from how many dots are drawn.
// 'idle' (nothing received yet) is drawn gray, never as Normal.
const STATE_FILL: Record<ZoneDisplay, string> = {
  normal: '#e0f1e7',
  building: '#fdf0cc',
  overloaded: '#fce6e3',
  unknown: '#e6eaee',
  idle: '#e6eaee',
};
const STATE_EDGE: Record<ZoneDisplay, string> = {
  normal: '#14663e',
  building: '#7a4d00',
  overloaded: '#a4231a',
  unknown: '#44505b',
  idle: '#44505b',
};

// three.js materials need literal colours; these mirror the urgency, accent and scene tokens in
// tokens.css (see DESIGN.md).
const URGENCY_COLOR: Record<Urgency, string> = {
  urgent: '#b4281f',
  medium: '#b8700a',
  lower: '#1f6f8f',
};
const URGENCY_RADIUS: Record<Urgency, number> = { urgent: 0.36, medium: 0.28, lower: 0.24 };

function usePrefersReducedMotion(): boolean {
  const ref = useRef(false);
  if (typeof window !== 'undefined' && window.matchMedia) {
    ref.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return ref.current;
}

// Camera sits on the true isometric diagonal from its target. The target slides along x to focus a
// zone and the zoom is multiplied by `k`; the overview is { tx: 3, k: 1 }.
const OVERVIEW_TX = 3;
const FOCUS_ZOOM = 1.9;
const FOCUS_MS = 450;
export interface CameraView {
  tx: number;
  k: number;
}
const OVERVIEW: CameraView = { tx: OVERVIEW_TX, k: 1 };

/**
 * Presentation-only camera: eases the view toward the focused zone (or back to the overview). It
 * never touches replay state. Reduced motion jumps straight to the target view.
 */
function useCameraView(focusZone: number | null, reduced: boolean): CameraView {
  const target: CameraView = focusZone === null ? OVERVIEW : { tx: ZONE_CENTERS[focusZone][0], k: FOCUS_ZOOM };
  const [view, setView] = useState<CameraView>(OVERVIEW);
  const viewRef = useRef<CameraView>(OVERVIEW);
  useEffect(() => {
    if (reduced) {
      viewRef.current = target;
      setView(target);
      return;
    }
    const from = viewRef.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / FOCUS_MS);
      const e = 1 - Math.pow(1 - u, 3);
      const v = { tx: from.tx + (target.tx - from.tx) * e, k: from.k + (target.k - from.k) * e };
      viewRef.current = v;
      setView(v);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusZone, reduced]);
  return view;
}

// World is ~34 units along the diagonal; fit horizontally with margin.
function fitZoom(width: number, height: number): number {
  return Math.max(6, Math.min(width / 31, height / 17));
}

function CameraRig({ view }: { view: CameraView }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    ortho.position.set(view.tx + 15, 15, 15);
    ortho.lookAt(view.tx, 0, 0);
    ortho.zoom = fitZoom(size.width, size.height) * view.k;
    ortho.updateProjectionMatrix();
  }, [camera, size.width, size.height, view.tx, view.k]);
  return null;
}

/** Same fixed camera as the canvas, so DOM labels can be placed over world positions. */
function projector(width: number, height: number, view: CameraView) {
  const cam = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 200);
  cam.position.set(view.tx + 15, 15, 15);
  cam.lookAt(view.tx, 0, 0);
  cam.zoom = fitZoom(width, height) * view.k;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z).project(cam);
    return { left: ((v.x + 1) / 2) * width, top: ((1 - v.y) / 2) * height };
  };
}

const COMPACT_BELOW_PX = 560;
/** One world unit along z moves a label this fraction of the zoom down the screen (true isometric view). */
const Z_TO_SCREEN_Y = 0.408;
/** Area labels are 10 px tall; adjacent zone 4 rows must be at least this far apart on screen. */
const MIN_LABEL_PITCH_PX = 10.2;

function LabelLayer({
  counts,
  areaCounts,
  zoneStates,
  exitCounts,
  view,
  focusZone,
}: {
  view: CameraView;
  focusZone: number | null;
  counts: Record<number, number>;
  areaCounts: Record<string, number>;
  zoneStates: Record<number, ZoneDisplay>;
  exitCounts: { home: number; ward: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const project = useMemo(() => (box.w > 0 ? projector(box.w, box.h, view) : null), [box.w, box.h, view]);
  // 'top' hangs the element below its anchor, so a two-line zone label grows toward the viewer
  // instead of into the area labels above it.
  const place = (x: number, y: number, z: number, anchor: 'center' | 'start' | 'top' = 'center') => {
    const p = project!(x, y, z);
    return {
      left: p.left,
      top: p.top,
      position: 'absolute' as const,
      transform:
        anchor === 'start' ? 'translate(0, -50%)' : anchor === 'top' ? 'translate(-50%, 0)' : 'translate(-50%, -50%)',
    };
  };
  // Too narrow for full labels: show zone numbers only. The zone buttons below the map carry the
  // same names and counts.
  // A focused camera is zoomed in, so the room it gives each label counts as extra canvas width.
  const rowPitchPx = ZONE4_ROW_PITCH * Z_TO_SCREEN_Y * fitZoom(box.w, box.h) * view.k;
  const compact = box.w * view.k < COMPACT_BELOW_PX || rowPitchPx < MIN_LABEL_PITCH_PX;
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {project && (
        <>
          {[1, 2, 3, 4].map((z) => {
            const [cx, cz] = ZONE_CENTERS[z];
            const state = zoneStates[z];
            // Compact scenes have no room for a bubble beside the label; the status icon next to the zone
            // number carries the alert there, and the zone buttons below spell it out.
            const alert = !compact && (state === 'overloaded' || state === 'unknown');
            return (
              <div
                key={`l${z}`}
                className={compact ? 'zone-label' : 'zone-label zone-label--stacked'}
                // The alert bubble is a child hanging off the label (above it for zone 1, whose front strip
                // is empty and which sits at the canvas edge; to the left for the others; the focused zone also goes above, because the zoom leaves no room beside it at a 768 px viewport), so its position
                // never depends on the label's size or the zoom.
                data-bubble-side={z === 1 || z === focusZone ? 'above' : 'left'}
                // Front edge: the back edge is where the area labels sit. The stacked label hangs below
                // its anchor so it grows toward the viewer, away from the rows above it.
                style={place(cx, 0.4, cz + PLATFORM_SIZE / 2 + 0.9, compact ? 'center' : 'top')}
              >
                {/* Status never rides on colour alone: icon and word sit in the label itself. */}
                <span className="zone-label-status" data-state={state} data-testid={`zone-label-status-${z}`}>
                  {ZONE_LOOK[state].icon}
                  <span className={compact ? 'sr-only' : undefined}>{ZONE_LOOK[state].label}</span>
                </span>
                <span>{compact ? z : `${z} · ${ZONE_NAMES[z]} · ${counts[z] ?? 0}`}</span>
                {alert && (
                  <span className="alert-bubble" data-testid={`alert-${z}`} data-state={state}>
                    {state === 'overloaded' ? <IconOctagon /> : <IconUnknown />}
                    {state === 'overloaded' ? 'ALERT' : 'Cannot assess'}
                  </span>
                )}
              </div>
            );
          })}
          {!compact && AREA_LABELS.map((a) => {
            const [cx, cz] = ZONE_CENTERS[a.zone];
            return (
              <div
                key={`${a.zone}-${a.text}`}
                className="area-label"
                style={place(cx + a.local[0], 0.3, cz + a.local[1], 'start')}
              >
                {a.text} · {areaCounts[a.key] ?? 0}
              </div>
            );
          })}
          {[EXITS.home, EXITS.ward].map((e) => (
            <div
              key={e.label}
              className="zone-label"
              // Compact: push the two exit labels apart (Home behind its pad, Ward / ICU in front).
              style={place(
                // Compact: the count makes the label wider; keep it inside the canvas.
                e.center[0] + (compact && e === EXITS.home ? -1.8 : 0),
                0.9,
                e.center[1] + (compact ? (e === EXITS.home ? -2.2 : 2.2) : 0),
              )}
            >
              {e.label} · {e === EXITS.home ? exitCounts.home : exitCounts.ward}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Platform({
  zone,
  selected,
  state,
  onSelect,
}: {
  zone: number;
  selected: boolean;
  state: ZoneDisplay;
  onSelect: (zone: number) => void;
}) {
  const [cx, cz] = ZONE_CENTERS[zone];
  return (
    <group position={[cx, 0, cz]}>
      <mesh
        position={[0, 0.0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(zone);
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[PLATFORM_SIZE, 0.5, PLATFORM_DEPTH]} />
        <meshStandardMaterial color={STATE_FILL[state]} />
      </mesh>
      <lineSegments position={[0, 0.251, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(PLATFORM_SIZE, 0.001, PLATFORM_DEPTH)]} />
        <lineBasicMaterial color={selected ? '#0a6680' : STATE_EDGE[state]} />
      </lineSegments>
    </group>
  );
}

function ExitPad({ center }: { center: [number, number] }) {
  return (
    <group position={[center[0], 0, center[1]]}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[3.2, 0.16, 3.2]} />
        <meshStandardMaterial color="#e9eef2" />
      </mesh>
    </group>
  );
}

function Dot({ dot, instant }: { dot: DotTarget; instant: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const target = useMemo(() => new THREE.Vector3(...dot.position), [dot.position]);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    if (instant) {
      m.position.copy(target);
      return;
    }
    // Presentation-only easing between positions the backend already reported.
    m.position.lerp(target, 1 - Math.exp(-9 * Math.min(dt, 0.1)));
  });
  return (
    <mesh ref={ref} position={dot.position} userData={{ patientId: dot.id }}>
      <sphereGeometry args={[URGENCY_RADIUS[dot.urgency], 20, 14]} />
      <meshStandardMaterial color={URGENCY_COLOR[dot.urgency]} />
    </mesh>
  );
}

interface SceneProps {
  scene: RenderedScene;
  counts: Record<number, number>;
  /** Exact patients per dot area, for the area labels. */
  areaCounts: Record<string, number>;
  /** Local zone state from the pressure model (platform tint and ALERT bubble). */
  zoneStates: Record<number, ZoneDisplay>;
  /** Patients who have physically left through each exit so far. */
  exitCounts: { home: number; ward: number };
  selectedZone: number | null;
  onSelectZone: (zone: number) => void;
  /** Zone the camera is focused on, or null for the fixed overview. */
  focusZone: number | null;
}

const TEST_HOOKS = new URLSearchParams(window.location.search).has('fixture');

/** Writes the number of patient meshes actually in the 3D scene to the canvas, for verification. */
function MeshCounter() {
  const { scene, gl } = useThree();
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 15 !== 0) return;
    let n = 0;
    const positions: { id: string; x: number; y: number; z: number }[] = [];
    scene.traverse((o) => {
      if (o.userData.patientId) {
        n += 1;
        positions.push({
          id: o.userData.patientId,
          x: Math.round(o.position.x * 100) / 100,
          y: Math.round(o.position.y * 100) / 100,
          z: Math.round(o.position.z * 100) / 100,
        });
      }
    });
    gl.domElement.dataset.patientMeshes = String(n);
    // Rendered positions, for the layout check: a test hook, written only for ?fixture= runs.
    if (TEST_HOOKS) gl.domElement.dataset.meshPositions = JSON.stringify(positions);
  });
  return null;
}

function World({ scene, selectedZone, zoneStates, onSelectZone, view }: SceneProps & { view: CameraView }) {
  const reduced = usePrefersReducedMotion();
  return (
    <>
      <CameraRig view={view} />
      <MeshCounter />
      <ambientLight intensity={1.7} />
      <directionalLight position={[8, 14, 6]} intensity={1.5} />
      {[1, 2, 3, 4].map((z) => (
        <Platform key={z} zone={z} selected={selectedZone === z} state={zoneStates[z]} onSelect={onSelectZone} />
      ))}
      <ExitPad center={EXITS.home.center} />
      <ExitPad center={EXITS.ward.center} />
      {scene.dots.map((d) => (
        <Dot key={d.id} dot={d} instant={reduced} />
      ))}
    </>
  );
}

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Scene(props: SceneProps) {
  const reduced = usePrefersReducedMotion();
  const view = useCameraView(props.focusZone, reduced);
  return (
    <SceneBoundary
      fallback={
        <div className="scene-fallback" role="status">
          The 3D view could not start on this device. Zone details remain available below.
        </div>
      }
    >
      <div
        className="scene-canvas"
        style={{ position: 'relative' }}
        aria-hidden="true"
        data-camera={props.focusZone === null ? 'overview' : `zone-${props.focusZone}`}
        data-camera-zoom={view.k.toFixed(2)}
      >
        <Canvas orthographic flat dpr={[1, 2]} camera={{ near: 0.1, far: 200 }}>
          <World {...props} view={view} />
        </Canvas>
        <LabelLayer
          counts={props.counts}
          areaCounts={props.areaCounts}
          zoneStates={props.zoneStates}
          exitCounts={props.exitCounts}
          view={view}
          focusZone={props.focusZone}
        />
      </div>
    </SceneBoundary>
  );
}
