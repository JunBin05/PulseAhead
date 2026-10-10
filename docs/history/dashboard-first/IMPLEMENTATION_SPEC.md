# PulseAhead: ED congestion forecast and action comparison

Status: local implementation spec updated with the user's product-clarity and UI/UX requirements. Frontend and backend behavior are part of every feature; Playwright MCP is required for all testing and verification. The revised ticket breakdown and tracker choice remain pending. No application code or measured results exist yet.

## Problem Statement

ED shift coordinators and bed managers need to know when a growing queue is likely to become sustained congestion, what is holding up patient flow, and which available action can help in time. Full beds or a short arrival surge alone do not answer that question.

An action can improve average ED time while making urgent patients wait longer. Staff need that trade-off visible before deciding. The hackathon has no hospital data, so the project must demonstrate its behavior with disclosed synthetic assumptions and measured comparisons within the simulation.

## Solution

Build a local dashboard for one fictional hospital with 24 regular ED treatment spaces. Model connected arrivals, care, diagnostics, discharge, and ward transfers. Forecast sustained congestion over the next 90 minutes using many possible futures from received information.

Explain the likely bottlenecks and compare four feasible operational interventions against continuing without action. Rank actions using resource eligibility, urgent-patient delay checks, expected total ED time saved, and resource cost. Staff can approve, reject, or defer. Compare the resulting policy with simple approaches and show the actual evidence and limitations.

Make that decision easy to understand from the first screen. Build the clear dashboard and real backend contract together, starting with a small labeled replay, then expand the synthetic scenarios. Good UI/UX is a core requirement alongside the simulation and evidence.

## User Stories

1. As an ED shift coordinator, I want to see the current patient queues, so that I understand where patients are waiting.
2. As an ED shift coordinator, I want to see occupied, empty, and usable treatment spaces, so that physical space is not mistaken for staffed capacity.
3. As a bed manager, I want to see boarded patients and suitable ward capacity, so that I can identify transfer constraints.
4. As a diagnostic lead, I want to see laboratory and imaging queues and turnaround, so that I can understand diagnostic delays.
5. As an operator, I want to see when each essential input was last updated, so that I know whether the forecast has usable information.
6. As an operator, I want missing or stale essential information to show Cannot assess, so that uncertainty is not presented as low risk.
7. As an operator, I want stable, building congestion, confirmed congestion, and recovery shown separately, so that brief fluctuations do not cause misleading status changes.
8. As an operator, I want a congestion chance for the next 90 minutes, so that I can decide whether to investigate or prepare.
9. As an operator, I want a predicted onset range, so that I can judge how much time remains to act.
10. As an operator, I want an explicit no-event outcome when appropriate, so that the dashboard does not invent a countdown.
11. As an operator, I want current congestion separated from a future warning, so that a late alert is not presented as early prediction.
12. As an operator, I want the main bottleneck explained using visible inputs, so that I can understand the recommendation.
13. As an operator, I want explanations to disclose uncertainty, so that model effects are not mistaken for proven hospital causes.
14. As a bed manager, I want eligible ward-transfer coordination compared with no action, so that I can decide whether to begin it.
15. As an ED shift coordinator, I want cleared-discharge processing compared with no action, so that I can decide whether extra support will help.
16. As an ED shift coordinator, I want staffed surge spaces compared with no action, so that I can weigh the benefit against reserve staff use.
17. As a diagnostic lead, I want diagnostic activation or reallocation compared with no action, so that I can see both ED benefit and donor-service costs.
18. As an operator, I want each action's approval role and required resources shown, so that I know who can authorize it and whether it is possible.
19. As an operator, I want blocked actions to show the reason, so that I do not rely on unavailable resources.
20. As an operator, I want staff review and setup time included in comparisons, so that the expected benefit reflects when an action can actually start helping.
21. As an operator, I want actions labeled as preventive or supporting recovery, so that an action after onset is not credited with prevention.
22. As an operator, I want predicted total ED time saved, so that the comparison covers the patient's whole stay.
23. As an operator, I want initial wait, care/tests time, and time awaiting departure shown separately, so that I can see where an apparent saving comes from.
24. As an operator, I want results separated by urgency, so that an improved average does not hide longer urgent-patient delays.
25. As an operator, I want materially harmful or uncertain urgent-delay results kept out of the best recommendation, so that the ranking reflects the agreed guardrails.
26. As an operator, I want a clear no-help result when no feasible action passes the checks, so that the system does not force a recommendation.
27. As an authorized staff member, I want to approve an action, so that it begins after review and setup using available resources.
28. As an authorized staff member, I want to reject an action, so that it does not change the simulation.
29. As an authorized staff member, I want to defer an action, so that I can postpone the decision and see how delay affects its benefit.
30. As an operator, I want an advanced replay or changed resource state to refresh the comparison, so that approval uses the current situation.
31. As an operator, I want active actions and resource use shown, so that reserve capacity is not double allocated.
32. As a presenter, I want scenario selection and replay controls, so that I can show how congestion develops and recovers.
33. As a presenter, I want saved runs to reproduce the same observed events and decisions, so that I can demonstrate the system reliably.
34. As a judge, I want a persistent synthetic-data label, so that I can distinguish this demonstration from hospital evidence.
35. As a judge, I want observed state, predictions, and completed replay results clearly separated, so that I know what each number represents.
36. As an evaluator, I want forecasts to use only received information, so that hidden replay events cannot create an artificial prediction advantage.
37. As an evaluator, I want matched patient demand and care requirements across action branches, so that differences come from the action rather than easier patients.
38. As an evaluator, I want separate tuning and final test shifts, so that performance is not measured on cases used to choose settings.
39. As an evaluator, I want reactive and simple-flow baselines with the same action rules and resources, so that the comparison is fair.
40. As an evaluator, I want false warnings, missed episodes, lead time, and probability error reported, so that useful warnings are distinguished from noisy alerts.
41. As an evaluator, I want unfinished patient stays retained and disclosed, so that slow departures cannot disappear from the impact calculation.
42. As an evaluator, I want changed workloads and faulty-input cases, so that I can inspect behavior beyond a selected success story.
43. As a presenter, I want exported evidence and saved replays, so that a live-demo problem does not prevent showing measured results.
44. As a project owner, I want assumptions, settings, sample counts, and limitations saved with results, so that claims can be checked and later revisited with a hospital partner.
45. As a project owner, I want every workflow and verification check exercised through Playwright MCP, so that the evidence comes from the running application.
46. As a first-time user, I want the first screen to explain what PulseAhead predicts and what I can do next, so that I can understand the product without technical knowledge.
47. As an operator, I want a clear sequence from risk to cause to action comparison to approval, so that I can make a decision without searching across screens.
48. As an operator, I want short labels, clear units, and expandable details, so that important information is easy to scan without hiding evidence.
49. As an operator, I want a consistent, readable interface on desktop, tablet, and a narrow screen, so that controls and information remain usable at different sizes.
50. As an operator using a keyboard or assistive technology, I want labeled controls, visible focus, and understandable status changes, so that I can complete the same decision flow.
51. As an operator, I want loading, missing-data, and error states to explain what is happening and how to recover, so that I do not confuse unavailable results with low risk.
52. As an operator, I want approval to show its delay, requirements, expected benefit, and urgent-patient effects before submission, so that I know what I am authorizing.
53. As an operator, I want duplicate submissions and stale responses handled consistently by the frontend and backend, so that retries cannot start a second action or show outdated results as current.
54. As a presenter, I want replay settings and evidence available without crowding the staff decision view, so that the synthetic demonstration is clear to both staff and judges.

## Implementation Decisions

### Architecture and public contract

- Use Python with SimPy for patient flow, FastAPI for the local API, and React with TypeScript for one dashboard.
- Deliver frontend and backend together in each ticket: real state and validation, a versioned API response, a usable screen/interaction, and Playwright MCP evidence. Interface design starts with the first working replay; it is not deferred until the model is finished.
- Build logical modules for scenario generation, received-event state, patient/resource flow, congestion detection, forecasting, action comparison and approval, evaluation, and dashboard display.
- Share one flow model between replay and forecast branches. Keep replay-only future data behind a separate boundary; the forecast receives a plain observed snapshot and permitted history.
- Store patient/resource state as plain data and reconstruct a fresh runner for each branch. Do not copy a running simulation environment.
- Use Playwright MCP for every testing and verification step. Exercise user workflows through the real dashboard and inspect the application's API responses and exported evidence through Playwright MCP for numerical checks. Keep one shared public application API boundary underneath these flows; do not substitute standalone API or unit-test runners for the requested tool.

| Public operation | Required behavior |
| --- | --- |
| Create/reset replay | Accept a fictional profile, scenario, and replay seed; return replay identity, time, and observed state. |
| Advance replay/read state | Progress simulated time; return received state, its version, freshness, and current congestion status. |
| Request forecast | Return observed-state version, model/settings version, forecast time, chance, onset range, and limitations; no hidden replay future fields. |
| Compare actions | Return the same starting state, no-action comparison, four action results, eligibility, delays, urgent checks, costs, and ranking. |
| Record staff choice | Accept a decision identity, action, approving demo role, choice, and comparison version; handle repeated decision identities without duplicate activation; reject stale or invalid choices or refresh before approval. |
| Run/read evaluation | Start matched-policy evaluation with disclosed settings and seed partitions; return progress, completed results, sample counts, and limitations for inspection through Playwright MCP. |
| Export/load saved run | Preserve profile, replay seed, forecast sampling settings, events, decisions, versions, and results without exposing private future data in normal observation responses. |

Results must carry their source state/version so the dashboard cannot mix a forecast with a newer replay state. Long comparisons can run separately from replay controls; show pending work and discard stale responses.

Use consistent response states and reasons for pending work, unavailable inputs, blocked actions, stale comparisons, validation errors, and failed requests. The frontend presents short messages with a recovery action; the backend remains the authority for resource eligibility, versions, and duplicate decisions. Preserve the last valid state with its timestamp when a request fails, without presenting it as fresh.

Provide controlled local test fixtures for fixed congestion boundaries, hidden-future variations, resource failures, and faulty feeds. Playwright MCP can select or load those fixtures through the application boundary. Keep test-only configuration separate from the normal staff workflow. Make event histories and evaluation artifacts available for checking calculated results; screenshots alone cannot establish numerical correctness.

### Events, patients, and resources

- Events include identity, event time, received time, patient/resource identity, and payload. Apply only events received by the current time; deduplicate and validate them. Each healthy source sends a heartbeat every five simulated minutes. Preserve source-specific timestamps: an aggregate replay heartbeat cannot make a stopped staffing, queue, or space feed fresh.
- Patients have three supplied urgency groups and a route through arrival, triage, first assessment, care/tests, supplied disposition/clearance, and physical departure. Future clinical decisions stay hidden until received. Discharge/transfer eligibility requires both the received clinical decision and completed required care/test prerequisites. A premature decision stays ineligible; the effective disposition timestamp is when both conditions hold. Operational actions cannot bypass unfinished tests.
- Save patient stage timestamps for the three mutually exclusive parts of total ED time. A decision to discharge or admit is not physical departure.
- Keep ED spaces occupied through diagnostics and boarding. Staff coverage limits usable space; clinician work, lab, imaging, ward allocation, discharge processing, and transport are finite resources.
- Separate active staff work from waiting for test results. Require clearance, a suitable ward bed, and transport for transfers; reserve a ward bed during transfer and release the ED space only at departure.
- Use urgency ordering for waiting work without interrupting work already underway. Every resource must have an owner/reservation record and balanced use/release behavior.

### Editable demo defaults

| Setting | Initial assumption |
| --- | --- |
| Regular/reserve spaces | 24 regular; four reserve spaces requiring a reserve staff team |
| Other resources | Four clinician work slots; two lab; one imaging; two discharge processing; one ward allocation; one transport team |
| Patient mix | 10% urgent, 40% medium urgency, 50% lower urgency |
| Arrivals | Time-varying normal rate averaging about six/hour, changed by scenario |
| Example task times | Active work 5–20 minutes; lab median 30; imaging median 45; discharge processing 10; ward allocation 15; transport 15 |
| Warm-up and scoring | Two-hour warm-up; eight-hour scored shifts |
| Essential-data age limit | Ten simulated minutes |

These are simulation assumptions, not hospital staffing ratios or validated clinical thresholds. Sample positive, varied times and routes conditional on urgency. Record concrete ward pool, bed-release, staff-coverage, and route settings with each run rather than leaving resources unlimited.

Cover normal shifts, busy shifts that recover, arrival surges, diagnostic delays, boarding blockages, mixed cascades, and no-effective-action cases. Unannounced scenario changes become known to forecasts only through received inputs.

### Congestion and forecasting

- Confirm congestion when zero available staffed spaces and at least six patients awaiting a space persist for 20 minutes. Available staffed spaces means empty treatment spaces with staff and required resources available to accept a patient; display it separately from total staffed capacity and occupied spaces. Store onset at the beginning of that interval and confirmation at its end.
- Show Building congestion before confirmation. Clear an episode after fewer than three patients await a space for ten minutes. Recovery does not also require an empty treatment space.
- Forecast every five simulated minutes across 90 minutes, plus a 20-minute tail to confirm late-window onsets. Carry the observed history of an interval already underway.
- Sample arrivals, remaining work, and ward availability from observed state and disclosed assumptions. Remaining work accounts for elapsed task time. Forecast random seeds are independent of replay seeds and hidden completion values.
- Start with 50 future samples and compare with 100 at development checkpoints. Target two seconds for a forecast and five for an action comparison on the demo machine; measure these limits.
- Report the fraction of futures with a qualifying new onset. Use a conditional 90% onset range for futures with an event; retain the no-event fraction and sample count. Report no sampled onset explicitly when applicable.
- For an interval already building, separately return the fraction of futures in which that same interval reaches confirmation. Show Building congestion — X% chance of confirmation, its elapsed duration, and no future-onset countdown for that interval. Confirmed congestion shows its current status and recovery comparison, rather than a new-onset risk as its main number.
- Do not use negative countdowns or count a warning during an already-started interval as warning before onset. Missing/stale essential data yields Cannot assess and no actionable ranking.
- Explain modeled constraints using received inputs and, where useful, a comparison that relaxes one constraint. Avoid claims of proven hospital causation.

### Operational action catalog and approval

| Action | Role | Setup after review | Initial effect |
| --- | --- | --- | --- |
| Coordinate eligible ward transfers | Bed manager | 10 minutes | Add one ward-allocation slot using a reserve coordinator. |
| Accelerate cleared discharge processing | Shift coordinator | 10 minutes | Add one discharge-processing slot using reserve support. |
| Activate staffed surge spaces | Shift coordinator | 20 minutes | Activate four reserve spaces and their staff coverage. |
| Activate/reallocate diagnostics | Diagnostic lead | 15 minutes | Add one lab/imaging slot from reserve capacity, or move capacity from a declared donor service. |

- Opening comparison/review pauses the demo replay and shows the source simulated time. Preserve the chosen action if relevant state changes, disable approval, and offer Refresh comparison. Leaving review does not silently resume replay. A successful approval may resume replay explicitly to show its effect.
- Staff approval records authorization; it then enters a five-simulated-minute review delay followed by the action's setup delay. Time spent reading a paused screen does not consume that delay. Deferral authorizes nothing, reserves nothing, and requires a fresh comparison when revisited.
- Use the shared lifecycle review → setup → active → draining → completed, with blocked/cancelled terminal outcomes. Atomically accept only one action in review, setup, active, or draining at a time; concurrent distinct approvals cannot both succeed. Reserve its activation inputs at acceptance without changing usable capacity. Reserve patient-specific ward beds only when a transfer can begin.
- Recheck received information, clinical prerequisites, resources, comparison version, and timing at acceptance. PulseAhead's evaluated policy also requires the valid Best action benefit/urgent checks; fixed-choice baselines do not inherit that predictive gate. Human demo choices show the comparison's cautions without treating a staff choice as an automatic policy recommendation. Recheck eligibility and reservations at the end of review and before activation. Lost requirements block the action, release unused reservations, and explain the reason; setup never creates an early effect.
- The 60-minute active window starts when setup completes and capacity actually changes. Enforce a minimum 20 simulated minutes between activation starts. On expiry, stop assigning new work to the extra capacity; occupied work/spaces enter draining and retain resources until released. Apply identical limits and budgets to every evaluated policy. Rejected, deferred, blocked, review, and setup states have no capacity effect.
- Do not create inpatient beds through coordination, make clinical clearance through operational actions, or double allocate reserves. Record donor-service effects for reallocation.
- When an activation ends, finish active tasks and close surge spaces as they become vacant. Charge resource time until actual release; do not evict patients.
- Show whether review/setup finishes early enough to support prevention or whether the action is expected to help recovery instead.

### Comparison, ranking, and total ED time

- Compare actions and no action from one observed snapshot. Pair the independent forecast futures across branches using patient/task-keyed random values, so changed event order does not change patient care requirements.
- Rank by feasibility, urgent-patient delay checks, supported positive total ED time saved, then resource cost. Keep no action as the reference. Best action requires the lower end of the paired 90% uncertainty interval for mean total patient-minutes saved to be greater than zero. Zero/negative or unclear savings cannot win: show No action shown to help or Needs review with the reason.
- For each paired future, calculate the action-minus-no-action difference in urgent p90 initial wait, urgent p90 total ED time, and the count of urgent patients whose initial wait exceeds 15 simulated minutes. Use identical patients in each pair and nearest-rank p90. Include every complete future with any urgent patients in the p90-change calculation; a one-patient p90 is that patient's value and cannot be discarded. Use all complete futures for overdue-count changes, including zero counts in empty urgent cohorts. Empty cohorts have no p90 and their exclusion from that metric is visible.
- As an additional evidence gate, at least 20 paired futures must each contain at least two urgent cohort patients with complete outcomes; otherwise show Needs review. This gate never permits dropping singleton harm from the calculation. Disclose that a two-patient p90 is the maximum and has limited information. Any incomplete comparison branch prevents a Best action claim. Do not alter the patient mix to pass the gate.
- Calculate uncertainty by resampling whole paired future runs 1,000 times with a recorded independent bootstrap seed; use the 5th and 95th percentiles of the resampled mean paired changes. Never count repeated patients across futures as independent observations. These intervals describe simulation sampling uncertainty conditional on the model, not hospital confidence. Report total futures, eligible futures, urgent counts, and excluded/incomplete counts.
- Best action requires the upper interval bound to be at most five simulated minutes for both urgent p90 changes and at most zero for the overdue-urgent count change. This is an absolute count difference, not a percentage. Unclear or insufficient evidence is Needs review; an established breach is Urgent delay check failed. The five-/15-minute values and minimum sample rule are fictional demo assumptions, not clinical limits.
- Diagnostic reallocation must also pass the same donor-service urgent p90 diagnostic-wait change (five-minute limit) and count-above-15-minute diagnostic-wait check, with the same paired sampling rules. Preserve donor urgency and patient/task records. Missing donor evidence prevents a Best action label; reserve activation does not need a donor check. These checks measure modeled delay, not medical outcomes or proven clinical safety.
- Use the same comparison cohort: patients present at the decision plus sampled arrivals during the next 90 minutes. Continue background arrivals during follow-up. Cap follow-up at 12 hours; show accrued time and unfinished counts if departure is incomplete, without claiming complete ED-time savings or ranking best on that basis.
- Calculate total ED time from arrival to physical departure. Show initial wait, care/tests time, time awaiting departure, boarding, occupied ED-space minutes, and resource use separately.

### Dashboard and evidence

- Keep a persistent Synthetic demo banner. Separate current state, forecast estimates, and completed replay results.
- Use a clear primary journey: current status and forecast → why congestion may happen → compare feasible actions → review and approve/reject/defer. Give the first screen a short purpose statement and an obvious next step.
- Give the main view a small set of readable summaries: congestion chance, expected start, patients waiting for a treatment space, and available staffed spaces. Show the cause and next action nearby; put secondary metrics in expandable details.
- Use plain labels such as Congestion chance, Expected start, Why this may happen, and Compare actions. Explain ED once as emergency department. Explain conditional onset ranges and missing results with short help text rather than technical jargon.
- Build a consistent visual system: calm light surfaces, readable system fonts, shared spacing and components, and distinct text/icon status labels. Status cannot depend on color alone; charts include units, legends, and text/table alternatives.
- Put detailed scenario settings, seeds, distributions, and evaluation controls in a separate demo/evidence panel. Keep synthetic labeling visible in the staff view.
- Keep loading layouts stable, show pending/retry feedback, provide useful empty/error states, and distinguish Cannot assess from a valid low-risk forecast. Disable duplicate submissions in the UI and enforce the same decision identity in the backend.
- Before approval, show the action, approving role, review/setup delay, required resources, benefit range, urgent-patient effects, and costs. After submission, show the actual pending/active/completed/blocked state and simulated timestamps.
- Show the next step from both current state and forecast: stable with risk at/above the locked warning threshold → compare preventive actions; stable below it → monitor; building → compare actions with timing shown; confirmed → compare recovery actions; Cannot assess → inspect missing/stale inputs; blocked/no help → inspect the limiting reason; action underway → monitor its progress. Use Simulated minutes on forecast and action delays, and Urgent delay check on comparison cards.
- Review dialogs move focus inside, keep keyboard navigation within the open dialog, close on Escape/cancel without submitting, and return focus to the opening control. Announce important status changes in a readable status region without announcing every replay tick.
- Support keyboard operation, visible focus, labeled controls, readable text, and reduced motion. Target at least 4.5:1 normal-text contrast and 44-pixel primary control targets. Playwright MCP must check the implemented values and behavior.
- Keep the primary journey usable at 375, 768, 1024, and 1440 pixels without page-level horizontal scrolling. Details may collapse or reorder, while status and staff choices remain accessible.
- Show current resources/freshness; congestion chance, range, and explanation; four action cards and approval controls; and a no-action versus selected-action result chart/table.
- Visualize current patient flow with mutually exclusive Waiting for assessment → Care and tests → Awaiting departure stages. Patients waiting for a space are a subset of the first stage; diagnostic/boarding details are nested, not extra patient totals. Link a stage's bottleneck explanation to the relevant action cards.
- Use one timeline with a visible Now boundary and distinct observed/forecast series. Compare no action with one selected action on identical axes; keep conditional onset ranges separate from queue uncertainty. Queue-threshold crossing alone cannot establish congestion without the space/duration conditions. Compare complete-cohort ED time using horizontal three-part bars with a table alternative; unfinished cohorts show accrued time/counts instead of complete savings. Display urgent effects and costs beside benefit.
- Provide scenario selection, play/pause, speed, reset, and saved replay loading. Use explanations derived from computed fields; an LLM layer is optional beyond this spec's required scope.
- Evaluate no action, a reactive rule, a recent-arrivals/departures flow forecast, and PulseAhead. Baselines use fixed bottleneck-action rules and the same resources, eligibility, review/setup delays, durations, and cooldowns.
- Keep development, tuning, and final test shifts separate. Aim for two tuning seeds and four test seeds for each scenario family, plus changed workload/service assumptions. Record actual sample counts if compute limits reduce the set.
- Choose warning thresholds on tuning shifts only, starting with probabilities 0.4, 0.6, and 0.8. Aim for at most one false warning per scored eight-hour shift. Follow the fixed baseline and scoring rules below.
- Score forecasts on no-action shifts; score intervention policies separately on matched underlying demand and clinical requirements. Evaluation replay values remain inaccessible to forecast code.
- Record detected/missed episodes, false warnings, lead time, squared probability error, and onset-range coverage. An actionable warning allows review, setup, and five extra minutes: 20 minutes for ward/discharge actions, 30 for surge spaces, and 25 for diagnostics.
- Compare total ED patient-minutes, mean and median stays, urgency-specific 90th percentiles, boarding, and resource costs with uncertainty. Follow the same scored arrival cohort with continuing background arrivals for up to 12 hours after the scored window; keep capped or blocked stays visible rather than averaging completed patients only. Background patients affect resources but do not enter the scored cohort. Do not stop arrivals to create artificial recovery.

### Fixed baseline and evaluation rules

- All policies consider an action at five-simulated-minute decision checkpoints, with no new decision while an action is underway. No action never activates capacity. Reactive warns/acts when available staffed spaces are zero and at least six await a space, without waiting for the 20-minute confirmation.
- PulseAhead's evaluation policy compares actions when new-onset probability reaches the locked threshold while stable, confirmation probability reaches it while building, or congestion is confirmed. A simulated staff response approves only a currently valid Best action through the same five-minute review and setup lifecycle. Needs review, failed checks, no-help, or Cannot assess produce no automatic action. This evaluation response does not remove real staff choices from the dashboard.
- The simple-flow baseline uses received arrivals and physical ED departures during the preceding 30 simulated minutes. Express rates per minute. If arrivals exceed departures, predict queue-threshold onset after `(available staffed spaces + max(0, 6 - queue)) / (arrival rate - departure rate)` minutes, assuming those rates persist through confirmation. Warn if that time is within 90 minutes; otherwise predict no new onset. Current building/confirmed intervals are labeled separately. Missing history or essential feeds yields Cannot assess, not zero risk.
- Fixed action choice orders bottlenecks with positive queue counts by the number of ED patients waiting at ward allocation, cleared discharge processing, diagnostics, and awaiting treatment space. Break equal counts in that order. Choose the corresponding feasible action; diagnostics prefers reserve activation over reallocation. Skip unavailable actions, then choose no action if none remain. All policies keep clinical eligibility and urgency queue rules. Baselines use these fixed choices without PulseAhead's predictive urgent filter; disclose that distinction and report their urgent-delay results. This compares complete policies rather than pretending they share the same predictor.
- Tune the simple history window from 15/30/60 minutes and each warning threshold only on tuning shifts. For warning settings, maximize early episode recall subject to the false-warning budget, then median lead time; tie-break with fewer false warnings and the documented default. If none meet the budget, select the fewest false warnings, then recall, and disclose the failure. Select the strongest simple action policy on tuning results by complete total ED patient-minutes saved; tie-break with lower urgent delays, then resource use. Incomplete results cannot establish a winner. Freeze this selection before final tests and still report every policy.
- Merge repeated warnings until below threshold for ten continuous simulated minutes. A warning episode retains its first timestamp and original 90-minute horizon; later updates do not extend it for credit. Match warnings chronologically one-to-one to the earliest unmatched qualifying onset after that first timestamp and within its horizon. One warning cannot earn credit for two congestion episodes. Warnings issued during a building/confirmed interval are late/current warnings, not early detections. Unmatched early warnings are false; keep unmatched, late, and ineligible records visible.
- Episode recall includes only qualifying onsets inside the eight-hour scored window. Warning issuance is scored inside that window, but truth replay continues with normal background demand for at least 110 minutes beyond its end, so near-end warnings and confirmations are not truncated. Warm-up warnings do not earn scored early-detection credit.
- At each eligible five-minute snapshot with no building/confirmed interval, probability error is `(forecast probability - new-onset indicator)^2`, where the indicator is one if any qualifying onset begins in the next 90 minutes. Report the mean and denominator. Score building-interval confirmation probability separately against whether that current interval confirms. Conditional onset-range coverage uses the first qualifying future onset only among snapshots with an observed onset and a returned range; report excluded/no-range cases and their counts rather than hiding them.
- Benchmark one complete development shift and action comparison through Playwright MCP before locking evaluation size. Aim for 14 tuning and 28 test shifts; if time requires, predeclare a balanced fallback of seven tuning and seven final shifts, one per family in each separate set. Save selected shift identities and workload variants before final results. Choose by the measured run budget, never favorable outcomes; smaller evidence carries wider limits. Record the full run estimate, actual runtime, and any sample-count reduction.
- Policy-result uncertainty resamples whole matched shift pairs 1,000 times using a recorded seed and reports 5th/95th percentiles of the mean paired change. Resample within scenario family and keep the same family weights; do not treat patients or neighboring snapshots as independent shifts. With one final shift per family, report family outcomes descriptively and the overall paired mean without an estimable within-family uncertainty interval. State that the seven-shift fallback cannot establish within-family variability; do not invent precision from patient counts.

## Testing Decisions

The user requires **Playwright MCP for all testing and verification**. Drive every process through the running application: scenario setup, replay, forecasts, each intervention, staff decisions, evaluation, export, and reload. Inspect actual UI state, application responses, event histories, and result artifacts through Playwright MCP. Use controlled simulated time rather than long real-time waits.

A good test checks externally visible behavior using known fixtures or independently calculated expectations. It does not depend on internal class names, scheduler internals, helper calls, or component structure. Do not mock the engine in end-to-end checks or treat a screenshot of a number as proof that its calculation is correct.

There are no existing tests or implementation seams to reuse. The approved plan's replay cases provide the starting scenarios. Retain one public application API boundary beneath the browser flows. When a detail is not visible on screen, inspect the real response or exported run through Playwright MCP rather than introducing a separate test runner.

Required behavior checks:

| Process | Playwright MCP verification |
| --- | --- |
| Coupled patient flow | Replay a ward blockage; inspect event history and resource responses to confirm retained ED spaces, upstream queue growth, balanced patient counts, and no double allocation. |
| Congestion and recovery | Advance fixed fixtures just before and at the 20-minute confirmation and ten-minute recovery boundaries; check original onset and late-horizon confirmation. |
| Forecast isolation | Load two fixtures with identical received state but different hidden futures, request fresh forecasts with identical independent forecast settings, and compare responses. Check observation responses for private future fields. |
| All four interventions | Exercise each family's useful, blocked, and ineffective cases; inspect setup timing, real capacity changes, transport/clearance requirements, and donor-service costs. |
| Staff decisions | Approve, reject, and defer; verify paused review/source time, stale selections, concurrent distinct approvals, and resource loss during setup. Step through lifecycle boundaries and confirm only valid, ready approvals have an effect. |
| Activation limits | Attempt overlapping reserve use, advance through activation expiry, and confirm occupied surge spaces remain until departure and resource costs continue until release. |
| Paired comparisons | Inspect exported cohort/task records across branches; confirm identical demand and care requirements despite changed scheduling. |
| Urgent-delay ranking | Check known pass/harm/insufficient-evidence calculations, ED and donor urgent harm, and four feasible actions with no supported positive benefit. Inspect paired bootstrap units, sample counts, and no-help outcomes. |
| Total ED time | Independently recompute arrival-to-departure and the three-part breakdown from exported timestamps through Playwright MCP; confirm boarding and unfinished stays remain visible. |
| Faulty information | Load duplicate, delayed, missing, stale, and impossible events; inspect deduplication, validation errors, limitations, and Cannot assess. |
| Baseline evaluation | Start the real evaluation through the application; inspect locked seed/settings partitions, matched cohorts and action budgets, warning matching, false-alarm counts, and exported benefits. Recompute representative metrics through Playwright MCP. |
| Dashboard controls | Exercise scenario selection, play/pause, speed, reset, refreshed comparisons, exports, and reload; check synthetic labels, pending states, errors, and displayed results. |
| Product clarity and UI/UX | Complete the risk → cause → compare → review → staff-choice journey at the target widths and by keyboard. Check labels, units, focus, dialog behavior, contrast, primary target sizes, loading/empty/error/retry states, and chart alternatives. |
| Frontend/backend agreement | Delay requests, return stale versions, disconnect/reconnect the backend, and repeat an approval identity. Check that the UI preserves truthful freshness, offers recovery, and cannot produce duplicate activation. |
| Performance and fallback | Measure forecast/comparison response times through Playwright MCP; reload the app from a fresh session and load saved replays/results. Record actual performance. |

Record a Playwright MCP pass, fail, or not-run result for every process, together with fixture/settings identity, expected and actual values, and relevant screenshots or response/artifact evidence. A failed or unrun check stays open in the evidence checklist. Verify tool availability before testing; if Playwright MCP is unavailable, report the missing connection rather than silently switching tools or claiming verification.

Passing automated behavior checks is separate from establishing forecast quality or policy benefit. Report measured comparisons, including failures, rather than asserting that tests prove hospital performance.

Usability checks establish specific implemented behaviors; they do not prove a flawless experience or validated staff comprehension. Keep any actual human feedback separate from automated results.

## Out of Scope

- Real patient data, hospital integration, real-time operational deployment, and validated hospital thresholds.
- Autonomous triage, diagnosis, admission decisions, discharge clearance, or medical treatment recommendations.
- Claims about mortality, clinical outcomes, or proven clinical safety from modeled delays.
- Multiple hospitals, action combinations, authentication, a production database, public hosting, or a production authorization system. Approval roles are demo inputs.
- Sophisticated machine learning, an LLM explanation layer, extra screens, and decorative features before the required simulation and evidence pass.

## Further Notes

- The user approved the concept and ended the interview. This spec synthesizes that scope; it does not reopen requirements discovery.
- The agreed architecture decision is to use forward simulation for forecasting and action comparison. A learned challenger is optional after the required loop and evidence pass.
- Preserve the 16-hour order: setup/simulation through hour four; forecast through six; actions through nine; dashboard through eleven; evaluation through fourteen; freeze, fallback, and rehearsal through sixteen.
- Organizer acceptance of synthetic-only evidence remains unresolved. The team should confirm it externally; it is not established by the supplied requirements checklist.
- Rehearse the supplied three-minute presentation plus two-minute Q&A, subject to updated organizer instructions. The supplied shortlisted format is conditional.
- Real data calibration and prospective hospital evaluation belong to a future hospital partnership. All hackathon claims must stay within the measured synthetic evidence.
- The user settled the testing choice: use Playwright MCP for every process and verification step. The earlier test-boundary question is closed.
- The user added easy product understanding and good UI/UX as core requirements, and explicitly requested both frontend and backend in the tickets. The revised breakdown contains 16 complete feature tickets, including interface foundations in the first ticket and a dedicated usability pass before the final demo.
- Three agents reviewed spec coverage, product clarity, and simulation/evidence rules. Their fixes were incorporated and rechecked; all 54 user stories remain covered by the 16 tickets. This document review does not establish implemented behavior or measured benefit.
- Publish to the configured project issue tracker with the ready-for-agent label once tracker setup is available. The local spec is complete; publication is pending.
