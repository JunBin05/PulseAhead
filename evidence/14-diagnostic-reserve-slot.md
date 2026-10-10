# Evidence: ticket 14 (reduced), diagnostic reserve slot

**smoke-verified, not per-criterion.** `evidence/14-smoke.mjs` against the real backend on :8000 (output `evidence/14-smoke.out.txt`), engine `flow-4`. UI **not-run** until the ticket 20 journey. Donor reallocation is descoped.

Case: `diagnostic-delay`, development seed 7, first imaging queue at **T+65** (2 waiting), approved at T+65, run on to T+300.

| Check | Result | Expected / actual |
|---|---|---|
| Reserves declared and owned | pass | imaging -> Radiology manager, lab -> Lab manager; review 5, setup 15, active 60 |
| Paired comparison shows diagnostic wait and total ED time | pass | 50 futures; diagnostic-wait saving mean 111.2 patient-min (90% lower bound 91.2); total ED saving mean 108.2 (lower bound 88.2) |
| Infeasible lab request | pass | no lab queue -> not feasible, request 422 with the reason |
| Wrong owner | pass | Lab manager -> 403 naming the Radiology manager; nothing reserved |
| Lifecycle and capacity | pass | approved T+65; setup at +5 (capacity 1); active at +20 (imaging servers 2, lab unchanged at 2); closes at +80 (capacity 1); events requested ... active, draining, completed |
| Reserve does real work | pass | `test_completed` events name unit `I2` |
| Tests never shortened | pass | 10 tests common to the action run and a no-action run of the same seed to T+300 have identical durations (0 different) |
| Forecast and comparison during the window | pass | forecast status ok; comparison offers no second action (`blocked_by_in_flight`) |
| Save / Load | pass | decision restored, digest matches |
| No-action regression | pass | seed 7 normal: 705 events, 59 patients |
| UI | **not-run** | ticket 20 |

Note: the saving here is large because the imaging queue is long under the delayed-turnaround family; whether it earns "Best action" is decided by the ranking rule in ticket 17, not here.
