# PulseAhead: end-to-end UI/UX brief for the redesign

Purpose: give a designer (or the Mobbin MCP session) the whole current experience, the rules that must survive, and the open problems, so the redesign changes the look and structure without breaking the product's honesty rules. Source of truth for behaviour is the code; for product intent, `PROBLEM_AND_SOLUTION.md`. Status as of the commit after `2245cf9` (tabbed-shell restructure).

## 1. What the product is
A synthetic digital twin of one fictional 24-space emergency department. It answers one question for an **ED shift coordinator**: will current boarding, diagnostic delays and incoming demand become *sustained* congestion, when, and which feasible action should its resource owner start first. Loop: **Predict -> Explain -> Act -> compare the outcome.** Everything is synthetic; the label "Synthetic demo" must always be visible.

## 2. Users and jobs
| Person | Job in the app |
|---|---|
| ED shift coordinator (primary) | Watch the ED, read warnings, compare actions, request one |
| Resource owner (lab manager, radiology manager, ward supervisor / bed manager, ED attending lead, triage charge nurse, ED nurse in charge) | Approve, reject or defer a request for their resource. The role switcher stands in for log-in |
| Presenter (hackathon pitch, 3 minutes) | Run the guided six-beat story, then show evidence and limits |
| Judge / reader | Needs to see explanation, uncertainty, trade-offs and limits without help |

## 3. Screen anatomy (now)
Desktop, top to bottom:
1. **Header:** title, "Synthetic demo" chip, simulated time (T+hh:mm), demo role switcher, overall status badge (+ "Local alert" chip).
2. **Run bar:** Start (before first run) or Play/Pause, Step 5 min, speed 1x/2x/5x/10x, Reset, scenario/seed/run/version line.
3. **Banners:** connection error (with last valid time and Retry), pending-request notice.
4. **Left rail, tabs:** **Story** (guided demo), **Resources** (live counts + patient-dot legend), **Data** (ambulances, feeds, data quality), **Runs** (scenario picker, forecast samples, save/load, evaluation panel).
5. **Centre:** forecast strip -> 3D four-zone map (or 2D list) with camera callout and view toggle -> zone bar (4 buttons with count, local status, action chip, forecast line) -> alert list (priority-ordered).
6. **Right rail, tabs:** **Zone** (details for the selected zone: queues, units, capacity, staff, pressure cards, forecast and explanation) and **Act** (Compare actions, request cards, approvals, what-if).

Below 1180 px the rails stack under the map; below 760 px everything is one column.

## 4. The core flows
**A. First run:** Start -> replay v1 at T+00:00 -> Play or Step -> counts, zone chips and alerts update each version.
**B. Read a warning:** forecast strip and alert list show chance, time left with a range, bottleneck, affected patients, urgent group, deadline, mixed causes -> select an alert -> camera focuses the zone -> Zone tab shows why (observed facts, model statements, a relaxed-constraint sensitivity) and predicted waits.
**C. Act:** Compare actions (pauses playback) -> priority list with labels (Best action / supported but ranked below / No action shown to help / Needs review / Urgent delay check failed / Cannot assess / Not feasible), impact per reserve unit-hour, deadline, owner, setup timing, what-if A vs B -> request as coordinator -> owner approves in their role -> review 5 min -> setup -> active 60 min -> draining -> completed or blocked. One action at a time.
**D. Guided demo (Story tab):** six beats A current condition, B received pressures, C predict and explain (with retrospective counts baseline), D fix first, E act and watch, F evidence and limits, closing "Act before the queue." Paces: Pitch 25 s per beat, Quick 4 s; Next, Auto-play, Skip to result, Reset. If no qualifying demo case exists it stops honestly at beat A and shows beat F.
**E. Evidence:** Runs tab -> Evaluation panel runs a 7-shift evaluation in the background; beat F reads the newest saved held-out result.
**F. Save and load:** Save run, list of saved runs, Load rebuilds and verifies; mismatched or tampered runs are refused.

## 5. State vocabulary the UI must keep distinct
| Concept | Values / wording | Never confuse with |
|---|---|---|
| Overall ED status | Stable / Congestion building / Congestion confirmed / Recovering / Cannot assess / Not started | Local zone state |
| Local zone state | Normal / Building / Overloaded / Cannot assess | Overall ED congestion (a local lab overload leaves overall Stable) |
| Alert kind | Forecast risk (predicted) / Building (not yet confirmed) / Overloaded (current) | A Building or Overloaded alert is **not** early detection |
| Evidence kind | Observed / Predicted / Retrospective / Model estimate / Outcome / Limit | An elapsed wait is observed, not a forecast |
| Rank label | see C above | A forced winner: there is none; "no action shown to help" is a valid answer |
| Feed state | Current / Stale (older than 10 simulated minutes) / Missing | Zero: a missing figure shows "Not current", never 0 |

Status is always colour **plus** text **plus** icon. Colour tokens are in `frontend/src/tokens.css`; status/icon mapping in `status.tsx` and `icons.tsx`.

## 6. Content and honesty rules (non-negotiable in any redesign)
- Persistent "Synthetic demo" label; no claims of clinical outcomes, ROI, money or validated hospital performance. Value is patient-minutes and reserve unit-hours ("operational efficiency").
- Never a mocked alert, forced "Best action", invented number, or bed/staff that does not exist. Deck numbers (12 waiting, 76 vs 48 min, 38 min...) are not hard-coded.
- Every caption states where a number comes from and at which state version; a stale response never overwrites a newer one.
- Local vs overall always labelled; a full ward with no suitable bed shows the unresolved constraint and an escalation need, never a "free beds" button.
- Cannot assess is a first-class screen state, not an error and not "low risk".
- Test-seed exposure and unmet targets are shown (false warnings vs target, PulseAhead vs reactive baseline).

## 7. Accessibility and responsiveness requirements
Keyboard-operable everything (tabs use arrow keys, Home/End); visible focus; targets >= 44 px; reduced-motion respected (camera jumps, no auto-animation); a 2D list mode with the same data and approvals; 375-1440 px with no horizontal scroll; colour never the only signal. Demo bar uses a text countdown, not an animation.

## 8. Data the UI consumes (all `GET/POST /api/v1/...`, same origin)
`/replays` (create), `/replays/{id}/state|advance|reset|zones/{z}|forecast|forecast/explain|compare|requests|requests/{rid}/decision|events|export|demo/drivers`, `/scenarios`, `/saved`, `/evaluations` (+ `/latest`, `/{id}`, `/export`), `/demo/case`. Types are in `frontend/src/types.ts`. Everything carries `version` and `sim_time_min`.

## 9. Hooks that tests depend on (keep or migrate together)
`data-testid` values drive the smoke scripts and the regression 01 snippet: `start, play-pause, step, speed-N, reset, scene, zone-N, zone-N-count, zone-drawer, compare-open, overall-status, sim-time, in-ed, occupied-spaces, available-spaces, demo-next/auto/skip/reset, demo-beat-X, demo-caption, demo-beat-title, demo-close, scenario-select, fc-samples-N, save-run, eval-panel` and tab ids `tab-left-*`, `tab-right-*`. Evidence scripts: `evidence/*-smoke.mjs`, `evidence/01-regression.playwright-mcp.js`.

## 10. Known UX problems to solve in the redesign
1. **Density:** three regions of dense text; the forecast strip, alert list and drawer repeat the same alert facts in different words.
2. **Hierarchy:** the audience-facing story (alert -> reason -> fix -> result) is not the visual spine; it lives in a tab.
3. **Story tab length:** beats C, D and E are long text lists; a chart (queue band, onset range, before/after capacity) would carry them better.
4. **Zone drawer is the longest component:** pressure cards, staffing, queues, forecast, explanation in one scroll.
5. **Compare panel** mixes table, what-if and request cards.
6. **3D scene** labels crowd when rows fill (zone 2 and 3); counts are exact only in buttons and drawer. 200-dot / 30 fps not measured.
7. **No non-expert comprehension check** has been run; terms like "lambda > mu", "paired futures", "reserve unit-hour" need plain wording and progressive disclosure.
8. **No printable/shareable summary** of a run for a hospital reader.

## 11. What to ask Mobbin for (pattern searches)
Operational dashboards with a primary status header and ranked alert list; "decision card" patterns (recommendation + confidence interval + owner + deadline); timeline/lifecycle trackers (review -> setup -> active -> completed); approval/inbox flows by role; forecast uncertainty displays (range bars, fan charts, probability chips); healthcare capacity/bed-board layouts; guided-tour / presenter-mode overlays; empty, stale and "cannot assess" states; mobile responsive stacks for dense data.

## 12. Constraints on any visual change
Backend owns all state; the renderer never advances a patient or changes a queue. Keep the six-beat copy rules, the label set in section 5, and the `data-testid` hooks (or update the smoke scripts in the same change). Rebuild the frontend (`cd frontend && npm run build`) and restart the backend (`backend/.venv/Scripts/python.exe -m uvicorn pulseahead.api:app --app-dir backend --port 8000`, no `--reload`) before checking in the browser.

## 13. Current evidence on the screen's behaviour
`evidence/final-build-scorecard.md`, `evidence/demo-story.md`, `evidence/heldout-test1.md`, `evidence/demo-smoke.out.txt`, `evidence/shots/`. Honest results: false warnings 0.29 per shift on held-out test seed [1] (target 1); 12 of 29 episodes warned early; PulseAhead beats no action but not the tuned reactive baseline on that run; 2 of 6 interventions modeled; not deployed; no rehearsal.
