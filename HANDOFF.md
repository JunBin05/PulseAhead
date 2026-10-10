# HANDOFF: PulseAhead build

Updated 2026-10-10 (ticket 06 in progress, uncommitted). Branch `pulseahead-mvp`. Repo root is `C:\Users\Vaas\Documents\Prototype\PulseAhead\Real`. Read `CLAUDE.md` first; it holds the architecture invariants and working rules.

## Goal and rules

- **Goal:** build the approved spec (`PulseAhead-Tickets/docs/PULSEAHEAD_3D_MVP_SPEC.md`) as 22 tickets (`PulseAhead-Tickets/.scratch/pulseahead-3d/issues/NN-*.md`), in blocker order. The ticket index with blockers is `PulseAhead-Tickets/docs/PULSEAHEAD_3D_TICKET_PLAN.md`.
- **Plans:**
  - `C:\Users\Vaas\.claude\plans\serene-nibbling-wirth.md` (master plan)
  - `C:\Users\Vaas\.claude\plans\continue-the-pulseahead-build-glistening-seahorse.md` (last session)
- **How to work:** implement directly in the main session (no `/implement-spec`, few agents). Follow the spec and tickets only, with no extra features.
- **Review gate:** the `code-review` skill is the only review gate, after tickets 01 (done), 06, 10, 11, 17, 19 and 21.
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
| 06 Local overload vs ED congestion | **in progress**: backend written and smoke-run only, **uncommitted**; frontend, evidence and ticket boxes not started | none yet |
| 07–22 | not started | n/a |

**Ticket 06 is half built, and nothing for it is verified through Playwright MCP.** Tickets 01 to 05 are committed (HEAD `1fae13c`). The working tree holds the uncommitted ticket 06 backend: `backend/pulseahead/pressure.py` (new), plus edits to `engine.py`, `replay.py`, `profile.py` and `fixtures.py`. No ticket 06 box may be ticked yet.

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

**Not verified yet (not-run), owned by later tickets:**
- 200-dot / 30 fps performance (ticket 20)
- reduced-motion and 2D fallback (ticket 20)
- local overload (ticket 06)
- congestion boundary fixtures (ticket 06)

## Known bugs, deferred findings, open questions

- **Deferred review findings** (full list in `evidence/01-working-3d-replay.md`, "Deferred to the ticket that owns them"):
  - **Ticket 06:** wait-area dot rows overflow into the next area (now above about 10 waiting patients per row); recovery is not labelled separately from "Congested"; the congestion monitor's boundaries are untested.
  - **Ticket 05:** resolved (exits show destination and counts; bed pool is finite).
  - **Ticket 08:** per-source freshness; `freshness.age_min` is always 0.
  - The ticket 02 ambulance placeholder item is resolved.
- **Kept by judgement:** `@react-three/drei` is pinned but unused; `ZONE_NAMES` duplicates the profile.
- **Open questions** (`OPEN_QUESTIONS.md`) and their working decisions:
  - **Q1:** 2 of the 24 spaces (`R1`, `R2`) are resuscitation spaces held for critical bypass. General spaces are `S01`–`S22`.
  - **Q2:** "available staffed spaces" counts free general spaces whose covering nurse is on duty; "awaiting a space" counts both queues.
  - **Both confirmed by the user on 2026-10-10 ("keep as is").**
  - **Q5 (new, ticket 05):** the three exclusive time parts (initial wait, care and tests, awaiting departure), boarding as the awaiting-departure part of Ward/ICU transfers, and the Ward/ICU bed pool numbers.
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
  - `fixtures.py`: test-only scripted scenarios (`fixture-intake`, `fixture-staffing`, `fixture-diagnostics`, `fixture-boarding`; a fixture may carry a supplied `staffing` roster, `ward_beds` schedule or `fixed_minutes`).
  - `engine.py`: the SimPy flow. Triage desk → staffed general space (`SpacePool`), or critical bypass → staffed resus space; then a named doctor, first assessment, supplied tests (lab `L1`-`L2`, imaging `I1`, zone 3), result review by a doctor (zone 2), decision received, required care complete (`awaiting_care_completion` if premature), then home discharge processing (zone 4) or a Ward/ICU transfer (`WardBeds` bed reservation, allocation work, transport), and physical departure through the Home or Ward/ICU exit. Also the ambulance lifecycle and the congestion monitor.
  - `replay.py`: sessions, versions and the snapshot read model.
  - `api.py`: endpoints (`/api/health`, `/api/v1/profile`, `/api/v1/fixtures`, `/api/v1/replays` create/state/advance with `expected_version` (409 on mismatch)/reset/events/export). It also serves `frontend/dist`.
- **Frontend** (`frontend/src/`):
  - `App.tsx`: controls, ambulance panel, resources, zone drawer and the shared staffing summary (zones 2 and 3). The test-only `?fixture=` parameter is read here.
  - `Scene.tsx`: R3F isometric scene, DOM labels, compact labels below a 560 px canvas, and the `data-patient-meshes` counter.
  - `layout.ts`: dot areas (phases that share a waiting line or a doctor share one area) and platform size (6 wide, 8 deep).
  - `api.ts`, `types.ts`, `tokens.css`, `app.css`, `icons.tsx`.
- **Design:** `DESIGN.md` ("The Charge Desk") and `.impeccable/design.json`.

## Ticket 06 state (read this first)

**Written (uncommitted, smoke-run in Python only):**
- `backend/pulseahead/pressure.py`:
  - `SERVICES`: triage, assessment, space, lab, imaging, discharge, allocation, transport, ward_beds, each with a zone, category and queue threshold.
  - `LocalMonitor`: per-service state machine, normal → building → overloaded, with separate onset and confirmed times, 10 min to confirm, 5 min to clear, and missing inputs unable to establish recovery.
- `profile.py`: `PROFILE["local_rule"]` (thresholds triage 3, assessment 6, lab 4, imaging 2, discharge/allocation/transport 3; confirm 10, clear 5, rate window 30).
- `engine.py`:
  - `self.local` (LocalMonitor), `local_readings()`, `_inputs_ok()` (a fixture may declare `missing_inputs: [(start, end, [service ids])]`).
  - `work_entries` / `work_done` logs via `WAIT_SERVICE` / `DONE_SERVICE`, used for λ and throughput.
  - `CongestionMonitor.recovering`.
- `replay.py`:
  - `snapshot()["pressure"]`: `services` (queue, threshold, state, onset, confirmed, `confirms_in_min`, rates with λ, μ, recent throughput, unit, `pressure_signal`), `zones` (state and label), `alerts` (category, affected patients, urgent group count, evidence), `mixed`, `episodes`.
  - `overall_status` gains `recovering`, `recovery_since_min`, `local_alert`; the label becomes "Congested, recovering" during recovery.
  - `export` gains `local_episodes`.
- `fixtures.py`: `fixture-congestion-boundary` (nurses N1–N5 off; W01/W02 urgent with 400 min care tasks hold S21/S22; A01 brings 8 critical patients at T+30.5) and `fixture-diagnostics-gap` (diagnostics script with imaging inputs missing T+90 to T+120).

**Smoke results to re-verify through Playwright MCP, not to quote as evidence:**
- Seed 7 normal 12 h: only the `ward_beds` service goes overloaded (P0043 boards at the end); overall status stays Stable.
- `fixture-congestion-boundary`: overall onset 31.0, confirmed 51.0, cleared 85.0; local `space` onset 31.0, confirmed 41.0, cleared 103.0.
- `fixture-diagnostics`: overall none; `triage` 2.0 / 12.0 / 64.0; `imaging` 68 / 78 / 99 and 112 / 122 / 154. This serves as the diagnostic-only alert case (no overall congestion), so a separate `fixture-diagnostic-only` is not needed.
- `fixture-diagnostics-gap`: the imaging episode stays confirmed (78) and clears at 154 instead of 99, because the gap withheld recovery.

**Still to do for ticket 06:**
1. Restart the backend (it is running pre-ticket 06 code) and confirm `/state` has `pressure`.
2. Frontend:
   - `types.ts`: pressure types, plus `overall_status.recovering`, `local_alert`.
   - Zone buttons show a status text and icon; use `.status` tones `normal` / `pressure` / `overload` / `unknown` and tokens `--status-*`.
   - Scene: platform tint per zone state, and an "ALERT" bubble (icon and text) on overloaded zones, from model state.
   - Overall badge: show "Local alert" when `overall_status.local_alert`.
   - Zone drawer: a status section with per-service queue/threshold, elapsed or confirms-in, recovery clock, λ, μ and throughput with units, "Unknown" when inputs are missing, the failure category and affected counts, and a line that local overload is not overall ED congestion.
3. Fix the deferred dot-row overflow in `layout.ts`: use 8 columns and stack extra layers vertically so patients never run into the next area, and add per-area counts to the area labels (for example "Awaiting space · 4"). Keep mesh count = patient count.
4. Write `evidence/06-pressure.playwright-mcp.js` and `evidence/06-zone-pressure-and-ed-congestion.md`:
   - Reconstruct per-minute queues from `/events` (phase at minute t = last phase event with time ≤ t; fixtures use non-integer event times to avoid ties with the integer-minute monitor tick).
   - Re-implement both rules independently in JS (local: 10 min confirm, 5 min clear, missing windows from the fixture; overall: available staffed general spaces 0 and at least 6 awaiting for 20 min, clear after fewer than 3 for 10 min).
   - Compare with the `local_episodes` and `congestion_episodes` exports, and step 1 minute at a time via `/advance` to check statuses at onset+19 / +20 and the recovery boundaries.
   - Check λ/μ units and that `pressure_signal` never gives a countdown, `Unknown` for missing inputs, the failure categories, and that a diagnostic-only alert leaves the overall status Stable.
   - Include the usual UI-vs-`/state` agreement at every step and the 375/768/1024/1440 width checks.
5. Regression: run `01-regression`, `02-intake`, `03-staffing`, `04-diagnostics`, `05-disposition` and check 0 problems.
6. Add Q6 to `OPEN_QUESTIONS.md`: "necessary capacity unavailable" interpreted as no suitable free capacity (no staffed free space while a patient awaits one; no suitable bed while a transfer awaits one), not merely busy units; transport uses the same threshold 3 as discharge and allocation; λ/μ windows and means.
7. Tick only passed boxes in `issues/06-*.md`, set Status to done with the evidence link, update this file, and commit `ticket 06: Distinguish local overload from ED congestion`.

## Servers

Currently running, started by this session; stop them by killing the python and node processes:
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
  - Its Chrome window is visible on the desktop, and manual clicks there affect checks.
  - A previous session's Chrome can lock the profile (error "Browser is already in use"). Stop only that Chrome process tree; its parent is an older `@playwright/mcp` node process.
  - Relative screenshot paths resolve from `C:\Users\Vaas\Documents\Prototype`, so save to `PulseAhead/Real/evidence/shots/<name>.png`.
  - `browser_run_code_unsafe` with `filename` only reads files under `C:\Users\Vaas\Documents\Prototype`. Copy `evidence/*.playwright-mcp.js` to `..\..\.playwright-mcp\` and strip the leading comment lines, or paste the code inline.
- **Git:** no global git identity is set. Commit with `git -c user.name=Vaas -c user.email=airscan.health@gmail.com commit ...`.
- **Stray screenshots:** old screenshots sit outside the repo (`Prototype/evidence/shots/`, `Prototype/Real/evidence/shots/`); they were left untouched.

## Exact next steps

1. Start the backend and build the frontend (see Servers). Confirm Playwright MCP works with `browser_navigate` to `http://127.0.0.1:8000/`.
2. **Ticket 06 (resume, see "Ticket 06 state" above; backend written, rest still to do):** local zone overload versus overall ED congestion.
   - Read `issues/06-zone-pressure-and-ed-congestion.md` and spec §Zone pressure versus overall congestion and §Congestion and forecasting.
   - Local thresholds (queue at or above the threshold for 10 min to confirm, below it with capacity available for 5 min to clear): triage 3, assessment 6, lab 4, imaging 2, departure processing/allocation 3. Store onset and confirmation separately. Missing inputs give Cannot assess.
   - The overall ED congestion rule exists (`CongestionMonitor`, 20 min to confirm, 10 min to clear); add recovery labelling and check its boundaries with fixtures.
   - Show λ (received work, previous 30 min) and μ (staffed capacity) in matching units per zone (patients/h for triage and assessment; tasks/h for lab and imaging; home processing and ward transfer separately), recent throughput apart, Unknown when inputs are missing. `resources.diagnostics` and `resources.disposition` already carry capacity per hour.
   - Zone colours green/yellow/red/gray with text and icon, ALERT bubbles from model state; failure categories with affected counts. Fix the deferred dot-row overflow (exact overflow count instead of rows running into the next area).
   - Add fixtures (`fixture-congestion-boundary`, `fixture-diagnostic-only`) for exact 20/10/5-minute boundaries; verify through Playwright MCP, write `evidence/06-*.md`, tick only passed boxes, commit `ticket 06: <title>`.
3. Then the **code-review gate** (`code-review` skill, base `e69ceb6`, which is before tickets 03 to 06): fix Standards and Spec findings inline, re-verify affected criteria, commit the fixes. Continue: 07 → 08 → 09 → 10 (review gate) ...
4. At each ticket, re-run `evidence/01-regression.playwright-mcp.js` and, if the flow changed, the `02-intake`, `03-staffing`, `04-diagnostics` and `05-disposition` snippets. Playwright MCP runs snippets by filename from `Prototype/.playwright-mcp/`; copy them there with the leading `//` lines removed.
