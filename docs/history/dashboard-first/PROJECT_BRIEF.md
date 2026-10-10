# PulseAhead project brief

Status: approved by the user; the interview is closed. The [16-hour build plan](BUILD_PLAN.md) is written. No implementation, dataset, demo, or measured results exist yet.

## What we are building

A synthetic ED demo that warns staff about upcoming congestion, explains the likely bottlenecks, and compares actions staff can approve. The main users are an ED shift coordinator working with a bed manager.

The demo represents one fictional ED with 24 treatment spaces, three urgency groups, and finite staffing, diagnostic, ward, and transport resources. Clinical decisions such as acuity, admission, and discharge clearance arrive as supplied inputs. Real hospital data and validation belong to a later hospital partnership.

## Agreed behavior

| Item | Decision |
| --- | --- |
| Congestion | No usable treatment spaces and at least six patients awaiting a space for 20 minutes. The episode starts at the beginning of that interval. |
| Building congestion | The conditions have started but have not yet lasted 20 minutes. |
| Recovery | Fewer than three patients awaiting a space for ten minutes. |
| Forecast | Look 90 minutes ahead; update every five simulated minutes. |
| Prediction method | Run many plausible futures from current information. A learned model is optional after the working simulation and evaluation. |
| Main time measure | Arrival until physical departure from the ED. |
| Time breakdown | Arrival to first assessment; assessment to admission/discharge/transfer decision; decision to physical departure. |
| Patient groups | Show each urgency group's results separately. |
| Staff choices | Approve, reject, or defer an action. |
| Missing key information | Show "Cannot assess" and when information was last updated. |

These numbers are editable demo assumptions, not validated hospital thresholds. The forecast cannot read the replay's future arrivals, results, departures, or hidden random choices. It must report current congestion separately from a new predicted episode.

## Agreed actions

| Action | Setup after staff review |
| --- | --- |
| Coordinate eligible ward transfers | 10 minutes |
| Speed up processing for cleared discharges | 10 minutes |
| Activate extra staffed treatment spaces | 20 minutes |
| Activate or reallocate diagnostic capacity | 15 minutes |

Staff review takes five simulated minutes by default. Setup time is separate from actual patient processing and transport time. Actions require available resources; boarding continues occupying ED space, and reallocation can slow another pathway.

Rank actions by feasibility, urgent-patient delay checks, supported positive total ED time saved, and resource cost. A zero-benefit action or one that materially worsens urgent ED or donor-service delays cannot be the top recommendation. Show effects on each urgency group and distinguish prevention from recovery. The implementation spec records exact fictional guardrails; they do not establish clinical safety.

## Approved approach

### Data and approvals

Keep staffing counts, arrival patterns, patient mix, care times, and ward/transport availability in an editable profile. Choose disclosed presets to represent the agreed normal, recovering-surge, arrival, diagnostic, boarding, mixed, and no-effective-action cases. Reference studies can guide assumptions, but do not establish local hospital validity. Routine numerical settings will be documented in the build plan rather than requiring further interview rounds.

For the demo, the bed manager approves ward actions, the shift coordinator approves discharge workflow and extra spaces, and a diagnostic lead approves diagnostic capacity. These are fictional demo roles; real approval rules require a hospital partner. Recheck resources and the expected benefit when an action is approved.

Treat essential information older than ten simulated minutes as too old; unrelated heartbeats cannot refresh a stopped feed. Missing optional feeds carry a visible limitation. Show new-onset chance and a conditional time range. For an interval already building, show its chance of confirmation with no future-onset countdown. Pause demo replay for comparison/review so staff can finish a choice; approval then starts the modeled review/setup delays.

### Proof that it helps

Use Playwright MCP for all testing and verification, including each user process, simulation behavior, numerical results, and baseline comparisons. Inspect the running application, real API responses, and exported evidence through that tool. Record checks as unrun until evidence exists.

Use separate complete shifts for choosing settings and for final tests. Include normal shifts, different bottlenecks, changed workloads, delayed/duplicate/missing information, and shocks without an advance signal.

Compare against a current-state threshold rule and a simple arrivals-versus-departures forecast. Give comparison methods the same actions, resources, and action delays. Aim for no more than one false warning per eight-hour simulated shift; choose the alert threshold on the tuning shifts and report the actual final result. Count repeated warnings as one episode.

Report congestion detection, false warnings, warning time, forecast error, and how often the stated ranges match outcomes. An actionable warning allows staff review, action setup, and an extra five-minute margin before onset.

Replay the same patient demand and care requirements under each policy. Measure total ED time, its three parts, boarding, each urgency group's outcomes, and resources used. Continue following patients who remain in the ED; if the evaluation stops before they leave, report that clearly and count their accrued time. Do not compare only patients who leave quickly.

Keep bottleneck explanations tied to actual inputs and modeled effects. They describe the simulator's behavior, not proven causes in a real hospital. Report cases where no feasible action helps. Claim improvement only if the measured comparison supports it.

### Demo and tools

Use a local web dashboard with replay controls, current queues/resources, congestion risk and timing, bottleneck explanations, approval buttons, before/after outcomes, and a persistent synthetic-data label. It should show stable, developing, congested, recovered, and missing-data cases. Publishing and live hospital integrations are outside this hackathon demo.

Product clarity and good UI/UX are core requirements. Build the frontend and backend together from the first ticket, then expand synthetic scenario coverage. The main journey is status/risk → cause → action comparison → review and staff choice. Use plain labels, clear units, consistent visual design, responsive/keyboard-accessible controls, and helpful loading/error/retry states. Keep detailed demo settings and evidence separate from the main decision view. The backend must enforce the same freshness, eligibility, and duplicate-decision rules the frontend displays.

Recommended tools: Python with SimPy for the flow model, FastAPI for the local API, and React with TypeScript for the dashboard. Test a small learned model only after the required simulation, action comparison, and evidence work passes. Python and Node run locally; the Python libraries still need installation. Keep saved replay and result files available for the pitch.

## Next step

Follow the [16-hour build plan](BUILD_PLAN.md), starting with the coupled simulator and resource checks. The user prioritizes reliable simulation, forecasts without future replay information, action comparison, and measured evidence over sophisticated machine learning. Implementation remains the next phase.

Organizer acceptance of synthetic-only evidence is still unverified. The public event page does not answer that question; the plan must retain it as a known external check.
