# 18: Measure forecast quality and resilience on held-out shifts

**What to build:** An evaluator runs locked synthetic shifts from the app and reads prediction quality, false alarms, lead time, noise behavior, and simple-baseline comparisons.

**Blocked by:** 11, 17 (policy part); 09, 10 (forecast part).

**Status:** ready-for-agent, merged with 19 and reduced (scope amendment 2026-10-11)

**Rubric focus:** Predictive rigor and data robustness.

### Criteria (scope amendment, final build)

- [ ] One evaluation run started from the app: 7 families x 1 held-out test seed (`seed_partitions.test[0]`), scored window T+120 to T+600, forecast every 15 simulated min at 50 futures, provisional warning threshold 0.4 (not tuned; disclosed).
- [ ] Forecast results: overall and local episodes warned before confirmation, misses, false warnings per shift and lead time, with the matching rule written in OPEN_QUESTIONS.
- [ ] Policy results on the same shifts: PulseAhead policy (a simulated owner approves a current Best action through the real review and setup) vs no action, in total ED patient-minutes, urgent initial wait, resource-hours and unfinished stays. Unfavourable results stay.
- [ ] Background job with progress and cancel, a results view and a JSON export; unfinished work never looks complete. Labelled synthetic, 7 shifts, descriptive only.
- [ ] API smoke: the run completes and one shift's numbers are recomputed from its exported records.

Descoped (from 18 and 19): threshold tuning, the noise suite, reactive and simple-flow baselines, fixed simple policies, bootstrap uncertainty and monetary costs.

### Original criteria (reference only; superseded by the scope amendment)

- Implement the spec's reactive and simple-flow calculations, received-history window tuning, locked warning thresholds, and deterministic selection/tie rules.
- Score on no-action shifts; keep development/tuning/final complete shifts separate with recorded seed/workload partitions and no hidden-future access.
- Use the measured compute gate to predeclare full or balanced fallback runs before final outcomes. Report actual sample counts, runtime, and uncertainty limits.
- Implement exact one-to-one warning matching, original horizon/first timestamp, local versus global records, late/current exclusions, recall window, and 110-minute truth tail.
- Export detection/misses, false warnings per shift, lead time/actionability, probability-error targets, confirmation score, conditional onset coverage, and denominator/no-range exclusions.
- Include normal noisy shifts, valid extreme delays/surges, missing essential feeds, delayed/duplicate inputs, and unannounced shocks; report performance/abstention rather than deleting difficult cases.
- Provide real evaluation progress/errors/cancel and readable evidence results; unfinished work never looks complete.
- Playwright MCP runs the evaluation and independently recalculates representative metrics from real exported records, including long warnings/two episodes, near-end confirmation, and noise/outlier cases.
