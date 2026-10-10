# Evidence: ticket 03, doctor assessment and shared staffing

Date: 2026-10-10. Tool: Playwright MCP (`browser_run_code_unsafe`, `browser_evaluate`, `browser_take_screenshot`) against the production build on `:8000`. The snippet is in [03-staffing.playwright-mcp.js](03-staffing.playwright-mcp.js).

Runs:
- **`fixture-staffing`**, started through the UI with the test-only `?fixture=fixture-staffing` parameter (default seed `20261010`). Scripted, no background arrivals:
  - 14 walk-ins at T+2 (W01–W14, mixed urgency; W04 and W09 urgent with 12 and 14 min stabilization tasks), and urgent W15 (8 min task) arriving at T+40.
  - A01: three critical-bypass patients at T+20 (stabilization 30, 30 and 6 min). A02: one critical patient at T+60 (10 min).
  - Supplied staffing roster: nurses N1–N5 off duty from T+0 (only N6 covers S21, S22, R1, R2); N1 and N2 on duty at T+60. N3–N5 never return.
- **`normal`**, seed 7, 12 h, through the API from the page, for the same invariants on generated demand.
- Seed 11 of `fixture-staffing` for chunk-size determinism.

Decisions for the ambiguous staffing rules are in [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) (Q3). Q1 and Q2 were confirmed by the user and kept.

## Results per acceptance criterion

| # | Criterion | Result |
|---|---|---|
| 1 | Four clinician slots, finite nurse/coverage pools, reserved ED spaces, supplied care tasks; concrete fictional units and identities | **pass** |
| 2 | Supplied urgency order, no interruption of work underway; critical patients still respect resus, clinician and coverage resources | **pass** |
| 3 | Active work separate from waiting; same space until departure; work-slot release is not a bed release | **pass** |
| 4 | Shared doctors/nurses not duplicated; resource owners and reservations explicit and balanced | **pass** |
| 5 | First-assessment and care-prerequisite timestamps; received decisions cannot invent completed care | **pass** |
| 6 | Zone 2 dots/counts and staffing summary from the same version; empty-but-unstaffed spaces explained | **pass** |
| 7 | Playwright MCP checks of all of the above | **pass** |

Ticket 02 and ticket 01 were re-run on the changed allocation code; see "Regression" below.

### 1. Staffing units and identities
- `/state` `resources.staff` (and the export `profile`) list:
  - doctors `D1` Dr. Okafor, `D2` Dr. Lindqvist, `D3` Dr. Moreau, `D4` Dr. Tanaka, owner "ED attending lead";
  - reserve physician `D5` Dr. Ibarra, inactive ("Declared, not active");
  - nurses `N1`–`N6`, 4 spaces each, owner "ED nurse in charge".
- 6 nurses cover 24 spaces: 24 covered, 24 unique, all ids real pool ids. `R1`/`R2` are covered by `N6`.
- `clinician_slots.total` is 4 and equals the 4 listed doctors.
- Supplied care task: assigned by the scenario for the urgent group and critical bypass (`stabilization_task_minutes` min 5, mode 15, max 30 in the profile assumptions). Fixture values are set explicitly. In the seed 7 normal run, 10 patients that reached assessment carried one. Their length is not in `/state`, not in `care_started` events (payload is exactly `{"task":"stabilization"}`) and only appears as `elapsed_min` at `care_completed`.

### 2. Urgency order, no interruption, critical resources
- **Space grants** (checked pairwise from `/events`, general and resus pools separately): no patient was granted a space while a better-ranked or an earlier same-rank patient was still waiting. 0 violations on the fixture and on 12 h seed 7.
- **Doctor grants**: same check. 0 violations.
- **At T+60**, when N1 and N2 returned, 8 spaces became staffed at the same instant. Space grants at 60 went to **W15, W07, W10, W12, W03, W06**: the urgent patient who arrived at T+40 was served before medium and lower patients that had been waiting for a space longer.
- **Doctors** `D1`–`D4`: per-doctor holds (assessment start to decision received) never overlap. Up to 4 busy at once (T+60–T+90 rows). Doctors serve only zone 2 work; no doctor is held in `awaiting_care_completion` or `disposition_processing` (0 events with a doctor in those phases).
- **Critical (A01 ×3 at T+20, A02-1 at T+60):**
  - A01-1 got R1 and A01-2 got R2 at 20; A01-3 waited and got R1 at 61.018, the moment A01-1 departed.
  - A02-1 waited for R2 (61.916) and then for a doctor (first assessment 73.94), because all four doctors were busy. Priority orders the queue; it does not preempt work underway.
  - Max resuscitation spaces held at once: 2. No critical patient was granted a general space and no non-critical patient a resus space (0 violations).
- **Coverage:** no grant to any space whose nurse was off duty at the grant (event order at equal timestamps respected). Spaces S09–S20 (N3–N5) were never granted. S01–S08 were not granted before T+60.

### 3. Active vs waiting, bed retention
- Zone 2 drawer separates "Waiting for an ED space", "Waiting for a clinician", "With a clinician" and "Decision received, care not complete".
- Patients whose decision was received before their task finished (premature decisions on the fixture: W04, W09, A01-1, A01-2, A02-1) show phase `awaiting_care_completion` in zone 2:
  - the doctor slot is released at `decision_received`;
  - the ED space is kept until departure (same space id in every event of every patient, 0 changes).
  - Example A01-1: decision 33.054, task done 50.0, `disposition_processing` at 50.0, departed 61.018, all on R1.
- Zone 4 count never includes these patients before their effective disposition.

### 4. Shared staffing, ownership, balance
- Doctors and nurses are listed once, in one "Staffing (shared by zones 2 and 3)" section; zone 3's drawer shows the same list, not a second capacity. Zone 2 and 3 share one space pool (unchanged).
- Owners are explicit per resource in `/state` (spaces, clinician slots, doctors, reserve physician, nurse coverage).
- Balance: 19 grants for 19 patients on the fixture; every hold has a release (0 "departure without hold" problems); at T+110 occupied is 0 and all 19 departed. Seed 7 over 12 h: 59 grants for 59 patients, 0 problems.

### 5. Timestamps
- `/export` patients carry `first_assessment_min`, `decision_min` (decision received), `care_task_required` (null before first assessment), `care_complete_min` and `effective_disposition_min`.
- Recomputed from events for every patient on the fixture and on seed 7:
  - `first_assessment_min` equals the `assessment_active` event time;
  - `decision_min` equals the `decision_received` event time;
  - `care_complete_min` equals the `care_completed` event time (or first assessment when there is no task);
  - `effective_disposition_min` equals max(decision, care complete) and equals the `disposition_processing` phase time;
  - no patient departed before its effective disposition.
- 0 mismatches. Premature decisions: 5 on the fixture, 8 of the 10 task patients on seed 7 (assumption effect, see notes).

### 6. Same version, plain explanation
- Over 28 UI steps (T+5 … T+140) the drawer version, sidebar and zone buttons equalled `/state` at the same version for every field checked (staffed, occupied, available, awaiting, care wait, mesh count, zone buttons, drawer count, 4 doctor rows with patient or "free", 6 nurse rows with on/off duty and occupied/empty). **0 problems.**
- Unstaffed note, T+40: "20 empty spaces are not usable because no nurse is covering them: Nurse Adeyemi, Nurse Brandt, Nurse Chen, Nurse Dube, Nurse Eriksen off duty. Staffed spaces: 4 of 24." Independently recomputed from nurse coverage and patient spaces at every step: 20 (T+5–T+55), then 12 (T+60 onward). Staffed 4/24 then 12/24.

### 7. Representative rows (fixture, from `/state`)

| T | Staffed | Occupied | Available staffed | Awaiting space | Unstaffed empty | Care wait | Doctors busy |
|---|---|---|---|---|---|---|---|
| 15 | 4/24 | 2 | 0 | 0 | 20 | 0 | 2 |
| 40 | 4/24 | 4 | 0 | 4 | 20 | 3 | 1 |
| 55 | 4/24 | 4 | 0 | 5 | 20 | 0 | 1 |
| 60 | 12/24 | 10 | 2 | 2 | 12 | 0 | 4 |
| 110 | 12/24 | 0 | 10 | 0 | 12 | 0 | 0 |

## Regression
- **Ticket 01 regression** ([01-regression.playwright-mcp.js](01-regression.playwright-mcp.js)), run three times; final run 2026-10-10T12:42Z on the shipped build: all sections pass (counts agree 7 = 7 = 7, 409 stale, banners, keyboard, 375/768/1024/1440 widths with 0 overlaps, 0 clipped, 0 targets under 44 px, same-origin routes, determinism 80 events identical, 10× → 9.94 sim min/s).
- **First run after the staffing change found 2 label overlaps** at 1024 and 1440 (the new "Awaiting care completion" label). Fixed by re-spacing the zone 2 rows, a tighter area-label line height and deeper platforms (6 wide, 8 deep). A first attempt that also moved the zone labels to the new platform edge clipped one label and overlapped two at 375 px; that was reverted. Final state has 0 overlaps and 0 clipped at all four widths.
- **Ticket 02 intake snippet** ([02-intake.playwright-mcp.js](02-intake.playwright-mcp.js)): all 12 steps 0 problems; triage order and critical-bypass timings are identical to the ticket 02 evidence (A05-1 R1 at 35, A05-2 R2 at 35, A05-3 R2 at 54.814). The snippet was changed to wait for the 3D mesh counter (up to 3 s) instead of a fixed 150 ms, after a run in a freshly launched, throttled browser window showed the counter one step behind; with the wait there are 0 problems.

Screenshot: [03-staffing-t40.png](shots/03-staffing-t40.png) (T+40: 5 nurses off duty, 3 patients waiting on required care, zone 2 drawer with staffing summary).

## Notes and limits
- **Only nurse coverage changes during a run.** Doctors are always on duty; the reserve physician `D5` is declared and inactive (ticket 16 activates it). There is no per-nurse concurrent-task limit (Q3).
- **Care task assumption is large.** A 5–30 min (mode 15) stabilization task exceeds the 5–20 min assessment often, so with seed 7, 8 of 10 task patients wait for care after the decision and hold their space a few minutes longer. This is a disclosed demo assumption, not a calibration.
- **Zone 2 scene is dense when all four rows are populated.** Area labels can sit under dots. No labels overlap each other and the exact counts are in the zone buttons and drawer. Row overflow beyond about 10 waiting patients is the ticket 06 item already deferred; the full visual pass is ticket 20.
- The meshes-vs-patients check depends on the next rendered frame; in a throttled window it can lag by one step. The regression and 03 snippets wait for it.
- The last evidence run used fixture seed 20261010; the 28-step UI table above is from the same run as the invariants.
