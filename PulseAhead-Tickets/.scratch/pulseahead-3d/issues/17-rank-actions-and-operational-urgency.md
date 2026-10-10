# 17: Rank six actions by benefit, urgent delays, and time to act

**What to build:** An operator sees all six actions ranked with honest benefit, urgent-delay checks, costs, and preventive/recovery timing, without a forced winner.

**Blocked by:** 11 — Compare ward coordination and route supervisor approval; 14 — Compare diagnostics (reserve slot).

**Status:** backend and ranking smoke-verified; panel and alert-impact UI boxes stay open until browser-checked, see `evidence/17-rank-actions-lite.md`

**Rubric focus:** Prioritize impact and urgency; actionable decisions; trust.

### Criteria (scope amendment, final build)

- [x] Compare every feasible action (ward coordination, diagnostic reserve slot) with no action on the same paired futures; infeasible actions are listed with their reason and the not-modeled presets are shown as such.
- [x] Best action only when the mean saving in total ED patient-minutes is positive, its normal-approximation 90% lower bound (mean - 1.645·sd/√n) is positive, and the urgent check passes (mean change in urgent initial wait ≤ +5 simulated min, mean change in overdue-urgent count ≤ 0). Fewer than 20 futures with a complete urgent outcome → Needs review. Otherwise No action shown to help / Needs review / Urgent delay check failed / Cannot assess. Never a forced winner.
- [ ] Order: feasibility, urgent check, supported saving, resource-hours. Each action gets its latest-start deadline (onset low bound - 5 min review - setup - 5 min margin), replacing ticket 10's provisional action; alert impact is filled from the comparison.
- [ ] Panel: no action vs the selected action on the same axes: the three ED-time parts (initial wait, care and tests, awaiting departure), urgent effects, resource-hours and required owners; a stale version cannot approve an old ranking.
- [x] API smoke: one case with a supported Best action, one no-help case (no-effective-action family) and one Cannot assess case; the labels match the rule recomputed from the response.

Descoped: whole-future bootstrap, nearest-rank p90, the two-urgent-patient gate details and donor checks.

### Original criteria (reference only; superseded by the scope amendment)

- Implement the active spec's supported-positive-benefit gate, paired no-action reference, feasibility, urgent checks, and resource-cost ordering.
- Use the exact whole-future bootstrap, nearest-rank p90, singleton/empty-cohort handling, minimum evidence gate, and donor checks. Show model-conditional uncertainty and all denominators.
- Best requires positive supported savings and passing urgent/donor bounds. Incomplete, sparse, missing donor, or uncertain harm cannot win; show No action shown to help, Needs review, or Cannot assess.
- Calculate the spec's estimated latest-start time from the lower conditional onset-range bound minus review/setup and five-minute margin. Show its source/chance, provisional action assumption, unavailable/past deadline, and recovery state; prioritize by deadline then supported impact without implying guaranteed prevention.
- Compare no action and one selected action on identical axes; show three-part complete-cohort ED-time bars/table and urgent/resource effects alongside benefit. Incomplete stays show accrued time/counts instead.
- Explain each preferred/excluded action and its required owners in plain language; stale versions cannot approve an old ranking.
- Playwright MCP checks known pass/harm/insufficient calculations, harmful singleton futures, donor harm, four/six feasible no-positive-benefit actions, cap/unfinished cases, and preventive/recovery/no-help output.
- Playwright MCP compares panel/chart/table values with actual API/export records and checks all catalog choices are reachable from the selected-zone view.
