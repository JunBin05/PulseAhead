# 01: Start a real four-zone 3D ED replay

**What to build:** A first-time user starts a synthetic ED replay and sees received patient dots move through a simple four-zone 3D map, with real controls and live counts.

**Blocked by:** None (can start immediately).

**Status:** done. Evidence: [evidence/01-working-3d-replay.md](../../../../evidence/01-working-3d-replay.md) (all 8 criteria pass; Playwright MCP, 2026-10-10)

**Rubric focus:** Problem clarity; live execution.

- [x] Run the Python/SimPy engine, local API, and React/TypeScript Three.js scene together. One real replay drives the view; do not use placeholder queues or decorative patient arrivals.
- [x] Show Simulation Window, a readable Overall status, Synthetic demo, simulated time, active demo role, and four numbered/named zones with home and Ward/ICU exits.
- [x] Provide a ready fictional profile, 24 regular ED spaces, patient/resource identities, source versions, and a basic assessment-to-cleared-departure route. Later tickets extend the same model.
- [x] Start, pause, step, speed, and reset use the real application boundary. Frame rate never changes the backend's simulation time or service durations.
- [x] Patient dots have stable identities, one received logical phase, and received transition timestamps. Interpolation cannot free beds or advance stages early; reset removes old state.
- [x] Use simple isometric geometry and readable DOM overlays/zone controls. Show pending/error feedback and preserve last-valid timestamp; keep detailed configuration outside the main scene.
- [x] Establish compatible stable frontend/renderer dependencies and a deployment-ready frontend/API boundary; do not rely on alpha graphics features.
- [x] Playwright MCP verifies first start, replay/particle/API counts, assessment/departure, pause/step/reset, labels, keyboard controls, and narrow layout. Confirm tool access before checks; missing access stays not-run.

