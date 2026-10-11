# PulseAhead ED operations

PulseAhead demonstrates forecasts and intervention decisions for simulated emergency department operations. The language distinguishes proposed actions, staff authorization, and simulated outcomes.

## Language

**Hospital profile**:
The description of an ED's treatment spaces, staffing, diagnostic services, inpatient capacity, and transport resources. The hackathon's profile represents a fictional ED.
_Avoid_: Validated hospital configuration

**Usable treatment space**:
A physical ED treatment space with the staff and other resources required to accept a patient. A physically empty space is not necessarily usable.
_Avoid_: Empty bed alone

**Urgency group**:
A supplied category representing the urgency of a patient's care. The demo distinguishes three such groups and reports waiting outcomes separately.
_Avoid_: Model-generated diagnosis

**ED simulation**:
A representation of emergency department patient flow and operational resources using synthetic events. Its outcomes describe the represented scenario rather than observed hospital performance.
_Avoid_: Live hospital evidence

**Operator**:
The ED shift coordinator working with the bed manager to review congestion forecasts and proposed flow interventions.
_Avoid_: Everyone in the hospital

**Operational intervention**:
A staff-authorized change to patient-flow processes or available resources intended to relieve congestion.
_Avoid_: Autonomous clinical decision

**Operational action catalog**:
The defined set of interventions available for staff to consider, including each intervention's approval role, resource requirements, completion time, and possible trade-offs.
_Avoid_: Unrestricted generated instruction

**Intervention resource cost**:
The staff time, diagnostic capacity, transport capacity, or other finite resources consumed by an operational intervention.
_Avoid_: Assumed cash savings

**Recommendation**:
A proposed operational intervention presented to staff for review and approval.
_Avoid_: Executed action

**Urgent-patient delay check**:
A comparison of how an intervention changes urgent patients' initial waits and total ED time. It prevents better average results from hiding worse urgent-patient delays in the simulation.
_Avoid_: Proven clinical safety, modeled medical outcomes

**Approval**:
Staff authorization to begin a proposed operational intervention.
_Avoid_: Recommendation, completion

**Deferred recommendation**:
A recommendation whose approval decision staff have postponed. It has not authorized an intervention.
_Avoid_: Approved intervention

**Rejected recommendation**:
A recommendation that staff have declined to authorize.
_Avoid_: Completed intervention

**Sustained operational congestion**:
An ED condition in which usable treatment spaces are exhausted and the waiting-for-treatment queue reaches or exceeds the chosen threshold for the required duration. The episode may later clear naturally or following an intervention.
_Avoid_: Any queue increase, full beds alone

**Tipping point**:
The beginning of a sustained operational congestion episode.
_Avoid_: Instantaneous arrival-rate crossing, permanent collapse

**Building congestion**:
The full-space and waiting-queue conditions have started, but have not yet lasted long enough to confirm a congestion episode.
_Avoid_: Confirmed congestion, warning before onset

**Recovery**:
A sustained reduction in the waiting-for-space queue that meets the profile's recovery rule after a congestion episode.
_Avoid_: One brief improvement

**Cannot assess**:
The system lacks sufficiently recent essential information to give a usable congestion forecast.
_Avoid_: Low risk, stable ED

**Congestion forecast**:
An estimate of when sustained operational congestion may begin and how likely it is, based on information available at the decision time.
_Avoid_: Known future outcome

**Intervention comparison**:
A comparison of simulated outcomes from the same starting situation and underlying scenario with and without a proposed operational intervention.
_Avoid_: Demonstrated hospital benefit

**Total ED time**:
The time from a patient's arrival until the patient physically leaves the ED, whether for a ward, another facility, or home.
_Avoid_: Time to first assessment, time to the discharge decision

**Initial wait**:
The time from ED arrival to the first clinician assessment. It is one part of total ED time.
_Avoid_: Full ED stay

**Care and tests time**:
The time from first clinician assessment to the decision to admit, discharge, or transfer the patient.
_Avoid_: Active clinician work alone

**Time awaiting departure**:
The time from the admission, discharge, or transfer decision until the patient physically leaves the ED.
_Avoid_: Initial wait, physical departure already completed

**Preventive action**:
An intervention expected to reduce or delay congestion before the episode starts.
_Avoid_: Guaranteed prevention

**Recovery action**:
An intervention intended to relieve an episode of congestion that has already started.
_Avoid_: Prevention after onset

**Clinical clearance**:
A clinical staff decision that a patient is eligible for a specified discharge or transfer pathway.
_Avoid_: Operational model's eligibility prediction

**Disposition**:
The supplied clinical decision about whether a patient will be discharged, admitted, or transferred.
_Avoid_: Physical departure, completed transfer

**Boarding**:
Patients remaining in the ED while waiting for an inpatient bed or transfer after initial ED care. [Source: ACEP](https://www.acep.org/administration/crowding--boarding).
_Avoid_: Waiting for first assessment

**Access block**:
In this project, an admitted patient's transfer from the ED to inpatient care being prevented by unavailable inpatient bed capacity. [Source: ACEM, section 5.1](https://policy.acem.org.au/index.php/policies-menu/p18-responsibility-for-care-in-emergency-departments).
_Avoid_: Any queue growth, arrivals exceeding departures
