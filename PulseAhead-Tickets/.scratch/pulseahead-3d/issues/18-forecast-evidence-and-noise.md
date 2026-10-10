# 18: Measure forecast quality and resilience on held-out shifts

**What to build:** An evaluator runs locked synthetic shifts from the app and reads prediction quality, false alarms, lead time, noise behavior, and simple-baseline comparisons.

**Blocked by:** 09 — Generate varied shifts and reproduce saved replays; 10 — Predict bottlenecks and explain the time remaining.

**Status:** ready-for-agent

**Rubric focus:** Predictive rigor and data robustness.

- [ ] Implement the spec's reactive and simple-flow calculations, received-history window tuning, locked warning thresholds, and deterministic selection/tie rules.
- [ ] Score on no-action shifts; keep development/tuning/final complete shifts separate with recorded seed/workload partitions and no hidden-future access.
- [ ] Use the measured compute gate to predeclare full or balanced fallback runs before final outcomes. Report actual sample counts, runtime, and uncertainty limits.
- [ ] Implement exact one-to-one warning matching, original horizon/first timestamp, local versus global records, late/current exclusions, recall window, and 110-minute truth tail.
- [ ] Export detection/misses, false warnings per shift, lead time/actionability, probability-error targets, confirmation score, conditional onset coverage, and denominator/no-range exclusions.
- [ ] Include normal noisy shifts, valid extreme delays/surges, missing essential feeds, delayed/duplicate inputs, and unannounced shocks; report performance/abstention rather than deleting difficult cases.
- [ ] Provide real evaluation progress/errors/cancel and readable evidence results; unfinished work never looks complete.
- [ ] Playwright MCP runs the evaluation and independently recalculates representative metrics from real exported records, including long warnings/two episodes, near-end confirmation, and noise/outlier cases.

