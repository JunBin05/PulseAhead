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
