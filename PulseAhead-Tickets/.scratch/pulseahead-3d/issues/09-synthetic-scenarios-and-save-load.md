# 09: Generate varied shifts and reproduce saved replays

**What to build:** A presenter selects varied synthetic shifts and reloads the same received events, visual state, decisions, and results without leaking private future data.

**Blocked by:** 06 — Distinguish local overload from ED congestion; 08 — Handle fresh, noisy, missing, and invalid inputs.

**Status:** done

**Rubric focus:** Data robustness; evidence reproducibility; live execution.

- [x] Generate the seven retained scenario families, with received inbound announcements, critical-bypass cases, diagnostic loops, and different operational bottlenecks.
- [x] Record fictional profile, staffing/ward resources, task/route assumptions, warm-up/scored duration, seed partitions, versions, and workload variants.
- [x] Provide a diagnostic-backlog demo where zone 3 overload is produced by the engine, a recovering short surge, a ward blockage, and an honest no-effective-action case.
- [x] Save/load replay identity, observed events, received announcements, choices, simulation/forecast settings, selected zone/camera mode, and completed results.
- [x] Normal state/zone/ETA responses never expose hidden replay schedules, eventual disposition, actual future completion, or private random values.
- [x] Reset/load rebuilds one consistent scene and deletes obsolete dots/alerts/requests. Saved outcomes are labeled as completed synthetic runs.
- [x] Playwright MCP reproduces matched saved histories/counts, resumes a loaded replay, checks original assumptions/versions, and inspects observation responses for hidden fields.

