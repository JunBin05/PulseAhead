# 02: Show walk-ins, critical entries, and inbound ambulances

**What to build:** An operator sees received ambulance ETAs and patient totals, then watches walk-ins pass through triage and supplied critical arrivals enter the finite resuscitation route.

**Blocked by:** 01 — Start a real four-zone 3D ED replay.

**Status:** done. Evidence: [evidence/02-triage-and-ambulance-feed.md](../../../../evidence/02-triage-and-ambulance-feed.md) (all 8 criteria pass; Playwright MCP, 2026-10-10)

**Rubric focus:** Prediction data; action context; live execution.

- [x] Add one finite regular triage desk and a declared reserve team to the fictional profile; walk-ins queue for registration/triage rather than instantly reaching assessment.
- [x] Store supplied acuity system/score, separate reporting urgency group, and critical-bypass input. The model does not assign clinical acuity.
- [x] Critical-bypass arrivals enter zone 2 directly and require an available resuscitation space within the existing ED-space pool; no unlimited extra beds or automatic stabilization.
- [x] Announcements record ambulance identity, received time, uncertain ETA, announced patient count, optional supplied acuity/critical data, freshness, and status.
- [x] The sidebar lists ETAs and separately labels inbound ambulance count and inbound patient total. Updates/cancellations/arrivals share identity and remove duplicate inbound entries.
- [x] En-route patients do not enter ED queues, bed occupancy, or total ED time before physical arrival. An overdue ETA is labeled delayed, not automatically arrived.
- [x] Expose known incoming demand separately from unannounced background arrivals for later forecasting; no hidden replay time is exposed as an ETA.
- [x] Playwright MCP checks walk-in triage, finite critical bypass, multiple patients per ambulance, ETA update/cancellation/overdue/arrival, and sidebar/API counts.

