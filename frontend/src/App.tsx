import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { buildScene } from './layout';
import { Scene } from './Scene';
import {
  IconCheck,
  IconOctagon,
  IconOverview,
  IconTriangle,
  IconUnknown,
  IconPlay,
} from './icons';
import { ZONE_LOOK, type ZoneDisplay } from './status';
import { ActionChip, ComparePanel, RoleSwitcher } from './Actions';
import { DemoBar, type DemoController } from './Demo';
import { EvaluationPanel } from './Evaluation';
import { clockOrDash, fig, formatClock, ofTotal, patientCount } from './format';
import { AmbulancePanel, DataQualityPanel, FeedsPanel } from './panels/DataPanels';
import { ResourcesPanel, URGENCY_LABEL } from './panels/ResourcesPanel';
import { RunsPanel } from './panels/RunsPanel';
import { RunBar } from './shell/RunBar';
import { KpiRow } from './shell/KpiRow';
import { Tabs } from './shell/Tabs';
import { AlertSpine, ForecastDock } from './shell/AlertSpine';
import { PitchStory } from './PitchStory';
import {
  AlertList,
  ForecastStrip,
  ZoneForecast,
  useExplanation,
  useForecast,
  zoneForecastLine,
  type ExplanationView,
  type ForecastSamples,
  type ForecastView,
} from './Forecast';
import {
  ZONE_NAMES,
  type CongestionState,
  type ComparisonResult,
  type Feed,
  type Phase,
  type PressureService,
  type SavedSummary,
  type ScenarioInfo,
  type Snapshot,
  type ZoneDetail,
} from './types';

const SPEEDS = [1, 2, 5, 10] as const;
type LeftTab = 'story' | 'resources' | 'data' | 'runs';
type RightTab = 'zone' | 'act' | 'alerts';

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

/** No snapshot yet means 'idle' (Not started), never Normal. */
function zoneState(snap: Snapshot | null, zone: number): ZoneDisplay {
  if (!snap) return 'idle';
  return snap.pressure.zones.find((z) => z.zone === zone)?.state ?? 'unknown';
}

function minutes(n: number): string {
  return `${n.toFixed(1)} min`;
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

/** Feeds each zone's figures depend on, for its limitation notes. */
const ZONE_FEEDS: Record<number, string[]> = {
  1: ['queues'],
  2: ['queues', 'spaces', 'staffing'],
  3: ['diagnostics', 'spaces', 'staffing'],
  4: ['disposition', 'spaces', 'staffing'],
};

function StatusBadge({ snap }: { snap: Snapshot | null }) {
  // The label text comes from the backend; only tone and icon are chosen here. An essential feed
  // older than ten simulated minutes means Cannot assess, whatever the last valid state was.
  const look = !snap
    ? { tone: 'unknown', icon: <IconUnknown /> }
    : snap.overall_status.assessable === false
      ? { tone: 'unknown', icon: <IconUnknown /> }
      : STATUS_LOOK[snap.overall_status.state];
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
  // The open zone's details, for the version they were computed at. Shown only while that version
  // is the one on screen.
  const [zoneDetail, setZoneDetail] = useState<ZoneDetail | null>(null);
  // Camera focus follows a user's selection of an overloaded zone; a state change never moves it.
  const [focusZone, setFocusZone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [, setClock] = useState(0);
  // Presenter controls: the scenario family used on the next Start or Reset, and saved runs.
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [scenarioId, setScenarioId] = useState('normal');
  const [savedList, setSavedList] = useState<SavedSummary[]>([]);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // Development setting: how many independent futures each forecast samples.
  const [fcSamples, setFcSamples] = useState<ForecastSamples>(50);
  // Demo role (who the screen acts as) and the action comparison panel; opening it pauses the replay.
  const [role, setRole] = useState('ED shift coordinator');
  const [compareOpen, setCompareOpen] = useState(false);
  const [lastCmp, setLastCmp] = useState<ComparisonResult | null>(null);
  // 2D list view: the same zone status, alerts, comparison and approvals without the 3D scene.
  const [listView, setListView] = useState(false);
  // Which tab each rail shows. Panels in hidden tabs stay mounted, so nothing loses its state.
  const [leftTab, setLeftTab] = useState<LeftTab>('story');
  // Pressing "Start guided demo" in the run bar asks the story stage to run its first beat.
  const [demoKick, setDemoKick] = useState(0);
  const [rightTab, setRightTab] = useState<RightTab>('zone');
  useEffect(() => {
    setRightTab(compareOpen ? 'act' : 'zone');
  }, [compareOpen]);
  const compareReturnRef = useRef<HTMLElement | null>(null);

  const idRef = useRef<string | null>(null);
  const versionRef = useRef(0);
  const busyRef = useRef(false);
  const epochRef = useRef(0);
  const requestRef = useRef(0);
  const playRef = useRef<HTMLButtonElement>(null);
  const focusPlayRef = useRef(false);
  const selectedRef = useRef<number | null>(null);
  const snapRef = useRef<Snapshot | null>(null);

  const clearSelection = useCallback(() => {
    selectedRef.current = null;
    setSelectedZone(null);
    setFocusZone(null);
    setZoneDetail(null);
  }, []);

  const apply = useCallback((s: Snapshot) => {
    // Discard anything older than what is already shown for the same replay.
    if (idRef.current === s.replay_id && s.version < versionRef.current) return;
    idRef.current = s.replay_id;
    versionRef.current = s.version;
    snapRef.current = s;
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
        // With a zone open, fetch its details for this very version before showing either, so the
        // drawer and the map never describe different states.
        let detail: ZoneDetail | null = null;
        const open = selectedRef.current;
        if (open !== null && epochRef.current === epoch) {
          try {
            detail = await api.zone(s.replay_id, open);
          } catch {
            detail = null; // the drawer shows its loading state and refetches
          }
        }
        if (epochRef.current === epoch) {
          apply(s);
          if (detail && detail.version === s.version && selectedRef.current === detail.zone.id) {
            setZoneDetail(detail);
          }
        }
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
    clearSelection();
    setCompareOpen(false);
    void run(() => api.create(TEST_FIXTURE ?? scenarioId), true);
  }, [run, clearSelection, scenarioId]);

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
    clearSelection();
    setCompareOpen(false);
    epochRef.current += 1;
    void run(() => api.reset(id, TEST_FIXTURE ? undefined : scenarioId), true);
  }, [run, clearSelection, scenarioId]);

  const refreshSaved = useCallback(() => {
    api
      .saved()
      .then((r) => setSavedList(r.saved))
      .catch(() => {
        /* the list keeps what it had; saving and loading report their own errors */
      });
  }, []);

  useEffect(() => {
    api
      .scenarios()
      .then((c) => setScenarios(c.scenarios))
      .catch(() => {
        /* the selector stays on the default scenario */
      });
    refreshSaved();
  }, [refreshSaved]);

  // Save the run as it is now: its received events, announcements, settings and what is on screen.
  const save = useCallback(() => {
    const id = idRef.current;
    if (!id) return;
    setSaveNote(null);
    api
      .save(id, {
        ui: {
          selected_zone: selectedRef.current,
          camera: focusZone === null ? 'overview' : `zone-${focusZone}`,
        },
        settings: { speed, step_min: STEP_MINUTES },
        forecast: { samples: fcSamples },
      })
      .then((s) => {
        setSaveNote(`Saved ${s.saved_id}: ${s.label} at ${formatClock(s.sim_time_min)}.`);
        refreshSaved();
      })
      .catch((e) => setSaveNote(e instanceof ApiError ? `Could not save: ${e.message}` : 'Could not save.'));
  }, [focusZone, speed, fcSamples, refreshSaved]);

  // Loading rebuilds one consistent run: the old replay, selection, camera and requests are dropped
  // first, then the saved selection and camera are restored on top of the rebuilt state.
  const load = useCallback(
    (savedId: string) => {
      setPlaying(false);
      setSaveNote(null);
      epochRef.current += 1;
      idRef.current = null;
      versionRef.current = 0;
      clearSelection();
      setCompareOpen(false);
      void run(async () => {
        const s = await api.load(savedId);
        const ui = s.saved_run?.ui;
        if (ui?.selected_zone) {
          selectedRef.current = ui.selected_zone;
          setSelectedZone(ui.selected_zone);
          setFocusZone(ui.camera === `zone-${ui.selected_zone}` ? ui.selected_zone : null);
        }
        const sp = s.saved_run?.settings.simulation.speed;
        if (sp === 1 || sp === 2 || sp === 5 || sp === 10) setSpeed(sp);
        const fs = s.saved_run?.settings.forecast?.samples;
        if (fs === 50 || fs === 100) setFcSamples(fs);
        setScenarioId(s.scenario);
        return s;
      }, true);
    },
    [run, clearSelection],
  );

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

  // Selecting a zone opens its drawer. If that zone is overloaded (an alert) the camera also focuses
  // it; a normal zone is not zoomed, and later state changes never move the camera on their own.
  const toggleZone = useCallback(
    (z: number) => {
      if (selectedRef.current === z) {
        clearSelection();
        return;
      }
      selectedRef.current = z;
      setSelectedZone(z);
      const state = snapRef.current?.pressure.zones.find((x) => x.zone === z)?.state;
      setFocusZone(state === 'overloaded' ? z : null);
    },
    [clearSelection],
  );

  // Keep the open zone's details at the version on screen (selection changes, or a refresh that
  // could not be fetched together with its state).
  useEffect(() => {
    if (!snap || selectedZone === null) return;
    if (
      zoneDetail &&
      zoneDetail.zone.id === selectedZone &&
      zoneDetail.replay_id === snap.replay_id &&
      zoneDetail.version === snap.version
    ) {
      return;
    }
    let cancelled = false;
    api
      .zone(snap.replay_id, selectedZone)
      .then((d) => {
        if (cancelled) return;
        if (d.zone.id === selectedRef.current && d.version === versionRef.current) setZoneDetail(d);
      })
      .catch(() => {
        /* the drawer keeps its loading state; the next state refresh tries again */
      });
    return () => {
      cancelled = true;
    };
  }, [snap?.replay_id, snap?.version, selectedZone, zoneDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  const { view: fcView, retry: fcRetry } = useForecast(snap, fcSamples);
  const explanation = useExplanation(fcView.data, selectedZone);

  // Choosing an alert from the alert list focuses its zone (a zone button keeps the earlier rule:
  // only an Overloaded zone is zoomed).
  const selectAlert = useCallback((z: number) => {
    selectedRef.current = z;
    setSelectedZone(z);
    setFocusZone(z);
  }, []);

  const openCompare = useCallback(() => {
    compareReturnRef.current = document.activeElement as HTMLElement | null;
    setPlaying(false);
    setCompareOpen(true);
  }, []);
  const closeCompare = useCallback(() => {
    setCompareOpen(false);
    window.setTimeout(() => compareReturnRef.current?.focus(), 0);
  }, []);

  // The guided demo drives the real API itself; this hands it the app's own snapshot, selection and panels.
  const demoCtl = useMemo<DemoController>(
    () => ({
      adopt: (s2, fresh) => {
        if (fresh) {
          epochRef.current += 1;
          idRef.current = null;
          versionRef.current = 0;
          clearSelection();
          setCompareOpen(false);
          setPlaying(false);
          setLastCmp(null);
        }
        apply(s2);
      },
      focusZone: (z) => selectAlert(z),
      setRole,
      openCompare,
      currentReplayId: () => idRef.current,
    }),
    [apply, clearSelection, selectAlert, openCompare],
  );

  const scene = useMemo(() => buildScene(snap), [snap]);
  const zoneCounts = scene.perZone;
  const zone = snap && selectedZone ? snap.zones.find((z) => z.id === selectedZone) : undefined;

  const lastValidAt = lastValid(conn);
  const ageSec = lastValidAt ? Math.max(0, Math.round((Date.now() - lastValidAt) / 1000)) : null;

  return (
    <div className={`app app--stage ${snap ? 'is-live' : 'is-idle'}`}>
      <header className="app-header">
        <div className="brand-row">
          <h1 className="app-title">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="28" height="28">
                <path d="M2 17h7l3-8 5 15 4-11 2 4h7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>
              PulseAhead
              <small>ED congestion early warning · operational twin</small>
            </span>
          </h1>
          <span className="synthetic-chip" data-testid="synthetic-label">
            Synthetic demo
          </span>
          {snap && (
            <span className="scenario-line">
              {snap.scenario_name} · seed {snap.seed} · run {snap.run_number} · v{snap.version}
            </span>
          )}
        </div>
        <div className="hud-cluster">
          <RoleSwitcher roles={snap?.actions.roles ?? ['ED shift coordinator']} value={role} onChange={setRole} />
          <div className="meta">
            <span className="meta-label">Sim time</span>
            <span className="meta-value" data-testid="sim-time">
              {snap ? formatClock(snap.sim_time_min) : 'T+00:00'}
            </span>
          </div>
          {snap && (
            <div className="meta">
              <span className="meta-label">Free staffed</span>
              <span className="meta-value">
                {snap.resources.ed_spaces.available_staffed === null ? 'Not current' : snap.resources.ed_spaces.available_staffed}
                <small> of {snap.resources.ed_spaces.total}</small>
              </span>
            </div>
          )}
          <StatusBadge snap={snap} />
        </div>
      </header>

      <KpiRow snap={snap} view={fcView} />
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

      <main className="workspace stage">
        <aside className="rail rail-left" aria-label="Story, resources, data and runs">
          <Tabs
            label="Panels"
            idPrefix="left"
            value={leftTab}
            onChange={(v) => setLeftTab(v as LeftTab)}
            tabs={[
              {
                id: 'story',
                label: 'Story',
                content: (
                  <>
                    <PitchStory ctl={demoCtl} kick={demoKick} onOpenEvidence={() => setLeftTab('runs')} />
                    <details className="story-advanced">
                      <summary>Full evidence walkthrough (for presenters)</summary>
                      <DemoBar ctl={demoCtl} kick={0} />
                    </details>
                  </>
                ),
              },
              {
                id: 'resources',
                label: 'Resources',
                content: <ResourcesPanel snap={snap} />,
              },
              {
                id: 'data',
                label: 'Data',
                content: (
                  <>
                    <AmbulancePanel snap={snap} />
                    <FeedsPanel snap={snap} />
                    <DataQualityPanel snap={snap} />
                  </>
                ),
              },
              {
                id: 'runs',
                label: 'Runs',
                content: (
                  <>
                    <RunsPanel
                      snap={snap}
                      scenarios={scenarios}
                      scenarioId={scenarioId}
                      onScenario={setScenarioId}
                      fixtureLocked={TEST_FIXTURE !== undefined}
                      onSave={save}
                      saveNote={saveNote}
                      saved={savedList}
                      onLoad={load}
                      fcSamples={fcSamples}
                      onFcSamples={setFcSamples}
                    />
                    <EvaluationPanel />
                  </>
                ),
              },
            ]}
          />
        </aside>

        <section className="stage-center" aria-label="Four-zone ED map">
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
            data-camera={focusZone === null ? 'overview' : `zone-${focusZone}`}
          >
            {!listView && (
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
                focusZone={focusZone}
                ambulances={snap ? snap.inbound_ambulances.map((a) => ({ id: a.id, eta_min: a.eta_min })) : []}
                simTime={snap?.sim_time_min ?? 0}
              />
            )}
            {focusZone !== null && (
              <div className="camera-callout" data-testid="camera-callout" role="status">
                <span>
                  Focused on zone {focusZone} · {ZONE_NAMES[focusZone]}
                </span>
                <button className="btn" onClick={() => setFocusZone(null)} data-testid="back-to-overview">
                  <IconOverview /> Back to overview
                </button>
              </div>
            )}
            {scene.overflow > 0 && (
              <div className="overflow-note" data-testid="overflow">
                +{scene.overflow} patients not drawn (listed in zone details)
              </div>
            )}
            <div className="view-toggle">
              <button
                className="btn"
                aria-pressed={listView}
                onClick={() => setListView((v) => !v)}
                data-testid="view-toggle"
              >
                {listView ? 'Show 3D view' : 'Show 2D list view'}
              </button>
              {listView && (
                <span className="muted" data-testid="list-view-note">
                  2D list view: counts, status, alerts, comparison and approvals are the same as in 3D.
                </span>
              )}
            </div>
            {!snap && (
              <div className="splash" data-testid="splash">
                <span className="splash-mark" aria-hidden="true">
                  <svg viewBox="0 0 32 32" width="30" height="30">
                    <path d="M2 17h7l3-8 5 15 4-11 2 4h7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h2>Know when the emergency department will overload</h2>
                <p>
                  A simulated hospital with made-up patients. PulseAhead warns early, says what is holding things up,
                  and ranks what to fix first.
                </p>
                <div className="splash-buttons">
                  <button
                    className="btn btn-primary btn-hero"
                    onClick={() => {
                      setLeftTab('story');
                      setDemoKick((k) => k + 1);
                    }}
                    data-testid="splash-demo"
                  >
                    <IconPlay /> Start the demo
                  </button>
                  <button className="btn" onClick={start} data-testid="splash-explore">
                    Explore on my own
                  </button>
                </div>
              </div>
            )}
            {snap && (
              <AlertSpine
                snap={snap}
                view={fcView}
                onCompare={(z) => {
                  selectAlert(z);
                  openCompare();
                }}
              />
            )}
          </div>
        </section>

        <aside className="rail drawer-col" aria-label="Selected zone and actions">
          <Tabs
            label="Zone and actions"
            idPrefix="right"
            value={rightTab}
            onChange={(v) => setRightTab(v as RightTab)}
            tabs={[
              {
                id: 'zone',
                label: 'Zone',
                content: (
                  <>
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
                  <ActionChip snap={snap} zone={z} />
                  {snap && (
                    <span className="zone-fc" data-testid={`zone-${z}-forecast`}>
                      {zoneForecastLine(fcView, z)}
                    </span>
                  )}
                </button>
              ))}
                  </div>
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
                    ) : zoneDetail &&
                      zoneDetail.zone.id === zone.id &&
                      zoneDetail.replay_id === snap!.replay_id &&
                      zoneDetail.version === snap!.version ? (
                      <ZoneDrawer snap={snap!} detail={zoneDetail} fcView={fcView} explanation={explanation} />
                    ) : (
                      <div data-testid="zone-drawer-loading" data-zone={zone.id}>
                        <h2 id="drawer-h">
                          Zone {zone.id} · {zone.name}
                        </h2>
                        <p className="muted" role="status">
                          Loading zone details for state v{snap!.version}…
                        </p>
                      </div>
                    )}
                  </section>
                  </>
                ),
              },
              {
                id: 'act',
                label: 'Act',
                content: (
                  <>
                    {snap && !compareOpen && (
                      <button className="btn btn-block" onClick={openCompare} data-testid="compare-open">
                        Compare actions
                      </button>
                    )}
                    {snap && compareOpen && (
                      <ComparePanel snap={snap} role={role} samples={fcSamples} onClose={closeCompare} onChanged={retry} onResult={setLastCmp} />
                    )}
                    {!snap && <p className="muted">Actions can be compared once the simulation has started.</p>}
                  </>
                ),
              },
              {
                id: 'alerts',
                label: 'Alerts',
                content: (
                  <>
          {snap && (
            <AlertList
              snap={snap}
              view={fcView}
              onSelect={selectAlert}
              selectedZone={selectedZone}
              comparison={lastCmp}
              onCompare={(z) => {
                selectAlert(z);
                openCompare();
              }}
            />
          )}
                  </>
                ),
              },
            ]}
          />
        </aside>

        <div className="stage-dock">
      <RunBar
        onStartDemo={() => {
          setLeftTab('story');
          setDemoKick((k) => k + 1);
        }}
        snap={snap}
        playing={playing}
        speed={speed}
        speeds={SPEEDS}
        stepMinutes={STEP_MINUTES}
        onStart={start}
        onTogglePlay={() => setPlaying((p) => !p)}
        onStep={() => void advance(STEP_MINUTES)}
        onSpeed={(s) => setSpeed(s as (typeof SPEEDS)[number])}
        onReset={reset}
        playRef={playRef}
      />
          <ForecastDock
            snap={snap}
            view={fcView}
            strip={<ForecastStrip snap={snap} view={fcView} onRetry={fcRetry} />}
          />
        </div>
      </main>
    </div>
  );
}

function ZoneDrawer({
  snap,
  detail,
  fcView,
  explanation,
}: {
  snap: Snapshot;
  detail: ZoneDetail;
  fcView: ForecastView;
  explanation: ExplanationView | null;
}) {
  // Zone, roster, staff, queues and capacity come from the versioned zone response; `snap` is the
  // same version and supplies the shared resource totals and the pressure services.
  const zone = {
    ...detail.zone.counts,
    id: detail.zone.id,
    name: detail.zone.name,
    patient_count: detail.zone.patient_count,
  } as Record<string, number> & { id: number; name: string; patient_count: number };
  const patients = detail.roster;
  const sp = snap.resources.ed_spaces;
  const rs = snap.resources.resus_spaces;
  const summary = detail.summary;
  const limited = ZONE_FEEDS[detail.zone.id]
    .map((id) => snap.feeds[id])
    .filter((f): f is Feed => f !== undefined && f.status !== 'fresh');
  return (
    <div
      data-testid="zone-drawer"
      data-zone={detail.zone.id}
      data-version={detail.version}
      data-state={detail.pressure.state}
    >
      <h2 id="drawer-h">
        Zone {zone.id} · {zone.name}
      </h2>
      <p className="drawer-source muted" data-testid="drawer-source">
        State v{detail.version} · {formatClock(detail.sim_time_min)} · replay clock{' '}
        {formatClock(detail.freshness.state_updated_at_min)}
        {detail.freshness.oldest_essential_age_min != null &&
          `, oldest essential feed ${detail.freshness.oldest_essential_age_min} min old`}
      </p>
      {limited.length > 0 && (
        <div className="callout" data-state="building" data-testid="drawer-limitations">
          <p>
            <strong>Limited data for this zone</strong>
          </p>
          {limited.map((f) => (
            <p key={f.id} data-testid={`drawer-limit-${f.id}`}>
              {f.label}: last valid update {clockOrDash(f.last_update_min)}
              {f.age_min != null && ` (${f.age_min} min old)`}. {f.limitation}
            </p>
          ))}
        </div>
      )}
      <div className="callout" data-testid="drawer-summary" data-state={summary.state}>
        <p>
          <strong data-testid="drawer-headline">{summary.headline}</strong>
        </p>
        {summary.cause && <p data-testid="drawer-cause">{summary.cause}</p>}
        {summary.blocked_reason && (
          <p data-testid="drawer-blocked">
            <strong>Blocked:</strong> {summary.blocked_reason}
          </p>
        )}
        <p className="muted">
          {summary.note} Overall ED status: {summary.overall_status_label}.
        </p>
      </div>
      <dl className="kv" style={{ marginBottom: 'var(--s-4)' }}>
        <dt>Patients here</dt>
        <dd data-testid="drawer-count">{zone.patient_count}</dd>
        {zone.id === 2 && (
          <>
            <dt>Waiting for an ED space</dt>
            <dd>{fig(zone.awaiting_space)}</dd>
            <dt>Waiting for a clinician</dt>
            <dd>{fig(zone.awaiting_clinician)}</dd>
            <dt>With a clinician (assessment or result review)</dt>
            <dd>{fig(zone.active)}</dd>
            <dt>Results back, waiting for review</dt>
            <dd data-testid="drawer-review-wait">{fig(zone.awaiting_result_review)}</dd>
            <dt>Decision received, care not complete</dt>
            <dd data-testid="drawer-care-wait">{fig(zone.awaiting_care_completion)}</dd>
          </>
        )}
        {zone.id === 1 && (
          <>
            <dt>Waiting for triage</dt>
            <dd data-testid="drawer-triage-queue">{fig(zone.queue)}</dd>
            <dt>At the triage desk</dt>
            <dd>
              {ofTotal(snap.resources.triage_desk.busy, snap.resources.triage_desk.total)}
            </dd>
            <dt>Reserve triage team</dt>
            <dd>{snap.resources.triage_desk.reserve_team.active ? 'Active' : 'Declared, not active'}</dd>
          </>
        )}
        {zone.id === 3 && (
          <>
            <dt>Waiting for the lab</dt>
            <dd data-testid="drawer-lab-queue">{fig(zone.lab_queue)}</dd>
            <dt>Lab tests running</dt>
            <dd data-testid="drawer-lab-active">
              {ofTotal(zone.lab_active, snap.resources.diagnostics.lab.servers)}
            </dd>
            <dt>Waiting for imaging</dt>
            <dd data-testid="drawer-imaging-queue">{fig(zone.imaging_queue)}</dd>
            <dt>Imaging running</dt>
            <dd data-testid="drawer-imaging-active">
              {ofTotal(zone.imaging_active, snap.resources.diagnostics.imaging.servers)}
            </dd>
            <dt>Lab capacity</dt>
            <dd data-testid="drawer-lab-rate">
              {snap.resources.diagnostics.lab.capacity_tasks_per_hour} tasks/h ·{' '}
              {fig(snap.resources.diagnostics.lab.completed_last_30_min)} done in 30 min
            </dd>
            <dt>Imaging capacity</dt>
            <dd data-testid="drawer-imaging-rate">
              {snap.resources.diagnostics.imaging.capacity_tasks_per_hour} tasks/h ·{' '}
              {fig(snap.resources.diagnostics.imaging.completed_last_30_min)} done in 30 min
            </dd>
          </>
        )}
        {zone.id === 4 && (
          <>
            <dt>Home discharge: waiting</dt>
            <dd data-testid="drawer-discharge-queue">{fig(zone.awaiting_discharge)}</dd>
            <dt>Home discharge: processing</dt>
            <dd data-testid="drawer-discharge-active">
              {ofTotal(zone.discharge_active, snap.resources.disposition.discharge.servers)}
            </dd>
            <dt>Boarding: waiting for a suitable bed</dt>
            <dd data-testid="drawer-boarding">{fig(zone.awaiting_ward_bed)}</dd>
            <dt>Ward allocation: waiting</dt>
            <dd data-testid="drawer-allocation-queue">{fig(zone.awaiting_ward_allocation)}</dd>
            <dt>Ward allocation: in progress</dt>
            <dd data-testid="drawer-allocation-active">
              {ofTotal(zone.allocation_active, snap.resources.disposition.allocation.servers)}
            </dd>
            <dt>Transport: waiting</dt>
            <dd data-testid="drawer-transport-queue">{fig(zone.awaiting_transport)}</dd>
            <dt>Transport: moving a patient</dt>
            <dd data-testid="drawer-transport-active">
              {ofTotal(zone.in_transport, snap.resources.disposition.transport.servers)}
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
      <p style={{ marginBottom: 'var(--s-4)' }} data-testid="drawer-capacity" data-kind={detail.capacity.kind}>
        {zone.id === 1 && detail.capacity.text}
        {(zone.id === 2 || zone.id === 3) &&
          `ED spaces are one shared pool for zones 2 and 3: ${sp.occupied} of ${sp.total} occupied, ${fig(sp.available_staffed)} general spaces free. ${fig(rs.available)} of ${rs.total} resuscitation spaces (held for supplied critical bypass) free${rs.awaiting ? `, ${rs.awaiting} critical patient${rs.awaiting === 1 ? '' : 's'} waiting` : ''}.`}
        {zone.id === 4 &&
          `These patients still occupy their ED space until they physically leave (${sp.occupied} of ${sp.total} spaces occupied).`}
        {(zone.id === 2 || zone.id === 3) && (
          <>
            {' '}
            <span className="muted" data-testid="drawer-shared-note">
              {detail.capacity.held_by_patients_here} of the {detail.capacity.occupied} occupied spaces are held
              by patients in this zone. The same pool is shown for zone {detail.capacity.shared_with_zone}; the
              two are not added together.
            </span>
          </>
        )}
      </p>
      <ZoneForecast snap={snap} view={fcView} zone={zone.id} explanation={explanation} />
      <details className="drawer-section">
        <summary>Staff assigned here</summary>
      <section data-testid="assigned-staff" aria-labelledby="assigned-h" style={{ marginBottom: 'var(--s-4)' }}>
        <h3 id="assigned-h" className="sr-only">
          Assigned here
        </h3>
        {detail.staff.doctors.length > 0 && (
          <ul className="roster" data-testid="assigned-doctors">
            {detail.staff.doctors.map((d) => (
              <li key={d.id} data-testid={`assigned-doctor-${d.id}`} data-assigned={d.assigned}>
                <strong>{d.id}</strong>
                <span>
                  {d.name} · {d.assigned ? `with ${d.patient_id}` : 'on duty, free'}
                </span>
                <span className="tag">Doctor, on duty</span>
              </li>
            ))}
          </ul>
        )}
        {detail.staff.nurses.length > 0 && (
          <ul className="roster" data-testid="assigned-nurses">
            {detail.staff.nurses.map((n) => (
              <li key={n.id} data-testid={`assigned-nurse-${n.id}`}>
                <strong>{n.id}</strong>
                <span>
                  {n.name} · {n.patient_ids.map((p, i) => `${p} in ${n.space_ids[i]}`).join(', ')}
                </span>
                <span className="tag">Nurse, on duty</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" data-testid="assigned-note">
          {detail.staff.note}
        </p>
      </section>
      </details>
      {zone.id === 3 && (
        <p className="muted" data-testid="diag-note" style={{ marginBottom: 'var(--s-4)' }}>
          These patients keep their ED space while they wait for or have tests; no doctor is held
          for the wait. {snap.resources.diagnostics.note} Lab median{' '}
          {snap.resources.diagnostics.lab.median_turnaround_min} min, imaging median{' '}
          {snap.resources.diagnostics.imaging.median_turnaround_min} min (demo assumptions).
        </p>
      )}
      <details className="drawer-section">
        <summary>Local pressure: queues against thresholds</summary>
        <PressureSection snap={snap} zoneId={zone.id} />
      </details>
      {(zone.id === 2 || zone.id === 3) && (
        <details className="drawer-section">
          <summary>Shared staffing (zones 2 and 3)</summary>
          <StaffingSummary snap={snap} />
        </details>
      )}
      {patients.length > 0 && (
        <details className="drawer-section" open>
          <summary>Patients ({patients.length})</summary>
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
        </details>
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

