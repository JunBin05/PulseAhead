# Evidence: FR-03 predicted waits

**smoke-verified, not per-criterion.** `evidence/waits-smoke.mjs` against :8000 (`evidence/waits-smoke.out.txt`), engine `flow-4`, forecast model `mc-flow-1` (additive output only: no forecast number changed). UI block `fc-waits` is type-checked and built; browser-checked in the final pass.

- Source: the same sampled futures as the forecast. For each patient present now: minutes from the forecast time to first assessment, and (for a lab or imaging queue) to the first test start. Median and 90th percentile are given only when at least that share of futures starts inside the 110-minute run; otherwise the wait is "not within 110 min" and no number is invented.
- Case: `diagnostic-delay` seed 7, T+100: 1 patient waiting for first assessment, 4 waiting for a test (lab P0005 median 12.5 min / 90% by 20.4; lab P0006 median 35.9 / 53.7; imaging P0002 median 1.8 / 4.8).
- Checks passed: listed patients equal the received waiting patients at that version; summary counts equal the received counts; non-negative and within the run; no 90th percentile without a median; cannot-assess shows no waits; same version gives identical waits; seed 7 normal 705 events / 59 patients.
- Limits: waits for patients not yet arrived are not predicted; the model has no per-patient wait for the ward bed or disposition stages (boarding is reported separately as awaiting departure in comparisons).
