# PulseAhead design discovery

Status: interview closed; brief approved and build plan written. Updated 10 October 2026 (Asia/Kuala_Lumpur).

The user approved the original concept and explicitly closed the interview. This records historical discovery; latest 3D/rubric changes are in [PULSEAHEAD_3D_MVP_SPEC.md](PULSEAHEAD_3D_MVP_SPEC.md) and [PULSEAHEAD_3D_BUILD_PLAN.md](PULSEAHEAD_3D_BUILD_PLAN.md). Implementation has not started.

The user requested the `grill-with-docs` workflow: resolve decisions through interview rounds, sharpen domain language, and record agreed decisions as they emerge. That interview is complete. Round entries below preserve the history; earlier pending details are resolved by the approved brief and plan.

## Available context

- [Handover.md](Handover.md) contains the supplied Emergency Department Dynamic Queue Instability concept. Its example predictions and improvements are illustrative.
- [README.md](../README.md) names the project PulseAhead and describes its intended behavior.
- [TRACK_1_CHECKLIST.md](TRACK_1_CHECKLIST.md) records a 16-hour build window. The user confirms no actual hospital data is available: the hackathon will generate synthetic operational data, while real-hospital data and validation are future work after hospital collaboration. Delivery must fit the timeframe. Team size and fixed tools remain unspecified.
- No code, dataset, measured model results, or original organizer rules were found in the workspace.
- Organizer acceptance of a simulation-only demonstration remains unverified.

## Decision tree

This tree records the decisions resolved during the interview. Organizer acceptance is the remaining external check.

- Evidence and product claim — simulation demonstration accepted in Round 1, Q1.
  - Synthetic operational events for the hackathon accepted in Round 3, Q9; hospital collaboration and real-data validation belong to the future milestone.
  - Organizer acceptance and required evidence.
  - Recoverable sustained-congestion target accepted in Rounds 2 and 3. Default rule accepted in Round 5, Q17: no usable treatment spaces and at least six patients awaiting a space for 20 minutes; onset is the start of that interval.
  - Fictional configurable ED with 24 treatment spaces accepted in Round 4, Q12; available staffing, diagnostics, ward capacity, and transport belong to its profile.
  - Evaluation, simple comparison methods, and defensible pitch claims.
- Primary operator and decision — ED shift coordinator working with the bed manager accepted in Round 1, Q2; staff approval required for proposed actions.
  - Approve, reject, or defer with simulated consequences accepted in Round 2, Q5.
  - Defined operational action catalog accepted in Round 3, Q10; the approved brief specifies four families, approval roles, required resources, setup times, and trade-offs.
  - Four action families accepted in Round 5, Q19: eligible ward transfers, cleared discharge processing, staffed surge spaces, and diagnostic capacity.
  - Finite resource accounting accepted in Round 4, Q14; boarding occupies ED space, newly usable capacity needs staff, transfers need ward space and transport, and reallocation can constrain another pathway.
  - Required warning time and treatment of already-congested states.
  - Rank feasible actions by expected time benefit, show costs and effects on urgency groups, and distinguish prevention from recovery, accepted in Round 5, Q20. Total ED time is the main time measure, accepted in revised Q21; keep first-assessment wait, care/tests, and time from the decision to physical departure visible.
  - Demo interaction and outputs.
- Delivery constraints — deliver within the 16-hour timeframe, using AI-assisted implementation; user requests the strongest achievable result rather than an artificially restricted concept.
  - Team responsibilities, model complexity, and familiar tools.
  - Minimum demonstration and scope cuts.
  - Feasibility of the agreed evaluation and presentation.
- Domain boundaries — connected inflow, treatment/diagnostics, and discharge/admission accepted in Round 2, Q6.
  - Queue growth and sustained congestion distinguished; congestion can recover naturally or through intervention, accepted in Round 3, Q8.
  - Observed state, forecast, and intervention comparison: agree on their meanings and evidence boundaries.
  - Time-based synthetic replay with information available only at each forecast time, and shared-scenario action comparisons, accepted in Round 2, Q7.
  - Core forecasts use many plausible forward simulations, accepted in Round 5, Q18. Final approval makes a learned model optional after the required loop and evidence.
  - Acuity, disposition, and clinical clearance are supplied clinical inputs; the operational model does not decide clinical eligibility, accepted in Round 3, Q11.
  - Three supplied urgency groups with different processing requirements and patient routes accepted in Round 4, Q13. Waiting outcomes must be visible by group.
- Shared understanding — confirmed by the user's explicit approval.
  - Proceed with the 16-hour plan; do not reopen the interview for routine settings.

## Round 1 answers

1. Accepted: demonstrate an explicitly labeled simulation of ED congestion forecasting and intervention comparison. Accuracy and benefit claims are bounded by evidence actually produced. Organizer acceptance remains a separate unresolved fact.
2. Accepted: focus on the ED shift coordinator working with the bed manager, deciding which feasible flow intervention to start and when. The user adds that staff must have the opportunity to approve actions.
3. The user describes implementation as entirely AI-assisted, requires completion within the timeframe, and asks for the best achievable result without prematurely limiting ambition. This is a delivery preference, not evidence of team capacity or permission to start implementation before the interview is complete.

## Resolved terminology

The [glossary](../GLOSSARY.md) captures the agreed terms, including total ED time, building congestion, recovery, and missing-data status. Congestion and recovery defaults are agreed. [ADR 0001](adr/0001-use-forward-simulation.md) records the agreed forecast approach.

## Verified external facts

- The official [Dormathon event page](https://www.aihackerdorm.com/events/dormathon-2026-malaysia-s-nationwide-hackathon-build-the-next-big-thing) describes Track 1 as predictive models supporting earlier decisions and permits teams to choose their tools. Its agenda lists submission on 11 October 2026, 09:00–09:30 MYT. It does not state a synthetic/simulation acceptance policy. Updated on-site instructions could supersede this published agenda.
- [MIT's queueing lecture](https://web.mit.edu/1.041/www/lectures/L8-queuing-models-2026sp.pdf) distinguishes long-run stability from transient queue behavior. A short interval with arrivals above departures does not, by itself, establish mathematical instability. Inference for PulseAhead: define a finite-horizon operational congestion event instead of equating a rate crossing with irreversible collapse.
- [ACEM's ED responsibility policy, section 5.1](https://policy.acem.org.au/index.php/policies-menu/p18-responsibility-for-care-in-emergency-departments) describes admitted patients unable to transfer to inpatient care because bed capacity is unavailable. Access block should not be used as a synonym for any growing queue.
- [ACEP's boarding overview](https://www.acep.org/administration/crowding--boarding) describes patients waiting for an inpatient bed or transfer after initial ED care.

### Implementation facts checked without modification

- Bundled Python 3.12.14 and NumPy 2.3.5 execute successfully. SimPy, SciPy, scikit-learn, and FastAPI are absent from that interpreter. Bundled Node 24.19.0 and system Node 24.14.1 are available; a separate usable system Python was not verified. No dependency was installed.
- [SimPy's resource API](https://simpy.readthedocs.io/en/stable/api_reference/simpy.resources.html) supports limited concurrent users and priority queues. A resource's capacity limits active users, not the total waiting population. [Environment controls](https://simpy.readthedocs.io/en/stable/topical_guides/environments.html) support event/time progression; probabilistic sampling must be supplied by the model.
- [scikit-learn's tree documentation](https://scikit-learn.org/stable/modules/tree.html) describes simple classifier and regression alternatives. Its [calibration documentation](https://scikit-learn.org/stable/modules/calibration.html) distinguishes probability estimates from calibrated probabilities, and its [cross-validation documentation](https://scikit-learn.org/stable/modules/cross_validation.html) addresses dependent/time-related samples.
- Inference for future method decisions: repeated stochastic forecasts describe uncertainty conditional on model assumptions; new seeds from the same generator do not establish hospital validity. Related snapshots need separation by complete scenario/shift in evaluation, and a forecast with no congestion inside its horizon needs an explicit outcome.

## Round 2 answers

4. Accepted: forecast the beginning of sustained operational congestion, not bed occupancy alone or a transient increase. Usable treatment spaces must be exhausted, the waiting queue must exceed a hospital-specific threshold, and congestion must persist for a defined duration. The user suggests 15–30 minutes as an example, requests onset time, probability, and contributing factors, and wants thresholds validated against real hospital data. Exact settings and validation timing are not settled. The user's final phrase, "moment arrival rate permanently overtakes processing rate", conflicts with recoverable finite-duration episodes and needs clarification.
5. Accepted: staff can approve, reject, or defer. Approval authorizes simulated execution subject to resource availability and completion time; pending or rejected recommendations do not change operations.
6. Accepted: represent connected inflow, treatment/diagnostics, and discharge/admission stages, including cascading constraints.
7. Accepted: replay synthetic events over time using information available at each simulated forecast time, and compare continuing without intervention with an approved intervention from the same starting situation.

## Round 3 answers

8. Accepted: the target is sustained, recoverable congestion. It can clear naturally or following intervention; mathematical permanence is not required.
9. Accepted: no actual hospital data is available. Generate synthetic data to represent ED operations for the hackathon, using disclosed configurable assumptions. Collaborate with a hospital to obtain real data and validate thresholds and predictions in a future milestone.
10. Accepted: recommendations select from a defined operational action catalog containing approval roles, required resources, completion times, and potential trade-offs.
11. Accepted: acuity, disposition decisions, and medical clearance are supplied clinical inputs. PulseAhead supports operational flow decisions using those inputs.

## Round 4 answers

12. Accepted for the demo: one fictional, configurable ED, defaulting to 24 treatment spaces, with staffing, diagnostics, ward capacity, and transport specified in its profile. Counts and rates are disclosed simulation assumptions.
13. Accepted: three supplied urgency groups, different processing requirements, and routes involving diagnostics, discharge, or admission. Waiting times are reported separately by group. Numerical patient mix and service-time assumptions remain pending.
14. Accepted: enforce finite resource accounting. Boarded patients retain ED spaces; opening usable spaces requires staff; transfers require suitable ward space and transport; reallocating staff or diagnostic capacity may slow another pathway.
15. Accepted: cover normal shifts, busy shifts that recover, arrival surges, diagnostic delays, boarding blockages, mixed cascades, and cases where no available intervention helps. Generator parameters and evaluation partitions remain pending.
16. Accepted: primary benefit is patient-minutes of waiting avoided, with boarding duration, occupied ED-space minutes, urgency-specific waits, and intervention resource costs visible. Prediction accuracy and false alarms are evaluated separately. The precise waiting-time endpoint remains to be defined.

## Round 5 answers

17. Accepted: default to no usable treatment spaces and at least six patients waiting for a space for 20 minutes. The episode starts at the beginning of that interval. These remain editable demo assumptions.
18. Accepted: run many plausible futures from observed state to estimate congestion likelihood and onset range. Also evaluate a small learned risk model. Hidden replay futures are excluded.
19. Accepted: the first catalog covers eligible ward transfers, discharge processing for cleared patients, staffed surge treatment spaces, and diagnostic capacity. Approval, finite resources, delays, and trade-offs still apply.
20. Accepted: rank feasible actions by expected waiting benefit, show resource costs and each urgency group's outcomes, and label whether an action helps prevention or recovery.
21. Revised and accepted: total ED time is the main time measure. Show three parts: arrival to first assessment; first assessment to the decision to admit, discharge, or transfer; that decision to physical departure. Report each urgency group separately and keep the initial wait visible. This replaces first-assessment waiting as the sole primary endpoint; it does not change the agreed six-patient/20-minute congestion rule.

## Round 6 answers

22. Accepted: look 90 minutes ahead and update every five simulated minutes. These are editable defaults; total ED stay remains the main time measure.
23. Accepted: show "Building congestion" until the agreed congestion conditions have lasted 20 minutes, then confirm the episode with its original start time. Show recovery after fewer than three patients await a space for ten minutes. Avoid a negative countdown or counting a post-onset warning as early.
24. Accepted: five simulated minutes for staff review, followed by setup times of ten minutes for transfer coordination, ten for discharge processing, twenty for surge spaces, and fifteen for diagnostics. These are editable demo settings; required resources and actual processing/transport time still apply.
25. Accepted: show "Cannot assess" when essential queue, space, or staffing information is missing or too old, and show its last update. The exact freshness limit is proposed in the final brief.

The user requests natural, concise, simple language. Keep subsequent questions short and explain terms in plain words.

## Final review

The user accepted the recommendations in [PROJECT_BRIEF.md](PROJECT_BRIEF.md): synthetic presets and approval roles; forecast ranges and no-event reporting; fair testing, false-alert limits, and unfinished patients; the web demo; and the implementation stack.

The user added four development priorities: reliable coupled simulation, forecasts using only received information, meaningful action comparisons, and measurable evidence against simpler approaches. Action ranking must also protect urgent patients from materially worse delays even when average time improves. The plan specifies adjustable demo guardrails and keeps them separate from claims of clinical safety.

During spec preparation, the user selected Playwright MCP to test every process and perform all testing and verification. This settles the test-boundary check: browser workflows and numerical checks through Playwright MCP, using the application's shared API and exported evidence underneath.

During ticket review, the user added easy product understanding and good UI/UX as core priorities and requested both frontend and backend in the tickets. The revised spec and 16-ticket breakdown start interface foundations with the real replay, expand synthetic scenarios afterward, and include a dedicated decision-journey usability pass before the demo. Every feature retains frontend, backend, and Playwright evidence; this does not reopen the domain interview.

Do not ask another series of questions about routine settings. The approved plan documents those assumptions. Organizer acceptance of synthetic-only evidence remains an unresolved external check.

Primary-source checks found ED simulation examples in [Hurwitz et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC4059027/), [Bair et al.](https://link.springer.com/article/10.1007/s10916-009-9307-4), and [Hoot et al.](https://pubmed.ncbi.nlm.nih.gov/18387699/). They can inform disclosed synthetic assumptions about patient routes and delays; their parameters do not validate the fictional ED. Keep overall elapsed treatment time distinct from active staff work so added diagnostic waits are not counted twice.
