import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AREA_LABELS,
  EXITS,
  PLATFORM_DEPTH,
  PLATFORM_SIZE,
  ZONE_CENTERS,
  type DotTarget,
  type RenderedScene,
} from './layout';
import { ZONE_NAMES, type Urgency } from './types';

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

// Camera sits on the true isometric diagonal from its target.
const CAMERA_TARGET: [number, number, number] = [3, 0, 0];
const CAMERA_POSITION: [number, number, number] = [
  CAMERA_TARGET[0] + 15,
  CAMERA_TARGET[1] + 15,
  CAMERA_TARGET[2] + 15,
];

// World is ~34 units along the diagonal; fit horizontally with margin.
function fitZoom(width: number, height: number): number {
  return Math.max(6, Math.min(width / 31, height / 17));
}

function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    ortho.position.set(...CAMERA_POSITION);
    ortho.lookAt(...CAMERA_TARGET);
    ortho.zoom = fitZoom(size.width, size.height);
    ortho.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

/** Same fixed camera as the canvas, so DOM labels can be placed over world positions. */
function projector(width: number, height: number) {
  const cam = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 200);
  cam.position.set(...CAMERA_POSITION);
  cam.lookAt(...CAMERA_TARGET);
  cam.zoom = fitZoom(width, height);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z).project(cam);
    return { left: ((v.x + 1) / 2) * width, top: ((1 - v.y) / 2) * height };
  };
}

const COMPACT_BELOW_PX = 560;

function LabelLayer({ counts }: { counts: Record<number, number> }) {
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
  const project = useMemo(() => (box.w > 0 ? projector(box.w, box.h) : null), [box.w, box.h]);
  const place = (x: number, y: number, z: number, anchor: 'center' | 'start' = 'center') => {
    const p = project!(x, y, z);
    return {
      left: p.left,
      top: p.top,
      position: 'absolute' as const,
      transform: anchor === 'start' ? 'translate(0, -50%)' : 'translate(-50%, -50%)',
    };
  };
  // Too narrow for full labels: show zone numbers only. The zone buttons below the map carry the
  // same names and counts.
  const compact = box.w < COMPACT_BELOW_PX;
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {project && (
        <>
          {[1, 2, 3, 4].map((z) => {
            const [cx, cz] = ZONE_CENTERS[z];
            return (
              <div
                key={`l${z}`}
                className="zone-label"
                // Front edge: the back edge is where the area labels sit.
                style={place(cx, 0.4, cz + PLATFORM_SIZE / 2 + 0.9)}
              >
                {compact ? z : `${z} · ${ZONE_NAMES[z]} · ${counts[z] ?? 0}`}
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
                {a.text}
              </div>
            );
          })}
          {!compact && (
            <div
              className="area-label"
              style={place(ZONE_CENTERS[3][0], 0.3, ZONE_CENTERS[3][1])}
            >
              Not modeled yet
            </div>
          )}
          {[EXITS.home, EXITS.ward].map((e) => (
            <div
              key={e.label}
              className="zone-label"
              // Compact: push the two exit labels apart (Home behind its pad, Ward / ICU in front).
              style={place(
                e.center[0],
                0.9,
                e.center[1] + (compact ? (e === EXITS.home ? -2.2 : 2.2) : 0),
              )}
            >
              {e.label}
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
  onSelect,
}: {
  zone: number;
  selected: boolean;
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
        <meshStandardMaterial color={selected ? '#dcecf1' : '#f8fafb'} />
      </mesh>
      <lineSegments position={[0, 0.251, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(PLATFORM_SIZE, 0.001, PLATFORM_DEPTH)]} />
        <lineBasicMaterial color={selected ? '#0a6680' : '#b3bec8'} />
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
  selectedZone: number | null;
  onSelectZone: (zone: number) => void;
}

/** Writes the number of patient meshes actually in the 3D scene to the canvas, for verification. */
function MeshCounter() {
  const { scene, gl } = useThree();
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 15 !== 0) return;
    let n = 0;
    scene.traverse((o) => {
      if (o.userData.patientId) n += 1;
    });
    gl.domElement.dataset.patientMeshes = String(n);
  });
  return null;
}

function World({ scene, selectedZone, onSelectZone }: SceneProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <>
      <CameraRig />
      <MeshCounter />
      <ambientLight intensity={1.7} />
      <directionalLight position={[8, 14, 6]} intensity={1.5} />
      {[1, 2, 3, 4].map((z) => (
        <Platform key={z} zone={z} selected={selectedZone === z} onSelect={onSelectZone} />
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
  return (
    <SceneBoundary
      fallback={
        <div className="scene-fallback" role="status">
          The 3D view could not start on this device. Zone details remain available below.
        </div>
      }
    >
      <div className="scene-canvas" style={{ position: 'relative' }} aria-hidden="true">
        <Canvas orthographic flat dpr={[1, 2]} camera={{ near: 0.1, far: 200 }}>
          <World {...props} />
        </Canvas>
        <LabelLayer counts={props.counts} />
      </div>
    </SceneBoundary>
  );
}
