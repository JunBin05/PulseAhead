# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

PulseAhead is a hackathon MVP: a synthetic 3D operational digital twin of one fictional 24-space emergency department (ED). Patient dots move through four zones. The app forecasts sustained congestion, compares six staff-approved operational actions against no action, and routes each approval to the resource owner.

Ticket status lives in each ticket file and in `evidence/NN-*.md`; `HANDOFF.md` describes where the last session stopped. Code: `backend/pulseahead/` (`profile.py`, `engine.py`, `replay.py`, `api.py`) and `frontend/src/` (`App.tsx`, `Scene.tsx`, `layout.ts`, `api.ts`). All planning docs are under `PulseAhead-Tickets/docs/`:

- `PULSEAHEAD_3D_MVP_SPEC.md` is the canonical spec and the source of truth for every rule. `PULSEAHEAD_3D_MVP_SPEC.md` at the `Real/` root is an identical copy; treat the docs copy as authoritative.
- `PULSEAHEAD_3D_TICKET_PLAN.md` is the 22-ticket index with blockers. Tickets live in `PulseAhead-Tickets/.scratch/pulseahead-3d/issues/NN-*.md`. The tracker is local files only; there is no external issue tracker.
- `PULSEAHEAD_3D_BUILD_PLAN.md` has the 16-hour checkpoints and the cut-first list. `PULSEAHEAD_3D_UX.md` has the layout and journey. `PULSEAHEAD_RUBRIC_MAP.md` maps the work to the judging rubric.

## Ticket workflow

- Start with ticket 01. Start a later ticket only after every blocker listed for it is complete.
- Each ticket is a vertical slice: simulation state, a versioned API, a usable UI, and Playwright MCP evidence, delivered together. Do not build a frontend-only mock or an engine with no UI.
- Leave acceptance-criteria checkboxes unchecked until real Playwright MCP evidence supports them. For each check, record pass, fail, or not-run, plus the fixture/version and the expected and actual values.

## Stack and commands

The stack is Python 3.12 with SimPy for the engine and FastAPI for the API, in `backend/` with a venv at `backend/.venv`. The frontend is React 19 + TypeScript + three + @react-three/fiber 9 + drei 10 on Vite, in `frontend/`. Versions are pinned exactly; no alpha or beta packages. In production, FastAPI serves the built `frontend/dist` from the same origin.

Python is not on PATH. Use `backend/.venv/Scripts/python.exe`, or `C:\Users\Vaas\AppData\Local\Programs\Python\Python312\python.exe` to create a venv.

Commands, run from `Real/`:

- Backend: `backend/.venv/Scripts/python.exe -m uvicorn pulseahead.api:app --app-dir backend --port 8000`. Restart it after backend edits. Avoid `--reload` on Windows: its worker can survive a restart and keep serving old code on the port.
- Frontend dev server: `cd frontend && npx vite --host 127.0.0.1` (port 5173, proxies `/api`).
- Type-check: `cd frontend && npx tsc --noEmit`. Production build: `cd frontend && npm run build`. Then `:8000` serves the app and API from one origin; the backend looks for `frontend/dist` only at startup.
- Design detector: `sh ~/.claude/skills/impeccable/scripts/impeccable detect --json frontend/src`.

Playwright MCP resolves relative screenshot paths from `C:\Users\Vaas\Documents\Prototype`, so save evidence as `PulseAhead/Real/evidence/shots/<name>.png`. Its Chrome window is visible on the desktop; manual clicks in it affect checks.

## Working rules

- Branch `pulseahead-mvp`. Commit once per ticket as `ticket NN: <title>`.
- Each ticket writes `evidence/NN-<slug>.md`. For every acceptance criterion, record pass, fail or not-run, the seed/fixture/version, expected vs actual values, and the response excerpt or screenshot path. Tick a ticket checkbox only when its evidence passed.
- Ports: backend 8000, Vite dev server 5173 (proxies `/api` to 8000).
- Put ambiguous spec rules in `OPEN_QUESTIONS.md` rather than guessing.
- Run `impeccable` (project design skill) before UI work; it keeps product context in `PRODUCT.md` and the design system in `DESIGN.md` at the `Real/` root. Status colours must always come with text and an icon.
- Playwright MCP writes snapshots to `.playwright-mcp/`, which is git-ignored.

## Testing: Playwright MCP only

All testing and verification goes through **Playwright MCP** against the running app. This is a settled user decision; do not reopen it.

- Do not add pytest, Jest, Vitest, or standalone API test runners, and do not mock the engine.
- Check numbers by inspecting real API responses, event histories, and exported artifacts through Playwright MCP. A screenshot alone does not prove a number is correct.
- Provide controlled test fixtures (congestion boundaries, hidden-future variants, faulty feeds) through the application boundary. Keep fixture configuration separate from the normal staff workflow.
- Confirm Playwright MCP is available before testing. If it is not, report the checks as not-run; do not switch tools.

## Architecture invariants (spread across the spec)

- **The backend owns all state.** Patient transitions, resources, and simulated time live in the backend. The renderer may interpolate between received transitions, but it must never advance a patient, free a bed, or change queues. Camera movement and frame rate never affect the simulation.
- **One flow model, two boundaries.** Replay and forecast branches share the same model. Replay-only future data stays behind a separate boundary: forecasts receive a plain observed snapshot and may use only received events. Do not expose hidden future fields in observation responses. Store state as plain data and build a fresh runner for each branch; never copy a running SimPy environment.
- **Versioned results.** Every response carries the source state/version it was computed from. The UI discards stale responses and never mixes a forecast with a newer replay state. The backend is the authority for eligibility, versions, and duplicate decision identities.
- **Zones are logical phases, not bed pools.** The four zones are Arrival/triage, Doctor assessment, Diagnostics, and Disposition. Zones 2 and 3 share one ED-bed pool. Patients in diagnostics keep their ED bed and return to zone 2 for result review. Supported routes are 1→2→4, 1→2→3→2→4, critical arrivals straight into 2, and separate home and Ward/ICU exits.
- **Local overload is not ED congestion.** ED congestion means zero available staffed spaces and at least six patients waiting for a space, sustained for 20 minutes; it clears after fewer than three wait for 10 minutes. Local zone overload has its own thresholds. An incoming rate above capacity (λ>μ) is a pressure signal only; never derive a countdown from it.
- **Forecasts** run Monte Carlo futures every 5 simulated minutes over a 90-minute horizon plus a 20-minute tail. They report chance, a conditional 90% onset range, and the no-event fraction. Missing or stale essential data (older than 10 simulated minutes) yields **Cannot assess**, never low risk.
- **Actions** follow one lifecycle: review (5 min) → setup → active (60 min) → draining → completed/blocked. Only one action can be in flight at a time. Approval needs **every** resource owner's grant; partial grants reserve nothing. Resolve approvers from resource ownership, not from the clicked zone.
- **Ranking** compares paired futures with keyed random values so demand is identical across branches. To be labeled Best action, an action must show a positive lower bound on total ED time saved and pass the urgent-delay checks (and the donor checks for diagnostic reallocation). Otherwise show No action shown to help or Needs review; never force a winner.

## Honesty constraints

- Keep a persistent Synthetic demo label. Make no claims about clinical outcomes, ROI, or validated hospital performance. Report value in patient-minutes and resource-hours.
- Never fake a queue, alert, best action, clinical clearance, or resource release to make the visual work. When scope must be cut, cut realism, physics, VR, and decorative effects first.
- A 2D/keyboard/reduced-motion mode offering the same data and approvals is required as a fallback.
