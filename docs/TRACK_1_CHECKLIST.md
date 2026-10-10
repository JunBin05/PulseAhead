# Track 1 checklist — Hospital Failure Point

Reviewed: 10 October 2026, Asia/Kuala_Lumpur.

Scope completed: research, adversarial assessment, dataset suitability review, and a proposed 16-hour implementation/evaluation plan. The user confirmed **no existing hospital access**. The workspace initially contained only `SKILL.md`; no implementation, dataset, results, or rehearsal evidence was available.

Evidence report: [HOSPITAL_FAILURE_POINT_RESEARCH.md](HOSPITAL_FAILURE_POINT_RESEARCH.md).

**Current project status: Not ready — 1 of 13 mandatory items verified.** A design, example screen, external paper, or proposed test does not establish that our own system works. Research completion and project readiness are separate.

**Priority 1 — Make the prediction useful**

- [x] **Problem and user:** ED patients wait while admitted patients occupy treatment spaces awaiting ward transfer. The ED shift coordinator and bed manager need to decide which feasible flow intervention to begin before capacity is exhausted. Evidence: Malaysia MOH's 2025 KPI dictionary identifies prolonged bed waiting as a contributor to ED crowding; the report names the beneficiary, operator, and decision. Demand for our particular product is still unverified.
- [ ] **Detect:** No working forecast has been implemented or run. Next evidence: replay a previously unseen scenario using only information available at each forecast time; record useful warning time before a defined congestion event.
- [ ] **Categorize:** Boarding, diagnostics, and treatment-capacity categories are specified, but no system has produced them from data. Next evidence: run separate bottleneck cases and a mixed case, recording the actual output.
- [ ] **Prioritize:** Action deadline, feasibility, and expected operational benefit are proposed, but no ranked findings have been produced. Next evidence: show the order changing when action lead time or resource availability changes.
- [ ] **Explain:** Input-linked explanations and uncertainty are designed, but no explanation has been verified against an actual prediction. Next evidence: show recorded bed-state, queue, turnaround, and freshness inputs beside the output; distinguish model sensitivity from proven causation.
- [ ] **Recommend action:** A bounded, human-approved action menu is proposed. No model-driven recommendation has been executed in a demonstration. Next evidence: show a feasible recommendation, an ineffective alternative, and a case where no feasible intervention exists.

**Priority 2 — Prove it is dependable and worthwhile**

- [ ] **Prediction evidence:** Sources were researched; no team model, held-apart result, or baseline comparison exists. Next evidence: report event recall, precision, warning time, uncertainty coverage, and comparison with persistence/net-flow/static-threshold baselines on locked evaluation scenarios. Label all simulated data and results. Do not reconstruct real hospital census from independently shifted MIMIC patient dates.
- [ ] **Robustness:** No noisy/unfamiliar-input checks have been run. Next evidence: delayed/duplicate events, missing lab data, stale bed updates, unfamiliar arrival bursts, changed service-time distributions, and impossible counts; record fallback or abstention behavior.
- [ ] **False alarms:** No normal-case evaluation or alert threshold validation exists. Next evidence: normal shifts as well as incident shifts, merged alert episodes, false alerts per shift, and a threshold selected on validation data under an explicit alert budget.
- [ ] **Measurable impact:** Arithmetic examples and an evaluation design are provided, not measured benefits. Next evidence: paired scenario replay with identical demand and service requirements under the reactive baseline and proposed policy; report patient-minutes of waiting and blocked bed-minutes with uncertainty and action-resource costs. Simulation impact is not demonstrated hospital impact.
- [ ] **Better-decision proof:** A fictional POV story illustrates the proposed decision, but no evaluated intervention comparison exists. Next evidence: demonstrate why acting earlier changes the outcome, compare against the best simple actionable baseline, and show a case where the recommendation cannot help.

**Priority 3 — Be ready to show it**

- [ ] **Working demo:** No demo exists. Next evidence: run normal, developing-congestion, and degraded-data cases end to end through input, prediction, category, priority, explanation, and recommendation. A numerical output must come from the running model.
- [ ] **Pitch and Q&A:** A pitch outline and likely judge questions are prepared in the report; no rehearsal has been observed. Next evidence: time a **3-minute live presentation plus 2-minute Q&A**. If shortlisted, also rehearse **4-minute demo plus 3-minute Q&A**; that additional format is conditional, the local rehearsal is mandatory.

**Next useful action:** Confirm whether the organizer accepts a fully disclosed simulation-based predictive demonstration. The supplied checklist requires transparent synthetic labeling, but does not establish the organizer's acceptance policy. If accepted, implement the smallest queue forecast and a strong baseline before building the interface. If real operational validation is required, do not commit to this hospital project for the 16-hour event without a data partner.

**Recommendation under the user's strict requirements:** Do not proceed with the original broad hospital-collapse pitch. A narrower intervention-timing simulation is technically plausible, but its novelty, daily-life fit, hospital validity, and customer demand remain insufficiently established. No mandatory unchecked item has been waived because data or access is missing.
