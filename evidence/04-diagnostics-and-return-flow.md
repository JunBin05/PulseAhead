# Evidence: ticket 04, diagnostic queues and return to the doctor

Date: 2026-10-10. Tool: Playwright MCP (`browser_run_code_unsafe`, `browser_take_screenshot`) against the production build on `:8000`. The snippet is in [04-diagnostics.playwright-mcp.js](04-diagnostics.playwright-mcp.js).

Runs:
- **`fixture-diagnostics`**, started through the UI with the test-only `?fixture=fixture-diagnostics` parameter (default seed `20261010`). Scripted, no background arrivals, 13 walk-ins with fixed supplied inputs:
  - Lab, 40 min: W01, W02, W03, W12. Lab, 30 min: W10 (urgent), W09. Lab, 20 min: W13 (urgent, arrives T+30).
  - Imaging: W04 and W05 60 min, W11 55 min.
  - Both, in order: W08, lab 35 then imaging 50.
  - Direct route, no tests: W06, W07.
  - W09 also carries a supplied clinical decision that arrives before its lab result.
  - Test turnaround is supplied per patient, so expected values are known independently of the engine.
- **`normal`**, seed 7, 12 h, through the API from the page, for generated demand.
- Seeds 20261010 (rates) and 5 (determinism) of `fixture-diagnostics`.

Assumptions (labelled demo assumptions in the profile and in OPEN_QUESTIONS Q4): lab turnaround triangular 15/28/50 (median 30.4), imaging 25/42/70 (median 44.9), result review 3/5/8 min, test need probability by urgency group.

## Results per acceptance criterion

| # | Criterion | Result |
|---|---|---|
| 1 | Finite lab and imaging, task-specific queues and turnaround, received results, clinician result review | **pass** |
| 2 | 2→3→2→4 and direct 2→4 routes; not every patient needs tests; different requirements by supplied route | **pass** |
| 3 | Zone 3 is logical waiting/work while the patient keeps their ED bed; no second copy in zone 2 | **pass** |
| 4 | Bed reservation retained through tests; clinician work separate from waiting; no doctor slot held for the wait | **pass** |
| 5 | Required care/tests and a received decision both complete before eligibility; premature clearance stays ineligible | **pass** |
| 6 | Separate lab/imaging queues and tasks-per-hour; queued dots cluster at the waiting area with exact counts | **pass**, with a visual note (see Notes) |
| 7 | Playwright MCP checks of all of the above | **pass** |

### 1. Finite units, queues, turnaround, review
- `/state` `resources.diagnostics`: lab 2 units (`L1`, `L2`), imaging 1 unit (`I1`), owners "Lab manager" and "Radiology manager".
- Over 56 UI steps (T+5 … T+280) busy never exceeded the unit counts. The event history gives the same: max 2 lab and 1 imaging busy at once, and no unit ever had overlapping tests.
- Queues formed. Lab: up to 3 waiting (T+50, T+85–T+100). Imaging: up to 2 waiting (T+70 onward).
- **Turnaround:** for all 12 tests the `test_completed` `elapsed_min` equals the supplied value (40, 60, 35, 50, 30, 55, 20 …) and the in-lab/in-imaging phase interval matches (0 mismatches). Each patient ran exactly the supplied number of tests.
- **Results and review:**
  - `results_received_min` equals the last `test_completed` time for every patient.
  - Review starts at results, lasts 3–8 min, and is done by a named doctor in zone 2 (`awaiting_result_review` then `result_review_active`).
  - Example W13: lab 56.966–76.966, results and review start 76.966, review end 83.25, departed 97.443.

### 2. Routes
Route shapes from `/events` (all departed):

| Patient | Phases after first assessment |
|---|---|
| W06, W07 | `disposition_processing` straight after `assessment_active` (direct, `tests_required: []`) |
| W01, W02, W03, W09, W10, W12, W13 | `awaiting_lab` > `in_lab` > `awaiting_result_review` > `result_review_active` > `disposition_processing` |
| W04, W05, W11 | `awaiting_imaging` > `in_imaging` > review > disposition |
| W08 | `awaiting_lab` > `in_lab` > `awaiting_imaging` > `in_imaging` > review > disposition (lab, then imaging) |

- The 12 h seed 7 run has 28 patients with a test order (27 tests completed, the rest still running or queued at the end), 30 on the direct route and 1 still before first assessment ends. No route problems.
- Direct-route patients never appear in zone 3 (0 violations).

### 3. Zone 3 is logical, bed retained, no duplicate
At every one of the 56 steps:
- Every patient in zone 3 held an ED space (`z3withSpace` equals the zone 3 count).
- `ed_spaces.occupied` equals the number of patients holding a space.
- Each patient id appears in exactly one zone (no duplicate across zone lists) and the zone counts sum to the patient total.
- The zone 3 queue and active counts equal the resource counts (`lab.waiting`, `lab.busy`, …).
- **Same space throughout:** 0 patients changed space between `awaiting_clinician` and `departed`.
- **Retained-bed growth:** occupied spaces grew from 0 to a peak of 11 (T+70–T+80) while up to 8 patients sat in zone 3 and the triage desk emptied (T+85: zones `[0, 0, 8, 2]`, occupied 10).

### 4. Clinician work vs waiting
- No `awaiting_lab`, `in_lab`, `awaiting_imaging` or `in_imaging` event carries a clinician slot (0 violations on both fixture and seed 7).
- Per-doctor holds, assessment and review together, never overlap (doctors `D1`–`D4` all used); the doctor is released when first assessment ends, so waiting for results does not hold a slot.
- Example W08: first assessment 35.092, lab/imaging until results at 198.84, review 198.84–203.817: no doctor held for the more than 150 min in between, and its space was held throughout (departed 214.876).

### 5. Eligibility and premature clearance
- Effective disposition for each patient with tests equals max(decision, results received, review end, care complete), recomputed from export and events (0 mismatches). The `disposition_processing` phase starts exactly at that time.
- **W09 (supplied early decision):**

  | Event | Time (min) |
  |---|---|
  | Decision received (`care_complete: true`, `tests_complete: false`, `eligible: false`) | 78.219 |
  | Lab queue entered (`awaiting_lab`) | 78.219 |
  | Lab started | 111.966 |
  | Lab result received | 141.966 |
  | Result review start–end | 141.966–148.152 |
  | Effective disposition and `disposition_processing` | 148.152 |
  | Departed | 155.764 |

  The decision at 78.219 did not move the patient to disposition; it stayed in zone 3 for 63.7 min.
- For every other test patient the decision comes after the result review and is marked `tests_complete: true`.
- Care tasks from ticket 03 still gate eligibility in the same expression.

### 6. Queues, rates, dots
- **Queue order from events:** no patient was started before a better-ranked or an earlier same-rank patient waiting for the same unit (0 violations, fixture and seed 7). Urgent W13 arrived at T+30, reached the lab queue at 46.297 and started at 56.966, ahead of W02 (waiting since 40.118, started 63.42) and W08 (waiting since 47.912, started 76.966).
- **Rates:** lab capacity 4 tasks/h (2 units × 60 / 30 min median), imaging 1.33 tasks/h (1 × 60 / 45). Recent throughput (completed in the last 30 min × 2) is reported separately.
- Started/completed in the last 30 min, recomputed from events at three times, all equal:

  | T | Lab started | Lab done | Imaging started | Imaging done |
  |---|---|---|---|---|
  | 60 | 2 = 2 | 1 = 1 | 1 = 1 | 0 = 0 |
  | 90 | 2 = 2 | 2 = 2 | 0 = 0 | 0 = 0 |
  | 135 | 1 = 1 | 1 = 1 | 0 = 0 | 0 = 0 |
- UI vs `/state` at every step: lab and imaging busy and waiting text, zone 3 drawer queues and active counts, capacity text, zone buttons, drawer count, roster rows, mesh count, drawer version = replay version. **0 problems over 56 steps.**
- Screenshot [04-diagnostics-t90.png](shots/04-diagnostics-t90.png): T+90, 8 patients in zone 3, lab 2 of 2 with 3 waiting, imaging 1 of 1 with 2 waiting.

### 7. Hidden data
- At T+3 every patient has `tests_status: "not_ordered"`, the export has `tests_required: null` for all, and `/state` contains no `"tests"` key and no turnaround value. The test list appears when first assessment ends; each turnaround appears only as `elapsed_min` on `test_completed`.

## Regression
- **Ticket 01 regression** (final run 2026-10-10T12:49Z): all sections pass, including counts agree (7 = 7 = 7), 409 stale, banners, keyboard, 10× → 9.95 sim min/s, determinism 86 events identical. Widths 375/768/1024/1440: 0 label overlaps, 0 clipped, 0 targets under 44 px, no horizontal scroll (17 labels at 1024/1440).
- **Ticket 02 intake snippet:** 0 problems; triage order and critical-bypass timings identical to the ticket 02 evidence.
- **Ticket 03 staffing snippet:** 0 problems on `fixture-staffing` and on seed 7. Its doctor-hold logic was updated: a doctor is now released at the next phase of the patient (decision no longer ends the hold for patients with tests). On seed 7, premature decisions drop from 8 to 3 because test patients decide after review.

## Notes and limits
- **One diagnostic round, tests in a fixed order.** A patient runs their supplied tests one after another (lab, then imaging) and then returns once. The spec says diagnostics/review can loop; repeated rounds are not modeled (OPEN_QUESTIONS Q4).
- **Assumptions are not calibrated.** Seed 7 generates about 28 test patients in 12 h; lab capacity is rarely exceeded and imaging is mostly idle, so a real diagnostic bottleneck appears only in fixtures or later scenarios (ticket 09).
- **Zone 2 shows first assessment and result review in the same rows** ("Awaiting clinician", "With clinician"); the roster and phase labels distinguish "Results back, waiting for a doctor to review".
- **Zone 3 scene is dense** when several rows are populated: dots can sit under area labels, as in zone 2. No two labels overlap and exact counts are in the zone buttons and drawer. Row overflow is a ticket 06 item; the full visual pass is ticket 20.
- The first seed 7 run of this snippet reported 4 problems that came from the snippet requiring a full route for patients still mid-route at the 12 h cutoff; the check now validates only the prefix of unfinished routes. No engine change.
- Lab/imaging reallocation and reserve units are ticket 14.
