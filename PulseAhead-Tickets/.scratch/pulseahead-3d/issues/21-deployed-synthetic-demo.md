# 21: Deploy and verify the complete synthetic demo

**What to build:** A judge opens a stable demo URL and runs the real synthetic 3D workflow with a working backend, protected run isolation, and a saved-run fallback.

**Blocked by:** 18 — Measure forecast quality and resilience on held-out shifts; 20 — Make the 3D decision journey usable and reliable.

**Status:** ready-for-agent

**Rubric focus:** Live execution, deployed prototype.

- [ ] Package built frontend, API/engine, presets, and saved evidence handling for a small authorized deployment; prefer one application origin and record its identity/version.
- [ ] Use an available authorized hosting target. Do not mark deployed based on a build, a local screenshot, or a planned URL; no cloud purchase/public publishing happens in this planning ticket.
- [ ] Keep replay/session identities isolated, with bounded forecast/evaluation concurrency, pending/error/cancel responses, and explicit restart/expired-session behavior.
- [ ] Label all data synthetic and roles as demo roles, not production authentication. Deploy no real patient data or hospital integration.
- [ ] Support a health check, backend connection feedback, and loading actual evaluation results/export through the public application boundary.
- [ ] Retain a local runnable version and real saved replays/results for network failure; recordings are supplemental, not a substitute for a functioning live app.
- [ ] Playwright MCP opens the actual deployment from a fresh browser and checks replay, received ambulance/zone state, alert, comparison, owner choice, setup/effect, evidence/export/reload, and two-session isolation.
- [ ] Record actual URL, version, machine/network context, latency, failures, and deployment evidence before checking this ticket complete.

