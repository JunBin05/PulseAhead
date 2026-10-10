# PulseAhead: Problem Statement and Proposed Solution

**Purpose:** Define an accurate product proposal aligned with the Dormathon 2026 pitch and the highest band of the Track 1 rubric.
**Scope:** The problem, the solution, the decision supported, and the evidence needed to substantiate it.
**Status:** Proposed product requirements; not a claim that every capability or performance target has been demonstrated.

## 1. Problem statement

Emergency department shift coordinators must decide when to activate additional operational resources before patient flow becomes congested. Current patient counts and free-bed counts describe the present situation, but alone they do not tell the coordinator whether incoming demand and delayed departures will overwhelm available staffed capacity, when that may happen, or which intervention is most likely to help.

Three pressures can compound:

- **Blocked departures:** Admitted patients remain in ED spaces while waiting for suitable ward/ICU beds or transfer processes, reducing capacity for new patients.
- **Diagnostic delays:** Patients needing test results and review may remain in the ED longer, holding treatment spaces and delaying disposition.
- **Incoming demand:** Walk-ins and announced ambulance arrivals add work while existing patients are still waiting or occupying resources.

The problem is therefore an impending mismatch between patient demand and the ED's ability to assess, treat, and move patients onward. A long queue is an observable symptom; it is not a sufficient explanation of the cause or a complete guide to action.

**The decision:** Which feasible resource intervention should the responsible supervisor start now, and can it take effect soon enough to improve patient flow without unacceptable modeled delays for urgent patients or other services?

This is an operational decision-support problem. PulseAhead does not determine diagnoses, assign clinical urgency, authorize clinical discharge, or promise improved clinical outcomes.

## 2. Proposed solution

**PulseAhead is an ED operational forecasting and decision-support product that predicts the risk and timing of sustained congestion, explains the likely bottleneck and expected waits, and ranks feasible interventions by their modeled benefit, urgency, and resource requirements.**

The product completes one decision loop: **Predict -> Explain -> Act -> Compare the outcome.**

### Predict: when might the ED become congested?

Use received patient-stage timestamps, queues, staffed-space availability, service capacity, diagnostic turnaround, boarding state, and available ambulance announcements to estimate possible future flow. Incoming ambulance information requires an actual received announcement feed; it cannot be inferred solely from patient timestamps.

Forecast sustained operational congestion rather than treating any crowding as collapse. Show:

- Probability of congestion within the stated forecast horizon.
- Estimated time remaining and an onset range when an event is predicted.
- Current versus future congestion, and local bottlenecks versus overall ED congestion.
- No predicted event or Cannot assess when the evidence does not support a useful forecast.

**Pitch ambition:** warnings 30-60 minutes before congestion. This is a performance target to evaluate, not an established capability or a guarantee for every situation.

### Explain: what is constraining flow, and how does it affect waits?

Identify the modeled limiting service or resource and explain it using observations the operator can inspect: patients boarding, suitable bed availability, diagnostic queues/turnaround, staff capacity, and received incoming demand.

Show a predicted wait with its meaning, affected patient group or service, units, and uncertainty. The deck promises a wait forecast but does not specify a single wait metric. Proposed product choice: time to first assessment and the relevant bottleneck wait where the model supports them; total ED time is used when comparing interventions. An elapsed wait is an observation, not a wait forecast.

The explanation must say why the alert appeared, why the proposed action may help, and what it costs or could worsen. A model-derived bottleneck is an explanation within the model, not proof of hospital causation.

### Act: which available fix should staff consider first?

Compare feasible actions with no action under matched demand and patient requirements. Show expected benefit, uncertainty, setup delay, resource cost, required owner, and urgent-patient effects. Rank supported choices and let the responsible supervisor approve, reject, or defer.

These are concrete proposed operational responses, not guaranteed solutions to every bottleneck:

| Pressure | Proposed response | Essential limitation |
| --- | --- | --- |
| Transfer processing delays | Coordinate already-eligible ward transfers with additional allocation support. | A suitable available bed and transport are still required. Coordination cannot create beds or discharge ward patients. |
| Cleared patients awaiting departure | Add discharge-processing support. | Only clinically cleared patients with completed prerequisites are eligible. |
| Insufficient staffed ED spaces | Activate declared reserve spaces with their staff coverage. | Physical space without staff is not usable capacity. |
| Diagnostic backlog | Activate reserve lab/imaging capacity or approved reallocation. | Capacity must exist; reallocation requires donor approval and evaluation of donor-service delays. |
| Triage backlog | Activate an available staffed surge triage desk. | The extra desk needs its declared reserve team. |
| Assessment backlog | Activate an available reserve physician. | More physician work capacity does not create beds or solve a ward-bed shortage. |

If no feasible action has a supported benefit, say so. If the actual constraint is a fully occupied ward with no suitable bed release, the proposed transfer-coordination action may not help. Show the unresolved bed constraint and escalation need rather than presenting "free ward beds" as an executable capacity button.

### Compare the outcome: did the model improve the decision?

Preserve the prediction and decision, then observe the simulated result separately. Evaluate PulseAhead against no action and clearly defined reactive/simple-flow policies with comparable information, resources, and action delays.

Report total ED patient-minutes, boarding, urgent-patient delays, occupied-space time, and resource use. Any patient-minutes-per-resource-hour measure is **operational efficiency**, not financial ROI. Disclose the resource type, calculation, uncertainty, and unfinished stays.

## 3. Accurate version of the pitch story

At a particular moment, the ED's headline counts may appear manageable. Received observations reveal blocked departures, diagnostic delays, and incoming demand. PulseAhead estimates whether those pressures will become sustained congestion, explains the limiting constraint, and compares actions staff could realistically start. The supervisor chooses a feasible response, its effects begin after review and setup, and the product shows the resulting simulated flow.

The deck's 12 waiting patients, three free beds, 14 admitted patients unable to leave, 76-versus-48-minute laboratory turnaround, six ambulances, and 38-minute warning are illustrative story values. Use actual model values in the live product; do not hardcode a successful forecast or recommendation.

Show all three drivers only when received evidence supports all three. If a scenario has imaging delay rather than lab delay, label imaging accurately. If only two drivers are present, describe two. If the predicted episode is local diagnostic overload, do not label it overall ED congestion. The system's actual best-supported action takes precedence over the slide's example fix.

Describe the comparison panel as a **defined reactive/counts-based baseline**, not a claim that every existing dashboard lacks forecasting. A queue-only threshold invented for the demo cannot establish superiority over a stronger baseline. Compare warning times for the same event and definition, and label any later-known no-action alarm time as a retrospective simulation result rather than information available to the operator at that moment.

## 4. Evidence needed for the highest rubric band

| Criterion: 20 points each | What this proposal must prove |
| --- | --- |
| Problem Clarity & Value Proposition | A named ED decision maker, a precise resource decision, and a quantified operational business case with benefit and resource cost. |
| Predictive Rigor & Data Robustness | A sound forecasting method, held-out evaluation, fair baselines, measured false alarms/misses/lead time, and resilience to noise, outliers, and missing inputs. |
| Decision Support & Actionability | Detection, bottleneck classification, impact/urgency ordering, concrete feasible recommendations, ownership, delayed effects, and better-decision evidence. |
| Explainability & Trust | Plain-language reasoning tied to actual inputs, meaningful wait forecasts, visible uncertainty, trade-offs, and honest limitations. |
| Live Execution, Prototype & Pitch | A working deployed end-to-end product, a clear presentation within three minutes, and evidence-backed Q&A. |

Target all five criteria. Do not weaken the action benefit or urgent-delay checks to manufacture a winner. Choose model settings using development/tuning data and freeze them before final evaluation; if final results guide another change, those results are no longer an untouched final test.

## 5. Scope and claims

The current competition proposal is a single-hospital synthetic demonstration. A 3D view can help explain flow but is a presentation choice, not the core solution or evidence of predictive quality.

Cross-hospital adaptation, statewide capacity comparison, ambulance routing, historical hospital calibration, and a three-month real-data pilot are roadmap work. A timestamp/rate-based design can support that direction; it does not prove the model works in any hospital.

Keep a visible synthetic-data disclosure. The deck's public-ED-data provenance claim requires a named dataset and reproducible parameter mapping; until verified, state the synthetic assumptions accurately. Real patient-data use requires appropriate approval and privacy controls; fictional IDs in a demo do not establish real-data anonymization.

Claims about achieved false-warning rates, baseline wins, completed interventions, deployment, or rehearsal require current artifacts. They are not established merely because they appear in a continuation prompt.

## 6. Demo storytelling brief

Make the demo tell six clear beats:

- **A.** Present the actual current ED condition and headline counts. Call it Stable only if the received state says so.
- **B.** Show the received pressures: boarding/suitable ward capacity, diagnostics, and announced arrivals. Use the actual service and available evidence; never invent a third driver or relabel imaging as lab.
- **C.** Show the model's event probability, time/onset range, bottleneck, and genuinely predicted wait. Distinguish local overload from overall ED congestion. Compare against a disclosed fair baseline for the same event; later-known baseline outcomes are retrospective evidence.
- **D.** Show the best-supported feasible fix, expected benefit and uncertainty, resource cost, owner, and setup timing. Use operational efficiency wording, not ROI.
- **E.** Follow the owner's decision, review/setup, and actual delayed effects. Never create staff or beds, bypass clearance, or force a recommendation. A full ward is not solved merely by adding transfer coordination.
- **F.** Show measured evaluation results and synthetic limitations, then close with Predict / Explain / Act using facts from the run.

Select a reproducible development scenario for presentation, clearly labeled as a demo case. Use real model values rather than the slide's example numbers. A chosen demonstration is not held-out performance evidence. If a requested capability is absent, identify the gap instead of claiming it exists.

Preserve model definitions and benefit/urgent-delay checks. Do not tune parameters to manufacture the pitch outcome. Freeze all tuning before final evaluation, disclose failures and prior exposure of test cases, and report the comparison with both no action and the strongest appropriately tuned baseline.

Prioritize the problem-to-decision journey and evidence over added screens or decorative effects. Keep the whole presentation within 180 seconds, including the value evidence and limitations. Verify actual behavior and distinguish observed state, predictions, retrospective comparisons, and completed outcomes.
