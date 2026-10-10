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
import type { Urgency } from './types';

// Platform fills mirror the --status-*-tint tokens (three.js needs literal colours). The state comes
// from the received queues and resources, never from how many dots are drawn.
// 'idle' (nothing received yet) is drawn gray, never as Normal.
const STATE_FILL: Record<ZoneDisplay, string> = {
  normal: '#e3f0f3',
  building: '#f8e6bd',
  overloaded: '#f6cdd2',
  unknown: '#cdd8e0',
  idle: '#dbe7ec',
};
const STATE_EDGE: Record<ZoneDisplay, string> = {
  normal: '#1c8f96',
  building: '#d98a00',
  overloaded: '#e63946',
  unknown: '#6b7f90',
  idle: '#8aa0ad',
};
// A soft tint of the state colour on the platform (presentation only).
const STATE_GLOW: Record<ZoneDisplay, number> = { normal: 0.1, building: 0.22, overloaded: 0.32, unknown: 0.04, idle: 0.03 };

// People are drawn in deeper tones so they read on the pale platforms; size also carries urgency.
const URGENCY_COLOR: Record<Urgency, string> = {
  urgent: '#e63946',
  medium: '#e08e0b',
  lower: '#0f6f8a',
};
const URGENCY_SCALE: Record<Urgency, number> = { urgent: 1.3, medium: 1.12, lower: 1 };

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
/** The camera looks slightly toward the back so the ambulance road above zone 1 stays in frame. */
const CAM_TZ = -2.2;
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
  return Math.max(6, Math.min(width / 31, height / 19.5));
}

function CameraRig({ view }: { view: CameraView }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    ortho.position.set(view.tx + 15, 15, 15 + CAM_TZ);
    ortho.lookAt(view.tx, 0, CAM_TZ);
    ortho.zoom = fitZoom(size.width, size.height) * view.k;
    ortho.updateProjectionMatrix();
  }, [camera, size.width, size.height, view.tx, view.k]);
  return null;
}

/** Same fixed camera as the canvas, so DOM labels can be placed over world positions. */
function projector(width: number, height: number, view: CameraView) {
  const cam = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 200);
  cam.position.set(view.tx + 15, 15, 15 + CAM_TZ);
  cam.lookAt(view.tx, 0, CAM_TZ);
  cam.zoom = fitZoom(width, height) * view.k;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z).project(cam);
    return { left: ((v.x + 1) / 2) * width, top: ((1 - v.y) / 2) * height };
  };
}

function formatEta(min: number): string {
  const t = Math.floor(min);
  return `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
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
  ambulances,
  simTime,
}: {
  ambulances: { id: string; eta_min: number }[];
  simTime: number;
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
                <span>{compact ? z : `${z} · ${counts[z] ?? 0}`}</span>
                {alert && (
                  <span className="alert-bubble" data-testid={`alert-${z}`} data-state={state}>
                    {state === 'overloaded' ? <IconOctagon /> : <IconUnknown />}
                    {state === 'overloaded' ? 'ALERT' : 'Cannot assess'}
                  </span>
                )}
              </div>
            );
          })}
          {!compact && focusZone !== null && AREA_LABELS.filter((a) => a.zone === focusZone).map((a) => {
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
          {ambulances.filter((a) => a.eta_min > simTime).map((a) => (
            <div
              key={a.id}
              className="zone-label amb-label"
              style={place(AMB_X + 1.9, 1.2, ambulanceZ(a.eta_min, simTime), 'start')}
            >
              {a.id} · ETA {formatEta(a.eta_min)}
            </div>
          ))}
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
        <meshStandardMaterial
          color={STATE_FILL[state]}
          emissive={STATE_EDGE[state]}
          emissiveIntensity={STATE_GLOW[state] * 0.35}
        />
      </mesh>
      <mesh position={[0, -0.3, 0]}>
        <boxGeometry args={[PLATFORM_SIZE + 0.6, 0.05, PLATFORM_DEPTH + 0.6]} />
        <meshBasicMaterial color={STATE_EDGE[state]} transparent opacity={STATE_GLOW[state] * 0.5} />
      </mesh>
      <lineSegments position={[0, 0.251, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(PLATFORM_SIZE, 0.001, PLATFORM_DEPTH)]} />
        <lineBasicMaterial color={selected ? '#22d3ee' : STATE_EDGE[state]} />
      </lineSegments>
    </group>
  );
}

/**
 * Presentation-only cue on a zone that the pressure model already reports as overloaded: a light
 * column and two expanding rings. It reads state; it never changes it. Reduced motion draws it still.
 */
function Threat({ center, color, reduced }: { center: [number, number]; color: string; reduced: boolean }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    rings.current.forEach((m, i) => {
      if (!m) return;
      const phase = reduced ? 0.35 + i * 0.3 : (clock.elapsedTime / 2.4 + i * 0.5) % 1;
      const s = 3.2 + phase * 2.6;
      m.scale.set(s, s, 1);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.55;
    });
  });
  return (
    <group position={[center[0], 0.3, center[1]]}>
      <mesh position={[0, 4.5, 0]}>
        <cylinderGeometry args={[1.0, 2.4, 9, 24, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.13} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(m) => { rings.current[i] = m; }} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[0.96, 1, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Faint floor grid under the platforms (decorative). */
function FloorGrid() {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(80, 40, '#22d3ee', '#22d3ee');
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.09;
    m.depthWrite = false;
    return g;
  }, []);
  return <primitive object={grid} position={[3, -0.45, 0]} />;
}

function ExitPad({ center }: { center: [number, number] }) {
  return (
    <group position={[center[0], 0, center[1]]}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[3.2, 0.16, 3.2]} />
        <meshStandardMaterial color="#1a2742" emissive="#22d3ee" emissiveIntensity={0.05} />
      </mesh>
    </group>
  );
}

/** One patient as a small standing figure. Position comes from received state; this only eases. */
function Person({ dot, instant }: { dot: DotTarget; instant: boolean }) {
  const ref = useRef<THREE.Group>(null);
  // Dots are positioned at head-ish height; figures stand on the platform.
  const target = useMemo(() => new THREE.Vector3(dot.position[0], dot.position[1] - 0.55, dot.position[2]), [dot.position]);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    if (instant) {
      m.position.copy(target);
      return;
    }
    m.position.lerp(target, 1 - Math.exp(-9 * Math.min(dt, 0.1)));
  });
  const color = URGENCY_COLOR[dot.urgency];
  return (
    <group ref={ref} position={target.toArray()} scale={URGENCY_SCALE[dot.urgency]} userData={{ patientId: dot.id }}>
      <mesh position={[0, 0.42, 0]}>
        <capsuleGeometry args={[0.2, 0.42, 4, 10]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <sphereGeometry args={[0.21, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
    </group>
  );
}

// ---- inbound ambulances -----------------------------------------------------------------
// A road runs off the back of zone 1. An announced ambulance sits on it at a distance that follows
// its reported ETA (45 simulated minutes out at the far end, at the door on arrival). It is drawn
// from the announcement list only; none is ever invented.
export const AMB_X = -9;
const AMB_FAR_Z = -15.8;
const AMB_STOP_Z = -10.7;
const AMB_WINDOW_MIN = 45;
export function ambulanceZ(etaMin: number, nowMin: number): number {
  const left = Math.max(0, etaMin - nowMin);
  const p = 1 - Math.min(left, AMB_WINDOW_MIN) / AMB_WINDOW_MIN;
  return AMB_FAR_Z + (AMB_STOP_Z - AMB_FAR_Z) * p;
}

function Road() {
  const len = 9.6;
  const cz = -9.4 - len / 2;
  return (
    <group position={[AMB_X, -0.38, cz]}>
      <mesh>
        <boxGeometry args={[2.6, 0.04, len]} />
        <meshStandardMaterial color="#1d3a5f" roughness={1} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[0, 0.03, -len / 2 + 0.9 + i * 1.6]}>
          <boxGeometry args={[0.12, 0.02, 0.7]} />
          <meshBasicMaterial color="#7fd8d8" transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function Ambulance({ z, reduced }: { z: number; reduced: boolean }) {
  const light = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!light.current) return;
    const on = reduced ? true : Math.floor(clock.elapsedTime * 3) % 2 === 0;
    light.current.color.set(on ? '#e63946' : '#9fe3e6');
  });
  const wheel = (x: number, zz: number) => (
    <mesh key={`${x}${zz}`} position={[x, 0, zz]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.3, 0.3, 0.22, 14]} />
      <meshStandardMaterial color="#081c37" />
    </mesh>
  );
  return (
    <group position={[AMB_X, -0.08, z]}>
      <mesh position={[0, 0.72, -0.3]}>
        <boxGeometry args={[1.5, 1.2, 2.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.52, 1.1]}>
        <boxGeometry args={[1.4, 0.8, 0.9]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.72, 1.56]}>
        <boxGeometry args={[1.1, 0.36, 0.04]} />
        <meshStandardMaterial color="#7fd8d8" />
      </mesh>
      {[-0.77, 0.77].map((x) => (
        <group key={x} position={[x, 0.78, -0.3]}>
          <mesh><boxGeometry args={[0.04, 0.2, 0.7]} /><meshBasicMaterial color="#e63946" /></mesh>
          <mesh><boxGeometry args={[0.04, 0.7, 0.2]} /><meshBasicMaterial color="#e63946" /></mesh>
        </group>
      ))}
      <mesh position={[0, 1.38, -0.3]}>
        <boxGeometry args={[0.8, 0.14, 0.3]} />
        <meshBasicMaterial ref={light} color="#e63946" />
      </mesh>
      {wheel(-0.78, -0.9)}
      {wheel(0.78, -0.9)}
      {wheel(-0.78, 1.1)}
      {wheel(0.78, 1.1)}
    </group>
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
  /** Announced inbound ambulances (id and ETA) and the current simulated time. */
  ambulances: { id: string; eta_min: number }[];
  simTime: number;
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

function World({ scene, selectedZone, zoneStates, onSelectZone, view, ambulances, simTime }: SceneProps & { view: CameraView }) {
  const reduced = usePrefersReducedMotion();
  return (
    <>
      <CameraRig view={view} />
      <MeshCounter />
      <ambientLight intensity={0.95} />
      <directionalLight position={[8, 14, 6]} intensity={1.0} />
      <hemisphereLight args={['#ffffff', '#14386a', 0.5]} />
      <Road />
      {ambulances.filter((a) => a.eta_min > simTime).map((a) => (
        <Ambulance key={a.id} z={ambulanceZ(a.eta_min, simTime)} reduced={reduced} />
      ))}
      <FloorGrid />
      {[1, 2, 3, 4].filter((z) => zoneStates[z] === 'overloaded').map((z) => (
        <Threat key={`t${z}`} center={ZONE_CENTERS[z]} color={STATE_EDGE.overloaded} reduced={reduced} />
      ))}
      {[1, 2, 3, 4].map((z) => (
        <Platform key={z} zone={z} selected={selectedZone === z} state={zoneStates[z]} onSelect={onSelectZone} />
      ))}
      <ExitPad center={EXITS.home.center} />
      <ExitPad center={EXITS.ward.center} />
      {scene.dots.map((d) => (
        <Person key={d.id} dot={d} instant={reduced} />
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
          ambulances={props.ambulances}
          simTime={props.simTime}
        />
      </div>
    </SceneBoundary>
  );
}
