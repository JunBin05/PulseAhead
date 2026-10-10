import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { buildScene } from './layout';
import { Scene } from './Scene';
import {
  IconCheck,
  IconClock,
  IconOctagon,
  IconPause,
  IconPlay,
  IconReset,
  IconStep,
  IconTriangle,
  IconUnknown,
} from './icons';
import { ZONE_LOOK, type ZoneDisplay } from './status';
import {
  ZONE_NAMES,
  type CongestionState,
  type Phase,
  type PressureService,
  type Snapshot,
  type Urgency,
} from './types';

const SPEEDS = [1, 2, 5, 10] as const;

/** Test-only: `?fixture=<id>` starts a controlled fixture scenario for Playwright MCP checks.
 * It is not linked or shown anywhere in the staff workflow. */
const TEST_FIXTURE = new URLSearchParams(window.location.search).get('fixture') ?? undefined;
const STEP_MINUTES = 5;

const PHASE_LABEL: Record<Phase, string> = {
  awaiting_triage: 'Waiting for triage',
  in_triage: 'At the triage desk',
  awaiting_space: 'Waiting for an ED space',
  awaiting_clinician: 'In a space, waiting for a clinician',
  assessment_active: 'With a clinician',
  awaiting_care_completion: 'Decision received, required care not complete (space held)',
  awaiting_lab: 'Waiting for the lab (keeps the ED space)',
  in_lab: 'Lab test running (keeps the ED space)',
  awaiting_imaging: 'Waiting for imaging (keeps the ED space)',
  in_imaging: 'Imaging running (keeps the ED space)',
  awaiting_result_review: 'Results back, waiting for a doctor to review',
  result_review_active: 'With a doctor, reviewing results',
  awaiting_discharge: 'Cleared, waiting for discharge processing',
  awaiting_ward_bed: 'Boarding: waiting for a suitable ward/ICU bed',
  awaiting_ward_allocation: 'Bed reserved, waiting for ward allocation work',
  ward_allocation_active: 'Ward allocation in progress',
  awaiting_transport: 'Allocated, waiting for transport',
  in_transport: 'In transport to the ward/ICU',
  disposition_processing: 'Discharge processing',
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

/** No snapshot yet means 'idle' (Not started), never Normal. */
function zoneState(snap: Snapshot | null, zone: number): ZoneDisplay {
  if (!snap) return 'idle';
  return snap.pressure.zones.find((z) => z.zone === zone)?.state ?? 'unknown';
}

function minutes(n: number): string {
  return `${n.toFixed(1)} min`;
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

function LocalChip({ state, testid }: { state: ZoneDisplay; testid?: string }) {
  const look = ZONE_LOOK[state];
  return (
    <span className="status" data-tone={look.tone} data-state={state} data-testid={testid}>
      {look.icon}
      <span>{look.label}</span>
    </span>
  );
}

function StatusBadge({ snap }: { snap: Snapshot | null }) {
  // The label text comes from the backend; only tone and icon are chosen here.
  const look = snap ? STATUS_LOOK[snap.overall_status.state] : { tone: 'unknown', icon: <IconUnknown /> };
  const label = snap ? snap.overall_status.label : 'Not started';
  const { tone, icon } = look;
  return (
    <div className="meta">
      <span className="meta-label">Overall status</span>
      <span className="status-line">
        <span className="status" data-tone={tone} data-testid="overall-status">
          {icon}
          <span>{label}</span>
        </span>
        {snap?.overall_status.local_alert && (
          <span className="status" data-tone="overload" data-testid="local-alert">
            <IconOctagon />
            <span>Local alert</span>
          </span>
        )}
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
    void run(() => api.create(TEST_FIXTURE), true);
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

          <AmbulancePanel snap={snap} />

          {snap && (
            <section className="panel" aria-labelledby="res-h">
              <h2 id="res-h">ED resources</h2>
              <dl className="kv">
                <dt>Available staffed spaces</dt>
                <dd data-testid="available-spaces">
                  {snap.resources.ed_spaces.available_staffed} of {snap.resources.ed_spaces.total}
                </dd>
                <dt>Staffed spaces</dt>
                <dd data-testid="staffed-spaces">
                  {snap.resources.ed_spaces.staffed_total} of {snap.resources.ed_spaces.total}
                </dd>
                <dt>Occupied spaces</dt>
                <dd data-testid="occupied-spaces">{snap.resources.ed_spaces.occupied}</dd>
                <dt>Awaiting a space</dt>
                <dd data-testid="awaiting-space">{snap.resources.ed_spaces.awaiting_space}</dd>
                <dt>Resuscitation spaces free</dt>
                <dd data-testid="resus-available">
                  {snap.resources.resus_spaces.available} of {snap.resources.resus_spaces.total}
                </dd>
                <dt>Triage desk busy</dt>
                <dd data-testid="triage-busy">
                  {snap.resources.triage_desk.busy} of {snap.resources.triage_desk.total}
                </dd>
                <dt>Lab busy</dt>
                <dd data-testid="lab-busy">
                  {snap.resources.diagnostics.lab.busy} of {snap.resources.diagnostics.lab.servers}
                  {snap.resources.diagnostics.lab.waiting > 0 &&
                    ` · ${snap.resources.diagnostics.lab.waiting} waiting`}
                </dd>
                <dt>Imaging busy</dt>
                <dd data-testid="imaging-busy">
                  {snap.resources.diagnostics.imaging.busy} of {snap.resources.diagnostics.imaging.servers}
                  {snap.resources.diagnostics.imaging.waiting > 0 &&
                    ` · ${snap.resources.diagnostics.imaging.waiting} waiting`}
                </dd>
                <dt>Discharge processing busy</dt>
                <dd data-testid="discharge-busy">
                  {snap.resources.disposition.discharge.busy} of {snap.resources.disposition.discharge.servers}
                </dd>
                <dt>Ward allocation busy</dt>
                <dd data-testid="allocation-busy">
                  {snap.resources.disposition.allocation.busy} of {snap.resources.disposition.allocation.servers}
                </dd>
                <dt>Transport busy</dt>
                <dd data-testid="transport-busy">
                  {snap.resources.disposition.transport.busy} of {snap.resources.disposition.transport.servers}
                </dd>
                <dt>Ward beds free</dt>
                <dd data-testid="ward-beds-free">
                  {snap.resources.disposition.beds.ward.free} of {snap.resources.disposition.beds.ward.total}
                </dd>
                <dt>ICU beds free</dt>
                <dd data-testid="icu-beds-free">
                  {snap.resources.disposition.beds.icu.free} of {snap.resources.disposition.beds.icu.total}
                </dd>
                <dt>Doctors busy</dt>
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
              exitCounts={{
                home: snap?.counts.departed_home ?? 0,
                ward: snap?.counts.departed_ward ?? 0,
              }}
              areaCounts={scene.perArea}
              zoneStates={{
                1: zoneState(snap, 1),
                2: zoneState(snap, 2),
                3: zoneState(snap, 3),
                4: zoneState(snap, 4),
              }}
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
                  <LocalChip state={zoneState(snap, z)} testid={`zone-${z}-status`} />
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
  const rs = snap.resources.resus_spaces;
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
            <dt>With a clinician (assessment or result review)</dt>
            <dd>{zone.active}</dd>
            <dt>Results back, waiting for review</dt>
            <dd data-testid="drawer-review-wait">{zone.awaiting_result_review ?? 0}</dd>
            <dt>Decision received, care not complete</dt>
            <dd data-testid="drawer-care-wait">{zone.awaiting_care_completion ?? 0}</dd>
          </>
        )}
        {zone.id === 1 && (
          <>
            <dt>Waiting for triage</dt>
            <dd data-testid="drawer-triage-queue">{zone.queue}</dd>
            <dt>At the triage desk</dt>
            <dd>
              {snap.resources.triage_desk.busy} of {snap.resources.triage_desk.total}
            </dd>
            <dt>Reserve triage team</dt>
            <dd>{snap.resources.triage_desk.reserve_team.active ? 'Active' : 'Declared, not active'}</dd>
          </>
        )}
        {zone.id === 3 && (
          <>
            <dt>Waiting for the lab</dt>
            <dd data-testid="drawer-lab-queue">{zone.lab_queue ?? 0}</dd>
            <dt>Lab tests running</dt>
            <dd data-testid="drawer-lab-active">
              {zone.lab_active ?? 0} of {snap.resources.diagnostics.lab.servers}
            </dd>
            <dt>Waiting for imaging</dt>
            <dd data-testid="drawer-imaging-queue">{zone.imaging_queue ?? 0}</dd>
            <dt>Imaging running</dt>
            <dd data-testid="drawer-imaging-active">
              {zone.imaging_active ?? 0} of {snap.resources.diagnostics.imaging.servers}
            </dd>
            <dt>Lab capacity</dt>
            <dd data-testid="drawer-lab-rate">
              {snap.resources.diagnostics.lab.capacity_tasks_per_hour} tasks/h ·{' '}
              {snap.resources.diagnostics.lab.completed_last_30_min} done in 30 min
            </dd>
            <dt>Imaging capacity</dt>
            <dd data-testid="drawer-imaging-rate">
              {snap.resources.diagnostics.imaging.capacity_tasks_per_hour} tasks/h ·{' '}
              {snap.resources.diagnostics.imaging.completed_last_30_min} done in 30 min
            </dd>
          </>
        )}
        {zone.id === 4 && (
          <>
            <dt>Home discharge: waiting</dt>
            <dd data-testid="drawer-discharge-queue">{zone.awaiting_discharge ?? 0}</dd>
            <dt>Home discharge: processing</dt>
            <dd data-testid="drawer-discharge-active">
              {zone.discharge_active ?? 0} of {snap.resources.disposition.discharge.servers}
            </dd>
            <dt>Boarding: waiting for a suitable bed</dt>
            <dd data-testid="drawer-boarding">{zone.awaiting_ward_bed ?? 0}</dd>
            <dt>Ward allocation: waiting</dt>
            <dd data-testid="drawer-allocation-queue">{zone.awaiting_ward_allocation ?? 0}</dd>
            <dt>Ward allocation: in progress</dt>
            <dd data-testid="drawer-allocation-active">
              {zone.allocation_active ?? 0} of {snap.resources.disposition.allocation.servers}
            </dd>
            <dt>Transport: waiting</dt>
            <dd data-testid="drawer-transport-queue">{zone.awaiting_transport ?? 0}</dd>
            <dt>Transport: moving a patient</dt>
            <dd data-testid="drawer-transport-active">
              {zone.in_transport ?? 0} of {snap.resources.disposition.transport.servers}
            </dd>
            <dt>Ward beds (free, reserved, occupied)</dt>
            <dd data-testid="drawer-ward-beds">
              {snap.resources.disposition.beds.ward.free}, {snap.resources.disposition.beds.ward.reserved},{' '}
              {snap.resources.disposition.beds.ward.occupied} of {snap.resources.disposition.beds.ward.total}
            </dd>
            <dt>ICU beds (free, reserved, occupied)</dt>
            <dd data-testid="drawer-icu-beds">
              {snap.resources.disposition.beds.icu.free}, {snap.resources.disposition.beds.icu.reserved},{' '}
              {snap.resources.disposition.beds.icu.occupied} of {snap.resources.disposition.beds.icu.total}
            </dd>
            <dt>Left through Home exit</dt>
            <dd data-testid="drawer-exit-home">{snap.counts.departed_home}</dd>
            <dt>Left through Ward / ICU exit</dt>
            <dd data-testid="drawer-exit-ward">{snap.counts.departed_ward}</dd>
          </>
        )}
      </dl>
      <p style={{ marginBottom: 'var(--s-4)' }}>
        {zone.id === 1 && 'No treatment beds here. Patients wait for registration and triage.'}
        {(zone.id === 2 || zone.id === 3) &&
          `ED spaces are one shared pool for zones 2 and 3: ${sp.occupied} of ${sp.total} occupied, ${sp.available_staffed} general spaces free. ${rs.available} of ${rs.total} resuscitation spaces (held for supplied critical bypass) free${rs.awaiting ? `, ${rs.awaiting} critical patient${rs.awaiting === 1 ? '' : 's'} waiting` : ''}.`}
        {zone.id === 4 &&
          `These patients still occupy their ED space until they physically leave (${sp.occupied} of ${sp.total} spaces occupied).`}
      </p>
      {zone.id === 3 && (
        <p className="muted" data-testid="diag-note" style={{ marginBottom: 'var(--s-4)' }}>
          These patients keep their ED space while they wait for or have tests; no doctor is held
          for the wait. {snap.resources.diagnostics.note} Lab median{' '}
          {snap.resources.diagnostics.lab.median_turnaround_min} min, imaging median{' '}
          {snap.resources.diagnostics.imaging.median_turnaround_min} min (demo assumptions).
        </p>
      )}
      <PressureSection snap={snap} zoneId={zone.id} />
      {(zone.id === 2 || zone.id === 3) && <StaffingSummary snap={snap} />}
      {patients.length > 0 && (
        <>
          <h3 style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--s-2)' }}>Patients</h3>
          <ul className="roster" data-testid="roster">
            {patients.map((p) => (
              <li key={p.id}>
                <strong>{p.id}</strong>
                <span>
                  {p.critical_bypass && p.phase === 'awaiting_space'
                    ? 'Critical bypass, waiting for a resuscitation space'
                    : PHASE_LABEL[p.phase]}
                  {p.space_id && ` · Space ${p.space_id}`}
                  {p.triage_id && ` · Desk ${p.triage_id}`}
                  {p.nurse_id && ` · Nurse ${p.nurse_id}`}
                  {p.clinician_id && ` · Doctor ${p.clinician_id}`}
                  {p.diagnostic_unit && ` · Unit ${p.diagnostic_unit}`}
                  {p.tests_done.length > 0 && ` · Done: ${p.tests_done.join(', ')}`}
                  {p.care_status === 'in_progress' && ' · Stabilization in progress'}
                  {` · ${p.acuity_system} ${p.acuity_score} (supplied)`}
                  {p.ambulance_id && ` · Ambulance ${p.ambulance_id}`}
                  {p.disposition && ` · Destination: ${p.disposition === 'home' ? 'home' : p.disposition === 'icu' ? 'ICU' : 'ward'}`}
                  {p.ward_bed_id && ` · Bed ${p.ward_bed_id}`}
                  {p.waiting_reason && ` · ${p.waiting_reason}`}
                </span>
                <span className="tag">
                  {p.critical_bypass ? 'Critical bypass' : URGENCY_LABEL[p.urgency]}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function rate(value: number | null, unit: string): string {
  return value === null ? 'Unknown' : `${value} ${unit}`;
}

function ServiceCard({ svc, now, rule }: { svc: PressureService; now: number; rule: Snapshot['pressure']['rule'] }) {
  const r = svc.rates;
  const id = svc.id;
  const unit = r.unit.replace(' per hour', '/h');
  const confirmedClock = svc.confirmed_min !== null ? formatClock(svc.confirmed_min) : null;
  const recoveryElapsed = svc.recovery_since_min !== null ? now - svc.recovery_since_min : null;
  let signal = 'Unknown (inputs missing)';
  if (r.pressure_signal === true) {
    signal = 'Incoming work exceeds staffed capacity: a pressure signal only, not a countdown';
  } else if (r.pressure_signal === false) {
    signal = 'Incoming work is within staffed capacity';
  } else if (svc.inputs_ok) {
    signal = 'No per-hour capacity model for this service';
  }
  return (
    <li
      data-testid={`svc-${id}`}
      data-state={svc.state}
      data-queue={svc.queue ?? ''}
      data-lambda={r.received_per_hour ?? ''}
      data-mu={r.capacity_per_hour ?? ''}
      data-throughput={r.recent_throughput_per_hour ?? ''}
    >
      <div className="svc-head">
        <strong>{svc.name}</strong>
        <LocalChip state={svc.state} testid={`svc-${id}-state`} />
      </div>
      <p className="svc-sub">Queue: {svc.queue_label}</p>
      <dl className="kv">
        <dt>Waiting</dt>
        <dd data-testid={`svc-${id}-queue`}>
          {svc.queue === null ? 'Unknown' : svc.queue}
          {svc.threshold !== null && ` (threshold ${svc.threshold})`}
        </dd>
        <dt>No capacity free</dt>
        <dd data-testid={`svc-${id}-blocked`}>
          {svc.capacity_unavailable === null ? 'Unknown' : svc.capacity_unavailable ? 'Yes' : 'No'}
        </dd>
        {svc.state === 'building' && svc.onset_min !== null && (
          <>
            <dt>Started</dt>
            <dd data-testid={`svc-${id}-onset`}>
              {formatClock(svc.onset_min)} · {minutes(svc.elapsed_min ?? 0)} so far
            </dd>
            <dt>Confirms in</dt>
            <dd data-testid={`svc-${id}-confirms-in`}>
              {svc.confirms_in_min !== null ? minutes(svc.confirms_in_min) : 'Unknown'} if it persists
            </dd>
          </>
        )}
        {svc.state === 'overloaded' && (
          <>
            <dt>Started, confirmed</dt>
            <dd data-testid={`svc-${id}-onset`}>
              {svc.onset_min !== null ? formatClock(svc.onset_min) : '—'}, {confirmedClock ?? '—'}
            </dd>
            <dt>Recovery</dt>
            <dd data-testid={`svc-${id}-recovery`}>
              {recoveryElapsed !== null
                ? `${minutes(recoveryElapsed)} of ${rule.clear_after_minutes} min below threshold with capacity`
                : 'Not recovering'}
            </dd>
          </>
        )}
        {svc.state === 'unknown' && (
          <>
            {svc.confirmed_min !== null && (
              <>
                <dt>Open episode</dt>
                <dd data-testid={`svc-${id}-open`}>
                  Confirmed {confirmedClock}; stays open while inputs are missing
                </dd>
              </>
            )}
            <dt>Recovery</dt>
            <dd data-testid={`svc-${id}-recovery`}>Cannot be established while inputs are missing</dd>
          </>
        )}
        <dt>Received work (λ, last {r.window_min} min)</dt>
        <dd data-testid={`svc-${id}-lambda`}>{rate(r.received_per_hour, unit)}</dd>
        <dt>Staffed capacity (μ)</dt>
        <dd data-testid={`svc-${id}-mu`}>
          {r.capacity_per_hour === null && r.free_beds
            ? `${r.free_beds.ward} ward, ${r.free_beds.icu} ICU beds free`
            : r.capacity_per_hour === null
              ? 'Not modelled per hour'
              : rate(r.capacity_per_hour, unit)}
        </dd>
        {r.capacity_per_hour !== null && (
          <>
            <dt>Capacity basis</dt>
            <dd data-testid={`svc-${id}-basis`}>
              {r.servers} × 60 / {r.mean_task_min} min
            </dd>
          </>
        )}
        <dt>Recent throughput (completed)</dt>
        <dd data-testid={`svc-${id}-throughput`}>{rate(r.recent_throughput_per_hour, unit)}</dd>
      </dl>
      <p className="muted" style={{ marginTop: 'var(--s-2)' }} data-testid={`svc-${id}-signal`}>
        {signal}
      </p>
    </li>
  );
}

function PressureSection({ snap, zoneId }: { snap: Snapshot; zoneId: number }) {
  const pr = snap.pressure;
  const zoneInfo = pr.zones.find((z) => z.zone === zoneId)!;
  const alerts = pr.alerts.filter((a) => a.zone === zoneId);
  return (
    <section data-testid="pressure" aria-labelledby="pressure-h" style={{ marginBottom: 'var(--s-4)' }}>
      <h3 id="pressure-h" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--s-2)' }}>
        Zone pressure
      </h3>
      <p style={{ marginBottom: 'var(--s-2)' }}>
        <LocalChip state={zoneInfo.state} testid="drawer-zone-state" />
      </p>
      {alerts.length > 0 && (
        <ul className="svc-list" data-testid="alert-list" style={{ marginBottom: 'var(--s-3)' }}>
          {alerts.map((a) => (
            <li key={a.service} data-testid={`alert-item-${a.service}`} data-category={a.category}>
              <div className="svc-head">
                <strong>{a.category_label}</strong>
                <LocalChip state={a.state} />
                {a.mixed && (
                  <span className="tag" data-testid={`alert-mixed-${a.service}`}>
                    Mixed: also {a.also_active.join(', ')}
                  </span>
                )}
              </div>
              <p className="svc-sub">
                {a.evidence}. Affected: {a.affected_patients ?? 'unknown'} · urgent group waiting:{' '}
                {a.urgent_group_waiting}
              </p>
            </li>
          ))}
        </ul>
      )}
      {pr.mixed && (
        <p data-testid="mixed-note" style={{ marginBottom: 'var(--s-2)' }}>
          {pr.mixed_label}: more than one failure category is active across the ED.
        </p>
      )}
      <ul className="svc-list">
        {zoneInfo.services.map((sid) => (
          <ServiceCard key={sid} svc={pr.services[sid]} now={snap.sim_time_min} rule={pr.rule} />
        ))}
      </ul>
      <p className="muted" data-testid="pressure-note" style={{ marginTop: 'var(--s-3)' }}>
        A local zone overload is not overall ED congestion. Overall ED status: {snap.overall_status.label}.
        Local overload is confirmed after {pr.rule.confirm_after_minutes} min and clears after{' '}
        {pr.rule.clear_after_minutes} min below its threshold with capacity available. Demo thresholds,
        not clinical standards.
      </p>
    </section>
  );
}

function StaffingSummary({ snap }: { snap: Snapshot }) {
  const staff = snap.resources.staff;
  const un = staff.unstaffed_empty_spaces;
  return (
    <section data-testid="staffing" aria-labelledby="staff-h" style={{ marginBottom: 'var(--s-4)' }}>
      <h3 id="staff-h" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--s-2)' }}>
        Staffing (shared by zones 2 and 3)
      </h3>
      <ul className="roster" data-testid="doctor-list">
        {staff.doctors.map((d) => (
          <li key={d.id} data-testid={`doctor-${d.id}`}>
            <strong>{d.id}</strong>
            <span>
              {d.name} · {d.patient_id ? `with ${d.patient_id}` : 'free'}
            </span>
            <span className="tag">Doctor, on duty</span>
          </li>
        ))}
        <li data-testid="doctor-reserve">
          <strong>{staff.reserve_physician.id}</strong>
          <span>
            {staff.reserve_physician.name} · reserve physician ·{' '}
            {staff.reserve_physician.active ? 'Active' : 'Declared, not active'} · owner{' '}
            {staff.reserve_physician.owner}
          </span>
          <span className="tag">Reserve</span>
        </li>
      </ul>
      <ul className="roster" data-testid="nurse-list" style={{ marginTop: 'var(--s-3)' }}>
        {staff.nurses.map((n) => (
          <li key={n.id} data-testid={`nurse-${n.id}`}>
            <strong>{n.id}</strong>
            <span>
              {n.name} · covers {n.covers[0]}–{n.covers[n.covers.length - 1]} · {n.occupied} occupied,{' '}
              {n.empty} empty
            </span>
            <span className="tag">{n.on_duty ? 'On duty' : 'Off duty'}</span>
          </li>
        ))}
      </ul>
      <p data-testid="unstaffed-note" style={{ marginTop: 'var(--s-3)' }}>
        {un.count > 0
          ? `${un.count} empty space${un.count === 1 ? ' is' : 's are'} not usable because no nurse is covering ${un.count === 1 ? 'it' : 'them'}: ${staff.off_duty_nurses.map((id) => staff.nurses.find((n) => n.id === id)?.name ?? id).join(', ')} off duty. Staffed spaces: ${snap.resources.ed_spaces.staffed_total} of ${snap.resources.ed_spaces.total}.`
          : `Every empty space has a covering nurse on duty. Staffed spaces: ${snap.resources.ed_spaces.staffed_total} of ${snap.resources.ed_spaces.total}.`}
      </p>
      <p className="muted">{staff.note}</p>
    </section>
  );
}

const AMB_STATUS: Record<'en_route' | 'delayed', string> = {
  en_route: 'En route',
  delayed: 'Delayed, ETA overdue',
};

function AmbulancePanel({ snap }: { snap: Snapshot | null }) {
  const inbound = snap?.inbound_ambulances ?? [];
  const summary = snap?.inbound_summary;
  return (
    <section className="panel" aria-labelledby="amb-h">
      <h2 id="amb-h">Inbound ambulances</h2>
      <dl className="kv">
        <dt>Ambulances en route</dt>
        <dd data-testid="amb-count">{summary ? summary.ambulances : '—'}</dd>
        <dt>Announced inbound patients</dt>
        <dd data-testid="amb-patients">{summary ? summary.patients : '—'}</dd>
      </dl>
      {!snap ? (
        <p className="muted" style={{ marginTop: 'var(--s-3)' }}>
          Announcements appear once the simulation has started.
        </p>
      ) : inbound.length === 0 ? (
        <p className="muted" style={{ marginTop: 'var(--s-3)' }} data-testid="amb-empty">
          No ambulances are currently announced.
          {summary?.feed_last_update_min != null &&
            ` Last ambulance update at ${formatClock(summary.feed_last_update_min)}.`}
        </p>
      ) : (
        <ul className="amb-list" data-testid="amb-list">
          {inbound.map((a) => {
            const critical = a.acuity?.filter((x) => x.critical_bypass).length ?? 0;
            return (
              <li key={a.id} data-testid={`amb-${a.id}`} data-status={a.status}>
                <div className="amb-row">
                  <strong>{a.id}</strong>
                  <span className="amb-status" data-tone={a.status === 'delayed' ? 'pressure' : 'unknown'}>
                    {a.status === 'delayed' ? <IconTriangle /> : <IconClock />}
                    {AMB_STATUS[a.status as 'en_route' | 'delayed']}
                  </span>
                </div>
                <div className="muted">
                  ETA {formatClock(a.eta_min)} ±{a.eta_uncertainty_min} min ·{' '}
                  {patientCount(a.patient_count)}
                  {a.minutes_overdue !== null && ` · ${Math.round(a.minutes_overdue)} min overdue`}
                </div>
                <div className="muted">
                  {a.acuity
                    ? `Supplied acuity: ${a.acuity.map((x) => x.acuity).join(', ')}${
                        critical ? ` · ${critical} critical bypass` : ''
                      }`
                    : 'Acuity not yet reported'}
                  {` · updated ${formatClock(a.source_updated_min)}`}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
