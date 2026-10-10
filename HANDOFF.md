# HANDOFF: PulseAhead build

Updated 2026-10-10 (tickets 01-06 done; the code-review gate for tickets 03-06 is closed and its fixes are committed as `review: fixes after ticket 03-06 gate`). Next ticket: 07. Branch `pulseahead-mvp`. Repo root is `C:\Users\Vaas\Documents\Prototype\PulseAhead\Real`. Read `CLAUDE.md` first; it holds the architecture invariants and working rules.

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
| 06 Local overload vs ED congestion | **done**: 8/8 pass; review gate for 03-06 closed, fixes re-verified (see "Review gate state") | `evidence/06-zone-pressure-and-ed-congestion.md`, `evidence/06-pressure.playwright-mcp.js`, `evidence/06-ui.playwright-mcp.js`, `evidence/shots/06-*.png` |
| 07–22 | not started | n/a |

Tickets 01 to 06 are done. Ticket 06 is committed as `ticket 06: Distinguish local overload from ED congestion` on top of the WIP commit `c76a295`. The code-review gate for tickets 03 to 06 has run and is **closed**: its fixes are committed and re-verified (see "Review gate state"). Tickets 01 to 06 therefore also stand on the gate build.

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

**Not verified yet (not-run), owned by later tickets:**
- 200-dot / 30 fps performance (ticket 20)
- reduced-motion and 2D fallback (ticket 20)
- forecast-based zone warnings (ticket 10)

## Known bugs, deferred findings, open questions

- **Deferred review findings** (full list in `evidence/01-working-3d-replay.md`, "Deferred to the ticket that owns them"):
  - **Ticket 06:** resolved (dots layer instead of overflowing; "Congested, recovering" label; boundaries tested).
  - **Ticket 05:** resolved (exits show destination and counts; bed pool is finite).
  - **Ticket 08:** per-source freshness; `freshness.age_min` is always 0.
  - The ticket 02 ambulance placeholder item is resolved.
- **Kept by judgement:** `@react-three/drei` is pinned but unused; `ZONE_NAMES` duplicates the profile.
- **Open questions** (`OPEN_QUESTIONS.md`) and their working decisions:
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
  - `replay.py`: sessions, versions and the snapshot read model, including `pressure` (services with rates, zone states, alerts) and the `recovering` / `local_alert` fields of `overall_status`.
  - `api.py`: endpoints (`/api/health`, `/api/v1/profile`, `/api/v1/fixtures`, `/api/v1/replays` create/state/advance with `expected_version` (409 on mismatch)/reset/events/export). It also serves `frontend/dist`.
- **Frontend** (`frontend/src/`):
  - `App.tsx`: controls, ambulance panel, resources, zone drawer and the shared staffing summary (zones 2 and 3). The test-only `?fixture=` parameter is read here.
  - `Scene.tsx`: R3F isometric scene, DOM labels, compact labels below a 560 px canvas, and the `data-patient-meshes` counter.
  - `layout.ts`: dot areas (phases that share a waiting line or a doctor share one area; wait lines have 8 columns, two rows per layer, extra patients stack upward; zone 4 has seven single-row areas, queue and active apart, pitch `ZONE4_ROW_PITCH` 1.18) and platform size (6 wide, 8 deep).
  - `status.tsx`: `ZONE_LOOK` (icon, tone and word per zone state, including `idle` = "Not started"), shared by the chips and the scene labels.
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

## Review gate state (tickets 03-06: closed)

The `code-review` skill ran two reviewers (Standards, Spec) over `e69ceb6...3ecc56c`. All in-scope findings were fixed and re-verified through Playwright MCP on the gate build; the details and numbers are in `evidence/06-zone-pressure-and-ed-congestion.md`, section "Review-gate fixes".

- **Backend:** assessment λ/μ units (result review has its own log key; μ from doctor minutes per patient), one μ basis for disposition, one throughput window, bed release schedule hidden from `/api/v1/profile` (kept in `export.profile`), `capacity_unavailable` from the unit capacity, per-alert `mixed` / `also_active`.
- **Frontend:** status icon and word in every zone label (compact scene: icon beside the number), "Not started" instead of Normal before any data, zone 4 split into queue and active areas, container-query zone bar (2 x 2, 4 across from 640 px of map width), ALERT bubble as a child of its zone label, mesh-position test hook only with `?fixture=`, types for the renamed key and the mixed fields, `DESIGN.md` sentence on the zone tint.
- **Verified (Playwright MCP, production build on :8000):** `06-pressure` engine (6 fixtures) and seed7 (720 min): 0 mismatches; `06-ui`: 0 problems; `06-zone4-layout` (40 steps): 0 problems; `06-label-geometry` (30 cases, 6 viewports, alerts in zones 1-4): 0 overlaps, 0 clipped; regression `01` to `05`: 0 problems.
- **A layout lesson worth keeping:** the first version of the gate fix passed every functional check and failed regression 01's overlap and clip check (6 to 7 overlaps, 1 clipped label). Adding a word to a label widens it, and seven zone 4 rows leave about 10.5 px between labels. Run `01-regression` and `06-label-geometry` after any change to labels, areas or platform depth.

### Review findings deliberately deferred (not fixed in this gate)

- **Missing-feed masking is partial:** only `pressure` hides counts for a service whose inputs are missing; `resources.diagnostics.*.waiting`, `zones[].lab_queue` and the sidebar still show exact numbers. Owned by ticket 08 (received data).
- **Overall monitor ignores missing space-feed inputs**, while the local one respects them. Ticket 08/10.
- **Total ED time and its parts shown separately in the UI** (story 23): export only for now. Tickets 11 and 17 (comparison panel).
- **Normal shift ends permanently red in zone 4 (ward beds):** a consequence of the disclosed Q5 bed assumption, an honest model state (also written into `OPEN_QUESTIONS.md` Q6). Revisit with ticket 09 scenarios.
- **Smells left as judgement calls:** repeated inline styles in `App.tsx`, `Scene` pass-through props, positional `SuppliedInputs(...)` in fixtures, a duplicated local helper `r()` in `engine.py`, mysterious short names in `replay.py`.
- **Compact scene (map under about 660 px):** area labels and ALERT bubble are not drawn; counts and status words are in the zone buttons and drawer. The 1280 px viewport is compact because the drawer column narrows the map. Ticket 20 owns the full visual and layout pass.

## Exact next steps

1. Start ticket 07 (blockers 04, 05, 06 are complete).
2. Continue in blocker order: 07 -> 08 -> 09 -> 10 (review gate) -> 11 (review gate) -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 (review gate) -> 18 -> 19 (review gate) -> 20.
3. **Stop before ticket 21** (hosting): ask the user for an authorized target. Ticket 22's rehearsal and the organizer check stay with the user.
4. At each ticket, re-run `evidence/01-regression.playwright-mcp.js` and, if the flow or layout changed, the `02-intake`, `03-staffing`, `04-diagnostics`, `05-disposition` and `06-*` snippets. Playwright MCP runs snippets by filename from `Prototype/.playwright-mcp/`; copy them there with the leading `//` lines removed (for `06-pressure`, also set `PART`).

## Tool quirks seen this session

- **Bash heredocs failed again** when the body held quotes and template strings ("unexpected EOF"): write patch scripts with the Write tool into the scratchpad and run them with `node`. Source files have CRLF line endings (`Scene.tsx`, `layout.ts`, `app.css`, the evidence snippets): make patch scripts EOL-tolerant (replace `\r\n` with `\n`, patch, write back) or `Edit` will not match.
- **A stale Playwright Chrome** held the profile again ("Browser is already in use"); stopping only the `chrome.exe` processes whose command line contains `mcp-chrome-ac24c5d` fixed it.
- **Snippet staging:** copy `evidence/*.playwright-mcp.js` to `Prototype/.playwright-mcp/` with the leading `//` lines removed; `browser_run_code_unsafe` echoes the whole snippet back, so long snippets cost output tokens on every run.

- **Bash heredocs with Python containing triple quotes failed** ("unexpected EOF"): write the script with the Write tool to the scratchpad and run it with `backend/.venv/Scripts/python.exe <script> <repo root>`.
- **Restart the backend** after Python edits: kill every `python.exe` whose command line contains `uvicorn pulseahead.api:app`, then start `backend/.venv/Scripts/python.exe -m uvicorn pulseahead.api:app --app-dir backend --port 8000` from `Real/` (hidden window, logs to `%TEMP%\pulse-backend.log`). Rebuild the frontend first (`cd frontend && npm run build`) after any `src` change.
- **A stale Playwright Chrome** can lock the profile ("Browser is already in use"): stop only the Chrome tree whose command line has `mcp-chrome-ac24c5d`.
- **`/advance` takes at most 60 min per call.**
- **Attribution:** commit trailers use the line given in the session's system reminder; the author identity is `Vaas <airscan.health@gmail.com>` via `git -c user.name=Vaas -c user.email=airscan.health@gmail.com commit`.
