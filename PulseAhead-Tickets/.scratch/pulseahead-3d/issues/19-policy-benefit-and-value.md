# 19: Measure decision benefit and operational value

**What to build:** A judge compares PulseAhead's complete decision policy with no action and fair simple policies, seeing total ED time, urgent delays, resource cost, and failures.

**Blocked by:** 17 — Rank six actions by benefit, urgent delays, and time to act; 18 — Measure forecast quality and resilience on held-out shifts.

**Status:** merged into ticket 18 (scope amendment 2026-10-11)

**Rubric focus:** Value proposition; better-decision proof.

See the spec's "Scope amendment (2026-10-11, final build)". The policy-vs-no-action part of this ticket is in ticket 18; fair simple baselines, threshold tuning, bootstrap uncertainty and monetary costs are dropped.

### Original criteria (not in this build)

- Use matched patient/task demand and care across complete policies, kept private from forecasts; score the same arrival cohort with continuing background arrivals and capped follow-up.
- Implement the exact five-minute policy triggers, locked thresholds, simulated owner approval behavior, common review/setup/resource limits, and baseline choice/tie rules.
- Model all required owner grants for auto-evaluation as disclosed synthetic staff responses; they do not bypass permissions, resource limits, or the modeled review delay.
- Fixed baselines can select all six presets with the same owners, resources, and lifecycle, using the spec's queue-count mapping/tie order. They do not secretly use PulseAhead's predictive benefit/urgent filter. Disclose differences and freeze the strongest simple policy on tuning data only; report all policies.
- Show total ED patient-minutes and mean/median/p90 components by urgency, boarding, occupied-space minutes, staff/diagnostic/transport use, donor effects, and unfinished stays.
- Use whole matched-shift uncertainty with fixed family weights; fallback single-shift families are descriptive and cannot claim within-family precision.
- Present the precise business decision/value in operational units, with resource costs and patient-minutes per extra staff-hour beside savings when the denominator is positive. Optional monetary costs use disclosed editable assumed rates/currency and actual resource time through draining; missing rates stay unavailable. No synthetic hospital ROI/revenue or clinical-outcome claim.
- Retain unfavorable/no-help results. Claim improvement against the selected best baseline only when measured results support it.
- Playwright MCP runs matched policies, inspects equal six-action access/budgets/owner delays/cohorts, and independently recomputes representative outcome/resource values, cost assumptions/arithmetic, and value ratios with expected versus actual evidence.
