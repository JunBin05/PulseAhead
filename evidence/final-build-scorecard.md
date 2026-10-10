# Final build scorecard (2026-10-11), honest status per Track 1 criterion

Statuses are `evidenced`, `partial` or `not-run`. They are not awarded points. Evidence is smoke scripts against the real :8000 backend plus one Playwright browser pass (demo, list view, widths). Seed 7 normal is unchanged (705 events, 59 patients) after every slice.

| Criterion | Status | Artifacts | Open gaps (smallest next step) |
|---|---|---|---|
| R1 Problem and value | partial | `evidence/demo-smoke.out.txt` (worked decision case), `evidence/18-evaluation-merged.md` (matched policies, patient-minutes, resource-hours) | PulseAhead did **not** beat the reactive baseline in aggregate (30,322.7 vs 30,176.6 patient-min; no action 31,353.9); one seed per family; no monetary assumptions. Tune the Best-action gate and re-run on tuning shifts, then re-test once. |
| R2 Predictive rigor and robustness | partial | `evidence/18-smoke.out.txt`, `evidence/waits-smoke.out.txt`; ticket 08 robustness evidence | 12 of 16 episodes warned early (median lead 48 min), 2 late-only, 2 missed, but **2.71 false warnings per shift against a target of 1: not met**. Threshold untuned; no noise suite in the evaluation; no simple-flow baseline; one seed per family. Tune the threshold on tuning shifts only. |
| R3 Decision support and actionability | partial | `evidence/11-*`, `14-*`, `17-*`, `demo-smoke.out.txt` | 2 of the 6 required interventions built (ward coordination, diagnostic reserve lab/imaging); four are "not modeled in this build". Loop (compare, rank, what-if, owner approval, delayed effect, blocked and no-help cases) is verified by smoke and in the browser. |
| R4 Explainability and trust | partial | `evidence/waits-predicted-waits.md`, `evidence/17-rank-actions-lite.md`, forecast explanation (ticket 10) | Predicted wait to first assessment and test start is built; waits for boarding/disposition stages are not predicted. No non-expert comprehension check was run. |
| R5 Live execution and pitch | not-run | six-beat guided demo works locally (`evidence/demo-smoke.mjs`, `evidence/demo-story.md`; browser pass at 1440/1024/768/375, keyboard, reduced motion) | **Not deployed** (ticket 21 needs an authorized hosting target). No timed 3-minute rehearsal (ticket 22, the user's). 200-dot / 30 fps measurement not run. |

## Browser pass (Playwright MCP, production build on :8000)

- Guided demo, all 8 steps by Next and by Skip to result: captions come from API responses; zone 3 focus, compare panel, request and approval, capacity 1 to 2 to 1, final caption separates the paired estimate from the observed queue (2 waiting at approval, 11 at the end of the window).
- Priority list labels (best action, supported but ranked below, not feasible), what-if sentence, alert impact line, predicted-wait block rendered with real values.
- 2D list view: no canvas, same zone counts and status, compare panel and approvals still present.
- Widths 375 (360 usable), 768, 1024, 1280: no horizontal scroll, no control under 44 px height. Console: 0 errors.
- Not run: regression 01 snippet, keyboard-only pass, reduced-motion pass, ticket 20 per-criterion journey.

## Findings to carry

- `no-effective-action` family: diagnostic slots show a supported saving in it (it is not action-free); parameters unchanged.
- The overdue-urgent rule (mean change at most 0) flips a large supported saving to Urgent delay check failed on a single extra overdue patient (+0.02 in 50 futures). Kept as specified.
- Reactive baseline is untuned and cheap; the Best-action gate waits for evidence, which may cost lead time. Not tested.

## Update: six-beat demo (2026-10-11)

- The demo case is a scanned development/tuning seed (1 qualifying case of 35 early-warned episodes). It is a demo case, not evidence of performance.
- Keyboard (Enter/Space on Next, chips, Reset), reduced-motion emulation, Quick auto-play and Skip were checked in Playwright; regression 01 was not re-run.

## Update: tuned and frozen settings (2026-10-11)

- Threshold 0.6 and reactive trigger Building chosen on development/tuning seeds; held-out test seed [1], run once: false warnings 0.29/shift (target 1 met); 12/29 episodes early, 11 late only, 6 missed; PulseAhead does not beat the tuned reactive baseline (34,331.1 vs 33,584.3) but beats no action (36,785.2) in 5 of 7 shifts, same in 2. See evidence/heldout-test1.md. This supersedes the 2.71 false-warnings and 12-of-16 figures above, which were threshold 0.4 on exposed test seed [0].
- Regression 01 re-run: pass.
