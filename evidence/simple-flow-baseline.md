# Simple-flow baseline vs Monte Carlo forecast (development and tuning seeds, 21 shifts)

| Method | Episodes | Early | Early 30+ | Late only | Missed | Median lead | False warnings / shift |
|---|---|---|---|---|---|---|---|
| Simple flow (lambda > mu with a queue) | 42 | 18 | 14 | 18 | 6 | 58.0 | 5.19 |
| Monte Carlo, threshold 0.6 | 42 | 25 | 14 | 14 | 3 | 31.0 | 0.86 |

Same episodes, same matching rule. The simple-flow rule is a fixed, untuned rule; the Monte Carlo threshold was chosen on these same shifts, so its numbers here are in-sample. Descriptive only.
