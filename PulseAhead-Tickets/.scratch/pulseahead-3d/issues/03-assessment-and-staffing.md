# 03: Model doctor assessment and shared staffing

**What to build:** An operator sees doctor-assessment queues, assigned staff, urgency-based work, and finite treatment-space coverage that affects patient progress.

**Blocked by:** 02 — Show walk-ins, critical entries, and inbound ambulances.

**Status:** done. Evidence: [evidence/03-assessment-and-staffing.md](../../../../evidence/03-assessment-and-staffing.md) (all 7 criteria pass; Playwright MCP, 2026-10-10)

**Rubric focus:** Predictive rigor; problem realism.

- [x] Model four clinician-work slots, finite nurse/coverage pools, reserved ED spaces, and supplied care tasks. Record concrete fictional staffing units and identities.
- [x] Use supplied urgency ordering without interrupting work already underway. Critical patients still respect available resuscitation, clinician, and coverage resources.
- [x] Expose active work separately from waiting. A patient keeps the same reserved ED space until actual departure; a work-slot release is not a bed release.
- [x] Shared doctors/nurses are not duplicated as independent capacity in several phases. Resource owners and reservations are explicit and balanced.
- [x] Maintain first-assessment and care-prerequisite timestamps; received clinical decisions cannot invent completed care.
- [x] Zone 2 dots/counts and a readable staffing summary use the same source version. Explain empty but unstaffed spaces plainly.
- [x] Playwright MCP checks urgency order, shared staffing, unavailable coverage, finite critical capacity, resource ownership/counts, and first-assessment timestamps.

