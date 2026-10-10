# Evidence: ticket 11, ward coordination and owner approval

**smoke-verified, not per-criterion.** Verified by `evidence/11-smoke.mjs` against the real backend on :8000 (output in `evidence/11-smoke.out.txt`), engine `flow-4`, profile unchanged apart from the declared reserves. The UI was type-checked and built but is **not-run** until the ticket 20 Playwright journey.

## Case

- Main case: scenario `busy-recovers`, development seed 7, stepped 2 min at a time until a decided Ward/ICU patient is in `awaiting_ward_allocation` (first at **T+220**).
- No-action regression: `normal`, seed 7, 12 h: **705 events, 59 patients** (unchanged).
- Blocked case: test fixture `fixture-reserve-outage` (boarding fixture with the reserve declared gone, hidden future).

## Results

| Check | Result | Expected / actual |
|---|---|---|
| No-action seed 7 normal unchanged | pass | 705 / 59; no `action_*` events |
| Engine version bumped | pass | `flow-4` |
| Eligibility from received state | pass | feasible with an allocation backlog; with only a bed wait (`boarding-blockage` seed 7, T+115) not feasible, reason names the bed; request -> 422 |
| Approver from ownership, not zone | pass | "Ward supervisor / bed manager" for the zone 4 service; catalog is zone-independent |
| Paired comparison | pass | 50 futures, same cohort in both branches (16.1 patients mean), unfinished stays counted apart (24 of 50 futures), saving mean 0.152, sd 1.125, 90% lower bound -0.110 patient-min; computed in 0.33 s |
| Wrong role | pass | Lab manager -> 403 naming the owner; the clicking coordinator -> 403 |
| Stale version | pass | compare and decision with an old `expected_version` -> 409 |
| Defer / reject | pass | request stays open on defer, no capacity change; reject closes it, nothing reserved; late approve -> 409 |
| Idempotent decision | pass | same `(role, decision_id)` returns the stored outcome; a different id from the same role -> 409 |
| One in flight | pass | second request while open or running -> 409 |
| Lifecycle timing | pass | approved T+220; setup T+225; active T+235 (allocation servers 1 -> 2); draining T+295 (servers back to 1) |
| No bed or clearance created | pass | ward 6 / ICU 2 bed totals unchanged |
| Not-modeled presets | pass | 5 listed; requesting one -> 422 |
| Reserve rechecked at activation | pass | fixture: `action_blocked`, no `action_active`, capacity unchanged |
| Save / Load | pass | 3 choices stored; load replays them and the event digest matches; same `action_*` events |
| UI (comparison panel, role switcher, request card, progress, chips) | **not-run** | built (tsc + build clean); verified in ticket 20 |

## Notes

- Approval needs the request's comparison time to equal the replay's current time (an old ranking cannot be approved); version only guards against concurrent changes.
- A lone allocation slot rarely binds: the saving is near zero with a lower bound below zero, so ranking (ticket 17) will say "No action shown to help" for this case. That is the honest result.
