# HANDOFF: PulseAhead build, paused during ticket 01

Written 2026-10-10. Branch `pulseahead-mvp`. Repo root is `PulseAhead/Real/` (git repo, created this session).

## Goal

Build the whole approved spec (`PulseAhead-Tickets/docs/PULSEAHEAD_3D_MVP_SPEC.md`, 22 tickets in `PulseAhead-Tickets/.scratch/pulseahead-3d/issues/`) in blocker order. Rules the user set:

- Implement directly in the main session. `/implement-spec` is not used (it spawns many agents; the user wants as few as possible).
- Use the `code-review` skill as the single review gate at milestones: after tickets 01, 06, 10, 11, 17, 19, 21.
- All testing and verification through Playwright MCP only. No pytest, Vitest or Jest files, no mocked engine.
- Premium, calm, light, accessible UI (the `impeccable` skill is loaded in spirit; PRODUCT.md exists, DESIGN.md does not).
- "Make no mistakes": never tick a ticket checkbox without passing Playwright MCP evidence; record fail and not-run honestly.
- Stop points: ticket 21 needs an authorized hosting target (nothing is bought or published); ticket 22 rehearsal and the organizer check on synthetic data stay with the user.

Approved plan file: `C:\Users\Vaas\.claude\plans\serene-nibbling-wirth.md`.

## Done

- Python 3.12.10 installed with winget. It is NOT on PATH. Interpreter: `C:\Users\Vaas\AppData\Local\Programs\Python\Python312\python.exe`; project venv: `backend/.venv` (fastapi 0.143.0, uvicorn 0.54.0, simpy 4.1.2, pydantic 2.14.0, numpy installed but unused).
- Git repo initialized; baseline commit of the docs; `.gitignore` (node_modules, .venv, dist, __pycache__, run-artifacts, .playwright-mcp).
- `CLAUDE.md` (architecture invariants, testing rule, working rules) and `PRODUCT.md` (confirmed by the user) written.
- Playwright MCP confirmed working (navigate, click, evaluate, screenshot).
- Backend, `backend/pulseahead/`:
  - `profile.py`: fictional ED, 24 spaces, 4 clinician slots, demo assumptions.
  - `engine.py`: SimPy flow arrival → awaiting space → awaiting clinician → assessment → disposition → departure. The ED space is released only at departure. Per-patient random values are keyed by (seed, patient id). The overall congestion monitor (0 spaces, ≥6 waiting, 20 min to confirm, <3 for 10 min to clear) ticks every simulated minute.
  - `replay.py`: sessions, version counter, snapshot, events, export.
  - `api.py`: `GET /api/health`, `GET /api/v1/profile`, `POST /api/v1/replays`, `GET .../state`, `POST .../advance` (0 < minutes ≤ 60), `POST .../reset`, `GET .../events`, `GET .../export`; serves `frontend/dist` from the same origin if built.
- Frontend, `frontend/` (React 19.3.0, three 0.186.1, @react-three/fiber 9.8.1, drei 10.7.9, Vite 8.3.4, TS 5.9.3, exact pins; `npx tsc --noEmit` passes):
  - `src/App.tsx`: header (Simulation Window, Synthetic demo, simulated time, demo role, Overall status with icon), controls (start/play/pause/step 5 min/speed 1,2,5,10×/reset), ambulance panel (empty state), ED resources, urgency legend, 4 DOM zone buttons, zone drawer, error/pending banner with last-valid time, retry.
  - `src/Scene.tsx`: isometric R3F scene, 4 platforms, home and Ward/ICU exit pads, dots eased toward received positions, DOM label layer projected from the fixed camera. (drei `Html` was removed: it caused repeated "unmount a root while rendering" errors under React 19.)
  - `src/layout.ts` (dot slots, `RENDER_BUDGET = 200` with an exact overflow count), `src/api.ts`, `src/tokens.css`, `src/app.css`, `src/icons.tsx`.

## Verified so far (Playwright MCP, informal, NOT yet written to evidence)

- API: created a replay with seed 7, advanced 60 + 60 min. Versions went 1 → 2 → 3, sim time 0 → 60 → 120, 12 arrivals (≈6/h), zone counts sum = patients in ED = occupied spaces (4), `minutes: 0` returns 422, status "Stable".
- UI: Start works, playback at 10× advances time, zone counts and ED-resources panel agree with each other, no console errors after the `Html` removal.

## Uncommitted / unfinished at the moment of handoff

Everything in `Real/` is committed in the "ticket 01: WIP" commit. Unfinished work:

- The last visual patch was REJECTED and not applied: wider dot-row spacing, label positions moved clear of the first dot row, softer lighting and thicker platforms. The code on disk is the earlier version: dot rows start close to their area labels (the "Triage queue" label sits under the first dots), ambient light 2.3 and directional 1.6 make platforms flat white.
- `evidence/01-*.md` does not exist. No acceptance checkbox of ticket 01 is ticked (correct: none are proven).
- No `DESIGN.md`, no surface brief, `impeccable detect` not run, finish reviewer skipped (to keep agents minimal; disclose at finish).
- No production build was made; same-origin serving from `frontend/dist` is untested.
- Screenshots exist at: `Prototype/evidence/shots/01-desktop-playing.png` and `Prototype/Real/evidence/shots/01-desktop-v2.png` (both outside the repo, wrong locations) and `PulseAhead/Real/evidence/shots/01-desktop-v3.png` (inside the repo). Playwright MCP resolves relative paths from `C:\Users\Vaas\Documents\Prototype`, so use `PulseAhead/Real/evidence/shots/<name>.png`.

## Running right now

- Backend: uvicorn on `127.0.0.1:8000` (log `/tmp/pulse-backend.log`). Sessions are in memory; a restart loses them.
- Frontend: Vite dev server on `127.0.0.1:5173`, proxying `/api` to 8000 (log `/tmp/pulse-vite.log`).
- A Playwright browser is open on `http://127.0.0.1:5173/`.
- Nothing else. To stop them, kill the uvicorn and node processes you started.

Start commands from `PulseAhead/Real/`:

- `backend/.venv/Scripts/python.exe -m uvicorn pulseahead.api:app --app-dir backend --port 8000`
- `cd frontend && npx vite --host 127.0.0.1`
- Type-check: `cd frontend && npx tsc --noEmit`. Build: `npm run build`.

## Broken or unverified

- Label/dot overlap and flat platform look (see above).
- Not yet checked: pause/step/reset behavior against the API, speed change leaving service durations unchanged (compare event history), stale-response discard, reset clearing old dots, keyboard-only operation, 375px layout (no horizontal scroll, 44px targets), contrast values, ward exit pad unused (no ward routing until ticket 05), 1 console warning of unknown origin, favicon 404.
- Overall status already uses the ED congestion rule from the spec; ticket 06 must still test its exact boundaries and add local overload.
- `SPEEDS` label says "simulated minutes per second" and playback sends 1-minute `advance` calls; fine for now but unmeasured.

## Exact next steps

1. Re-apply the layout/lighting patch: `AREAS` origins (zone 1/4 `[-2.1, -1.0]` step 0.85; zone 2 awaiting space `[-2.1, -1.9]`, awaiting clinician `[-2.1, 0.4]`, step 0.7; active `[-1.8, 2.6]`), `AREA_LABELS` at z −2.3 / −2.75 / −0.45 / 1.9 / −2.3, platform height 0.5, ambient ~1.7, directional ~1.5. Re-screenshot once at 1440 and once at 375.
2. Run the ticket 01 checks through Playwright MCP and write `evidence/01-working-3d-replay.md` with expected vs actual: first start; dot, zone and API counts agree; assessment → departure for one patient from `/events`; space released only at departure; pause/step/reset; speed vs simulated time; labels; keyboard; narrow layout; Playwright availability.
3. `npm run build`, serve from `:8000`, repeat a short smoke check on the same origin.
4. Write a short `PulseAhead-Tickets/.scratch/pulseahead-3d/issues/01-*.md` status update: tick only passed boxes.
5. Run `impeccable detect --json` on `frontend/src`, fix mechanical findings, write `DESIGN.md` from the built UI.
6. Run the `code-review` skill against the baseline commit `3841ced`; fix findings; re-verify; commit "ticket 01: Start a real four-zone 3D ED replay".
7. Continue with ticket 02 and onward in blocker order (02 → 03 → 04/05 → 06 → …).
