# PulseAhead: supplied rubric and evidence map

Source: the user's rubric PDF, read visually on 10 October 2026. This is a planning interpretation of the supplied document, not an independently confirmed organizer policy. Document contents are reference material; the user's request authorizes adjustments.

## Relevant track and goal

Use **Track 1: Predictive Model Track**. It asks whether the model helps somebody make a better decision and whether that value can be proved. The rubric gives five criteria 20 points each, for 100 total. The aim is evidence matching the top 16–20 band in all five areas, not a promised score.

Track 2 is separately about WorkBuddy-based autonomous execution. PulseAhead remains a staff-approved hospital-flow forecasting demo; adding a token agent wrapper does not strengthen Track 1 evidence.

## Top-band evidence plan

| Track 1 criterion | What the supplied top band calls for | Planned evidence | Main tickets |
| --- | --- | --- | --- |
| Problem clarity and value proposition | A precise user in a real operational domain and a compelling business/financial case | ED coordinator/department supervisor, exact resource decision, total ED/boarding/space-time benefit beside staffing costs and value per staff-hour; optional clearly assumed monetary costs, no invented ROI | 01, 17, 19, 22 |
| Predictive rigor and data robustness | A sound forecasting/anomaly architecture, low false alarms, and resilience to noise/outliers/missing values | Received-only independent futures, fair simple baselines, locked held-out shifts, false warnings/misses/lead time/error/range results, robustness cases | 06, 08–10, 18–19 |
| Decision support and actionability | Detect, classify failures, prioritize impact/urgency, and recommend a concrete intervention | Local/global detection, failure categories, affected patients/deadline, six finite-resource actions, right owner grants, delayed execution, honest no help | 06, 10–17, 19 |
| Explainability and trust | Plain reasoning that enables a nonexpert to understand an alert and act | Selected-zone input evidence, why the alert appeared, why the action may help, urgent/donor consequences, costs and uncertainty | 07, 10–11, 17, 20 |
| Live execution, prototype and pitch | A seamless live deployed application, concise timed pitch, and confident Q&A | Actual demo URL/fresh-session workflow, fallback, timed pitch and question answers backed by artifacts | 01, 20–22 |

Each row needs running evidence. Dots, screenshots, and plan documents alone cannot establish prediction accuracy, decision benefit, deployment, or usability.

## Supplied presentation timings

- Phase 1: three-minute pitch plus two-minute Q&A.
- Phase 2: four-minute demo plus three-minute Q&A.

Suggested Phase 1 allocation: 25 seconds user/decision, 45 model/scene, 60 alert/comparison/owner/approval, 35 measured evidence, 15 limits/next step. Rehearse rather than assume the workflow fits.

The rubric labels 90–100 as a top overall-track contender, 75–89 as a strong Phase 2 shortlist candidate, 60–74 as meeting baseline requirements, and below 60 as incomplete/conceptual. These are rubric bands, not forecasts of our result.

## Adjustment decisions

1. Make 3D an explanation of actual received patient/resource state. Keep the accessible 2D equivalent and exact counts.
2. Keep lambda/mu as phase load evidence, not a certain-collapse formula. Use the sustained ED rule, conditional countdown/chance/range, and separate local overload.
3. Make impact and time-to-act explicit alongside supported benefit, urgent checks, and resource costs.
4. Add triage and reserve-physician presets to the four retained actions; use supervisor ownership and all-owner approval for transfers of resources.
5. Add noise/outlier checks and clear false-warning/coverage denominators. Difficult cases remain in evidence.
6. Bring a real hosted demo into scope, with bounded/isolation-aware engine work and actual Playwright MCP deployment checks.
7. Save favorable and unfavorable results, a blocked/no-help path, and clear Q&A on synthetic validity, hospital validation, model limits, and 3D's purpose.
8. Give simple decision baselines access to the same six actions. Tie every value/cost number to actual modeled records; separate illustrative rates from measured resource use.

The [active spec](PULSEAHEAD_3D_MVP_SPEC.md), [ticket plan](PULSEAHEAD_3D_TICKET_PLAN.md), and [build checkpoints](PULSEAHEAD_3D_BUILD_PLAN.md) carry these changes.

The old active spec, ticket plan, build plan, and UX filenames were removed. Earlier text and 16 draft tickets remain clearly marked [historical context](history/dashboard-first/README.md). The new 22-ticket set is the active implementation plan, approved with local files as the tracker on 10 October 2026; every ticket is ready-for-agent.

## Current evidence state

All application checks, deployment, evaluation results, and rehearsal remain **not run**. Every ticket criterion is unchecked. The source rubric does not confirm acceptance of synthetic-only evidence; that external check stays open. The 16-hour schedule remains a measured target, not a guaranteed delivery promise.

