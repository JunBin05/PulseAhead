# 11: Compare ward coordination and route supervisor approval

**What to build:** A bed manager compares ward coordination with no action, receives the correctly routed request, approves/rejects/defers it, and watches a delayed real effect.

**Blocked by:** 10 — Predict bottlenecks and explain the time remaining.

**Status:** ready-for-agent (scope amendment 2026-10-11)

**Rubric focus:** Complete decision loop; concrete interventions.

### Criteria (scope amendment, final build)

- [ ] Paired comparison from one received snapshot: no action vs ward coordination on the same keyed futures (`fc:{seed}:{k}:{patient}`); cohort = patients present at the decision plus 90 min of arrivals, background arrivals continue, follow-up capped at 12 h; incomplete outcomes are counted apart, never dropped.
- [ ] Approvers come from resource ownership in `profile.py`, not from the alert zone: ward coordination routes to "Ward supervisor / bed manager" even when opened from a zone 3 alert.
- [ ] Eligibility needs a decided Ward/ICU patient that more allocation work can help and the declared reserve coordinator (add it to the profile). Success adds one ward-allocation slot; it never creates a ward bed or a clearance.
- [ ] Versioned requests with required owners, per-role idempotent decision identities, wrong-role refusal, stale-version 409, approve / reject / defer.
- [ ] Partial approval reserves nothing. The final grant enters review 5 min → setup 10 min → active 60 min → draining → completed/blocked, recorded as `action_*` events by the backend; one action in flight; activation rechecks the reserve (blocked if it is gone).
- [ ] UI: comparison panel opened from an alert (pauses the replay, shows its source time, Refresh when stale), demo-role switcher, approve/reject/defer, action progress on the map and in the drawer. No "Best action" label until ticket 17.
- [ ] Saved runs store decisions in `choices` and reload them; `ENGINE_VERSION` is bumped; the no-action path is unchanged (seed 7 normal still gives 705 events and 59 patients).
- [ ] API smoke: the right owner approves ward coordination and allocation capacity rises after setup (visible in `/state` and `/events`); a wrong owner is refused; a stale version gets 409; a repeated decision is idempotent; the no-action seed 7 counts are unchanged.

Descoped from the original: command-center escalation records, the concurrent-request stress check and per-criterion Playwright MCP evidence.

### Original criteria (reference only; superseded by the scope amendment)

- Create reusable paired comparisons from one received snapshot using patient/task-keyed randomness, retained cohort/follow-up rules, and explicit incomplete outcomes.
- Derive approving roles from required resource owners, not the alert zone. A diagnostic alert recommending ward coordination routes to its bed manager.
- Require eligible cleared patients, suitable ward/ICU capacity, transport, and a reserve coordinator. A successful action adds one allocation slot, never a ward bed or clearance.
- Implement versioned requests with required owners, per-role decision identities, wrong-role feedback, stale refresh, reject/defer, and local command-center escalation records.
- Partial/missing owner approval reserves nothing and changes no capacity. The final valid approval atomically enters five-minute review, ten-minute setup, active, draining, and terminal states.
- Follow the spec's one-action limit, reservations, activation rechecks, 60-minute active window, start gap, expiry/draining costs, and idempotent decisions.
- Pause replay during comparison/review, show source time, preserve selection on stale changes, and require explicit resume. Review exposes benefit/urgent effects/resources and actual request progress.
- Playwright MCP checks allocation-backlog success with existing beds/transport, unavailable-bed failure, wrong-owner route, all staff choices, concurrent requests, stale/duplicate approvals, setup resource loss, and actual timing.
- Do not label Best action until the later ranking contract is complete.
