# Open questions

Spec rules that are ambiguous. Each one records the working decision so the build can continue; change the decision here if the answer differs.

## Q1. What does "reserved resuscitation space within the 24-space pool" mean? (ticket 02)

Spec §Four phases, zone 2: "Supplied critical arrivals bypass registration to a reserved resuscitation space within the 24-space pool; no unlimited critical bay."

**Working decision:**
- 2 of the 24 regular spaces (`R1`, `R2`) are resuscitation spaces held for critical-bypass patients. The other 22 (`S01`–`S22`) serve everyone else.
- A critical patient waits for a resuscitation space when both are taken. They do not spill into general spaces, and no extra bed is created.
- The number 2 is a demo assumption in `profile.py`.

**Alternative not taken:** critical patients take any free space first, with top priority.

## Q2. Which spaces count as "available staffed spaces" for the congestion rule? (ticket 02)

**Working decision:**
- *Available staffed spaces* counts free general spaces only, because a waiting non-critical patient cannot use a resuscitation space.
- *Patients awaiting a space* counts both queues (general and resuscitation).
- Resuscitation availability is reported separately in `resources.resus_spaces`.
