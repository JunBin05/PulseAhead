# Emergency Department Dynamic Queue Instability Predictor

## 1. Core Concept & Problem Statement

### Core Problem

Emergency Department (ED) operational failure is not caused by a single resource failure, such as a bed shortage, or by patient-volume spikes alone.

It is caused by **Dynamic Queue Instability**: a cascading chain reaction in which small delays across independent operational nodes—patient inflow, diagnostics, treatment, discharge, and downstream ward capacity—compound non-linearly.

The ED does not fail because one resource disappears. It fails because several small constraints emerge at the same time and reinforce one another.

### Paradigm Shift

| Traditional approach | Our approach |
|---|---|
| Predicts patient **volume** | Predicts **systemic instability** |
| Example: “80 patients will arrive today” | Example: “In 38 minutes, processing rate will fall below arrival rate, causing queue explosion” |
| Static and reactive | Dynamic and preventive |
| Focuses on how many patients arrive | Focuses on whether the ED can still process patients faster than they arrive |
| Alerts after queues become long | Warns before gridlock becomes irreversible |

The central question is not:

> “How many patients will arrive?”

It is:

> “How long do we have before the ED becomes unstable, and which bottleneck should we fix first?”

## 2. System Model Architecture

The ED is modeled as a three-stage fluid pipeline. Bottlenecks can emerge in any stage and cascade backwards through the system.

```text
[ INFLOW / INPUT ] --> [ THROUGHPUT / CORE ] --> [ OUTFLOW / OUTPUT ]

Ambulance ETA/count       Triage & waiting queues       Ward admissions
Walk-in arrivals          Doctor/nurse exams            Patient discharges
                          Labs & diagnostic tech        External transfers
```

### Stage 1: Inflow / Input

The rate at which patients enter the ED.

Key signals include:

- Walk-in arrival rate
- Ambulance arrivals and estimated time of arrival
- Triage acuity mix
- Time of day, day of week, weather, and local events
- Seasonal illness patterns

### Stage 2: Throughput / Core

The rate at which the ED can assess, diagnose, treat, and prepare patients for discharge or admission.

Key signals include:

- Doctor and nurse availability
- Triage queue length
- Time to first clinician assessment
- Laboratory turnaround time
- Radiology and imaging turnaround time
- Treatment-room and trolley availability
- Patient complexity and acuity mix

### Stage 3: Outflow / Output

The rate at which patients leave the ED through discharge, transfer, or admission.

Key signals include:

- Available inpatient beds
- Patients awaiting ward admission
- Discharge-processing delays
- Transport availability
- External transfer capacity
- Boarding time for admitted patients

## 3. Cascading Failure Sequence

The model treats ED collapse as a cascade rather than an isolated event.

### Step 1: Output Blockage

Downstream capacity becomes constrained.

Examples:

- Inpatient wards have no available beds.
- Admitted patients remain in the ED because they cannot be transferred.
- Discharges are delayed because transport, paperwork, or receiving units are unavailable.

Result: ED beds remain occupied by patients who are clinically ready to leave.

### Step 2: Throughput Slowdown

The blocked output reduces the ED’s ability to process new patients.

Examples:

- Laboratory or radiology turnaround increases.
- Doctors wait for diagnostic results before making disposition decisions.
- Treatment spaces cannot be turned over quickly.
- Staff are occupied managing boarded patients instead of new arrivals.

Result: the effective service rate of the ED decreases.

### Step 3: Inflow Backlog

New patients continue arriving while the ED’s processing capacity falls.

Examples:

- Ambulances continue to arrive.
- Walk-in patients continue to register.
- Free treatment spaces fall to zero.
- Triage queues grow rapidly.

Result: the ED enters **Access Block**, where arrival rate exceeds service rate and the queue expands faster than it can be cleared.

## 4. Key Model Target and Metrics

### Primary Target Variable

**Time-to-Tipping-Point**

\[
\Delta t_{collapse}
\]

This is the estimated time window remaining before the system’s service rate falls below its arrival rate and the queue begins to grow uncontrollably.

In simple terms:

\[
\lambda > \mu
\]

Where:

- \\( \\lambda \\) = patient arrival rate
- \\( \\mu \\) = effective ED processing or discharge rate

When \\( \\lambda > \\mu \\), the queue grows. The model estimates how soon this condition will become sustained and operationally critical.

Example output:

> “In approximately 38 minutes, the ED’s processing rate is expected to fall below its arrival rate. Without intervention, waiting times are likely to rise sharply.”

### Secondary Outputs

#### Primary Bottleneck Identification

The main constraint most likely to trigger or accelerate instability.

Examples:

- `Output: Inpatient bed allocation`
- `Output: Delayed discharges`
- `Throughput: Diagnostic turnaround time`
- `Throughput: Clinician capacity`
- `Inflow: Ambulance surge`

#### Secondary Bottleneck Identification

The next most important constraint that may compound the primary bottleneck.

Examples:

- `Throughput: Radiology turnaround time`
- `Output: Ward admission delay`
- `Inflow: High-acuity ambulance arrivals`

#### Expected Waiting-Time Delta

The predicted change in patient waiting time over a defined future window.

Example:

> “Median waiting time is expected to increase by 27 minutes within the next 40 minutes.”

## 5. Why This Is Different

Most existing ED analytics tools answer:

- How many patients will arrive?
- How many beds are available now?
- What was yesterday’s waiting time?
- Which department is currently busy?

This system answers:

- Which part of the ED will fail first?
- How quickly will the failure cascade?
- How much time do managers have to act?
- Which intervention will have the greatest stabilizing effect?
- What will happen to waiting times if no action is taken?

It shifts the output from a descriptive dashboard to an **operational early-warning and intervention-prioritization system**.

## 6. Example Model Output

```text
ALERT: Dynamic Queue Instability Detected

Time-to-tipping-point: 38 minutes
Confidence: Medium-high

Primary bottleneck:
Output — Inpatient bed allocation

Secondary bottleneck:
Throughput — Laboratory turnaround time

Current state:
- 14 patients awaiting ward admission
- 3 available ED treatment spaces
- Ambulance arrivals expected within 30 minutes: 6
- Average lab turnaround has increased from 48 to 76 minutes

Predicted impact:
- Median waiting time: +27 minutes within the next 40 minutes
- Risk of ambulance offload delay: High

Recommended actions:
1. Escalate inpatient bed allocation to hospital operations.
2. Prioritize discharge processing for medically cleared patients.
3. Activate fast-track pathway for low-acuity walk-in patients.
4. Alert laboratory team to prioritize urgent ED panels.
```

## 7. Intended Users and Decisions

| User | Decision supported |
|---|---|
| ED charge nurse | Reallocate nurses, open treatment spaces, prioritize triage |
| ED physician lead | Reassign clinicians, fast-track suitable patients, manage diagnostics |
| Hospital operations command center | Free inpatient beds, accelerate admissions, coordinate discharge teams |
| Laboratory / radiology lead | Prioritize ED tests and imaging |
| Ambulance coordination | Redirect or stagger non-critical ambulance arrivals when appropriate |

## 8. Technical Implementation Direction

### Data Schema

A practical minimum dataset should include time-stamped events at patient and resource level.

#### Patient-level events

| Field | Description |
|---|---|
| `patient_id` | Anonymous patient identifier |
| `arrival_time` | Time patient enters ED |
| `arrival_mode` | Walk-in, ambulance, police, transfer |
| `triage_time` | Time triage completed |
| `triage_category` | Acuity level |
| `doctor_seen_time` | Time first assessed by clinician |
| `lab_order_time` | Time laboratory test ordered |
| `lab_result_time` | Time laboratory result available |
| `imaging_order_time` | Time imaging ordered |
| `imaging_result_time` | Time imaging completed |
| `disposition_time` | Time discharge/admission decision made |
| `departure_time` | Time patient physically leaves ED |
| `disposition_type` | Discharged, admitted, transferred, left without being seen |
| `admission_request_time` | Time admission requested |
| `ward_transfer_time` | Time patient transferred to ward |

#### Resource-level events

| Field | Description |
|---|---|
| `timestamp` | Event time |
| `ed_beds_available` | Number of available treatment spaces |
| `doctors_on_shift` | Active clinician count |
| `nurses_on_shift` | Active nurse count |
| `waiting_queue_length` | Patients waiting for triage or assessment |
| `boarded_patients` | Admitted patients still occupying ED beds |
| `lab_queue_length` | Pending laboratory tests |
| `lab_avg_turnaround` | Recent laboratory turnaround time |
| `imaging_queue_length` | Pending imaging requests |
| `imaging_avg_turnaround` | Recent imaging turnaround time |
| `ward_beds_available` | Available inpatient beds |
| `ambulance_eta` | Expected ambulance arrival time |
| `ambulance_count_next_60m` | Expected ambulance arrivals in next hour |

### Feature Engineering

Use rolling windows rather than only current-state values.

Examples:

- Arrivals in the last 15, 30, 60, and 120 minutes
- Ambulance arrivals expected in the next 30, 60, and 120 minutes
- Average lab turnaround over the last 30 and 60 minutes
- Number of boarded patients
- Change in available ED beds over the last 30 minutes
- Ratio of arrivals to discharges over the last hour
- Queue growth rate
- Clinician workload per active patient
- Time since last successful bed turnover
- Day-of-week, hour-of-day, holiday, and weather indicators

### Modeling Approaches

Start simple, then add complexity only if it improves decision quality.

#### Baseline models

1. **Threshold rule**
   - Alert when arrivals exceed discharges for several consecutive intervals and available beds fall below a threshold.

2. **Queueing approximation**
   - Estimate \\( \\lambda \\) and \\( \\mu \\) from recent data.
   - Flag instability when \\( \\lambda \\) approaches or exceeds \\( \\mu \\).

#### Machine-learning models

1. **Classification model**
   - Predict whether the ED will enter an unstable state within 30, 60, or 90 minutes.

2. **Regression model**
   - Predict time-to-tipping-point in minutes.

3. **Survival model**
   - Estimate the probability that collapse has not yet occurred by a given future time.

4. **Bottleneck classifier**
   - Identify whether the dominant constraint is inflow, throughput, or outflow.

### Candidate Metrics

| Metric | Purpose |
|---|---|
| Precision / recall for collapse warning | Measures how reliably the model detects real instability |
| False-alarm rate | Prevents alert fatigue |
| Mean absolute error of \\( \\Delta t_{collapse} \\) | Measures accuracy of time-to-collapse prediction |
| Lead time | Minutes of warning provided before instability |
| Bottleneck identification accuracy | Measures whether the correct constraint is identified |
| Simulated waiting-time reduction | Estimates operational benefit of earlier intervention |

## 9. Demo Flow

1. Select a simulated ED state or upload a time-stamped operational snapshot.
2. The system calculates current inflow, throughput, and outflow rates.
3. It predicts whether instability will occur and when.
4. It identifies the primary and secondary bottlenecks.
5. It estimates the expected waiting-time increase.
6. It ranks recommended interventions by expected impact.
7. It displays both:
   - A stable scenario where no action is needed.
   - A near-collapse scenario requiring immediate intervention.

## 10. Important Limitations

- Real ED data is highly sensitive and requires governance, privacy controls, and hospital approval.
- The model should support operational staff; it should not replace clinical judgment.
- Predictions should include uncertainty, especially when data is delayed, incomplete, or affected by unusual events.
- A high alert rate can cause alert fatigue; thresholds must be tuned for operational usefulness.
- The system should clearly distinguish between observed data, forecasts, and simulated demonstrations.
