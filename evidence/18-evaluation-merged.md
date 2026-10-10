# Evidence: ticket 18 (merged with 19, reduced), held-out evaluation

**smoke-verified, not per-criterion.** `evidence/18-smoke.mjs` against :8000 (`evidence/18-smoke.out.txt`), engine `flow-4`, forecast `mc-flow-1`, 50 futures every 15 simulated minutes, warning threshold 0.4 (**not tuned**). One evaluation run: 7 families x the first held-out test seed (2001, 2011, 2021, 2031, 2041, 2051, 2061), scored window T+120 to T+600, finished in 90 s. **Descriptive only: one shift per family, no confidence interval.** The UI panel (`eval-panel`) is built; browser-checked in the final pass.

## Forecast quality (matching rule in `OPEN_QUESTIONS.md` Q18)

| Family (seed) | Confirmed episodes | Early warned | Late only | Missed | False-warning runs / warning runs |
|---|---|---|---|---|---|
| normal (2001) | 0 | 0 | 0 | 0 | 0 / 0 |
| busy-recovers (2011) | 3 | 3 | 0 | 0 | 5 / 9 |
| arrival-surge (2021) | 2 | 1 | 0 | 1 | 4 / 5 |
| diagnostic-delay (2031) | 4 | 1 | 2 | 1 | 2 / 4 |
| boarding-blockage (2041) | 5 | 5 | 0 | 0 | 0 / 7 |
| mixed-cascade (2051) | 2 | 2 | 0 | 0 | 7 / 9 |
| no-effective-action (2061) | 0 | 0 | 0 | 0 | 1 / 1 |
| **Total** | **16** | **12** | **2** | **2** | **19 false runs = 2.71 per shift** |

Lead time of the 12 early warnings: min 6, median 48, max 88 minutes (n = 12). **The false-warning target of at most 1 per shift is NOT met (2.71).** No tuning was done to fix this on the test shifts; the next step is tuning the threshold on tuning-partition shifts only.

## Decision policies on matched shifts (same seeds, same actions, same delays)

| Policy | Total ED patient-min | Urgent initial wait (mean min) | Unfinished stays | Actions approved | Reserve unit-hours |
|---|---|---|---|---|---|
| No action | 31,353.9 | 6.53 | 104 | 0 | 0 |
| Reactive (owner approves once the service is already Overloaded) | 30,176.6 (-1,177.3) | 6.53 | 98 | 15 | 20 |
| PulseAhead (approve only a Best action) | 30,322.7 (-1,031.2) | 6.53 | 100 | 18 | 24 |

- PulseAhead was better than no action in 7 of 7 shifts (per shift 20.8, 284.4, 56.8, 285.2, 56.5, 322.8, 4.7 patient-min); reactive was better in 5, same in 2.
- **PulseAhead did not beat the reactive baseline in aggregate on this run** (diagnostic-delay: reactive 594.4 vs PulseAhead 285.2 saved). The PRD's success target (supported improvement over the strongest baseline) is therefore **unmet** here. Possible reasons, not tested: the Best-action gate waits for evidence while acting once a service is overloaded is cheap; one seed per family is noisy. No post-hoc change was made.
- Urgent initial wait is unchanged (6.53) for all three policies; the urgent-delay check never failed an approved action.
- Savings per reserve unit-hour: reactive 58.9, PulseAhead 43.0 patient-min per hour.

## Checks passed in the smoke

Job runs in the background with progress, partial results marked unfinished, cancel works and is never shown complete, a second run is refused (409); export carries format, settings and all 7 shifts; for `diagnostic-delay` total ED patient-minutes, unfinished stays and urgent wait recompute from the exported records for all three policies, episode classes (4 episodes: 1 early, 2 late-only, 1 missed) and warning runs (4 runs, 2 false) recompute from the exported warnings and episodes; aggregates equal the sum of shifts; seed 7 normal still 705 events, 59 patients.

## Not done (descoped by the amendment)

Threshold tuning, noise/fault suite, the simple-flow baseline, bootstrap uncertainty, monetary value. These remain open gaps for R2.
