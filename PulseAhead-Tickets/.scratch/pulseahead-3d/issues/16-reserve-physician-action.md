# 16: Compare reserve physician assessment capacity

**What to build:** The ED attending lead compares a reserve physician slot and sees whether assessment work improves without additional physical beds.

**Blocked by:** 11 — Compare ward coordination and route supervisor approval.

**Status:** descoped (scope amendment 2026-10-11): not modeled in this build

**Rubric focus:** Phase 2 actionability; constrained resource value.

See the spec's "Scope amendment (2026-10-11, final build)". The reserve physician is listed in the catalog as not modeled and cannot be requested.

### Original criteria (not in this build)

- Use one declared reserve physician to add one clinician-work slot after five-minute review and 15-minute setup, for the shared 60-minute window.
- Require the owning ED attending lead and available physician; retain shared request/version/reservation/pairing and expiry behavior.
- An extra physician does not create treatment spaces, nurse coverage, clinical clearance, or guaranteed faster diagnostics.
- Show assessment/result-review work, all urgency outcomes, downstream bottlenecks, total ED time, and actual staff cost.
- Scene/drawer progress reflects received activation only. Finish active work after expiry before returning the physician.
- Playwright MCP checks assessment backlog benefit, bed/diagnostic-limited no help, missing physician, wrong owner, timing, and shared resource accounting.
