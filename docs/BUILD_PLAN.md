# PulseAhead: 16-hour build plan

Status: the user approved the brief and closed the interview. Planning is complete; implementation and measured results have not started.

Build one working loop: **observe the ED → predict sustained congestion → compare four actions → staff approve → measure what changes**. Use one fictional hospital, 24 ED treatment spaces, and clearly labeled synthetic data. Keep the simulator and evidence ahead of extra features.

Hours below are elapsed build hours. They form one main work track and do not assume a particular team size. If teammates are available, the dashboard and pitch can run alongside the engine once its data format is fixed. Keep the final two hours for checking and presenting.

## Work order

| Hours | Build | Checkpoint before moving on |
| --- | --- | --- |
| 0–1 | Set up Python, the local API, and the web app. Define patient events, resources, editable settings, and saved-run format. | One command starts a small replay; its state reaches the browser. |
| 1–4 | Build coupled patient flow, finite resources, congestion detection, and the seven scenario families. | A ward blockage keeps patients in ED spaces and grows the queue. A brief surge clears without becoming confirmed congestion. Resource checks pass. |
| 4–6 | Forecast from observed information using many possible futures. Add current-state and simple flow baselines. | Show risk and an onset range; changing the hidden replay future does not change a forecast from the same observed state. |
| 6–9 | Implement all four actions, review/setup delays, paired comparisons, and urgent-patient checks. | Each action has a useful case and a blocked or ineffective case. A faster-average action that worsens urgent waits cannot be the top recommendation. |
| 9–11 | Finish the dashboard: replay, explanations, comparisons, and approval controls. | A staff choice changes the running simulation only after approval and setup. Stable, congestion, and missing-data cases work end to end. |
| 11–14 | Lock settings, run separate test shifts, compare policies, and save evidence. Fix failures that affect correctness. | Results show actual benefits, harms, false warnings, and limitations against the strongest simple baseline. |
| 14–16 | Freeze features, check a clean restart, save fallback replays, and rehearse. | The demo runs from a fresh start and the pitch can use saved results if live replay fails. |

## 1. Make the simulator believable

Use Python, SimPy, and FastAPI for the engine/API; React with TypeScript for one dashboard. A learned model is optional work after the required loop and evaluation pass. No database, login system, hospital connection, or public deployment is needed.

Keep patient and resource state as plain, saved data. Start a fresh simulation from a snapshot for each forecast; do not try to copy a running SimPy environment. Separate the replay's private future schedule from the observation feed and forecast code.

The patient route is arrival → triage → treatment space and first assessment → care/tests → supplied disposition and clearance → physical departure. Urgency determines queue order and sampled care requirements. Work already underway is not interrupted merely to reorder a queue.

Enforce these rules:

- A patient keeps their ED space through tests and boarding, until physical departure.
- Staff coverage limits usable spaces. Clinician work, diagnostics, discharge processing, ward beds, and transport each have finite capacity.
- Waiting for a result does not automatically occupy a clinician work slot for the whole wait. Model active work separately from elapsed care time.
- A ward transfer needs clearance, a suitable available ward bed, and transport. Reserve that bed while transport is underway; release the ED space only when the patient leaves.
- Resource activation uses a declared reserve. Reallocation removes capacity from its donor pathway and shows that cost.

Use these **starting assumptions**, then tune only on development shifts:

| Setting | Fictional starting value |
| --- | --- |
| Treatment spaces | 24 regular spaces; one reserve unit of four spaces requiring its reserved staff team |
| Other capacity | Four clinician work slots; two lab slots; one imaging slot; two discharge-processing slots; one ward-allocation slot; one transport team |
| Patient mix | 10% urgent, 40% medium urgency, 50% lower urgency |
| Normal arrivals | Time-varying rate averaging about six patients/hour; scenario controls can raise it |
| Example task times | Assessment/work steps 5–20 minutes; lab processing median 30; imaging median 45; discharge processing 10; ward allocation 15; transport 15 |
| Ward availability | Small finite pool with separately generated bed-release events; never an unlimited sink |

These are editable simulator settings, not clinical standards. Sample positive, varied task times and routes conditional on urgency. Use explicit staff coverage units rather than claiming a real nurse-to-patient ratio. Record every chosen value in the saved run.

Generate normal shifts, a busy shift that recovers, an arrival surge, diagnostic delays, ward boarding, a mixed cascade, and a case where no available action helps. Add a two-hour warm-up before each scored eight-hour shift. Scenario changes drive the simulator; the forecaster sees a change only through received information or an explicitly announced plan.

Useful simulation references include [Hurwitz et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC4059027/) and [Hoot et al.](https://pubmed.ncbi.nlm.nih.gov/18387699/). They inform modeling choices; they do not validate this hospital profile.

## 2. Predict without reading the replay's future

Every event has an ID, event time, received time, patient/resource ID, and payload. Apply only events received by the current replay time. Deduplicate IDs; validate counts and patient transitions. Send a state heartbeat every five simulated minutes even when staffing has not changed. Show essential queue, space, or staffing information older than ten simulated minutes as **Cannot assess**.

At each five-minute update, create many independent future samples from the received state and recent history. Forecast seeds must be independent of the replay seed. Sample future arrivals, remaining work, and ward availability. Condition remaining task time on how long the task has already been running. Do not reveal an eventual disposition before its clinical decision is received, or reuse a patient's hidden completion time.

Start with 50 futures. Compare with 100 at selected development checkpoints to check that conclusions are reasonably stable. Benchmark early; target a forecast within two seconds and an action comparison within five seconds on the demo machine. These are performance targets to test, not promises. Compute comparisons when requested or when a warning/resource change warrants them, and cache by snapshot and settings.

Keep the agreed rules:

- Congestion: zero usable spaces and at least six patients awaiting a space for 20 minutes. Onset is the start of that interval.
- Building congestion: that interval has begun but is not yet confirmed.
- Recovery: fewer than three awaiting a space for ten minutes.
- Forecast window: 90 minutes. Run a further 20-minute tail to check whether an onset near the end of the window truly persists. Use observed history for an interval already underway.

Show the fraction of futures with congestion and an onset range for those futures. Show “No congestion predicted within 90 minutes” when appropriate. Separate a predicted new episode from current or already developing congestion; never credit a warning after onset as early warning.

Explain outputs with visible evidence: spaces occupied by boarded patients, diagnostic queues and turnaround, recent arrivals, and staff coverage. Where useful, test how relieving one constraint changes modeled risk. Call this a model explanation, not proof of a real hospital cause.

## 3. Compare actions and protect urgent patients

All comparisons start from the same observed snapshot. Within each sampled future, reuse the same patient demand and care requirements across actions. Use random values keyed by patient and task; merely resetting a seed is insufficient when actions change event order.

| Action | Approving role | Setup after five-minute review | Required check |
| --- | --- | --- | --- |
| Coordinate ward transfers | Bed manager | 10 minutes | Cleared patients, suitable ward capacity, transport, and coordination resource |
| Speed cleared discharges | Shift coordinator | 10 minutes | Discharge clearance and available processing support |
| Open staffed surge spaces | Shift coordinator | 20 minutes | Physical reserve spaces and an uncommitted reserve staff team |
| Activate/reallocate diagnostics | Diagnostic lead | 15 minutes | Reserve or donor capacity; show the donor pathway's delay |

Use 60-minute activations as the initial action setting: add one ward-allocation slot using a reserve coordinator; add one discharge-processing slot using reserve support; activate four surge spaces with their reserve team; or add one lab/imaging slot using a reserve diagnostic team. In a diagnostic reallocation preset, remove the corresponding slot from the donor service. Extra slots affect concurrency, not clinical clearance or task duration. Ward coordination cannot create inpatient beds.

For the first version, compare one action at a time, with one activation underway and a 20-minute minimum gap between starts. Give every policy the same duration, resource budget, and cooldown; do not stack uses of the same reserve. When an activation ends, finish active work and close surge spaces as they become vacant; never evict a patient. Charge resource time until the resource is actually released.

Approve, reject, and defer are real simulation choices. Pending or rejected actions have no effect. Setup starts after review; actual processing and transport still take time. Recheck clearance, resources, and benefit at approval. If replay has advanced since comparison, refresh it. Show whether an action can take effect before onset or mainly help recovery.

**Ranking order: feasibility → urgent-patient delay check → expected total ED time saved → resource cost.**

Use a clear demo guardrail: an action cannot be marked best if it increases urgent patients' 90th-percentile initial wait or total ED time by more than five minutes, or increases the number whose initial wait exceeds a configured 15-minute delay budget. Use the upper end of a paired 90% uncertainty range when checking changes. Cases with too few urgent samples or unclear harm are labeled **Needs review** and kept below actions that pass. If nothing passes, say so.

The five- and 15-minute values are disclosed fictional assumptions, not hospital safety limits. These checks measure delay; the simulator does not establish medical outcomes or clinical safety. Keep urgency priority and clinical eligibility rules in force for every policy.

For time-saving estimates, follow the same cohort: patients already present and those arriving in the next 90 minutes. Continue background arrivals while following that cohort, so the ED does not empty artificially. Cap follow-up at 12 simulated hours. If patients remain, show accrued time and the unfinished count; do not label the result a complete total-ED-time saving or use it to claim a best action on that basis.

## 4. Build one clear dashboard

Use a persistent **Synthetic demo** banner and four areas:

1. Current queues, usable/occupied spaces, boarding, diagnostics, staffing, and last updates.
2. Congestion status, forecast chance/range, and the evidence behind the main bottleneck.
3. Four action cards showing eligibility, setup time, predicted benefit, urgent delays, resource use, and approval controls.
4. A chart/table comparing no action and selected action, with predicted results clearly separated from completed replay results.

Add scenario selection, play/pause, speed, reset, and saved replay loading. Keep explanations tied to computed fields; an LLM explanation layer is unnecessary for the core demo.

The local API needs only replay creation/stepping, current state, forecast, action comparison, staff decision, and results export. Save profile, seed, settings, events, decisions, and results together so a run can be reproduced.

## 5. Produce evidence judges can inspect

Use separate complete shifts for development, threshold tuning, and final tests. Do not randomly split neighboring snapshots. Aim for two tuning seeds and four locked test seeds per scenario family: 14 tuning shifts and 28 test shifts. If compute limits force fewer tests, state the actual count and wider uncertainty; never replace them with selected showcase runs. Include changed arrival patterns and care-time assumptions, not only fresh random seeds.

Compare these policies:

- **No action:** reference for intervention benefit.
- **Reactive rule:** respond to current full-space/queue conditions; choose a feasible action using fixed bottleneck rules.
- **Simple flow forecast:** extrapolate recent arrivals and departures to warn earlier; use the same fixed action rules.
- **PulseAhead:** future samples and constrained action comparison.

Tune baseline thresholds and PulseAhead's warning threshold on tuning shifts, then freeze them. Start by testing warning probabilities of 0.4, 0.6, and 0.8. Aim for at most one false warning per eight-hour synthetic shift; report the actual result even if the target is missed. Merge repeated alerts until the warning has cleared for ten minutes. A false warning has no qualifying new onset within its stated 90-minute window.

For forecast scoring, use no-action shifts so a successful intervention does not make a correct warning appear false. Score intervention policies separately using matched demand, clinical requirements, action resources, and approval delays. Preserve shared randomness across evaluation policies with patient/task keys, while keeping those replay values unavailable to the forecaster. Pair forecast samples only with other action branches of the same independent forecast sample.

Save these results with sample counts and uncertainty:

| Evidence | What to report |
| --- | --- |
| Warnings | Episodes detected/missed, false warnings per shift, lead time, probability error, and onset-range coverage |
| Time to act | Fraction of warnings allowing review + setup + five-minute margin: 20 minutes for transfers/discharges, 30 for surge spaces, 25 for diagnostics |
| Main benefit | Total patient-minutes in ED and average total ED time, against each baseline |
| Patient experience | Initial wait, care/tests time, time awaiting departure, and median/90th-percentile results by urgency |
| Resource effects | Boarding, occupied ED-space minutes, staff/diagnostic/transport use, and donor-pathway costs |
| Limits | No-help cases, unfinished patients, urgent-delay failures, and unannounced shocks |

For the full-shift comparison, score the same arrival cohort and follow it to departure after arrivals end. A boarding blockage that does not clear must remain an unfinished result. Never average only the patients who left quickly. Report that all benefits are within this simulator; a favorable result on one case is not general proof.

Required checks are focused on consequential behavior:

- Patient counts and resource occupancy balance after every transition; no negative capacity or double allocation.
- Congestion duration, recovery, and horizon-boundary timestamps are correct.
- Forecasts cannot access hidden replay schedules or change when only those schedules change.
- Unapproved, infeasible, or not-yet-ready actions do not free capacity.
- Paired comparisons preserve patient demand and care requirements.
- An action with better average time but worse urgent delays is not ranked best.
- Missing, stale, duplicate, delayed, and impossible events produce the expected status or validation error.

Save a results table, run metadata, a bottleneck example, an urgent-delay example, and a no-effective-action example. Claim improvement over the best simple baseline only if the measured results support it.

## 6. Finish inside the window

If a checkpoint slips, cut learned models, extra screens, decorative animation, action combinations, and deployment first. Retain all four action families, finite resources, future isolation, urgent-delay checks, and a measured baseline comparison. Expose a failed check rather than hiding it behind a polished screen.

At hour 14, freeze features and prepare three short paths: a normal shift, a developing blockage with an approved intervention, and a case where data or resources prevent a recommendation. Keep saved model-generated replays and result files as the fallback.

Rehearse the supplied local format of three minutes plus two minutes of questions; confirm any newer organizer format. Explain the user, the prediction, why one action is preferred, and the measured difference. Be ready to answer about synthetic assumptions, false warnings, urgent delays, and future hospital validation.

**Open external check:** organizer acceptance of synthetic-only evidence remains unverified. The team should resolve it with organizers; it does not block this approved planning task. Real data access, local thresholds, prospective hospital testing, and integrations belong to a later hospital partnership.

The build is ready to present only after the evidence and rehearsal checks in [TRACK_1_CHECKLIST.md](TRACK_1_CHECKLIST.md) have actually passed. A finished plan does not mark the product ready.
