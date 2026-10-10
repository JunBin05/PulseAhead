# PulseAhead: rubric-aligned 3D operational digital twin MVP

Status: ready-for-agent. The user approved the 22-ticket breakdown and local-file tracker on 10 October 2026. This active spec incorporates the user's 3D proposal, handwritten wireframe, and supplied judging rubric; previous context is historical. No application code, deployment, or measured results exist yet. All application testing and verification remains through Playwright MCP.

## Problem Statement

ED shift coordinators and bed managers need to know when a growing queue is likely to become sustained congestion, what is holding up patient flow, and which available action can help in time. Full beds or a short arrival surge alone do not answer that question.

An action can improve average ED time while making urgent patients wait longer. Staff need that trade-off visible before deciding. The hackathon has no hospital data, so the project must demonstrate its behavior with disclosed synthetic assumptions and measured comparisons within the simulation.

The business decision is concrete: which available resource should the responsible supervisor activate now, can it help before congestion begins, and is the predicted ED-time saving worth its staff/space cost? Report time, boarding, and resource use in operational units; do not claim hospital revenue, clinical outcomes, or validated ROI from synthetic results.

## Solution

Build an interactive 3D operational digital twin for one fictional hospital with 24 regular ED treatment spaces. Show patient dots moving through four labeled zones: Arrival and triage, Doctor assessment, Diagnostics and testing, and Disposition. Include separate home and Ward/ICU exits and a received en-route ambulance feed. The model runs on synthetic data; the scene is a live view of received simulation state.

Clicking a zone opens its patients, staff, queues, and capacity. Clicking an alert focuses the camera and opens its prediction, cause, and ranked operational actions. Route approval to the supervisor who owns the required resources. Staff can approve, reject, or defer, then watch setup and changes in patient flow. Compare six concrete MVP action presets against no action, using resource eligibility, urgent-delay checks, supported total ED time savings, and costs.

Keep one obvious journey: Start simulation → spot a building queue → select its alert → compare actions → review with the right supervisor → watch the result. Retain the earlier forecast isolation, resource accounting, synthetic disclosure, and baseline evidence. The 3D view is now required, with a matching accessible 2D view for unsupported graphics or reduced motion.

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
55. As a first-time user, I want four numbered 3D zones with readable names and paths, so that I understand the ED journey immediately.
56. As an operator, I want each patient dot to follow received simulation events, so that animation cannot invent progress or departures.
57. As an operator, I want queued dots to gather at a blocked zone, so that I can see where flow is slowing.
58. As an operator, I want home and Ward/ICU exits shown separately, so that I understand the destination and its constraints.
59. As an operator, I want an en-route ambulance list with ETAs and patient totals, so that announced inbound demand is visible before arrival.
60. As an operator, I want ETA updates and cancellations handled, so that incoming patients are not counted twice or treated as certain.
61. As an operator, I want walk-ins and supplied critical arrivals to use their correct entry paths, so that critical arrivals can bypass registration without bypassing finite resuscitation resources.
62. As an operator, I want received acuity scores and separate reporting groups shown, so that the model does not invent triage decisions.
63. As an operator, I want normal-zone details with patients, assigned doctors/nurses, and bed use, so that I can inspect a zone without an alert.
64. As an operator, I want one-click alert focus and Back to overview, so that I can investigate congestion and return without losing context.
65. As an operator, I want local zone overload distinguished from overall ED congestion, so that a diagnostic delay does not falsely declare the entire ED collapsed.
66. As an operator, I want incoming work and service capacity shown in matching units, so that a load warning has a clear meaning.
67. As an operator, I want an estimated time to congestion with chance and range, so that a countdown does not promise a certain collapse.
68. As an operator, I want the selected alert linked to a plain-language cause and actions, so that I know why that zone matters.
69. As a triage charge nurse, I want to compare an extra staffed triage desk, so that I can address a triage backlog when reserve staff exist.
70. As an ED attending lead, I want to compare a reserve physician slot, so that I can address assessment work without pretending it creates a bed.
71. As a supervisor, I want approvals routed from resource ownership rather than the selected zone, so that a lab alert cannot authorize somebody else's ward resources.
72. As a supervisor, I want multi-owner actions to require all relevant approvals, so that donor resources cannot be taken with only the receiving department's consent.
73. As a command-center operator, I want blocked cross-department requests recorded for escalation, so that unresolved requests remain visible without inventing capacity.
74. As a keyboard user, I want zone buttons and a 2D equivalent, so that the same details and approvals are available without manipulating a 3D camera.
75. As an operator, I want reduced-motion and low-graphics modes, so that the visualization stays readable and usable on my device.
76. As a presenter, I want a saved diagnostic-blockage replay with camera and action state, so that the wireframe's main story can be demonstrated from a clean start.
77. As an evaluator, I want dot counts, zone details, API state, and exported events to agree, so that a persuasive scene still represents the actual model.
78. As a judge, I want to see the precise operator, decision, and operational value, so that the problem is more concrete than a general hospital animation.
79. As a supervisor, I want alerts prioritized by impact and time available to act, so that I can address the most consequential constraint first.
80. As an evaluator, I want realistic noise, outliers, and missing inputs tested, so that low false alarms are demonstrated rather than claimed.
81. As a nontechnical user, I want each alert to explain why it appeared, why an action helps, and what could worsen, so that I can make a reasoned choice.
82. As a judge, I want a deployed synthetic application that runs the complete workflow, so that the result is more than a local screenshot or recording.
83. As a presenter, I want a timed pitch and evidence-based Q&A, so that the demonstration fits the supplied judging format.

## Implementation Decisions

### Architecture and public contract

- Use Python/SimPy for flow, FastAPI for the local API, and React/TypeScript with Three.js and React Three Fiber for the 3D view. Pair stable compatible React/renderer versions; avoid alpha features. Official renderer documentation describes this relationship and compatibility requirements: [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction).
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
| Compare actions | Return the same starting state, no-action comparison, six catalog results, eligibility, delays, urgent checks, resource owners, approval requirements, costs, and ranking. |
| Read zone/inbound state | Return zone patients, logical phase, bed reservations, assigned staff identities, queues, pressure reasons, and received ambulance announcements with independent freshness. |
| Route/record staff choice | Create a versioned approval request from action resource owners; accept per-owner decision identities, action, demo role, choice, and comparison version. Prevent duplicate or partial activation; reject stale, wrong-owner, or invalid choices. |
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

### Four phases and the scene's meaning

| Zone | Modeled work | Important rule |
| --- | --- | --- |
| 1 Arrival and triage | Walk-in registration and a finite triage desk | Acuity is a supplied ESI/CTAS 1–5 input, with the chosen scoring system labeled; the AI does not assign it. |
| 2 Doctor assessment | First assessment, stabilization tasks, result review | Supplied critical arrivals bypass registration to a reserved resuscitation space within the 24-space pool; no unlimited critical bay. |
| 3 Diagnostics and testing | Finite lab/imaging work and results | Only patients needing tests enter this logical phase; they retain their ED bed. Results return to the clinician in zone 2 before disposition. |
| 4 Disposition | Supplied effective decision, cleared discharge work, ward allocation and transport | Home and suitable Ward/ICU exits are distinct; actual departure releases the ED bed. |

- The four zones summarize a branching process, not a compulsory one-way chain. Support 1→2→4, 1→2→3→2→4, critical entry directly into 2, and separate home/ward exits. One patient has one logical zone at a time. Diagnostics dots represent work/result waiting, not a claim that the patient physically left their ED bed.
- Keep three supplied reporting urgency groups for the retained urgent-delay metrics. Preserve the separate acuity system/score and critical-bypass input; do not derive clinical classification or clearance from animation or model predictions. Record any synthetic relationship between these inputs as a demo assumption.
- Begin with one regular triage slot and a declared reserve triage team; retain four clinician-work slots plus one declared reserve physician. Record doctor/nurse identities, availability, coverage pools, and owner roles. Shared staff are not counted as additional independent workers in every zone. Use staffing units as fictional operational resources, not validated ratios.
- Use finite ward/ICU bed types and suitability from the profile. Zone 1 has no treatment-bed pool; its drawer shows No treatment beds here rather than a false zero-capacity warning. Zones 2/3 share the same ED-bed pool; their views must not add their bed counts as separate capacity.

### Received ambulance information

- An announcement contains ambulance identity, announcement/received time, estimated arrival and uncertainty, announced patient count, supplied critical/acuity information when known, source update time, and update/cancellation/arrived state. The sidebar lists ETAs and explicitly separates inbound ambulance count from announced inbound patient total.
- Only received announcements can enter forecasts. Sample known incoming patients around their disclosed ETA uncertainty, plus unannounced background demand; avoid double-counting known ambulances in both sources. Never use actual hidden replay arrivals as ETAs.
- Dispatch time is not ED arrival time. En-route patients do not occupy beds, enter ED waiting totals, or start total ED time before physical arrival. ETA changes, cancellations, and arrival handoff use the same identity. An ETA already passed shows Delayed/ETA overdue, not an invented arrival.
- Stale/missing inbound data carries its own limitation. It never makes essential queue/space/staffing feeds fresh or silently removes uncertainty.

### 3D layout, particles, and camera

- Follow the supplied wireframe: Simulation Window title on the left of the header, textual Overall status on the right, controls and ambulance feed on the left, a central four-node 3D scene, and a selected-zone drawer on the right. Keep Synthetic demo, simulated time, active demo role, and freshness visible. Replace the sketch's bare exclamation mark with a readable status plus icon.
- Use simple isometric geometry and readable overlays. No realistic hospital modeling, physics collisions, walking avatars, or decorative loading sequence is required. Each visible dot has a stable synthetic patient identity and one received logical stage. Queues cluster in distinct waiting areas; active tasks use slots; numeric counts remain legible when dots overlap.
- The backend owns patient transitions, resources, and simulated time. The renderer may interpolate between already-received transitions but cannot advance a patient before a received event or alter queues/capacity. Pause/step freezes or reconciles transitions at the selected simulated timestamp. Reset/load removes obsolete dots and selections. Rendering frame rate never changes service speed.
- Default to one dot per patient. If a configured stress run exceeds the declared render budget, show a visible overflow count or labeled aggregate representation, while lists/API retain every patient. Never silently drop patients or make random decorative dots look like observations.
- Normal-zone click opens patient count/roster, assigned on-duty doctors/nurses, queues, and relevant bed/resource use without forcing a camera zoom. Alert click focuses that zone smoothly and opens the same drawer with prediction/cause/actions. Camera movement never advances or mutates the simulation.
- Back to overview restores the fixed overview camera and readable map without resetting replay, decisions, or action progress. Selection persists across valid updates; reset clears it. Switching between alerts updates title, zone, and version together. Do not auto-zoom on every alert or obscure controls with bubbles.
- Provide visible DOM zone buttons with the same selection/details behavior as canvas picks. Reduced motion skips camera animation and uses static dot positions. The required 2D mode exposes the same patients, alerts, feeds, comparisons, and approvals if graphics are unavailable; it is a fallback, not the new primary demo.
- Target at least 30 frames/second with 200 visible patient dots during ordinary playback on the named demo machine, measured through Playwright MCP. Record actual performance. Keep forecast/comparison work off the scene's main interaction path and lower decorative detail before compromising state accuracy.

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

### Zone pressure versus overall congestion

- Show incoming work (lambda) and staffed service capacity (mu) in matching units. Use the previous 30 simulated minutes for received work rates; obtain capacity from finite staffed slots and disclosed task-duration assumptions. Display recent completed throughput separately: an idle service's zero recent completions does not prove it has zero capacity. Insufficient inputs show Unknown, not division by zero or an infinite countdown.
- Triage/assessment use patients per hour. Diagnostics use tasks per hour separately for lab and imaging, because one patient may need several tests. Disposition separates home processing and ward-transfer constraints. A single blended rate must not hide a blocked ward or imaging pathway.
- Lambda greater than mu is a pressure signal, not proof of sustained ED congestion. Local overload occurs when the affected waiting queue reaches its configurable threshold, or necessary capacity is unavailable while eligible work waits, for ten continuous minutes. Initial queue thresholds: triage three, assessment six, lab four, imaging two, departure processing/allocation three. Store local onset and confirmation separately; a brief queue/density burst does not earn a confirmed red overload. Clear the local episode only after its queue stays below the threshold and required capacity is available for five continuous minutes. Missing inputs show Cannot assess; they cannot establish recovery. These local rules do not replace the overall ED rule.
- Use green Normal, yellow Pressure/building, red Overloaded, and gray Cannot assess with text/icons. Red local alerts follow received queues/resources, not pixel density. A forecast warning can highlight a currently normal zone without pretending congestion already occurred. Overall status follows the retained ED rule below, while still indicating Local alert when applicable.
- Forecast local threshold episodes with the same independent future runs as the global forecast. The selected-zone panel labels Local overload expected separately from Overall ED congestion expected. No overload sampling means no invented local countdown. The demo's Node 3 alert is a generated diagnostic case, not a permanently red decoration.

### Congestion and forecasting

- Confirm congestion when zero available staffed spaces and at least six patients awaiting a space persist for 20 minutes. Available staffed spaces means empty treatment spaces with staff and required resources available to accept a patient; display it separately from total staffed capacity and occupied spaces. Store onset at the beginning of that interval and confirmation at its end.
- Show Building congestion before confirmation. Clear an episode after fewer than three patients await a space for ten minutes. Recovery does not also require an empty treatment space.
- Forecast every five simulated minutes across 90 minutes, plus a 20-minute tail to confirm late-window onsets. Carry the observed history of an interval already underway.
- Sample arrivals, remaining work, and ward availability from observed state and disclosed assumptions. Remaining work accounts for elapsed task time. Forecast random seeds are independent of replay seeds and hidden completion values.
- Start with 50 future samples and compare with 100 at development checkpoints. Target two seconds for a forecast and five for an action comparison on the demo machine; measure these limits.
- Report the fraction of futures with a qualifying new onset. Use a conditional 90% onset range for futures with an event; retain the no-event fraction and sample count. Report no sampled onset explicitly when applicable.
- For an interval already building, separately return the fraction of futures in which that same interval reaches confirmation. Show Building congestion — X% chance of confirmation, its elapsed duration, and no future-onset countdown for that interval. Confirmed congestion shows its current status and recovery comparison, rather than a new-onset risk as its main number.
- Do not use negative countdowns or count a warning during an already-started interval as warning before onset. Missing/stale essential data yields Cannot assess and no actionable ranking.
- Interpret the proposal's time-to-collapse as an estimate of the retained sustained-congestion onset, not a claim of permanent clinical failure. Show Expected congestion in approximately X simulated minutes, chance, and the conditional 90% onset range. X is the median event-future onset minus forecast time, with that source time visible. Recompute after new forecasts; an expired estimate prompts refresh rather than a false zero/negative timer. Building/confirmed intervals show their current state or chance of confirmation instead of a new-onset countdown. Never compute this countdown from lambda greater than mu alone.
- Explain modeled constraints using received inputs and, where useful, a comparison that relaxes one constraint. Avoid claims of proven hospital causation.
- Each alert reports its failure category (triage/arrival pressure, physician/staffed-space constraint, lab/imaging delay, departure/ward/transport blockage, or mixed), affected patient count, urgent group effects, source evidence, and whether action can still help before onset. Order actionable alerts by earlier intervention deadline, then expected patient-minute impact; show recovery and unknown-evidence cases separately. Do not invent impact estimates when a completed comparison is unavailable.
- For a feasible action, its estimated latest start is the lower end of the relevant conditional 90% onset range minus five minutes of review, its setup time, and a five-minute margin. Show this as a model estimate with the source forecast and chance, not a guaranteed deadline. Past deadlines say May be too late to prevent; already-started episodes say Recovery. Without a range or feasible action, the deadline is unavailable. Compare alert deadlines using the best-supported feasible action when a comparison exists; otherwise label the provisional action assumption. Earliest deadline sorts first, followed by supported expected patient-minute saving; without a comparison, show affected counts rather than invented savings.
- Use plain summaries such as Incoming work exceeds available lab processing, backed by received queues/slots/turnaround and model sensitivity. Keep lambda/mu and technical model settings expandable. The explanation distinguishes Why this alert appeared, Why this action may help, and What it costs or could worsen.

### Operational action catalog and approval

| Action | Role | Setup after review | Initial effect |
| --- | --- | --- | --- |
| Coordinate eligible ward transfers | Ward supervisor / bed manager | 10 minutes | Add one ward-allocation slot using a reserve coordinator. |
| Accelerate cleared ED discharge processing | Resource-owning bed manager | 10 minutes | Add one discharge-processing slot using reserve support. |
| Activate staffed surge spaces | ED attending lead | 20 minutes | Activate four reserve spaces and their staff coverage. |
| Activate/reallocate diagnostics | Lab or radiology manager for the target service | 15 minutes | Add one lab/imaging slot from reserve capacity, or move a slot from a declared donor service after donor approval. |
| Open a staffed surge triage desk | Triage / ED charge nurse | 10 minutes | Add one triage slot using its reserve team. |
| Activate reserve physician assessment capacity | ED attending lead | 15 minutes | Add one clinician-work slot using a reserve physician; no additional beds. |

- These six presets are the concrete MVP interpretation of the supplied action examples. Diversions, new holding units, changed lab-batching rules, and expedited inpatient clinical discharge need their own modeled eligibility, resources, donor costs, and tests before being offered as executable actions. They are extension examples, not fake-capacity buttons. The current ward action coordinates cleared transfers; it cannot discharge a ward patient or create a bed.
- Resolve approvers from the action's required resource owners in the fictional profile, not its alert zone. Default phase ownership follows the user's proposal: triage charge nurse, ED attending lead, target lab/radiology manager, and ward supervisor/bed manager. Thus a zone 3 alert can recommend a ward action owned by the bed manager. Resource ownership can be edited without rewriting UI routing.
- A cross-owner reallocation requires all distinct owner approvals. The request records required roles, pending/granted/rejected/deferred/stale/escalated states, source version, per-role identities, and simulated timestamps. No resources are reserved or capacity changed on a partial approval. The final valid approval atomically enters the common authorized lifecycle; simultaneous requests still cannot activate two actions. Essential/resource state changes invalidate stale grants; refreshing creates a new versioned request. Repeated decision identities return their existing result.
- A blocked cross-department/system-wide request can be recorded locally as Escalated to Hospital Command Center, with its reason and owner. This is a demo routing state, not an external message or automatic capacity override. Command-center escalation cannot bypass department grants, eligibility, or resource limits. Show the destination and missing approval beside a disabled Approve control when the active demo role is wrong.

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
- Keep the 3D four-zone map central. Use a compact status strip for congestion chance, expected start, patients awaiting a space, and available staffed spaces; put detailed charts/evidence behind the selected-zone drawer or evidence panel.
- Use plain labels such as Congestion chance, Expected start, Why this may happen, and Compare actions. Explain ED once as emergency department. Explain conditional onset ranges and missing results with short help text rather than technical jargon.
- Build a consistent visual system: calm light surfaces, readable system fonts, shared spacing and components, and distinct text/icon status labels. Status cannot depend on color alone; charts include units, legends, and text/table alternatives.
- Put detailed scenario settings, seeds, distributions, and evaluation controls in a separate demo/evidence panel. Keep synthetic labeling visible in the staff view.
- Keep loading layouts stable, show pending/retry feedback, provide useful empty/error states, and distinguish Cannot assess from a valid low-risk forecast. Disable duplicate submissions in the UI and enforce the same decision identity in the backend.
- Before approval, show the action, approving role, review/setup delay, required resources, benefit range, urgent-patient effects, and costs. After submission, show the actual pending/active/completed/blocked state and simulated timestamps.
- Show the next step from both current state and forecast: stable with risk at/above the locked warning threshold → compare preventive actions; stable below it → monitor; building → compare actions with timing shown; confirmed → compare recovery actions; Cannot assess → inspect missing/stale inputs; blocked/no help → inspect the limiting reason; action underway → monitor its progress. Use Simulated minutes on forecast and action delays, and Urgent delay check on comparison cards.
- Review dialogs move focus inside, keep keyboard navigation within the open dialog, close on Escape/cancel without submitting, and return focus to the opening control. Announce important status changes in a readable status region without announcing every replay tick.
- Support keyboard operation, visible focus, labeled controls, readable text, and reduced motion. Target at least 4.5:1 normal-text contrast and 44-pixel primary control targets. Playwright MCP must check the implemented values and behavior.
- Keep the primary journey usable at 375, 768, 1024, and 1440 pixels without page-level horizontal scrolling. Details may collapse or reorder, while status and staff choices remain accessible.
- Show current resources/freshness, received inbound ambulances, zone details, prediction/cause, and ranked catalog actions with required supervisors. Use one selected-action versus no-action chart/table alongside its review, rather than six charts on the scene.
- The four logical scene phases are distinct from the retained three time components. Waiting-for-space is a queue subset, bed retention is a resource record, and diagnostics/result review can loop without adding duplicate patients. Phase drawer totals, scene dots, and API histories must agree.
- Use one timeline with a visible Now boundary and distinct observed/forecast series. Compare no action with one selected action on identical axes; keep conditional onset ranges separate from queue uncertainty. Queue-threshold crossing alone cannot establish congestion without the space/duration conditions. Compare complete-cohort ED time using horizontal three-part bars with a table alternative; unfinished cohorts show accrued time/counts instead of complete savings. Display urgent effects and costs beside benefit.
- Provide scenario selection, play/pause, speed, reset, and saved replay loading. Use explanations derived from computed fields; an LLM layer is optional beyond this spec's required scope.
- Evaluate no action, a reactive rule, a recent-arrivals/departures flow forecast, and PulseAhead. Baselines use fixed bottleneck-action rules and the same resources, eligibility, review/setup delays, durations, and cooldowns.
- Keep development, tuning, and final test shifts separate. Aim for two tuning seeds and four test seeds for each scenario family, plus changed workload/service assumptions. Record actual sample counts if compute limits reduce the set.
- Choose warning thresholds on tuning shifts only, starting with probabilities 0.4, 0.6, and 0.8. Aim for at most one false warning per scored eight-hour shift. Follow the fixed baseline and scoring rules below.
- Score forecasts on no-action shifts; score intervention policies separately on matched underlying demand and clinical requirements. Evaluation replay values remain inaccessible to forecast code.
- Record detected/missed episodes, false warnings, lead time, squared probability error, and onset-range coverage. An actionable warning allows review, setup, and five extra minutes: 20 minutes for ward/discharge/triage actions, 30 for surge spaces, and 25 for diagnostics/physician capacity. Score actual warning lead time against observed onset separately from the model-estimated deadline.
- Compare total ED patient-minutes, mean and median stays, urgency-specific 90th percentiles, boarding, and resource costs with uncertainty. Follow the same scored arrival cohort with continuing background arrivals for up to 12 hours after the scored window; keep capped or blocked stays visible rather than averaging completed patients only. Background patients affect resources but do not enter the scored cohort. Do not stop arrivals to create artificial recovery.

### Fixed baseline and evaluation rules

- All policies consider an action at five-simulated-minute decision checkpoints, with no new decision while an action is underway. No action never activates capacity. Reactive warns/acts when available staffed spaces are zero and at least six await a space, without waiting for the 20-minute confirmation.
- PulseAhead's evaluation policy compares actions when new-onset probability reaches the locked threshold while stable, confirmation probability reaches it while building, or congestion is confirmed. A simulated staff response approves only a currently valid Best action through the same five-minute review and setup lifecycle. Needs review, failed checks, no-help, or Cannot assess produce no automatic action. This evaluation response does not remove real staff choices from the dashboard.
- The simple-flow baseline uses received arrivals and physical ED departures during the preceding 30 simulated minutes. Express rates per minute. If arrivals exceed departures, predict queue-threshold onset after `(available staffed spaces + max(0, 6 - queue)) / (arrival rate - departure rate)` minutes, assuming those rates persist through confirmation. Warn if that time is within 90 minutes; otherwise predict no new onset. Current building/confirmed intervals are labeled separately. Missing history or essential feeds yields Cannot assess, not zero risk.
- Fixed action choice orders bottlenecks with positive queue counts by the number of ED patients waiting at ward allocation, cleared discharge processing, diagnostics, awaiting treatment space, doctor assessment, and triage. Break equal counts in that order. Map these to ward coordination, cleared-discharge support, diagnostics, surge spaces, reserve physician work, and surge triage respectively. Count a diagnostic patient once even when awaiting several tests; assessment work queues and patients awaiting a space are distinct. Choose the corresponding feasible action; diagnostics prefers reserve activation over reallocation. Skip unavailable actions, then choose no action if none remain. Every policy has the same six presets, clinical eligibility, urgency queue rules, resource budgets, and owner delays. Baselines use these fixed choices without PulseAhead's predictive urgent filter; disclose that distinction and report their urgent-delay results. This compares complete policies rather than pretending they share the same predictor.
- Tune the simple history window from 15/30/60 minutes and each warning threshold only on tuning shifts. For warning settings, maximize early episode recall subject to the false-warning budget, then median lead time; tie-break with fewer false warnings and the documented default. If none meet the budget, select the fewest false warnings, then recall, and disclose the failure. Select the strongest simple action policy on tuning results by complete total ED patient-minutes saved; tie-break with lower urgent delays, then resource use. Incomplete results cannot establish a winner. Freeze this selection before final tests and still report every policy.
- Merge repeated warnings until below threshold for ten continuous simulated minutes. A warning episode retains its first timestamp and original 90-minute horizon; later updates do not extend it for credit. Match warnings chronologically one-to-one to the earliest unmatched qualifying onset after that first timestamp and within its horizon. One warning cannot earn credit for two congestion episodes. Warnings issued during a building/confirmed interval are late/current warnings, not early detections. Unmatched early warnings are false; keep unmatched, late, and ineligible records visible.
- Episode recall includes only qualifying onsets inside the eight-hour scored window. Warning issuance is scored inside that window, but truth replay continues with normal background demand for at least 110 minutes beyond its end, so near-end warnings and confirmations are not truncated. Warm-up warnings do not earn scored early-detection credit.
- At each eligible five-minute snapshot with no building/confirmed interval, probability error is `(forecast probability - new-onset indicator)^2`, where the indicator is one if any qualifying onset begins in the next 90 minutes. Report the mean and denominator. Score building-interval confirmation probability separately against whether that current interval confirms. Conditional onset-range coverage uses the first qualifying future onset only among snapshots with an observed onset and a returned range; report excluded/no-range cases and their counts rather than hiding them.
- Benchmark one complete development shift and action comparison through Playwright MCP before locking evaluation size. Aim for 14 tuning and 28 test shifts; if time requires, predeclare a balanced fallback of seven tuning and seven final shifts, one per family in each separate set. Save selected shift identities and workload variants before final results. Choose by the measured run budget, never favorable outcomes; smaller evidence carries wider limits. Record the full run estimate, actual runtime, and any sample-count reduction.
- Policy-result uncertainty resamples whole matched shift pairs 1,000 times using a recorded seed and reports 5th/95th percentiles of the mean paired change. Resample within scenario family and keep the same family weights; do not treat patients or neighboring snapshots as independent shifts. With one final shift per family, report family outcomes descriptively and the overall paired mean without an estimable within-family uncertainty interval. State that the seven-shift fallback cannot establish within-family variability; do not invent precision from patient counts.

### Rubric delivery and deployment

- Treat the five Track 1 criteria equally: precise user/value, forecasting rigor/robustness, complete decision support, understandable explanations, and seamless live execution. Each needs observable evidence; a compelling 3D scene alone cannot establish prediction quality or usefulness.
- The judge-facing path must show received demand → detected/forecast bottleneck → failure category → impact/time priority → feasible action comparison → owner approvals → delayed execution → measured results. Include a blocked/no-help example, not only the success case. Display patient-minutes saved and staff/space costs together; any money conversion requires disclosed assumptions and cannot become measured ROI.
- Present a small value case: the decision-maker, measured complete-cohort ED/boarding time change, resource-hours consumed, patient-minutes saved per extra staff-hour when that denominator is positive, and conditions where the action does not help. An optional cost illustration uses editable, clearly assumed hourly resource rates, declared currency, and actual simulated resource-time charges through draining. Show unknown rates as unavailable. Patient time saved is not automatically cash saved; do not invent revenue or monetize released bed time as realized hospital savings. Playwright MCP checks cost arithmetic from exported resource records and separately labels all assumed rates.
- Tune then lock warning settings against false-alarm targets; export holdout sample counts, misses, false warnings, lead time, probability error, and uncertainty. Keep a normal shift and degraded-feed case available for Q&A. The existing Monte Carlo flow forecast is a forecasting architecture; do not add nominal machine learning solely to use an AI label.
- Package frontend, API, synthetic presets, and saved-run handling for one small deployment with a stable entry URL and a healthy backend. Prefer serving the built frontend and API from the same application origin. Hosting target is selected from available authorized setup; no cloud resource, payment, or public publishing is performed by this planning task. Record deployment identity/version and verify the actual URL through Playwright MCP before marking it complete.
- Keep hosted replay state isolated by run/session identity; cap concurrent forecasts/evaluations, expose progress/failure/cancel, and prevent one user's reset from overwriting another run. Backend restarts explicitly expire unfinished sessions or restore recorded saved runs rather than silently inventing state. Demo roles must not be represented as real authentication. Only synthetic presets are used.
- Freeze features before rehearsing. Phase 1 pitch targets 180 seconds: user/decision about 25 seconds, core model and scene about 45, cause/comparison/approval about 60, measured evidence about 35, and limits/next step about 15. These are presentation allocations, not automatic execution claims. Prepare the longer 240-second Phase 2 live path plus Q&A.
- Retain concise answers with evidence for why 3D helps, how predictions avoid hidden futures, what synthetic assumptions mean, how false alerts/urgent harms are handled, why actions need the named supervisor, what baselines show, and how a hospital partnership would validate the approach. If evidence is unavailable or unfavorable, say so and show its status.

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
| All six interventions | Exercise each preset's useful, blocked, and ineffective cases; inspect setup timing, finite triage/physician/space changes, transport/clearance requirements, and donor-service costs. |
| Staff decisions | Approve, reject, and defer; verify paused review/source time, stale selections, concurrent distinct approvals, and resource loss during setup. Step through lifecycle boundaries and confirm only valid, ready approvals have an effect. |
| Activation limits | Attempt overlapping reserve use, advance through activation expiry, and confirm occupied surge spaces remain until departure and resource costs continue until release. |
| Paired comparisons | Inspect exported cohort/task records across branches; confirm identical demand and care requirements despite changed scheduling. |
| Urgent-delay ranking | Check known pass/harm/insufficient-evidence calculations, ED and donor urgent harm, and six feasible actions with no supported positive benefit. Inspect paired bootstrap units, sample counts, and no-help outcomes. |
| Total ED time | Independently recompute arrival-to-departure and the three-part breakdown from exported timestamps through Playwright MCP; confirm boarding and unfinished stays remain visible. |
| Faulty information | Load duplicate, delayed, missing, stale, and impossible events; inspect deduplication, validation errors, limitations, and Cannot assess. |
| Baseline evaluation | Start the real evaluation through the application; inspect locked seed/settings partitions, matched cohorts and action budgets, warning matching, false-alarm counts, and exported benefits. Recompute representative metrics through Playwright MCP. |
| Dashboard controls | Exercise scenario selection, play/pause, speed, reset, refreshed comparisons, exports, and reload; check synthetic labels, pending states, errors, and displayed results. |
| Product clarity and UI/UX | Complete the risk → cause → compare → review → staff-choice journey at the target widths and by keyboard. Check labels, units, focus, dialog behavior, contrast, primary target sizes, loading/empty/error/retry states, and chart alternatives. |
| Patient particles and zones | Inspect known fixtures to compare rendered patient identities/counts, logical phases, bed reservations, and API/exported events. Check diagnostic return to the doctor, critical bypass, no duplication, pause/step/reset, and overflow labeling. Camera interpolation cannot create early completion. |
| Camera and drawers | Select normal and red zones, use DOM zone buttons, focus/back to overview, switch alerts, and load/reset. Verify relevant versioned data, no camera-caused simulation changes, preserved action progress, and readable controls. |
| Ambulance feed | Exercise announcement, ETA revision, cancellation, overdue ETA, arrival, stale feed, and multiple patients per ambulance. Confirm no pre-arrival ED-time/bed count, no duplicate arrivals, and received-only forecast demand. |
| Approval routing | Trigger a ward action from a diagnostic alert, attempt wrong-role approval, collect required donor/receiving grants, reject/defer/escalate, invalidate stale grants, and repeat per-role decisions. Partial grants never activate capacity; all valid grants enter the normal delay/resource lifecycle. |
| Graphics and accessible fallback | Inspect 200-dot playback performance, camera interactions during forecast work, reduced motion, unavailable/lost graphics context, and equivalent 2D/keyboard workflows at all target widths. Record machine and actual frame/response measurements. |
| Data robustness | Run normal noise, duplicate announcements/events, extreme but valid task delays, impossible inputs, missing/stale essential feeds, and unannounced surges. Inspect false warnings, abstentions, source errors, and recovery. A plausible surge/outlier is not silently discarded to improve scores. |
| Deployed workflow | Open the actual deployment in a fresh browser through Playwright MCP; start replay, inspect zone/ETA, receive a prediction, compare, collect required approvals, advance setup/effect, inspect/export evidence, and reload. Check same-source versions and local saved-run fallback. |
| Frontend/backend agreement | Delay requests, return stale versions, disconnect/reconnect the backend, and repeat an approval identity. Check that the UI preserves truthful freshness, offers recovery, and cannot produce duplicate activation. |
| Performance and fallback | Measure forecast/comparison response times through Playwright MCP; reload the app from a fresh session and load saved replays/results. Record actual performance. |

Record a Playwright MCP pass, fail, or not-run result for every process, together with fixture/settings identity, expected and actual values, and relevant screenshots or response/artifact evidence. A failed or unrun check stays open in the evidence checklist. Verify tool availability before testing; if Playwright MCP is unavailable, report the missing connection rather than silently switching tools or claiming verification.

Passing automated behavior checks is separate from establishing forecast quality or policy benefit. Report measured comparisons, including failures, rather than asserting that tests prove hospital performance.

Usability checks establish specific implemented behaviors; they do not prove a flawless experience or validated staff comprehension. Keep any actual human feedback separate from automated results.

## Out of Scope

- Real patient data, hospital integration, real-time operational deployment, and validated hospital thresholds.
- Autonomous triage, diagnosis, admission decisions, discharge clearance, or medical treatment recommendations.
- Claims about mortality, clinical outcomes, or proven clinical safety from modeled delays.
- Multiple hospitals, action combinations, authentication, a production database, or a production authorization system. Approval roles are clearly labeled demo inputs. A small deployed synthetic demo is now in scope for the supplied rubric; production hospital deployment is not.
- A realistic 3D hospital replica, physics-based particle collisions, avatar navigation, VR, real ambulance integrations, external notification delivery, or proven real-time digital-twin calibration. This is a synthetic operational twin.
- Executable diversion, holding-unit, novel lab-batching, and inpatient clinical-discharge actions before their mechanisms are explicitly modeled. They remain action-catalog extension examples; role routing itself includes all supplied department owners and command-center escalation.
- Sophisticated machine learning, an LLM explanation layer, extra screens, and decorative features before the required simulation and evidence pass.

## Further Notes

- The user approved the concept and ended the interview. This spec synthesizes that scope; it does not reopen requirements discovery.
- The agreed architecture decision is to use forward simulation for forecasting and action comparison. A learned challenger is optional after the required loop and evidence pass.
- Keep the 16-hour target, reserving the last two hours for freeze/rehearsal. Start with a simple real 3D replay, then coupled phases/EMS, forecast, department actions, and evidence. The new scene, feed, and two added presets increase scope; measure progress and do not promise all work fits before benchmarking.
- Organizer acceptance of synthetic-only evidence remains unresolved. The team should confirm it externally; it is not established by the supplied requirements checklist.
- Rehearse the supplied three-minute presentation plus two-minute Q&A, subject to updated organizer instructions. The supplied shortlisted format is conditional.
- Real data calibration and prospective hospital evaluation belong to a future hospital partnership. All hackathon claims must stay within the measured synthetic evidence.
- The user settled the testing choice: use Playwright MCP for every process and verification step. The earlier test-boundary question is closed.
- The user's latest proposal replaces the dashboard-first presentation with a 3D particle map, live synthetic inbound tracking, zone focus/details, and resource-based department routing. Existing simulation and evidence rules remain except where this spec explicitly changes presentation, input detail, ownership, or catalog scope.
- The approved breakdown contains 22 vertical feature tickets covering 83 user stories, published as local files with ready-for-agent status. The original 16 drafts remain historical and must not be mixed with the new set. The earlier agent review applies to retained rules, not to an independently reviewed or implemented 3D product.
- The handwritten PDF supplies visual context; labels/arrows/examples are not additional executable instructions. The user's message authorizes this spec and new ticket draft. The previously settled highest application API boundary and Playwright MCP requirement remain; no new test seam or repeated testing approval is needed.
- Use the supplied rubric's Track 1 Predictive Model criteria as the primary score target: five equal 20-point categories. The separate Track 2 WorkBuddy criteria do not require converting this staff-approved model into an autonomous clinical agent. The goal is strong evidence for the 16–20 band in every relevant category, not a guaranteed score.
- The supplied rubric states Phase 1 three-minute pitch plus two-minute Q&A, and Phase 2 four-minute demo plus three-minute Q&A. Use those timings as the current supplied format, subject to an organizer update. It does not establish organizer acceptance of synthetic-only data.
- The user selected local files as the tracker on 10 October 2026. This document is the canonical ready-for-agent spec, linked from the local tracker alongside the 22 approved tickets. No external tracker setup or publication is required.
