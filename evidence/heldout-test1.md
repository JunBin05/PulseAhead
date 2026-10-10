# Held-out evaluation on test seed [1] with frozen settings

**Status: smoke-verified (`demo-smoke.mjs` beat F, `18-smoke.mjs` on a tuning partition), run exactly once; descriptive only, one shift per family.**

## Procedure
1. Test seed [0] of every family had already been evaluated and its results seen (threshold 0.4, reactive trigger Overloaded): treated as exposed.
2. `python -m pulseahead.tune` (evidence/tuning-results.md) used the 21 development/tuning shifts only. Rule fixed beforehand: at most 1 false warning per shift, then most episodes warned early; reactive trigger with lower total ED patient-min.
   - Threshold 0.4: 1.95 false warnings/shift (not met); 0.6: 0.86 (met, 25 of 42 episodes early); 0.8: 0.19 (17 of 42 early, 5 missed).
   - Reactive trigger Building: 89,173.3 patient-min vs Overloaded 90,185.0 (no action 93,272.2).
3. Frozen: `WARNING_THRESHOLD = 0.6`, `REACTIVE_TRIGGER = "building"`, forecast `MODEL_VERSION` mc-flow-1 -> mc-flow-2. Engine unchanged (flow-4; seed 7 normal 705 / 59).
4. One evaluation on test seed index 1 of every family (evaluation id 73ec843aaf, saved to backend/saved_runs/evaluations/).

## Result (as measured)
- 29 confirmed episodes: 12 warned early (7 with 30+ min lead), 11 late only, 6 missed; lead min 7, median 44, max 87 min.
- False warnings 0.29 per shift (2 runs in 7 shifts), target at most 1: met. Cost of the higher threshold: late-only and missed rose (earlier run at 0.4: 2 late, 2 missed of 16).
- Total ED patient-min: no action 36,785.2; reactive (trigger Building) 33,584.3; PulseAhead 34,331.1.
- PulseAhead vs no action: better in 5, same in 2, worse in 0 shifts. PulseAhead vs the strongest tuned baseline (reactive, Building): 746.8 patient-min **higher**, so it does not beat it in aggregate. Per-shift saving vs no action: reactive 0, 542, 305, 1849.6, 71.9, 432.4, 0; PulseAhead 75.2, 147.4, 211.7, 1721.5, 0, 298.3, 0.
- Resource hours: reactive 20.0 (15 actions), PulseAhead 22.7 (17 actions).

## Caveats
- Seven shifts, one per family: no confidence interval; the Best-action gate was not tuned (only threshold and reactive trigger were).
- The choice rests on 21 shifts and 42 episodes; it may not transfer.
- Saved runs recorded under mc-flow-1 are now refused by Load (forecast settings changed) by design.
- Test [1] has now been seen: do not re-tune on it.

## Consequence for the demo
Under the frozen threshold no development/tuning episode qualifies as a demo case (evidence/demo-case-scan.md; the 0.4 scan that found busy-recovers 1011 is kept as evidence/demo-case-scan-threshold-0.4.md). The demo therefore stops honestly at beat A and proceeds to beat F.
