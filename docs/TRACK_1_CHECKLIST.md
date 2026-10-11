# Track 1 checklist — PulseAhead

Updated: 10 October 2026, Asia/Kuala_Lumpur.

The concept/interview was approved; latest 3D/rubric steering guides the [active spec](PULSEAHEAD_3D_MVP_SPEC.md), [22 tickets](PULSEAHEAD_3D_TICKET_PLAN.md), and [build checkpoints](PULSEAHEAD_3D_BUILD_PLAN.md). No implementation, dataset, deployment, measured results, or rehearsal evidence exists yet.

**Product status: Not ready — 1 of 13 items verified.** Planning is complete; the remaining items require running evidence. The [supplied checklist](Requirement_skill.md) is requirements context, not proof of organizer acceptance of synthetic data.

The user requires **Playwright MCP for all testing and verification**. Attach process-level results with expected/actual values and browser, response, or exported-artifact evidence before checking an item. A missing Playwright MCP connection or an unrun check is not a pass.

## Priority 1 — Make the prediction useful

- [x] **Problem and user:** The approved brief names sustained ED congestion and the ED shift coordinator working with the bed manager. Their decision is which feasible intervention to start and whether it can take effect before congestion. Hospital demand for this particular product remains unverified.
- [ ] **Detect:** Run a previously unseen synthetic shift using only received information. Record warnings before the agreed sustained-congestion onset.
- [ ] **Categorize:** Produce boarding, diagnostic, arrival, and capacity explanations in separate and mixed cases; tie them to the actual modeled state.
- [ ] **Prioritize:** Demonstrate ranking by feasibility, urgent-patient delay checks, total ED time saved, and resource cost. Show that a better average cannot hide material harm to urgent waits.
- [ ] **Explain:** Show the relevant queues, occupied spaces, delays, and data freshness beside each output. Explain uncertainty and distinguish model effects from proven hospital causes.
- [ ] **Recommend action:** Run six constrained presets with correct resource-owner routing, donor grants, approval/rejection/deferral, and delayed execution. Include ineffective and no-help cases; partial approval never creates capacity.

## Priority 2 — Prove it is dependable and worthwhile

- [ ] **Prediction evidence:** Save separate tuning/test shifts and results against the reactive and simple flow baselines. Report detection, false warnings, lead time, probability error, and onset-range coverage. Label all data and outputs synthetic.
- [ ] **Robustness:** Run missing/stale, delayed, duplicate, and impossible events, changed workloads, and an unannounced shock. Record validation errors, limitations, or Cannot assess as appropriate.
- [ ] **False alarms:** Include normal shifts; merge repeated warnings; choose thresholds on tuning shifts and report actual false warnings per eight-hour test shift against the proposed one-warning budget.
- [ ] **Measurable impact:** Compare matched patient demand and care requirements under no action, simple baselines, and PulseAhead. Report total ED patient-minutes, time breakdowns, urgent delays, boarding, resource use, uncertainty, and unfinished stays. Do not compare only completed departures.
- [ ] **Better-decision proof:** Show why action timing or selection changes the outcome relative to the strongest simple baseline, and show a no-help case. Claim improvement only where measured results support it.

## Priority 3 — Be ready to show it

- [ ] **Working demo:** Run the actual deployment from a fresh session: received ambulance/state → 3D alert → zone focus/details → prediction/cause → comparison → owner approval → delayed effect. Include stable/no-help/degraded-data paths. Playwright MCP checks dot/API counts, camera/back, graphics/2D/keyboard equivalence, responsive behavior, feedback, and real evidence output.
- [ ] **Pitch and Q&A:** Rehearse the supplied rubric's Phase 1 three-minute pitch/two-minute Q&A and Phase 2 four-minute demo/three-minute Q&A, subject to organizer updates. Map every equal-weight criterion to evidence. Keep actual local/saved-run fallback and evidence-backed answers on validity, false warnings, value/costs, and limits.

**Next implementation step:** follow the first simulator checkpoint in the build plan, including resource accounting and a reproducible ward-blockage case. A learned model is optional after the required simulation, comparisons, and evidence work passes.

**Open external check:** organizer acceptance of synthetic-only evidence is unverified. Keep this visible and resolve it with organizers; it does not cancel the user's approved plan. Real hospital validation and integrations are future work.
