# 13: Compare staffed surge treatment spaces

**What to build:** The ED attending lead compares and approves four reserve spaces with their staff team and watches queued patients use them after setup.

**Blocked by:** 11 — Compare ward coordination and route supervisor approval.

**Status:** ready-for-agent

**Rubric focus:** Actionability; resource realism.

- [ ] Require four reserve spaces and their available coverage team, with ED attending lead or the configured resource owner.
- [ ] After five-minute review and 20-minute setup, activate four staffed spaces for the shared 60-minute window; never create coverage from empty space alone.
- [ ] Retain common approval/version/mutex/reservation/pairing/cohort rules and show staffing cost plus urgent/group outcomes.
- [ ] On expiry, stop new admissions to closing surge spaces and retain coverage for occupied patients until departure; no eviction and no premature release.
- [ ] The scene and zone counts show capacity changes only from received activation events, with setup/active/draining status beside the action.
- [ ] Playwright MCP checks success, unavailable team, no benefit, setup boundary, duplicate use, occupied-at-expiry, and release/cost records.

