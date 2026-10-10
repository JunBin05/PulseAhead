# HANDOFF: PulseAhead build

Updated 2026-10-10 (tickets 01-08 done; the 03-06 review gate is closed and committed as `b4e7f5a review: fixes after ticket 03-06 gate`; tickets 07 and 08 are committed on top). Ticket 09 is IN PROGRESS and UNCOMMITTED (see "Ticket 09 WIP" below); HEAD is `24f24d7`. Branch `pulseahead-mvp`. Repo root is `C:\Users\Vaas\Documents\Prototype\PulseAhead\Real`. Read `CLAUDE.md` first; it holds the architecture invariants and working rules.

## Goal and rules

- **Goal:** build the approved spec (`PulseAhead-Tickets/docs/PULSEAHEAD_3D_MVP_SPEC.md`) as 22 tickets (`PulseAhead-Tickets/.scratch/pulseahead-3d/issues/NN-*.md`), in blocker order. The ticket index with blockers is `PulseAhead-Tickets/docs/PULSEAHEAD_3D_TICKET_PLAN.md`.
- **Plans:**
  - `C:\Users\Vaas\.claude\plans\serene-nibbling-wirth.md` (master plan)
  - `C:\Users\Vaas\.claude\plans\continue-the-pulseahead-build-glistening-seahorse.md` (last session)
- **How to work:** implement directly in the main session (no `/implement-spec`, few agents). Follow the spec and tickets only, with no extra features.
- **Review gate:** the `code-review` skill is the only review gate, after tickets 01 (done), 06 (done), 10, 11, 17, 19 and 21. The user allows subagents only for these gates.
- **Verification:** all verification goes through Playwright MCP. No pytest, Jest or Vitest files and no mocked engine. Tick a checkbox only when its Playwright MCP evidence passed. Record pass, fail or not-run per criterion in `evidence/NN-<slug>.md`.
- **Stop points:**
  - Ticket 21 needs an authorized hosting target; nothing gets bought or published.
  - Ticket 22's rehearsal and the organizer check stay with the user.

## Tickets

| Ticket | State | Evidence |
|---|---|---|
| 01 Start a real four-zone 3D ED replay | **done**: 8/8 pass, review gate passed, findings fixed | `evidence/01-working-3d-replay.md`, `evidence/01-regression-results.json`, `evidence/01-regression.playwright-mcp.js` |
| 02 Walk-ins, critical entries, inbound ambulances | **done**: 8/8 pass (no review gate due) | `evidence/02-triage-and-ambulance-feed.md`, `evidence/02-intake.playwright-mcp.js`, `evidence/shots/02-fixture-t20.png` |
| 03 Assessment and shared staffing | **done**: 7/7 pass (no review gate due) | `evidence/03-assessment-and-staffing.md`, `evidence/03-staffing.playwright-mcp.js`, `evidence/shots/03-staffing-t40.png` |
| 04 Diagnostic queues and return flow | **done**: 7/7 pass (no review gate due) | `evidence/04-diagnostics-and-return-flow.md`, `evidence/04-diagnostics.playwright-mcp.js`, `evidence/shots/04-diagnostics-t90.png` |
| 05 Cleared discharge and constrained ward exits | **done**: 7/7 pass (no review gate due) | `evidence/05-disposition-and-exits.md`, `evidence/05-disposition.playwright-mcp.js`, `evidence/shots/05-boarding-t70.png` |
| 06 Local overload vs ED congestion | **done**: 8/8 pass; review gate for 03-06 closed, fixes re-verified (see "Review gate state") | `evidence/06-zone-pressure-and-ed-congestion.md`, `evidence/06-pressure.playwright-mcp.js`, `evidence/06-ui.playwright-mcp.js`, `evidence/shots/06-*.png` |
| 07 Zone drawers and camera | **done**: 7/7 pass (no review gate due) | `evidence/07-zone-drawers-and-camera.md`, `evidence/07-zones.playwright-mcp.js`, `evidence/07-ease.playwright-mcp.js`, `evidence/shots/07-*.png` |
| 08 Fresh, noisy, missing and invalid inputs | **done**: 7/7 pass (no review gate due) | `evidence/08-received-data-and-robustness.md`, `evidence/08-feeds.playwright-mcp.js` (PART `A` and `B`), `evidence/shots/08-*.png` |
| 09 Scenario families and saved runs | **in progress, uncommitted**: code written and built, nothing verified through Playwright MCP yet, no evidence file, no ticks | n/a |
| 10–22 | not started | n/a |

Tickets 01 to 08 are done. Ticket 06 is committed as `ticket 06: Distinguish local overload from ED congestion` on top of the WIP commit `c76a295`. The code-review gate for tickets 03 to 06 has run and is **closed**: its fixes are committed and re-verified (see "Review gate state"). Tickets 01 to 06 therefore also stand on the gate build.

## Verified through Playwright MCP (all pass, production build on :8000)

**Ticket 01** (regression snippet; last run 2026-10-10T12:21Z, after the ticket 02 changes):
- First start and header labels.
- Counts agree across UI, rendered meshes, zone buttons, `/state`, `/events` and `/export`.
- One patient's journey; space held until departure.
- Pause, step, reset.
- Playback cadence: 10× → 9.94 and 2× → 1.99 sim min/s.
- Stale-response 409 on reset.
- Error banner with the last valid time; pending banner after 500 ms; live staleness age.
- Canvas/DOM zone toggle parity.
- Keyboard-only operation.
- 375/768/1024/1440 widths: no horizontal scroll, labels without overlap, targets ≥44 px.
- Same-origin routes, including the JSON 404 for unknown `/api`.
- Determinism across chunk sizes.

**Ticket 02** (fixture `fixture-intake` through the UI with `?fixture=fixture-intake`; seed 7 normal for the random stream):
- Triage desk queue and urgency order.
- Finite critical bypass: 3 critical patients, 2 resuscitation spaces.
- Ambulance announce, update, cancel, overdue ("Delayed") and arrive, under one identity.
- Sidebar matches the API at each of 12 steps.
- En-route patients stay out of the ED.
- No hidden arrival times in observation or export.
- Known vs background demand.

**Ticket 03** (fixture `fixture-staffing` through the UI, plus 12 h seed 7 through the API):
- Space and doctor grants in urgency order, FIFO within a group, no interruption (0 violations on both runs).
- Nurse coverage: no grant to a space whose nurse was off duty; critical patients limited to 2 resus spaces; space kept until departure.
- Premature decisions stay ineligible: `effective_disposition_min` = max(decision, care complete) for every patient.
- Drawer, sidebar and zone buttons equal `/state` at the same version over 28 steps.

**Ticket 04** (fixture `fixture-diagnostics` through the UI, plus 12 h seed 7 through the API):
- Lab 2 and imaging 1 units never exceeded; lab/imaging queues in urgency order; every test's turnaround equals the supplied value.
- Direct route, lab then imaging, result review in zone 2, space and no-doctor retention through tests.
- Premature decision (W09) stays ineligible until results and review; effective disposition = max of all prerequisites.
- Lab/imaging task-per-hour capacity and 30-minute started/completed counts recomputed from events.
- 56 UI steps: sidebar, zone 3 drawer, zone buttons and mesh counts equal `/state` at the same version.

**Ticket 05** (fixture `fixture-boarding` through the UI, plus 12 h seed 7 through the API):
- Discharge 2, ward allocation 1, transport 1 units never exceeded; supplied work durations equal the observed intervals.
- Ward/ICU beds: right type, reserved during transfer, never before their release time, urgency order, no bed for the ICU patient while only ward beds are free (kept visible as unfinished).
- ED space held through all of zone 4 and released only at departure; exit pads and counts equal `/state`.
- Waiting reasons: discharge busy, allocation busy, transport busy, unavailable bed, unsuitable bed.
- Three time parts and per-urgency summaries recomputed from timestamps; unfinished stays counted apart.

**Ticket 06** (fixtures through the API at 1 min steps, UI at 5 min steps, plus 12 h seed 7; independent JS re-implementation of both rules from `/events`):
- Per-minute agreement of overall state, label, recovering flag, zone state and every service's state/queue/λ/μ/throughput/category with the reconstruction: 0 mismatches in 7 runs.
- Exact boundaries: overall 31/51/85 (building at +19, confirmed at +20, recovering 75-84), local space 31/41/103, triage surge 3/13/119.
- Short burst never confirms; diagnostic-only and triage-only alerts leave the overall status Stable; missing imaging feed gives Cannot assess and withholds recovery (clears 154, not 99).
- UI chips, ALERT bubbles, Local alert chip, area-label counts and drawer cards equal `/state` at every step; layered dots stay in their area; 375/768/1024/1440 widths pass.

**Ticket 08** (fixtures `fixture-feed-staffing-stop`, `fixture-feed-faults`, `fixture-feed-optional-stop`, `fixture-diagnostics-gap`; API at 1 min, UI at 5 min steps):
- Healthy replay and ambulance heartbeats never refresh a stopped staffing feed; exact boundary (age 10 fresh, 11 stale), Cannot assess, last valid values with age, recovery with the resume time.
- Duplicates, out-of-order updates, 9 quarantined inputs with reasons, valid outliers kept (130 min test, 10-arrival burst, 87 min ETA move), delayed feed shows its as-of time.
- Optional feeds stale limit only their part; `missing_inputs` figures are `null` and read "Not current"; hidden fault schedule never in any response.
- Regressions 01 to 05, 06 (pressure engine + seed7, ui, zone4, label geometry) and 07 all pass.

**Not verified yet (not-run), owned by later tickets:**
- 200-dot / 30 fps performance (ticket 20)
- reduced-motion and 2D fallback (ticket 20; the camera jumps under reduced motion, checked in ticket 07)
- forecast-based zone warnings (ticket 10)
- decisions and active actions surviving Back to overview (ticket 11; none exist yet)

## Known bugs, deferred findings, open questions

- **Deferred review findings** (full list in `evidence/01-working-3d-replay.md`, "Deferred to the ticket that owns them"):
  - **Ticket 06:** resolved (dots layer instead of overflowing; "Congested, recovering" label; boundaries tested).
  - **Ticket 05:** resolved (exits show destination and counts; bed pool is finite).
  - **Ticket 08:** resolved (per-source freshness in `feeds.*`; top-level `freshness.age_min` is the replay heartbeat and stays 0 by design, with `oldest_essential_age_min` beside it).
  - The ticket 02 ambulance placeholder item is resolved.
- **Kept by judgement:** `@react-three/drei` is pinned but unused; `ZONE_NAMES` duplicates the profile.
- **Open questions** (`OPEN_QUESTIONS.md`) and their working decisions:
  - **Q7 (ticket 07):** an "alert" for the camera is an Overloaded zone only (building, Cannot assess and Normal select without zoom); assigned doctors are listed in zone 2 only, nurses only when they cover a space held by a patient in the zone; Back keeps the selection.
  - **Q1:** 2 of the 24 spaces (`R1`, `R2`) are resuscitation spaces held for critical bypass. General spaces are `S01`–`S22`.
  - **Q2:** "available staffed spaces" counts free general spaces whose covering nurse is on duty; "awaiting a space" counts both queues.
  - **Both confirmed by the user on 2026-10-10 ("keep as is").**
  - **Q6 (ticket 06):** "necessary capacity unavailable" means no suitable free capacity; transport threshold 3; λ/μ windows and means; an open episode stays open while inputs are missing.
  - **Q5 (ticket 05):** the three exclusive time parts (initial wait, care and tests, awaiting departure), boarding as the awaiting-departure part of Ward/ICU transfers, and the Ward/ICU bed pool numbers.
  - **Q4 (ticket 04):** one diagnostic round, tests in a fixed order, premature decision as a supplied early decision.
  - **Q3 (ticket 03):** fictional staffing units: doctors `D1`-`D4` (reserve `D5` inactive), nurses `N1`-`N6` each covering 4 spaces, a supplied stabilization task for urgent/critical patients.
- **Ticket 03 limits** (details in `evidence/03-assessment-and-staffing.md`):
  - Only nurse coverage changes during a run, via the scenario's supplied `staffing` roster (fixtures only). Doctors are always on duty; `D5` is inactive until ticket 16.
  - The stabilization task (5-30 min) often outlasts the assessment, so 8 of 10 task patients in seed 7 wait for care after the decision. Disclosed assumption.
  - Zone 2 scene rows are dense when all four are populated; area labels can sit under dots. Counts are exact in the buttons and drawer. Ticket 06 owns row overflow, ticket 20 the full visual pass.
- **Ticket 04 limits** (details in `evidence/04-diagnostics-and-return-flow.md`):
  - Seed 7 rarely stresses lab or imaging; diagnostic bottlenecks come from fixtures or later scenarios (ticket 09).
  - Zone 2 first assessment and result review share the "Awaiting clinician" and "With clinician" rows.
  - Zone 3 dots can sit under area labels when several rows are populated (same limit as zone 2).
- **Ticket 05 limits** (details in `evidence/05-disposition-and-exits.md`):
  - Beds are free, reserved or occupied only (no cleaning, no return); with seed 7 the six ward beds run out late in the shift.
  - All four disposition resources are owned by "Ward supervisor / bed manager".
  - The 2-slot discharge limit lengthens waits slightly for earlier fixtures (ticket 02 A05-2 now departs 57.839, was 54.814; ticket 04 W13 97.603, was 97.443).
  - Zone 4 dots can sit under area labels (same limit as zones 2 and 3).
- **Unexplained, observed once:** the zone selection changed with no scripted click, and one backend `reset` arrived that the session did not send. Most likely manual clicks in the visible Playwright Chrome window. It was not reproduced in three reruns.
- **Console warning:** `THREE.Clock` deprecated. It comes from @react-three/fiber 9.8.1 internals, not our code.
- **Arrival rate:** seed 7 normal gave 4.9 arrivals/h against about 6.4/h expected from the assumptions. This is one sample, not a calibration.

## Code map

- **Backend** (`backend/pulseahead/`):
  - `profile.py`: fictional ED with 24 spaces (2 resus), 4 named doctors plus a reserve physician, 6 named nurses with coverage blocks, 1 triage desk, a declared reserve triage team, lab 2 and imaging 1, discharge 2, ward allocation 1, transport 1, a Ward/ICU bed pool with release schedule, owners and assumptions.
  - `scenario.py`: supplied inputs (acuity, urgency group, critical bypass, stabilization task) and ambulance run scripts. The hidden arrival time and task length stay here.
  - `fixtures.py`: test-only scripted scenarios (`fixture-intake`, `fixture-staffing`, `fixture-diagnostics`, `fixture-boarding`, `fixture-congestion-boundary`, `fixture-diagnostics-gap`, `fixture-queue-surge`; a fixture may carry a supplied `staffing` roster, `ward_beds` schedule or `fixed_minutes`).
  - `engine.py`: the SimPy flow. Triage desk → staffed general space (`SpacePool`), or critical bypass → staffed resus space; then a named doctor, first assessment, supplied tests (lab `L1`-`L2`, imaging `I1`, zone 3), result review by a doctor (zone 2), decision received, required care complete (`awaiting_care_completion` if premature), then home discharge processing (zone 4) or a Ward/ICU transfer (`WardBeds` bed reservation, allocation work, transport), and physical departure through the Home or Ward/ICU exit. Also the ambulance lifecycle and the congestion monitor.
  - `pressure.py`: `SERVICES` (nine services with zone, category, threshold) and `LocalMonitor` (normal, building, overloaded; 10 min to confirm, 5 min to clear, missing inputs).
  - `feeds.py`: the received-data layer (`IngestGate`): six sources with heartbeats and freshness, deduplication, validation and quarantine of external messages, outlier log, sequence gaps. Fixtures script `feed_faults` and `injections`.
  - `replay.py`: sessions, versions and the snapshot read model, including `pressure` (services with rates, zone states, alerts) and the `recovering` / `local_alert` fields of `overall_status`.
  - `api.py`: endpoints (`/api/health`, `/api/v1/profile`, `/api/v1/fixtures`, `/api/v1/replays` create/state/advance with `expected_version` (409 on mismatch)/reset/events/ingest/export). It also serves `frontend/dist`.
- **Frontend** (`frontend/src/`):
  - `App.tsx`: controls, ambulance panel, resources, zone drawer and the shared staffing summary (zones 2 and 3). The test-only `?fixture=` parameter is read here.
  - `Scene.tsx`: R3F isometric scene, DOM labels, compact labels below a 560 px canvas, and the `data-patient-meshes` counter.
  - `layout.ts`: dot areas (phases that share a waiting line or a doctor share one area; wait lines have 8 columns, two rows per layer, extra patients stack upward; zone 4 has seven single-row areas, queue and active apart, pitch `ZONE4_ROW_PITCH` 1.18) and platform size (6 wide, 8 deep).
  - `status.tsx`: `ZONE_LOOK` (icon, tone and word per zone state, including `idle` = "Not started"), shared by the chips and the scene labels.
  - Ticket 07: `Scene.tsx` `useCameraView` / `CameraView` (camera focus, zoom 1.9, 450 ms ease, reduced motion jumps), `App.tsx` `ZoneDrawer` reading `ZoneDetail`, `replay.py` `zone_detail`, `api.py` `GET /api/v1/replays/{id}/zones/{zone}`.
  - `api.ts`, `types.ts`, `tokens.css`, `app.css`, `icons.tsx`.
- **Design:** `DESIGN.md` ("The Charge Desk") and `.impeccable/design.json`.

## Ticket 06 summary

- **Backend:** `pressure.py` plus the hooks in `engine.py` (`local_readings`, `work_entries`/`work_done`, `missing_inputs` in a fixture) and `replay.py` (`snapshot()["pressure"]`, `export.local_episodes`). The first queue entry (arrival) is logged in `_spawn`; this was a defect found by code reading and fixed.
- **Frontend:** zone buttons carry a status chip; the platform tint and ALERT bubble follow `pressure.zones`; the overall badge adds "Local alert"; the zone drawer has a "Zone pressure" section (service cards, alerts, the not-overall-congestion note). `canvas.dataset.meshPositions` is a test hook.
- **Known limits:** area labels can sit under dots (ticket 20); only the in-progress recovery clock is shown for a local episode; the "Open episode" row for a service with missing inputs is not asserted.
- **Fixtures added:** `fixture-congestion-boundary`, `fixture-diagnostics-gap`, `fixture-queue-surge`.

## Servers

Currently running, started by this session (backend restarted after the ticket 06 build); stop them by killing the python and node processes:
- **Backend:** uvicorn on 127.0.0.1:8000 (log `%TEMP%\pulse-backend.log`). It serves the built `frontend/dist` from the same origin. Sessions live in memory, so a restart loses them.
- **Frontend dev:** Vite on 127.0.0.1:5173 (proxies `/api` to 8000). It was started by an earlier session and may still be running.

Start commands, from `Real/`:
- Backend: `backend/.venv/Scripts/python.exe -m uvicorn pulseahead.api:app --app-dir backend --port 8000`
- Dev frontend: `cd frontend && npx vite --host 127.0.0.1`
- Type-check: `cd frontend && npx tsc --noEmit`. Build: `cd frontend && npm run build`. Restart the backend after a build so it picks up `dist`.

## Environment gotchas

- **Python:** it is not on PATH. Use `backend/.venv/Scripts/python.exe`.
- **Restarting the backend:** restart it after backend edits. **Don't use `--reload` on Windows**: its spawned worker survived a restart, kept the port and served old code. To stop the backend cleanly, kill every `python.exe` whose command line contains `uvicorn pulseahead.api:app`, then confirm with `netstat -ano | findstr :8000` that nothing listens.
- **Playwright MCP:**
  - `/advance` accepts at most 60 min per call.
  - Evidence snippets with a `PART` constant (`06-pressure`) are run once per part: copy with the leading `//` lines stripped and set `PART`.
  - Its Chrome window is visible on the desktop, and manual clicks there affect checks.
  - A previous session's Chrome can lock the profile (error "Browser is already in use"). Stop only that Chrome process tree; its parent is an older `@playwright/mcp` node process.
  - Relative screenshot paths resolve from `C:\Users\Vaas\Documents\Prototype`, so save to `PulseAhead/Real/evidence/shots/<name>.png`.
  - `browser_run_code_unsafe` with `filename` only reads files under `C:\Users\Vaas\Documents\Prototype`. Copy `evidence/*.playwright-mcp.js` to `..\..\.playwright-mcp\` and strip the leading comment lines, or paste the code inline.
- **Git:** no global git identity is set. Commit with `git -c user.name=Vaas -c user.email=airscan.health@gmail.com commit ...`.
- **Stray screenshots:** old screenshots sit outside the repo (`Prototype/evidence/shots/`, `Prototype/Real/evidence/shots/`); they were left untouched.

## Ticket 07 summary

- **Backend:** `ReplaySession.zone_detail(zone_id)` in `replay.py` and `GET /api/v1/replays/{id}/zones/{zone}` in `api.py` (404 for zone outside 1-4 or an unknown replay, 422 for a non-integer). It is computed from `snapshot()`, so it carries the same `version`, `sim_time_min`, `run_number` and `replay_id`. Fields: `zone`, `roster` (identical to `/state` patients), `queues`, `units`, `capacity` (`none` for zone 1, `shared_ed_spaces` for zones 2 and 3, `spaces_retained` plus ward/ICU beds for zone 4), `staff`, `freshness`, `pressure`, `summary` (headline, cause, blocked_reason).
- **Frontend:** `api.zone`, `ZoneDetail` types. `App.tsx` fetches the open zone with each snapshot and applies both together; `ZoneDrawer` renders from it and shows a loading state when the response is missing or its version differs. Selecting an Overloaded zone sets `focusZone`; `.scene-canvas` carries `data-camera` (`overview` | `zone-N`) and `data-camera-zoom`; a "Focused on zone N" callout with `back-to-overview` sits top-left of the map. While a zone is focused its ALERT bubble sits above its label (`data-bubble-side="above"`, as zone 1's does); left of the label it fell outside the map at 768 px and right of it hit zone 4's area labels.
- **Test hooks:** `data-patient-meshes` is written every 15th frame, so a snippet must wait for it to equal `patients.length` before comparing (`03-staffing` and `06-ui` now do; a read 100 ms after a step can be one dot high).
- **Evidence:** all 7 criteria pass (`evidence/07-zone-drawers-and-camera.md`). Regression `01` to `05` and `06-*` pass on the final build.
- **Known limits:** zone details are received state only (no forecast); the drawer does not retry a failed zone request until the next state version; in the compact scene the focused zone is zoomed but no bubble is drawn.

## Review gate state (tickets 03-06: closed)

The `code-review` skill ran two reviewers (Standards, Spec) over `e69ceb6...3ecc56c`. All in-scope findings were fixed and re-verified through Playwright MCP on the gate build; the details and numbers are in `evidence/06-zone-pressure-and-ed-congestion.md`, section "Review-gate fixes".

- **Backend:** assessment λ/μ units (result review has its own log key; μ from doctor minutes per patient), one μ basis for disposition, one throughput window, bed release schedule hidden from `/api/v1/profile` (kept in `export.profile`), `capacity_unavailable` from the unit capacity, per-alert `mixed` / `also_active`.
- **Frontend:** status icon and word in every zone label (compact scene: icon beside the number), "Not started" instead of Normal before any data, zone 4 split into queue and active areas, container-query zone bar (2 x 2, 4 across from 640 px of map width), ALERT bubble as a child of its zone label, mesh-position test hook only with `?fixture=`, types for the renamed key and the mixed fields, `DESIGN.md` sentence on the zone tint.
- **Verified (Playwright MCP, production build on :8000):** `06-pressure` engine (6 fixtures) and seed7 (720 min): 0 mismatches; `06-ui`: 0 problems; `06-zone4-layout` (40 steps): 0 problems; `06-label-geometry` (30 cases, 6 viewports, alerts in zones 1-4): 0 overlaps, 0 clipped; regression `01` to `05`: 0 problems.
- **A layout lesson worth keeping:** the first version of the gate fix passed every functional check and failed regression 01's overlap and clip check (6 to 7 overlaps, 1 clipped label). Adding a word to a label widens it, and seven zone 4 rows leave about 10.5 px between labels. Run `01-regression` and `06-label-geometry` after any change to labels, areas or platform depth.

### Review findings deliberately deferred (not fixed in this gate)

- **Missing-feed masking:** resolved in ticket 08 (services declared missing report `null` figures and the sidebar/drawer say "Not current").
- **Overall monitor ignores missing space-feed inputs:** resolved in ticket 08 (`_overall_inputs` degrades).
- **Total ED time and its parts shown separately in the UI** (story 23): export only for now. Tickets 11 and 17 (comparison panel).
- **Normal shift ends permanently red in zone 4 (ward beds):** a consequence of the disclosed Q5 bed assumption, an honest model state (also written into `OPEN_QUESTIONS.md` Q6). Revisit with ticket 09 scenarios.
- **Smells left as judgement calls:** repeated inline styles in `App.tsx`, `Scene` pass-through props, positional `SuppliedInputs(...)` in fixtures, a duplicated local helper `r()` in `engine.py`, mysterious short names in `replay.py`.
- **Compact scene (map under about 660 px):** area labels and ALERT bubble are not drawn; counts and status words are in the zone buttons and drawer. The 1280 px viewport is compact because the drawer column narrows the map. Ticket 20 owns the full visual and layout pass.

## Ticket 08 summary

- **Backend:** `feeds.py` `IngestGate` sits between the engine and every read model. `replay.py` `snapshot()` is received state: `_observe` rebuilds patients, zones and counts from the last received event of each patient (`_received_patients`) whenever a source is behind, overlays frozen resource sections from per-minute samples, and `_mask_missing` nulls figures for a service whose inputs a fixture declares missing. New fields: `feeds`, `data_quality`, `limited_services`, `overall_status.assessable/reasons/last_valid_label`, `freshness.oldest_essential_age_min`. `GET /api/v1/replays/{id}/ingest`, and `/events` and `/export` serve received events (`export.ingest` carries counts and the log).
- **Engine:** `CongestionMonitor.degrade()` when spaces or staffing are stale or the space service is declared missing; `missing_services()`; per-minute reading history so a stopped feed's monitors read as of its newest data.
- **Frontend:** `FeedsPanel`, `DataQualityPanel` (sidebar), Cannot-assess badge, stale-resources note, drawer limitation notes; `fig()`/`ofTotal()` show "Not current" for `null` figures.
- **Fixtures added:** `fixture-feed-staffing-stop`, `fixture-feed-faults`, `fixture-feed-optional-stop`.
- **Evidence:** 7/7 criteria pass (`evidence/08-received-data-and-robustness.md`). Open question Q8 records the policy.
- **Known limits:** external messages never move a patient (by design); a resumed feed's heartbeat shows hidden changes while the lost events stay gaps; observed-count noise is not modelled (ticket 18); `_sample` keeps 400 minutes per faulted session; `07-ease` was not re-run.
- **Test-snippet lesson:** a Playwright snippet's source is echoed back in its result, so long snippets cost output tokens on every run; run only what the change touches plus 01.

## Ticket 09 WIP (uncommitted, written 2026-10-10, UNVERIFIED except where stated)

Ticket: `PulseAhead-Tickets/.scratch/pulseahead-3d/issues/09-synthetic-scenarios-and-save-load.md` (7 criteria, all unticked). `git status` shows modified `.gitignore`, `backend/pulseahead/{api,engine,fixtures,profile,replay}.py`, `frontend/src/{App.tsx,api.ts,app.css,types.ts}` and new `backend/pulseahead/saved.py`. `tsc` and `npm run build` pass; the backend on :8000 was restarted with the latest backend code (restart it anyway if unsure).

**What is built**
- **`profile.py`:** `SCENARIOS` holds the seven families (`normal`, `busy-recovers`, `arrival-surge`, `diagnostic-delay`, `boarding-blockage`, `mixed-cascade`, `no-effective-action`) as plain data: `surges` (arrival-rate segments for walk-ins and ambulances), `test_boosts`, `turnaround_scales`, `disposition_boost`, `ward_beds`, `staffing`. Also `WARMUP_MIN=120`, `SCORED_MIN=480`, `ENGINE_VERSION`, `CATALOG_VERSION`, per-family `seed_partitions` (development [7], tuning 1000+10i+1/2, test 2000+10i+1..4), `seed_partition()`, `scenario_catalog()` (qualitative; no time windows), `SCENARIO_PARAM_KEYS`. Demo roles: `arrival-surge` = recovering short surge, `diagnostic-delay` = diagnostic-backlog demo, `boarding-blockage` = ward blockage, `no-effective-action` = honest no-help case.
- **`engine.py`:** `_segment_mult`, `_rate_ceiling`, `_adjust` (extra or slower tests and heavier admissions, keyed by seed and identity), thinned ambulance stream when a scenario has `surges` or `rate_ceiling`. The default path is bit-identical: `normal` seed 7 still gives 705 events and 59 patients over 720 min (checked after the change).
- **`fixtures.py`:** `fixture-hidden-future-a` and `-b` (same seed, same `rate_ceiling`; only B has a surge and imaging backlog from T+75), to show observation responses cannot depend on the future.
- **`replay.py`:** `run_record()` (profile snapshot, scenario parameters, warm-up/scored, seed partition, versions; also in `/export` as `run_record`), `save(ui, settings)`, `ReplayStore.load(record)` (rebuilds from the seed to the saved time and refuses with `SavedRunMismatch` unless the received-event digest matches), `digest_events`, snapshot field `saved_run` (null unless loaded; cleared on reset).
- **`saved.py`:** JSON files in `backend/saved_runs/` (git-ignored), so they survive a backend restart.
- **`api.py`:** `GET /api/v1/scenarios`, `POST /api/v1/replays/{id}/save` (body `{ui:{selected_zone,camera,view_mode}, settings:{speed,step_min}}`), `GET /api/v1/saved`, `GET /api/v1/saved/{id}`, `POST /api/v1/saved/{id}/load` (409 on mismatch). `/api/v1/profile` now lists only id, name, family and description per scenario.
- **Frontend:** `DemoPanel` in the sidebar (testids `scenario-select`, `scenario-desc`, `scenario-pending`, `loaded-run`, `run-record`, `run-warmup`, `run-seed`, `run-versions`, `save-run`, `save-note`, `saved-list`, `saved-<id>`, `saved-load-<id>`). Start uses the selected scenario, Reset applies it; `save` and `load` restore selected zone, camera and speed. The selector is disabled when `?fixture=` is set.

**Probe results so far (exploratory, not evidence)**
- All seven families run for 600 min on every seed in their partitions. `diagnostic-delay`: imaging overload by T+65..132 on all 7 seeds. `boarding-blockage`: confirmed `ward_beds` episode T+95..213 on all 7. `mixed-cascade`: imaging and ward beds (mixed = true) on all 7. `arrival-surge`: a triage episode that clears on all 7. `busy-recovers`: pressure that clears (seed 7 is the mildest, arrival ratio 1.26 against 2.2 to 3.5 on others). `no-effective-action` (7.0x walk-ins and 3.5x ambulances for T+0..45, then 0.5x): a triage episode that clears (latest clear T+194) on all 7 seeds.
- **Known:** plain `normal` is not always quiet over 600 min (imaging or ward beds overload on 4 of 7 seeds); this comes from earlier tickets' assumptions and was not changed. The UI uses the default seed 20261010, which is in no partition ("custom").

**Still to do for ticket 09**
1. Write `evidence/09-synthetic-scenarios-and-save-load.md` and `evidence/09-scenarios.playwright-mcp.js` (PART A API, PART B UI and save/load). Planned checks:
   - Catalog: 7 ids, warm-up 120 and scored 480, development [7], 2 tuning and 4 test seeds per family, partitions disjoint, versions present, no time windows (`surges`, `start`, `free_at_min`) in the catalog.
   - Per family on a test seed: received inbound announcements, critical-bypass arrivals, diagnostic loops (review after tests), and the family's bottleneck recomputed from `/events` (arrival-rate ratio inside vs outside the surge window; zone 3 queue at the overload onset; ward-bed waiters with no suitable bed; mixed categories; early triage episode cleared).
   - Hidden-field scan of `/state`, `/zones/1..4`, `/events`, `/ingest`, `/scenarios`, `/profile` (forbidden: `surges`, `test_boosts`, `turnaround_scales`, `disposition_boost`, `free_at_min`, `rate_ceiling`, `feed_faults`, `injections`, `missing_inputs`; `disposition` must be null until `decision_received`).
   - Forecast-isolation precursor: fixtures hidden-future A and B give identical state, zones, events and ingest (ignoring replay id and scenario name) at T+60 and T+70, and differ at T+120.
   - `export.run_record`: profile resources, ward bed schedule, assumptions, scenario parameters, warm-up/scored, seed partition, versions; equal to `/api/v1/profile` assumptions and `/scenarios` versions.
   - Save/load through the UI: pick `diagnostic-delay`, Start, step to T+90, open zone 3, Save; reload the page; Load; check time, version, dot count, `saved_run` label, zone and camera restored, saved events equal the rebuilt replay's `/events`; step on and compare with a fresh replay advanced the same amount; loading drops a slow in-flight advance; a completed (T+600) run is labelled "Completed synthetic run" and carries `results.time_summary`; a tampered saved file (copy a record, change `event_digest`) returns 409 and nothing is approximated; saved runs survive a backend restart.
2. Add open question **Q9** to `OPEN_QUESTIONS.md`: family definitions as parameter sets; seed partitions (development, tuning, test numbering); warm-up and scored are recorded only (a run still starts empty at T+0); no-effective-action is a surge that passes before an action could land (its "no action shown to help" is verified by tickets 17 and 19, not here); the catalog hides time windows while the saved record carries them; saved runs persist as files and are verified by event digest.
3. Run regression: `01` always; `02` to `05`, `06-pressure` (engine and seed7), `06-ui`, `06-zone4-layout`, `06-label-geometry`, `07-zones` because response shapes (`saved_run`, `run_record`) and the sidebar changed. Stage snippets by stripping the leading `//` lines with a node script (UTF-8, no BOM) into `Prototype/.playwright-mcp/`.
4. Tick the ticket checkboxes only for criteria whose evidence passed; set the ticket status; update this file; commit `ticket 09: Generate varied shifts and reproduce saved replays` with the attribution trailer from the session's system reminder.

## Exact next steps

1. Finish ticket 09 from "Ticket 09 WIP" above (the code exists; verification, Q9, evidence, ticks and the commit remain). Run `git diff --stat` first and re-check the claims there before trusting them.
2. Continue in blocker order: 09 -> 10 (review gate) -> 11 (review gate) -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 (review gate) -> 18 -> 19 (review gate) -> 20.
3. **Stop before ticket 21** (hosting): ask the user for an authorized target. Ticket 22's rehearsal and the organizer check stay with the user.
4. At each ticket, re-run `evidence/01-regression.playwright-mcp.js` and, if the flow or layout changed, the `02-intake`, `03-staffing`, `04-diagnostics`, `05-disposition` and `06-*` snippets, plus `07-zones`. Playwright MCP runs snippets by filename from `Prototype/.playwright-mcp/`: stage them with the leading `//` lines removed, as UTF-8 without a BOM (PowerShell `Get-Content`/`Set-Content` re-encodes the middle dot and adds a BOM; use `node`). For `06-pressure`, also set `PART`.

## Tool quirks seen this session

- **Bash heredocs failed again** when the body held quotes and template strings ("unexpected EOF"): write patch scripts with the Write tool into the scratchpad and run them with `node`. Source files have CRLF line endings (`Scene.tsx`, `layout.ts`, `app.css`, the evidence snippets): make patch scripts EOL-tolerant (replace `\r\n` with `\n`, patch, write back) or `Edit` will not match.
- **A stale Playwright Chrome** held the profile again ("Browser is already in use"); stopping only the `chrome.exe` processes whose command line contains `mcp-chrome-ac24c5d` fixed it.
- **Snippet staging:** copy `evidence/*.playwright-mcp.js` to `Prototype/.playwright-mcp/` with the leading `//` lines removed; `browser_run_code_unsafe` echoes the whole snippet back, so long snippets cost output tokens on every run.

- **Bash heredocs with Python containing triple quotes failed** ("unexpected EOF"): write the script with the Write tool to the scratchpad and run it with `backend/.venv/Scripts/python.exe <script> <repo root>`.
- **Restart the backend** after Python edits: kill every `python.exe` whose command line contains `uvicorn pulseahead.api:app`, then start `backend/.venv/Scripts/python.exe -m uvicorn pulseahead.api:app --app-dir backend --port 8000` from `Real/` (hidden window, logs to `%TEMP%\pulse-backend.log`). Rebuild the frontend first (`cd frontend && npm run build`) after any `src` change.
- **A stale Playwright Chrome** can lock the profile ("Browser is already in use"): stop only the Chrome tree whose command line has `mcp-chrome-ac24c5d`.
- **`/advance` takes at most 60 min per call.**
- **Attribution:** commit trailers use the line given in the session's system reminder; the author identity is `Vaas <airscan.health@gmail.com>` via `git -c user.name=Vaas -c user.email=airscan.health@gmail.com commit`.
