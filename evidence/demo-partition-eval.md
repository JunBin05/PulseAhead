# Frozen-settings evaluation on the non-test `demo` seeds (28 shifts)

Threshold 0.6, reactive trigger building; seeds never used for tuning and not the held-out test partition. Descriptive only, one run per seed.

- Episodes 77: early 49 (30+ min lead 29), late only 22, missed 6; median lead 39 min.
- False warnings per shift: 0.82 (target at most 1).
- Total ED patient-min: no action 136330.8, reactive 130730.9, PulseAhead 130329.6.
- Better than no action: reactive in 17, PulseAhead in 25 of 28 shifts; PulseAhead below reactive in 19 of 28 shifts.

| Seed index | Evaluation id | Early | Late | Missed | False runs | PulseAhead | Reactive | No action |
|---|---|---|---|---|---|---|---|---|
| 0 | 64b610eeba | 15 | 9 | 0 | 5 | 36355.2 | 36555.2 | 37892.2 |
| 1 | e55d9ebc73 | 15 | 6 | 4 | 10 | 37427.2 | 37411.8 | 38766.9 |
| 2 | 6a0dba0058 | 12 | 6 | 0 | 2 | 27954.1 | 28321.2 | 30010.4 |
| 3 | f757c457d6 | 7 | 1 | 2 | 6 | 28593.1 | 28442.7 | 29661.3 |
