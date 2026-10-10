# Open questions

Spec rules that are ambiguous. Each one records the working decision so the build can continue; change the decision here if the answer differs.

## Q1. What does "reserved resuscitation space within the 24-space pool" mean? (ticket 02)

Spec §Four phases, zone 2: "Supplied critical arrivals bypass registration to a reserved resuscitation space within the 24-space pool; no unlimited critical bay."

**Working decision:**
- 2 of the 24 regular spaces (`R1`, `R2`) are resuscitation spaces held for critical-bypass patients. The other 22 (`S01`–`S22`) serve everyone else.
- A critical patient waits for a resuscitation space when both are taken. They do not spill into general spaces, and no extra bed is created.
- The number 2 is a demo assumption in `profile.py`.

**Alternative not taken:** critical patients take any free space first, with top priority.

**Decision (user, 2026-10-10):** keep as is.

## Q2. Which spaces count as "available staffed spaces" for the congestion rule? (ticket 02)

**Working decision:**
- *Available staffed spaces* counts free general spaces only, because a waiting non-critical patient cannot use a resuscitation space.
- *Patients awaiting a space* counts both queues (general and resuscitation).
- Resuscitation availability is reported separately in `resources.resus_spaces`.

**Decision (user, 2026-10-10):** keep as is. From ticket 03, "staffed" also requires the covering nurse to be on duty (see Q3).

## Q3. What are the nurse and doctor staffing units? (ticket 03)

Spec §Events/patients/resources: "Record doctor/nurse identities, availability, coverage pools, and owner roles. Shared staff are not counted as additional independent workers." The spec gives no nurse numbers.

**Working decision (fictional demo units, not staffing ratios):**
- Doctors `D1`-`D4` each hold one of the 4 clinician-work slots. Reserve physician `D5` is declared and inactive (owner: ED attending lead; activation is ticket 16).
- Nurses `N1`-`N6` each cover a fixed block of 4 spaces (`N1` S01-S04 ... `N5` S17-S20, `N6` S21, S22, R1, R2). An empty space is *staffed* only while its covering nurse is on duty.
- A nurse going off duty never evicts an occupied space; the space just cannot be granted again until coverage returns.
- Nurses and doctors are on duty for the whole shift in normal scenarios. Coverage changes come only from a supplied staffing roster in test fixtures.
- Stabilization is a supplied care task (urgent group and critical bypass only), running from first assessment alongside the doctor's work. It needs no extra worker; the covering nurse is the staffing owner.

**Alternative not taken:** a per-nurse limit on concurrent care tasks.

## Q4. How do diagnostics loop and what does a premature decision look like? (ticket 04)

Spec: "1→2→3→2→4 ... diagnostics/result review can loop without adding duplicate [time components]" and "a premature decision stays ineligible".

**Working decision:**
- A patient makes one pass through zone 3: their supplied tests run one after another (lab, then imaging), then they return to zone 2 once for result review. Repeated rounds are not modeled.
- Tests are supplied per patient (kind and turnaround) and stay hidden until the patient's first assessment ends and the tests are ordered.
- A premature decision is a supplied clinical decision that arrives at the end of first assessment, before the tests are back. It is recorded as received but not eligible; disposition starts only when tests, review and any care task are all done.
- Lab turnaround is triangular 15/28/50 min (median 30.4) and imaging 25/42/70 min (median 44.9), matching the spec's lab 30 and imaging 45 medians. Test need by urgency group and result review (3/5/8 min) are demo assumptions.

**Alternative not taken:** a second test round after review.

## Q5. What are the "three mutually exclusive parts" of total ED time, and what is boarding? (ticket 05)

Spec: "Save patient stage timestamps for the three mutually exclusive parts of total ED time" and "Show initial wait, care/tests time, time awaiting departure, boarding, occupied ED-space minutes ... separately". The spec names five quantities and calls three of them mutually exclusive.

**Working decision:**
- The three exclusive parts partition arrival to physical departure: **initial wait** (arrival to first assessment), **care and tests** (first assessment to effective disposition, including result review and any required care task), and **awaiting departure** (effective disposition to physical departure).
- **Boarding** is not a fourth part: it is the awaiting-departure part for patients going to the Ward/ICU (bed, allocation work and transport), and is null for home patients. **Occupied ED-space minutes** is a separate resource record (space grant to departure) and overlaps the parts.
- Unfinished stays report accrued minutes and are counted apart; they are never averaged as complete.

**Ward/ICU bed pool (demo assumptions):** 6 ward beds (WD1-WD6) and 2 ICU beds (IC1, IC2); WD1, WD2 and IC1 are free at the start, the others are occupied by inpatients and released at 90, 150, 240, 420 min (ward) and 200 min (ICU). Ward and ICU beds are not interchangeable. A bed given to an ED patient stays occupied for the rest of the run.

**Alternative not taken:** splitting awaiting departure into discharge processing and boarding as two exclusive parts.

## Q6. What counts as "necessary capacity unavailable", and how are the rates windowed? (ticket 06)

Spec §Zone pressure: local overload occurs when the queue reaches its threshold, "or necessary capacity is unavailable while eligible work waits", for ten continuous minutes; λ uses the previous 30 minutes and μ comes from finite staffed slots and disclosed task durations.

**Working decision:**
- *Necessary capacity unavailable* means no suitable free capacity while a patient waits for it: no free staffed general space while a general patient awaits one (or no free resuscitation space while a critical patient does), and no suitable free Ward/ICU bed while a transfer awaits one. Busy units alone are not "unavailable"; a queue at threshold covers that case.
- The staffed-space and Ward/ICU-bed services have no queue threshold. They alarm only on unavailable capacity (one waiter is enough, for 10 minutes).
- Discharge processing, ward allocation and transport use the same threshold, 3 (the spec gives one "departure processing/allocation" value).
- λ is entries into the service's queue in the previous 30 simulated minutes (the window is shorter early in the run), per hour. The first queue is entered at arrival. μ is servers × 60 / mean task minutes, using the mean of the disclosed triangular assumptions (lab and imaging: the disclosed medians). Recent throughput is completions in the same window, shown apart.
- A service whose inputs are missing shows Cannot assess. A building interval is no longer continuous and is dropped. An episode that is already confirmed stays open (it is not cleared and its zone keeps the red state), because missing inputs cannot establish recovery.
- Zone state is the worst of its services: Overloaded, then Pressure building, then Cannot assess, then Normal.
- **Assessment units (added at the 03-06 review gate).** Assessment λ and recent throughput count first assessments (patients per hour); a result review is the same patient returning to a doctor, so it has its own work-log key and is not a new arrival. Assessment μ = doctor slots × 60 / (mean first assessment + review share × mean result review), where review share = result-review entries ÷ first-assessment entries so far (capped at 1, 0 before any assessment). The queue and the alert counts still merge both kinds of waiting, because they share the same doctors.
- **Onset timing.** Local and overall onsets are taken at the one-minute monitor tick that first sees the condition, so a stored onset can be up to 1 simulated minute after the true start.
- **Unit capacities are never zero in this build.** Triage, doctors, lab, imaging, discharge, allocation and transport always have at least one staffed unit; their "capacity unavailable" flag is therefore always false. Only the staffed-space and Ward/ICU-bed services can report unavailable capacity. A scenario that removes a whole service would need its own fixture.
- **A normal 12 h shift ends with the ward-bed alert open.** A bed given to an ED patient stays occupied for the rest of the run (Q5), so beds never release after use and the ward-bed service stays Overloaded late in a normal shift. This is an honest consequence of the disclosed bed assumption, not a defect in the rule; ticket 09 scenarios revisit it.

**Alternative not taken:** treat any fully busy unit as capacity unavailable (this would raise an alert at normal load); show a zone as Cannot assess as soon as one service is missing, even with a confirmed episode.

