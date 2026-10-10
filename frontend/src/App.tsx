import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { buildScene } from './layout';
import { Scene } from './Scene';
import {
  IconCheck,
  IconOctagon,
  IconPause,
  IconPlay,
  IconReset,
  IconStep,
  IconTriangle,
  IconUnknown,
} from './icons';
import { ZONE_NAMES, type CongestionState, type Phase, type Snapshot, type Urgency } from './types';

const SPEEDS = [1, 2, 5, 10] as const;
const STEP_MINUTES = 5;

const PHASE_LABEL: Record<Phase, string> = {
  arrival: 'Registration and triage',
  awaiting_space: 'Waiting for an ED space',
  awaiting_clinician: 'In a space, waiting for a clinician',
  assessment_active: 'With a clinician',
  disposition_processing: 'Cleared, processing departure',
};

const URGENCY_LABEL: Record<Urgency, string> = {
  urgent: 'Urgent',
  medium: 'Medium urgency',
  lower: 'Lower urgency',
};

const URGENCY_COLOR: Record<Urgency, string> = {
  urgent: 'var(--urgency-urgent)',
  medium: 'var(--urgency-medium)',
  lower: 'var(--urgency-lower)',
};

const URGENCY_SIZE: Record<Urgency, number> = { urgent: 18, medium: 14, lower: 12 };

function formatClock(min: number): string {
  const total = Math.floor(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function patientCount(n: number): string {
  return `${n} ${n === 1 ? 'patient' : 'patients'}`;
}

type Conn =
  | { state: 'idle' }
  | { state: 'pending'; lastValidAt: number | null }
  | { state: 'ok'; lastValidAt: number }
  | { state: 'error'; message: string; lastValidAt: number | null };

const lastValid = (c: Conn): number | null => ('lastValidAt' in c ? c.lastValidAt : null);

/** Slow requests show a pending banner only after this delay, so normal playback does not flicker. */
const PENDING_AFTER_MS = 500;

const STATUS_LOOK: Record<CongestionState, { tone: string; icon: ReactNode }> = {
  stable: { tone: 'normal', icon: <IconCheck /> },
  building: { tone: 'pressure', icon: <IconTriangle /> },
  confirmed: { tone: 'overload', icon: <IconOctagon /> },
};

function StatusBadge({ snap }: { snap: Snapshot | null }) {
  // The label text comes from the backend; only tone and icon are chosen here.
  const look = snap ? STATUS_LOOK[snap.overall_status.state] : { tone: 'unknown', icon: <IconUnknown /> };
  const label = snap ? snap.overall_status.label : 'Not started';
  const { tone, icon } = look;
  return (
    <div className="meta">
      <span className="meta-label">Overall status</span>
      <span className="status" data-tone={tone} data-testid="overall-status">
        {icon}
        <span>{label}</span>
      </span>
    </div>
  );
}

export function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [conn, setConn] = useState<Conn>({ state: 'idle' });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [, setClock] = useState(0);

  const idRef = useRef<string | null>(null);
  const versionRef = useRef(0);
  const busyRef = useRef(false);
  const epochRef = useRef(0);
  const requestRef = useRef(0);
  const playRef = useRef<HTMLButtonElement>(null);
  const focusPlayRef = useRef(false);

  const apply = useCallback((s: Snapshot) => {
    // Discard anything older than what is already shown for the same replay.
    if (idRef.current === s.replay_id && s.version < versionRef.current) return;
    idRef.current = s.replay_id;
    versionRef.current = s.version;
    setSnap(s);
    setConn({ state: 'ok', lastValidAt: Date.now() });
  }, []);

  const fail = useCallback((e: unknown) => {
    const message = e instanceof ApiError ? e.message : 'Something went wrong.';
    setPlaying(false);
    setConn((c) => ({
      state: 'error',
      message,
      lastValidAt: lastValid(c),
    }));
  }, []);

  /**
   * Runs one command. A second command is ignored while one is in flight, unless `override` is
   * set (start, reset): those bump the epoch so the older response is discarded when it lands.
   * Only the latest request clears the busy and pending flags.
   */
  const run = useCallback(
    async (work: () => Promise<Snapshot>, override = false) => {
      if (busyRef.current && !override) return;
      busyRef.current = true;
      setBusy(true);
      const epoch = epochRef.current;
      const request = ++requestRef.current;
      const slowTimer = window.setTimeout(() => {
        if (requestRef.current === request) setSlow(true);
      }, PENDING_AFTER_MS);
      setConn((c) => ({ state: 'pending', lastValidAt: lastValid(c) }));
      try {
        const s = await work();
        if (epochRef.current === epoch) apply(s);
      } catch (e) {
        if (epochRef.current === epoch) fail(e);
      } finally {
        window.clearTimeout(slowTimer);
        if (requestRef.current === request) {
          busyRef.current = false;
          setBusy(false);
          setSlow(false);
        }
      }
    },
    [apply, fail],
  );

  const start = useCallback(() => {
    // The Start button is replaced by Play; keep keyboard focus on the controls.
    focusPlayRef.current = document.activeElement?.getAttribute('data-testid') === 'start';
    epochRef.current += 1;
    idRef.current = null;
    versionRef.current = 0;
    setSelectedZone(null);
    void run(() => api.create(), true);
  }, [run]);

  const advance = useCallback(
    (minutes: number) => {
      const id = idRef.current;
      if (!id) return Promise.resolve();
      const expected = versionRef.current;
      return run(() =>
        api.advance(id, minutes, expected).catch((e) => {
          // Someone else moved this replay; show its current state instead of guessing.
          if (e instanceof ApiError && e.status === 409) return api.state(id);
          throw e;
        }),
      );
    },
    [run],
  );

  const retry = useCallback(() => {
    const id = idRef.current;
    if (id) void run(() => api.state(id));
  }, [run]);

  const reset = useCallback(() => {
    const id = idRef.current;
    if (!id) return;
    setPlaying(false);
    setSelectedZone(null);
    epochRef.current += 1;
    void run(() => api.reset(id), true);
  }, [run]);

  // Playback: each tick asks the backend to advance one simulated minute. Rendering speed never
  // changes simulated time; only these requests do.
  useEffect(() => {
    if (!playing || !snap) return;
    let cancelled = false;
    let timer = 0;
    const interval = 1000 / speed;
    const startedAt = performance.now();
    let ticks = 0;
    const tick = async () => {
      if (cancelled) return;
      await advance(1);
      ticks += 1;
      // Schedule against a fixed start so request time and timer delay do not accumulate.
      const wait = Math.max(0, startedAt + (ticks + 1) * interval - performance.now());
      if (!cancelled) timer = window.setTimeout(tick, wait);
    };
    timer = window.setTimeout(tick, interval);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [playing, speed, snap?.replay_id, advance]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (snap && focusPlayRef.current) {
      focusPlayRef.current = false;
      playRef.current?.focus();
    }
  }, [snap]);

  // Keep the "received Ns ago" age current while a stale-state banner is showing.
  const showingStale = conn.state === 'error' || slow;
  useEffect(() => {
    if (!showingStale) return;
    const t = window.setInterval(() => setClock((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [showingStale]);

  const toggleZone = useCallback(
    (z: number) => setSelectedZone((cur) => (cur === z ? null : z)),
    [],
  );

  const scene = useMemo(() => buildScene(snap), [snap]);
  const zoneCounts = scene.perZone;
  const zone = snap && selectedZone ? snap.zones.find((z) => z.id === selectedZone) : undefined;

  const lastValidAt = lastValid(conn);
  const ageSec = lastValidAt ? Math.max(0, Math.round((Date.now() - lastValidAt) / 1000)) : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          Simulation Window
          <small>PulseAhead ED operational twin</small>
        </h1>
        <div className="meta-row">
          <span className="synthetic-chip" data-testid="synthetic-label">
            Synthetic demo
          </span>
          <div className="meta">
            <span className="meta-label">Simulated time</span>
            <span className="meta-value" data-testid="sim-time">
              {snap ? formatClock(snap.sim_time_min) : 'T+00:00'}
            </span>
          </div>
          <div className="meta">
            <span className="meta-label">Demo role</span>
            <span className="meta-value">ED shift coordinator</span>
          </div>
        </div>
        <StatusBadge snap={snap} />
      </header>

      <div aria-live="polite" role="status">
        {conn.state === 'error' && (
          <div className="banner" data-tone="error" data-testid="conn-error">
            <strong>{conn.message}</strong>{' '}
            {lastValidAt !== null && snap
              ? `Showing the last valid state from ${formatClock(snap.sim_time_min)}${
                  ageSec !== null ? `, received ${ageSec}s ago` : ''
                }. It may be out of date.`
              : 'No simulation state has been received yet.'}{' '}
            {snap ? (
              <button className="btn" onClick={retry}>
                Retry
              </button>
            ) : (
              <button className="btn" onClick={start}>
                Retry start
              </button>
            )}
          </div>
        )}
        {conn.state === 'pending' && busy && snap === null && (
          <div className="banner" data-tone="pending">
            Starting the simulation…
          </div>
        )}
        {conn.state === 'pending' && slow && snap && (
          <div className="banner" data-tone="pending" data-testid="conn-pending">
            Waiting for the simulation service. Showing the state from{' '}
            {formatClock(snap.sim_time_min)}
            {ageSec !== null ? `, received ${ageSec}s ago` : ''}.
          </div>
        )}
      </div>

      <main className="workspace">
        <aside aria-label="Controls and feeds">
          <section className="panel" aria-labelledby="controls-h">
            <h2 id="controls-h">Simulation controls</h2>
            {!snap ? (
              <div className="intro">
                <p>
                  PulseAhead shows where patients are waiting in a fictional emergency department
                  (ED) and how long until congestion sets in.
                </p>
                <p className="muted" style={{ marginBottom: 'var(--s-4)' }}>
                  Start the simulation to watch synthetic patients move through four zones.
                </p>
                <button
                  className="btn btn-primary btn-block"
                  onClick={start}
                  data-testid="start"
                >
                  <IconPlay /> Start simulation
                </button>
              </div>
            ) : (
              <>
                <div className="btn-row">
                  <button
                    ref={playRef}
                    className="btn btn-primary"
                    onClick={() => setPlaying((p) => !p)}
                    aria-pressed={playing}
                    data-testid="play-pause"
                    style={{ flex: 1 }}
                  >
                    {playing ? <IconPause /> : <IconPlay />}
                    {playing ? 'Pause' : 'Play'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => void advance(STEP_MINUTES)}
                    // Not disabled while a request is in flight: that would drop keyboard focus.
                    // `run` already ignores a second command until the first one returns.
                    disabled={playing}
                    data-testid="step"
                    title={`Advance ${STEP_MINUTES} simulated minutes`}
                  >
                    <IconStep /> Step {STEP_MINUTES} min
                  </button>
                </div>
                <span className="field-label" id="speed-l">
                  Speed (simulated minutes per second)
                </span>
                <div className="segmented" role="group" aria-labelledby="speed-l">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      aria-pressed={speed === s}
                      onClick={() => setSpeed(s)}
                      data-testid={`speed-${s}`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 'var(--s-4)' }}>
                  <button className="btn btn-block" onClick={reset} data-testid="reset">
                    <IconReset /> Reset replay
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 'var(--s-3)' }}>
                  {snap.scenario_name} · seed {snap.seed} · run {snap.run_number} · state v
                  {snap.version}
                </p>
              </>
            )}
          </section>

          <section className="panel" aria-labelledby="amb-h">
            <h2 id="amb-h">Inbound ambulances</h2>
            <dl className="kv">
              <dt>Ambulances en route</dt>
              <dd data-testid="amb-count">{snap ? snap.inbound_ambulances.length : 0}</dd>
              <dt>Announced patients</dt>
              <dd>0</dd>
            </dl>
            <p className="muted" style={{ marginTop: 'var(--s-3)' }}>
              No ambulance announcements have been received.
            </p>
          </section>

          {snap && (
            <section className="panel" aria-labelledby="res-h">
              <h2 id="res-h">ED resources</h2>
              <dl className="kv">
                <dt>Available staffed spaces</dt>
                <dd data-testid="available-spaces">
                  {snap.resources.ed_spaces.available_staffed} of {snap.resources.ed_spaces.total}
                </dd>
                <dt>Occupied spaces</dt>
                <dd data-testid="occupied-spaces">{snap.resources.ed_spaces.occupied}</dd>
                <dt>Awaiting a space</dt>
                <dd data-testid="awaiting-space">{snap.resources.ed_spaces.awaiting_space}</dd>
                <dt>Clinician slots busy</dt>
                <dd>
                  {snap.resources.clinician_slots.busy} of {snap.resources.clinician_slots.total}
                </dd>
                <dt>Patients in the ED</dt>
                <dd data-testid="in-ed">{snap.counts.in_ed}</dd>
                <dt>Departed so far</dt>
                <dd data-testid="departed">{snap.counts.departed_total}</dd>
              </dl>
            </section>
          )}

          <section className="panel" aria-labelledby="leg-h">
            <h2 id="leg-h">Patient dots</h2>
            <ul className="legend">
              {(['urgent', 'medium', 'lower'] as Urgency[]).map((u) => (
                <li key={u}>
                  <span
                    className="swatch"
                    style={{
                      width: URGENCY_SIZE[u],
                      height: URGENCY_SIZE[u],
                      background: URGENCY_COLOR[u],
                    }}
                  />
                  {URGENCY_LABEL[u]}
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <section aria-label="Four-zone ED map">
          <div
            className="scene-wrap"
            data-testid="scene"
            data-dots-total={scene.dots.length}
            data-dots-overflow={scene.overflow}
            data-dots-z1={zoneCounts[1]}
            data-dots-z2={zoneCounts[2]}
            data-dots-z3={zoneCounts[3]}
            data-dots-z4={zoneCounts[4]}
            data-replay-version={snap?.version ?? 0}
          >
            <Scene
              scene={scene}
              counts={zoneCounts}
              selectedZone={selectedZone}
              onSelectZone={toggleZone}
            />
            {scene.overflow > 0 && (
              <div className="overflow-note" data-testid="overflow">
                +{scene.overflow} patients not drawn (listed in zone details)
              </div>
            )}
            <div className="zone-bar" role="group" aria-label="Zones">
              {[1, 2, 3, 4].map((z) => (
                <button
                  key={z}
                  className="zone-btn"
                  aria-pressed={selectedZone === z}
                  onClick={() => toggleZone(z)}
                  data-testid={`zone-${z}`}
                >
                  <span className="zone-num">Zone {z}</span>
                  <span className="zone-name">{ZONE_NAMES[z]}</span>
                  <span className="zone-count" data-testid={`zone-${z}-count`}>
                    {patientCount(snap ? snap.zones.find((q) => q.id === z)?.patient_count ?? 0 : 0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="drawer-col" aria-label="Selected zone">
          <section className="panel" aria-labelledby="drawer-h">
            {!zone ? (
              <>
                <h2 id="drawer-h">Zone details</h2>
                <p className="muted">
                  {snap
                    ? 'Select a zone on the map or in the zone list to see its patients, queues and capacity.'
                    : 'Zone details appear here once the simulation has started.'}
                </p>
              </>
            ) : (
              <ZoneDrawer snap={snap!} zoneId={zone.id} />
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

function ZoneDrawer({ snap, zoneId }: { snap: Snapshot; zoneId: number }) {
  const zone = snap.zones.find((z) => z.id === zoneId)!;
  const patients = snap.patients.filter((p) => zone.patient_ids.includes(p.id));
  const sp = snap.resources.ed_spaces;
  return (
    <div data-testid="zone-drawer" data-zone={zone.id} data-version={snap.version}>
      <h2 id="drawer-h">
        Zone {zone.id} · {zone.name}
      </h2>
      <dl className="kv" style={{ marginBottom: 'var(--s-4)' }}>
        <dt>Patients here</dt>
        <dd data-testid="drawer-count">{zone.patient_count}</dd>
        {zone.id === 2 && (
          <>
            <dt>Waiting for an ED space</dt>
            <dd>{zone.awaiting_space ?? 0}</dd>
            <dt>Waiting for a clinician</dt>
            <dd>{zone.awaiting_clinician ?? 0}</dd>
            <dt>With a clinician</dt>
            <dd>{zone.active}</dd>
          </>
        )}
        {zone.id === 1 && (
          <>
            <dt>In registration and triage</dt>
            <dd>{zone.queue}</dd>
          </>
        )}
        {zone.id === 4 && (
          <>
            <dt>Processing departure</dt>
            <dd>{zone.active}</dd>
          </>
        )}
      </dl>
      <p style={{ marginBottom: 'var(--s-4)' }}>
        {zone.id === 1 && 'No treatment beds here. Patients wait for registration and triage.'}
        {(zone.id === 2 || zone.id === 3) &&
          `ED spaces are one shared pool for zones 2 and 3: ${sp.occupied} of ${sp.total} occupied, ${sp.available_staffed} available.`}
        {zone.id === 4 &&
          `These patients still occupy their ED space until they physically leave (${sp.occupied} of ${sp.total} spaces occupied).`}
      </p>
      {zone.id === 3 && (
        <p className="muted">Diagnostic work is not modeled yet, so this zone is empty.</p>
      )}
      {patients.length > 0 && (
        <>
          <h3 style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--s-2)' }}>Patients</h3>
          <ul className="roster" data-testid="roster">
            {patients.map((p) => (
              <li key={p.id}>
                <strong>{p.id}</strong>
                <span>
                  {PHASE_LABEL[p.phase]}
                  {p.space_id && ` · Space ${p.space_id}`}
                  {p.clinician_id && ` · Clinician slot ${p.clinician_id}`}
                </span>
                <span className="tag">{URGENCY_LABEL[p.urgency]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
