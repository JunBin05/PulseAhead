# 11: Compare ward coordination and route supervisor approval

**What to build:** A bed manager compares ward coordination with no action, receives the correctly routed request, approves/rejects/defers it, and watches a delayed real effect.

**Blocked by:** 10 — Predict bottlenecks and explain the time remaining.

**Status:** ready-for-agent

**Rubric focus:** Complete decision loop; concrete interventions.

- [ ] Create reusable paired comparisons from one received snapshot using patient/task-keyed randomness, retained cohort/follow-up rules, and explicit incomplete outcomes.
- [ ] Derive approving roles from required resource owners, not the alert zone. A diagnostic alert recommending ward coordination routes to its bed manager.
- [ ] Require eligible cleared patients, suitable ward/ICU capacity, transport, and a reserve coordinator. A successful action adds one allocation slot, never a ward bed or clearance.
- [ ] Implement versioned requests with required owners, per-role decision identities, wrong-role feedback, stale refresh, reject/defer, and local command-center escalation records.
- [ ] Partial/missing owner approval reserves nothing and changes no capacity. The final valid approval atomically enters five-minute review, ten-minute setup, active, draining, and terminal states.
- [ ] Follow the spec's one-action limit, reservations, activation rechecks, 60-minute active window, start gap, expiry/draining costs, and idempotent decisions.
- [ ] Pause replay during comparison/review, show source time, preserve selection on stale changes, and require explicit resume. Review exposes benefit/urgent effects/resources and actual request progress.
- [ ] Playwright MCP checks allocation-backlog success with existing beds/transport, unavailable-bed failure, wrong-owner route, all staff choices, concurrent requests, stale/duplicate approvals, setup resource loss, and actual timing.
- [ ] Do not label Best action until the later ranking contract is complete.

