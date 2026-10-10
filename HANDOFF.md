# HANDOFF: PulseAhead build

Updated 2026-10-10 (after ticket 03). Branch `pulseahead-mvp`. Repo root is `C:\Users\Vaas\Documents\Prototype\PulseAhead\Real`. Read `CLAUDE.md` first; it holds the architecture invariants and working rules.

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
| 04–22 | not started | n/a |

No ticket is in progress. Ticket 03 was finished, verified and committed before this handoff.

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

**Not verified yet (not-run), owned by later tickets:**
- 200-dot / 30 fps performance (ticket 20)
- reduced-motion and 2D fallback (ticket 20)
- local overload (ticket 06)
- congestion boundary fixtures (ticket 06)

## Known bugs, deferred findings, open questions

- **Deferred review findings** (full list in `evidence/01-working-3d-replay.md`, "Deferred to the ticket that owns them"):
  - **Ticket 06:** wait-area dot rows overflow into the next area above about 15 waiting patients; recovery is not labelled separately from "Congested"; the congestion monitor's boundaries are untested.
  - **Ticket 05:** departures have no exit destination; the Home and Ward/ICU pads are static.
  - **Ticket 08:** per-source freshness; `freshness.age_min` is always 0.
  - The ticket 02 ambulance placeholder item is resolved.
- **Kept by judgement:** `@react-three/drei` is pinned but unused; `ZONE_NAMES` duplicates the profile.
- **Open questions** (`OPEN_QUESTIONS.md`) and their working decisions:
  - **Q1:** 2 of the 24 spaces (`R1`, `R2`) are resuscitation spaces held for critical bypass. General spaces are `S01`–`S22`.
  - **Q2:** "available staffed spaces" counts free general spaces whose covering nurse is on duty; "awaiting a space" counts both queues.
  - **Both confirmed by the user on 2026-10-10 ("keep as is").**
  - **Q3 (new, ticket 03):** fictional staffing units: doctors `D1`-`D4` (reserve `D5` inactive), nurses `N1`-`N6` each covering 4 spaces, a supplied stabilization task for urgent/critical patients.
- **Ticket 03 limits** (details in `evidence/03-assessment-and-staffing.md`):
  - Only nurse coverage changes during a run, via the scenario's supplied `staffing` roster (fixtures only). Doctors are always on duty; `D5` is inactive until ticket 16.
  - The stabilization task (5-30 min) often outlasts the assessment, so 8 of 10 task patients in seed 7 wait for care after the decision. Disclosed assumption.
  - Zone 2 scene rows are dense when all four are populated; area labels can sit under dots. Counts are exact in the buttons and drawer. Ticket 06 owns row overflow, ticket 20 the full visual pass.
- **Unexplained, observed once:** the zone selection changed with no scripted click, and one backend `reset` arrived that the session did not send. Most likely manual clicks in the visible Playwright Chrome window. It was not reproduced in three reruns.
- **Console warning:** `THREE.Clock` deprecated. It comes from @react-three/fiber 9.8.1 internals, not our code.
- **Arrival rate:** seed 7 normal gave 4.9 arrivals/h against about 6.4/h expected from the assumptions. This is one sample, not a calibration.

## Code map

- **Backend** (`backend/pulseahead/`):
  - `profile.py`: fictional ED with 24 spaces (2 resus), 4 named doctors plus a reserve physician, 6 named nurses with coverage blocks, 1 triage desk, a declared reserve triage team, owners and assumptions.
  - `scenario.py`: supplied inputs (acuity, urgency group, critical bypass, stabilization task) and ambulance run scripts. The hidden arrival time and task length stay here.
  - `fixtures.py`: test-only scripted scenarios (`fixture-intake`, `fixture-staffing`; a fixture may carry a supplied `staffing` roster).
  - `engine.py`: the SimPy flow. Triage desk → staffed general space (`SpacePool`), or critical bypass → staffed resus space; then a named doctor, assessment, decision received, required care complete (`awaiting_care_completion` if premature), disposition and departure. Also the ambulance lifecycle and the congestion monitor.
  - `replay.py`: sessions, versions and the snapshot read model.
  - `api.py`: endpoints (`/api/health`, `/api/v1/profile`, `/api/v1/fixtures`, `/api/v1/replays` create/state/advance with `expected_version` (409 on mismatch)/reset/events/export). It also serves `frontend/dist`.
- **Frontend** (`frontend/src/`):
  - `App.tsx`: controls, ambulance panel, resources, zone drawer and the shared staffing summary (zones 2 and 3). The test-only `?fixture=` parameter is read here.
  - `Scene.tsx`: R3F isometric scene, DOM labels, compact labels below a 560 px canvas, and the `data-patient-meshes` counter.
  - `layout.ts`: dot areas and platform size (6 wide, 8 deep).
  - `api.ts`, `types.ts`, `tokens.css`, `app.css`, `icons.tsx`.
- **Design:** `DESIGN.md` ("The Charge Desk") and `.impeccable/design.json`.

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
2. **Ticket 04:** diagnostic queues and return flow (blocked only by 03, which is done).
   - Read `issues/04-diagnostics-and-return-flow.md` and spec §Four phases (zone 3), §Editable demo defaults (2 lab, 1 imaging, lab median 30 min, imaging median 45 min) and the zone 3 rules.
   - Add lab and imaging resources, supplied per-patient test needs, phases for waiting and running tests and `awaiting_result_review`, and make required tests part of the care prerequisites that `effective_disposition_min` already waits for.
   - Zone 3 holds logical diagnostic waiting; the patient keeps the same ED space and holds no doctor while waiting for results.
   - Add a fixture (`fixture-diagnostics`) in `fixtures.py`; extend `/state` zone 3 and the drawer; verify through Playwright MCP, write `evidence/04-*.md`, tick only passed boxes, commit `ticket 04: <title>`.
3. Continue: 05 → 06 → **code-review gate** (base `e69ceb6`, or the ticket 03 commit) → 07 …
4. At each ticket, re-run `evidence/01-regression.playwright-mcp.js` and, if the flow changed, `evidence/02-intake.playwright-mcp.js` and `evidence/03-staffing.playwright-mcp.js`.
