# Demo story: six beats (A to F)

**Status: smoke-verified (`evidence/demo-smoke.mjs`, `demo-smoke.out.txt`) and browser-checked with Playwright MCP on the production build; not per-criterion, not rehearsed, not deployed.**

> **Update after tuning:** the case below was found at warning threshold 0.4. With the frozen threshold 0.6 no case qualifies, so the live demo stops at beat A and shows beat F. See evidence/heldout-test1.md.

## What the demo is
`frontend/src/Demo.tsx` drives the real backend through the brief's six beats: A current condition, B received pressures, C predict and explain (with the retrospective counts baseline), D fix first, E act and watch, F evidence and limits, closing "Act before the queue." Every figure on screen comes from an API response at the state version shown. Nothing is hard-coded: scenario, seed, service and alert time come from `GET /api/v1/demo/case`. Deck numbers (12 waiting, 76 vs 48, 38 min, ...) are not used.

## Case selection (development/tuning seeds only)
`python -m pulseahead.demo_scan` (in-process): 21 shifts (1 development + 2 tuning seeds x 7 families), forecast every 15 min at 50 futures, matched with `evaluation.match_forecasts`. A candidate needs a forecast-risk alert with lead >= 30 min, at least two supported drivers at that alert (`demo_case.DRIVER_RULES`, fixed before the scan), and a feasible supported action for the alerted zone. Output: `evidence/demo-case-scan.md/.json`.

Result: **one** qualifying case of 35 early-warned episodes: `busy-recovers` tuning seed 1011, Lab, forecast-risk alert at T+01:45 (42% against threshold 40%), counts onset T+02:25 (lead 40 min), drivers diagnostics (lab demand 8.0/h vs capacity 4.0/h) + announced arrivals (2 patients within 30 min), overall status Stable, best action Diagnostic reserve slot (lab), owner Lab manager. This is a demo case, **not held-out evidence**. The chance is only just above the threshold; the case is a single scan hit, not a typical one.

## Honest observations in the chosen case
- Only one action is feasible, so there is no A-vs-B what-if here (the beat says so when `what_if` is null). Ward coordination is not feasible (no decided Ward/ICU patient waits).
- The action deadline is `too_late` (latest start T+01:37 by the lower onset bound), so the action may take effect after the earliest plausible onset. Beat D states this.
- Observed lab queue: 2 at approval, 2 when capacity rose, 1 at the end. The model saving (166.5 patient-min, lower bound 131.1) is a paired-futures estimate, not an observed outcome.
- Baseline: the counts alarm is the episode's own onset by the local threshold, read from a no-action replay of the same seed (`/demo/case.retrospective`, cross-checked in the smoke against an independent replay). It is labelled retrospective.
- Overall ED congestion chance is 0% here: this is a local lab overload, not ED-wide congestion, and the beat says so.

## Beat F numbers (latest saved evaluation, exactly as measured)
16 confirmed episodes in 7 shifts: 12 warned early (7 with 30+ min lead), 2 late only, 2 missed, lead median 48 min. False warnings 2.71 per shift against a target of 1: **not met**. Total ED patient-min: PulseAhead 30,322.7, reactive 30,176.6, no action 31,353.9: PulseAhead beats no action in 7 of 7 shifts but does **not** beat the reactive baseline in aggregate. Test seed [0] of every family was evaluated and seen before: exposed.

## Added surface
- `GET /api/v1/demo/case`, `POST /api/v1/replays/{id}/demo/drivers`, `GET /api/v1/evaluations/latest` (saved to `backend/saved_runs/evaluations/`, git-ignored).
- Paces: Pitch 25 s per beat (5 waits = 125 s plus compute; stage pauses in beat E are 5 s), Quick 4 s (all six beats auto-played in 24.7 s measured). Next, Skip to result, Reset demo, beat chips.

## Verified / not verified
- Verified: smoke (all pass), seed 7 normal 705 events / 59 patients, Playwright at 375/768/1024/1440 (no horizontal scroll, no demo-bar control under 44 px, Synthetic label present), keyboard Enter/Space on Next, chips and Reset, reduced-motion emulation, Quick auto-play and Skip, console free of app errors.
- Not verified: a timed 180 s Pitch rehearsal (the user's), deployment, non-expert comprehension, 200-dot / 30 fps, regression 01 re-run.
