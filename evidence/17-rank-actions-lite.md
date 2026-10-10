# Evidence: ticket 17 (lite), ranking, priority list and what-if

**smoke-verified, not per-criterion.** `evidence/17-smoke.mjs` against the real backend on :8000 (output `evidence/17-smoke.out.txt`), engine `flow-4`. The UI (priority list, what-if selector, alert impact line) is type-checked and built but **not-run** in a browser until the guided-demo pass.

## Cases

| Case | Where | Result |
|---|---|---|
| Supported best action + supported runner-up | `diagnostic-delay` seed 7, T+100 | imaging `best_action` (saving mean 403.8, 90% lower bound 362.7 patient-min, 302.9 per reserve unit-hour); lab `supported_not_top` (42.2, lower bound 28.9). What-if imaging instead of lab: +361.6 patient-min, identical to the difference of the two savings |
| No help | `no-effective-action` seed 7, T+120 | ward coordination: saving 0.048, lower bound -0.011 -> No action shown to help |
| Needs review | `busy-recovers` seed 7, T+420 | lab reserve, 18 futures with a complete urgent outcome (< 20) |
| Cannot assess | `fixture-feed-staffing-stop`, T+45 | staffing feed stopped: every action Cannot assess, no numbers |
| Urgent check failure (observed, not asserted) | `busy-recovers` seed 7, T+100 | lab reserve saving lower bound 113.5 but mean overdue-urgent change +0.02 > 0 -> Urgent delay check failed |

## Checks

| Check | Result |
|---|---|
| Labels recomputed from the returned rule inputs | pass (all compared rows) |
| Order: feasibility, urgent check, supported saving (lower bound), resource-hours; at most one Best | pass |
| Infeasible actions listed last with their reasons; 5 not-modeled presets apart | pass |
| What-if pair difference equals difference of savings on the same keyed futures | pass (361.621 vs 361.621) |
| Impact per reserve unit-hour = saving / (review + setup + active hours) | pass (302.932 = 403.808 / 1.333) |
| Deadline = onset low bound - review - setup - 5 margin (lab: 164 - 25 = 139); overloaded service has none | pass |
| Request records the rank label; approval from an older time refused 409 | pass |
| No-action seed 7 normal | pass: 705 events, 59 patients |

## Findings to carry

- **`no-effective-action` is not action-free.** Diagnostic reserve slots earn a supported saving there early in the shift (lab at T+60, lower bound 217.8), so the family's name overstates. Q9 said to change the family parameters if this happened; **not changed in this build** (outside the scope of the demo and it would invalidate saved runs of that family). Ward coordination does show no help in it, which is what the smoke asserts.
- **The overdue-urgent rule is strict** (mean change <= 0): a single extra overdue patient in one of 50 futures (+0.02) flips a large supported saving to Urgent delay check failed. That is the rule as specified, and the honest behaviour is kept.
- Savings are accrued patient-minutes of the cohort to the 12 h cap, so a long queue gives large numbers; unfinished stays are counted apart in the comparison.
