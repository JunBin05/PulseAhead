# HANDOFF: PulseAhead build

Updated 2026-10-11. Tickets 01-09 are done and committed. **Ticket 10 is committed as WIP (`48f3619`) but NOT closed** (see "Ticket 10 status at commit"). Branch `pulseahead-mvp`, repo root `C:UsersVaasDocumentsPrototypePulseAheadReal`. **The push to GitHub is blocked (403, see "Start here in a new session").** Read `CLAUDE.md` first; it holds the architecture invariants and working rules.

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
| 09 Generate varied shifts and reproduce saved replays | **done**: 7/7 pass (no review gate due); two caveats owned by later tickets (no-effective-action ranking, empty choices/forecast settings) | `evidence/09-synthetic-scenarios-and-save-load.md`, `evidence/09-scenarios.playwright-mcp.js` (PART `A`, `B`), `evidence/09-save-load-ui.playwright-mcp.js`, `evidence/09-saved-persistence.playwright-mcp.js` (PART `A`, `B`), `evidence/09-critical-bypass.playwright-mcp.js`, `evidence/shots/09-diagnostic-zone3-overload.png` |
| 10 Predict bottlenecks and explain the time remaining | **WIP committed, not closed**: code and Playwright evidence snippets exist and passed (see "Ticket 10 status at commit"); `evidence/10-forecast-and-alert-panel.md` not written, no ticket boxes ticked, `07-zones` regression not run, review gate not run | `evidence/10-*.playwright-mcp.js`, `evidence/shots/10-zone3-forecast.png` |
| 11–22 | not started | n/a |

Tickets 01 to 09 are done. Ticket 06 is committed as `ticket 06: Distinguish local overload from ED congestion` on top of the WIP commit `c76a295`. The code-review gate for tickets 03 to 06 has run and is **closed**: its fixes are committed and re-verified (see "Review gate state"). Tickets 01 to 06 therefore also stand on the gate build.

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

**Ticket 09** (production build on :8000; API at 60-min steps to T+600, UI at 5-min steps):
- Catalog: 7 families, warm-up 120 / scored 480, 1 development + 2 tuning + 4 test seeds each (disjoint), versions, no time windows in `/scenarios` or `/profile`.
- Each family on a test seed to T+600: announcements before arrival, critical-bypass arrivals straight into zone 2, 2→3→2 diagnostic loops, and its bottleneck recomputed from `/events` (surge rate ratio, queue at onset against threshold, ward waiters with no suitable bed, overlapping episodes, early surge then quiet).
- Hidden-field scan of `/state`, `/zones`, `/events`, `/ingest`, `/scenarios`, `/profile` at five times per family; disposition null until `decision_received`; hidden-future fixture pair identical at T+60 and T+70, different at T+120.
- Save / page reload / Load: same events, counts, patients, announcements, zone, camera, speed; resume equals a fresh replay; Load while playing drops the playback; Reset clears label, dots, bubbles, drawer, camera; completed run labelled; tampered records refused (409); saved runs survive a backend restart.
- Regressions 01 to 05, 06 (engine, seed7, ui, zone4, label geometry) and 07 pass on the final build.

**Not verified yet (not-run), owned by later tickets:**
- no-effective-action: that no staff-approved action shows a benefit (tickets 17 and 19; change the family parameters if a best action appears)
- save/load of decisions, active actions and forecast settings (tickets 10 to 12 must populate `choices` and `settings.forecast` in the saved record and re-verify load)
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

Currently running, started by this session (backend restarted after the ticket 09 build); stop them by killing the python and node processes:
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

## Ticket 09 summary

- **Backend:**
  - `profile.py`: `SCENARIOS` holds the seven families as plain data (arrival-rate `surges`, `test_boosts`, `turnaround_scales`, `disposition_boost`, `ward_beds`, `staffing`), `WARMUP_MIN` 120, `SCORED_MIN` 480, `ENGINE_VERSION` `flow-3` (bump it on any engine change), `CATALOG_VERSION`, per-family `seed_partitions` (development [7], tuning `1000+10i+1/2`, test `2000+10i+1..4`), `seed_partition()`, `scenario_catalog()` (no time windows).
  - `engine.py`: `_segment_mult`, `_rate_ceiling`, `_adjust`; the default path is bit-identical (seed 7 normal: 705 events, 59 patients).
  - `fixtures.py`: `fixture-hidden-future-a` / `-b`.
  - `replay.py`: `run_record()` (also `export.run_record`), `save()`, `ReplayStore.load()` (rebuild from seed, event count and SHA-256 digest, `SavedRunMismatch` -> 409), snapshot field `saved_run`.
  - `saved.py`: JSON files in `backend/saved_runs/` (git-ignored).
  - `api.py`: `GET /api/v1/scenarios`, `POST /replays/{id}/save`, `GET /saved`, `GET /saved/{id}`, `POST /saved/{id}/load`.
- **Frontend:** `DemoPanel` in the sidebar (scenario selector, run record, Save, saved list, Load, "Open record"). Start uses the selected scenario, Reset applies it. The selector is disabled under `?fixture=`. Load restores selected zone, camera and speed.
- **Evidence:** 7/7 criteria pass (`evidence/09-synthetic-scenarios-and-save-load.md`). Open question Q9 records the decisions.
- **Known limits:**
  - `GET /saved/{id}` (the "Open record" link) shows the scenario's hidden time windows; that is evidence, not an observation response.
  - `choices` and `settings.forecast` are empty until tickets 10 to 12.
  - The selector clips the demo role and the "Warm-up / scored" label wraps (ticket 20).
  - Plain `normal` can show an imaging or ward-bed episode within 600 min.
- **Snippet staging lesson:** a snippet's echo is the whole source, so ticket 09's evidence is split into small files; use a helper that strips the leading `//` lines and sets `PART` (UTF-8, no BOM).

## Ticket 10 status at commit (2026-10-11)

Committed as `WIP ticket 10` at the user's request ("commit the progress and push"). **Not closed.**

**Passed through Playwright MCP (production build on :8000, backend restarted after the last Python edit):**
- `10-isolation` 10/10: hidden-future pair and private-arrival vs announced-ETA pair give identical state and forecasts until the received state differs; no hidden field in any forecast or explanation; stale/missing/never-forecast versions refused (409/422); cache.
- `10-horizon` 20/20: known demand, building (confirmation chance, elapsed, no countdown), confirmed (recovery), triage-only overload with overall Stable, missing imaging (unknown), stale staffing feed (cannot_assess at age 11), no zero/negative countdown, deadline formula, impact unavailable.
- `10-scan` A and B 9/9 each: 168 forecasts over 7 families (alert order, deadline formula, 2741 countdown values positive, lambda>mu without onset gives no timer, chance = events/samples).
- `10-inputs` 7/7: in-progress work resumed with received elapsed time, ward beds as received, an ambulance counted once.
- `10-ui-agreement` 6/6 (25 steps UI vs API at the same version), `10-ui-states` A 8/8 (pending, interactive map, expired estimate, failed refresh, retry, 409) and B 5/5 (Cannot assess, resume, widths 375-1440).
- `10-bench` A 3/3 and B 2/2: 50 vs 100 futures (max chance difference 0.11, none above 2 standard errors; latency 50 about 0.26 s, 100 about 0.52 s); full development shift (seed 7 normal, 144 forecasts, median 250 ms, max 336 ms, 43 s total); machine: Ryzen 7 7735HS, 16 threads.
- Regression run on this build: `01` (counts, widths, keyboard pass; 10x cadence read 9.49 sim min/s against 9.97 earlier, likely forecast CPU contention, recorded for ticket 20), `02`, `03`, `04`, `05` (0 problems), `06-label-geometry` (30 cases, 0 overlaps), `06-zone4-layout` (0 problems), `06-pressure` engine and seed7 (0 mismatches), `06-ui` (0 problems on the isolated re-run; the first run had timing failures because it ran concurrently with another snippet in the same browser, so run snippets one at a time).

**Still to do for ticket 10:**
1. Run `07-zones` (staged at `Prototype/.playwright-mcp/07-zones.js`).
2. Write `evidence/10-forecast-and-alert-panel.md` (criteria table, pass/fail per check above, the benchmark and the predeclared evaluation size in Q10), tick the nine ticket boxes that passed, set the ticket status.
3. Commit `ticket 10: Predict bottlenecks and explain the time remaining`, then run the `code-review` gate and commit `review: fixes after ticket 10 gate`.
4. Then tickets 11 onward as under "Exact next steps".

**New this session:** `forecast.py` `inputs.in_progress` and `inputs.ward_beds` (transparency of what is resumed), `fixture-eta-private-a/-b` fixtures, the drawer's source line has its own test id `fc-zone-source`, Q10 in `OPEN_QUESTIONS.md`.

## Ticket 10 WIP notes (written 2026-10-10; superseded where the section above says otherwise)

Ticket: `PulseAhead-Tickets/.scratch/pulseahead-3d/issues/10-forecast-and-alert-panel.md` (9 criteria, all unticked). `git status`: modified `backend/pulseahead/{api,engine,replay}.py`, `frontend/src/{App.tsx,api.ts,app.css,types.ts}`; new `backend/pulseahead/forecast.py`, `frontend/src/Forecast.tsx`, `evidence/shots/10-first-look.png` (exploratory screenshot, not evidence). `tsc` and `npm run build` passed; the backend on :8000 was restarted before the last edit (the `next_step` change in `forecast.py` is NOT loaded: restart it, and re-run `py_compile`/`ast.parse` on `forecast.py` first).

**Read the spec sections "Zone pressure versus overall congestion", "Congestion and forecasting", "Operational action catalog" (deadline rule) and the ticket before continuing.**

**What is built**
- **`engine.py`:** public patient record gains `tests_required` (kinds, `null` until tests are ordered). Nothing else in the engine changed.
- **`forecast.py`** (pure function of a received snapshot plus received events; it never touches the engine's patients or hidden schedules):
  - `build_input(snapshot, events)` makes the plain input (patients with phase/elapsed, held spaces, on-duty nurses, bed states, ED-taken beds from received departures, announced ambulances, monitor state, received history).
  - `Future` is one SimPy runner per sampled future. It reuses the engine's `SpacePool`, `WardBeds`, `CongestionMonitor` and `LocalMonitor`, and resumes every present patient from its received phase with elapsed-conditioned remaining work. Hidden needs (tests, durations, disposition, care task) are sampled from the profile's disclosed assumptions from one `random.Random(f"fc:{seed}:{k}:{patient_id}")` per patient, so branches are paired. Forecast seed `FORECAST_SEED = 7310004` is independent of replay seeds.
  - Arrivals: announced ambulances around ETA +/- disclosed uncertainty (7% cancel; overdue = soon), unannounced walk-ins and ambulance runs from disclosed rates, scaled by received arrivals of the last 30 min (shrinkage, 0.5 to 4, half-life 30 min); turnaround scaled by received completed turnarounds (0.5 to 3). Occupied ward/ICU beds not taken by ED patients release uniformly in 10 to 300 min. Constants and wording are in `FORECAST_ASSUMPTIONS`.
  - Output: `overall` (stable: new-onset chance, no-event fraction, conditional 5th to 95th percentile onset range, median, `expected_in_min`; building: confirmation chance, elapsed, no countdown; confirmed: clear chance), per-service and per-zone local summaries, `alerts` (actionable sorted by latest start = onset low - 5 review - setup - 5 margin, with provisional action label; recovery and unknown kept apart; impact always `null`), `series` (p10/p50/p90 per 5 min), `limitations`, `next_step`, `compute.ms`. `status: cannot_assess` when essential feeds are stale. Provisional warning threshold 0.4 (ticket 18 tunes it).
  - `explain_zone()`: observed facts, model statements, announced-vs-unannounced demand split, and a paired "one more unit" sensitivity of the bottleneck service.
- **`replay.py` / `api.py`:** `ReplaySession.forecast(samples, expected_version)` (cache by (version, samples), last 6; plain input built under the session lock, futures sampled outside it) and `forecast_explain(zone, samples, version)` (explains the cached forecast for that version; 409 if not held). `POST /api/v1/replays/{id}/forecast` body `{samples: 50|100, expected_version?}`; `POST /api/v1/replays/{id}/forecast/explain` body `{zone, samples, expected_version}` (version required).
- **Frontend:** `Forecast.tsx` has `useForecast` (refresh when sim time passes the next 5-minute mark, one request in flight, responses for another replay/run dropped, retry), `useExplanation`, `ForecastStrip` (Congestion chance, Expected start, awaiting a space, available staffed spaces, source line, next step, limitations; testids `fc-strip`, `fc-chance`, `fc-expected`, `fc-awaiting`, `fc-available`, `fc-source`, `fc-next`, `fc-retry`, `fc-limitations`), `AlertList` under the map (`fc-alerts`, `fc-alert-<service>`, `-text`, `-deadline`; clicking focuses the zone), `ZoneForecast` in the drawer (`fc-zone`, `fc-local`, `fc-overall`, `fc-explain`, `fc-observed`, `fc-model`, `fc-sensitivity`, `fc-tech`) and a forecast line on each zone button (`zone-N-forecast`). The Demo panel has a 50/100 futures selector (`fc-samples-50`, `fc-samples-100`).

**Exploratory results (not evidence)**
- 50 futures take about 0.2 to 0.25 s, 100 about 0.45 s, an explanation with sensitivity 0.2 to 0.5 s (target 2 s for a forecast). Single process, no pooling needed so far.
- `diagnostic-delay` seed 2033 at T+80: imaging 68% chance, median in 35 min (range 5 to 70), real onset T+82; with one more imaging slot the same futures give 10%. At T+100 imaging is Overloaded (0% clears), overall 0% (stable).
- The UI at T+100 shows the strip, the zone button forecast lines and the Recovery alert list correctly (see `shots/10-first-look.png`).

**Still to do for ticket 10 (nothing below is done)**
1. Restart the backend; rebuild if frontend changed. Re-read the diff for coherence.
2. Write Q10 in `OPEN_QUESTIONS.md`: forecast design as above (sampled hidden attributes from disclosed assumptions, arrival and turnaround adjustment, bed release, alert-list click focuses its zone, provisional warning threshold 0.4, provisional action per service for the deadline, `tests_required` exposure, explanation keyed to a cached version).
3. Evidence (split into small snippets, one per concern) and `evidence/10-forecast-and-alert-panel.md`:
   - Isolation: identical received states with changed hidden futures give identical forecasts. Fixtures `fixture-hidden-future-a` and `-b` give identical state until T+75; compare `/forecast` at T+60 and T+70 (same samples, ignoring replay id and `compute.ms`), and at T+120 they differ because the received state differs. Add a case where two runs share a received state but differ later (private ambulance arrival time vs announced ETA).
   - Known ETA vs private arrival: only received announcements enter; no hidden arrival time in input or output.
   - Local vs global horizon cases and building-confirmation probability: use `fixture-congestion-boundary` (overall onset 31, confirmed 51, cleared 85; local space 31/41/103) and `fixture-queue-surge`, `fixture-diagnostics-gap` (missing imaging gives Cannot assess for that service), stale feeds (`fixture-feed-staffing-stop` gives `cannot_assess`).
   - No lambda>mu-only timer, no negative countdown, no new-onset timer for building or confirmed intervals; expired estimate shows refresh, not zero.
   - Displayed explanation and source agree with `/state`, `/zones` and the forecast response at the same version (UI vs API per step).
   - Alert ordering (deadline first, then affected count; recovery and unknown separate; impact unavailable), pending/stale/error states (delay and abort `**/forecast` with `page.route`), map stays interactive during a forecast.
   - Benchmark 50 vs 100 samples (latency, onset-chance difference at development checkpoints on `diagnostic-delay`, `busy-recovers`, `arrival-surge` seeds) and one full development shift (seed 7 normal, T+720, forecast every 5 min); record machine and timings; predeclare the evaluation size from the measured cost (spec: aim 14 tuning and 28 test shifts, fallback 7 and 7 one per family) in `evidence/10-*.md`.
4. Regression: `01` always, `02` to `05`, `06-*` (engine, seed7, ui, zone4, label-geometry) and `07-zones`, because the public patient record, the sidebar/strip and the zone buttons changed. The zone-button forecast line and the new strip change layout: re-check `01` widths and `06-label-geometry`.
5. Tick only passed criteria, set the ticket status, update this file, commit `ticket 10: Predict bottlenecks and explain the time remaining` with the attribution trailer.
6. **Then run the `code-review` skill gate for ticket 10** (subagents allowed for this gate), fix in-scope findings, re-verify, commit `review: fixes after ticket 10 gate`.

## Start here in a new session (2026-10-11)

**Another machine.** Paths in this file are from the first PC (`C:UsersVaasDocumentsPrototypePulseAheadReal`). On a new PC use your own clone path. Set up: Python 3.12 venv at `backend/.venv` with `pip install -r backend/requirements.txt`, `cd frontend && npm install`, then build and start the backend as below. Saved runs (`backend/saved_runs/`) and `.playwright-mcp/` are git-ignored and start empty. Playwright MCP must be installed in the Claude Code session; its snippet folder is `.playwright-mcp/` under the session working directory, so adapt the staging paths.

**Git remote.** `origin` is `https://github.com/JunBin05/PulseAhead.git`. `git push -u origin pulseahead-mvp` failed with 403: the signed-in GitHub account `Srinivaas-only` has no write access. Nothing was pushed; all commits are local. The user must add that account as a collaborator, supply another repo, or sign in with another credential. Do not change the remote or guess credentials; ask.

**First commands** (from `Real/`): `git status` and `git log --oneline | head -5` (expect HEAD `48f3619` or a later docs commit and a clean tree), then confirm the servers below.

**Servers.** The backend on :8000 was started from the current code (log `%TEMP%\pulse-backend.log`) and serves the built `frontend/dist`; it may still be running. Restart it after any Python edit: kill python.exe whose command line contains `uvicorn pulseahead.api:app`, confirm :8000 is free with `netstat`, then start `backend/.venv/Scripts/python.exe -m uvicorn pulseahead.api:app --app-dir backend --port 8000` from `Real/`. Rebuild first after any `frontend/src` change (`cd frontend && npx tsc --noEmit && npm run build`). The browser caches the bundle: reload the page (or clear the cache) after a rebuild before checking.

**Playwright MCP.**
- If the profile is locked ("Browser is already in use"), stop only chrome.exe processes whose command line contains `mcp-chrome-ac24c5d`.
- Run **one snippet at a time**. Two snippets in one turn shared one browser and gave false failures in `06-ui`.
- Staging: copy `evidence/NN-name.playwright-mcp.js` to `C:\Users\Vaas\Documents\Prototype\.playwright-mcp\` as UTF-8 without BOM, with the leading `//` lines removed, and set `PART` where the snippet has one (`06-pressure`: `engine`, `seed7`; `10-scan`, `10-ui-states`, `10-bench`: `A`, `B`). The staging helper script lived in the old session's scratchpad (not in the repo); rewrite it in a few lines of node. Staged copies of the regression and ticket 10 snippets already exist in that folder.
- A snippet's source is echoed in every result, so keep snippets small and run only what the change touches plus regression 01.

**Finish ticket 10, in order:**
1. Run `07-zones` (the only regression not yet run on this build). Re-run `01` after any code change.
2. Write `evidence/10-forecast-and-alert-panel.md` from the results in "Ticket 10 status at commit": a nine-row criteria table (pass / fail / not-run, seed or fixture, expected vs actual), the benchmark, the machine and the predeclared evaluation size (Q10). State the criterion 9 caveat: the action-comparison cost does not exist yet (tickets 11 and 17), so the size is re-confirmed in ticket 18.
3. Tick the passed boxes in `PulseAhead-Tickets/.scratch/pulseahead-3d/issues/10-forecast-and-alert-panel.md` (criterion 1 rests on `10-isolation` I4 and `10-inputs` N1, N2), set its status and update the ticket table above.
4. Commit `ticket 10: Predict bottlenecks and explain the time remaining` with `git -c user.name=Vaas -c user.email=airscan.health@gmail.com commit` and the attribution trailer from the session's system reminder.
5. Run the `code-review` skill gate for ticket 10 (subagents allowed for gates only), fix in-scope findings, re-verify, commit `review: fixes after ticket 10 gate`.
6. Continue 11 (gate) -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 (gate) -> 18 -> 19 (gate) -> 20. Stop and ask before ticket 21 (hosting); ticket 22 stays with the user. The plan and the design notes for 11 (shared action machinery) are in `PLAN_TICKETS_10_TO_20.md` at the repo root.

**Carry to ticket 20.** Regression 01 measured 10x playback at 9.49 sim min/s (earlier runs 9.94 to 9.97) while forecasts ran; the forecast competes for the Python GIL. Ticket 20 must measure interaction while forecast work runs.

## Exact next steps (older list; "Start here" above is current)

1. Finish ticket 10 from "Ticket 10 WIP" above (code exists; verification, Q10, evidence, ticks, commit and the review gate remain). Run `git status` and `git diff --stat` first and re-check the claims there before trusting them.
2. Continue in blocker order: (10 review gate) -> 11 (review gate) -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 (review gate) -> 18 -> 19 (review gate) -> 20.
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
