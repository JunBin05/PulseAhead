# 04: Show diagnostic queues and return to the doctor

**What to build:** Patients needing tests visibly gather in zone 3, keep their ED beds, and return to the clinician for result review before a decision.

**Blocked by:** 03 — Model doctor assessment and shared staffing.

**Status:** ready-for-agent

**Rubric focus:** Predictive rigor; explainability; live demonstration.

- [ ] Implement finite lab and imaging resources, task-specific queues/turnaround, received results, and clinician result-review work.
- [ ] Support 2→3→2→4 and direct 2→4 routes. Not every patient requires tests; tests can have different requirements by supplied route.
- [ ] Zone 3 represents logical diagnostic waiting/work even when the patient physically remains in their ED bed; do not display a second copy in zone 2.
- [ ] Retain bed reservation through tests. Separate clinician active work from waiting for results; do not hold a physician slot for all diagnostic waiting time.
- [ ] Required care/tests plus a received clinical decision must both be complete before operational eligibility; preserve premature clearance as ineligible.
- [ ] Show separate lab/imaging queues and task-per-hour quantities. Queued dots cluster at the actual waiting area with readable exact counts.
- [ ] Playwright MCP runs lab/imaging delays, direct/no-test route, result-review return, retained-bed growth, premature clearance, and patient identity/count agreement.

