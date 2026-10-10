# Tuning on development and tuning seeds (21 shifts; test seeds untouched)

| Threshold | Episodes | Early | Early 30+ | Late only | Missed | Median lead | False warnings / shift |
|---|---|---|---|---|---|---|---|
| 0.4 | 42 | 35 | 22 | 7 | 0 | 44.0 | 1.95 |
| 0.6 | 42 | 25 | 14 | 14 | 3 | 31.0 | 0.86 |
| 0.8 | 42 | 17 | 9 | 20 | 5 | 31.0 | 0.19 |

No action total: 93272.2 patient-min.

| Reactive trigger | Total ED patient-min | Unfinished | Reserve hours | Actions |
|---|---|---|---|---|
| overloaded | 90185.0 | 259 | 45.332 | 34 |
| building | 89173.3 | 252 | 49.331 | 37 |

**Chosen:** threshold 0.6 (false-warning target of at most 1 per shift met), reactive trigger building.

Rule fixed before the run: the threshold with at most 1 false warning per shift that warns the most episodes early (ties: lower); otherwise the fewest false warnings. The trigger with the lower total ED patient-minutes (ties: Overloaded).
