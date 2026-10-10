# Evidence: ticket 05, cleared discharge and constrained ward exits

Date: 2026-10-10. Tool: Playwright MCP (`browser_run_code_unsafe`, `browser_take_screenshot`) against the production build on `:8000`. The snippet is in [05-disposition.playwright-mcp.js](05-disposition.playwright-mcp.js).

Runs:
- **`fixture-boarding`**, started through the UI with the test-only `?fixture=fixture-boarding` parameter (default seed `20261010`). Scripted, no background arrivals, no tests or care tasks, fixed work durations so contention is predictable:
  - Home discharge processing 25 min, ward allocation 20 min, transport 20 min.
  - 11 patients: home H1–H4; ward G1–G4 and urgent U1 (arrives T+40); ICU I1, I2.
  - Supplied bed release schedule (hidden future): WD1 and WD2 free at 0, WD3 at 70, WD4 at 100, WD5 at 130, WD6 at 160, IC1 at 120, IC2 never within the run.
- **`normal`**, seed 7, 12 h, through the API from the page, with the profile's default bed schedule (WD1–WD6, IC1–IC2).
- Seed 3 of `fixture-boarding` for chunk-size determinism.

Assumptions (OPEN_QUESTIONS Q5, labelled demo assumptions in the profile): discharge, ward allocation and transport slots 2/1/1; home processing triangular 6/10/16; ward allocation 10/15/22; transport 10/15/25; ward 6 beds, ICU 2 beds with release times; supplied disposition probabilities by urgency group.

## Results per acceptance criterion

| # | Criterion | Result |
|---|---|---|
| 1 | Supplied effective disposition/clearance, finite home-discharge processing, ward-allocation work, suitable Ward/ICU beds, transport | **pass** |
| 2 | Eligibility needs completed care prerequisites and a received decision; coordination cannot create clearance or a ward bed | **pass** |
| 3 | Reserve a suitable bed during transfer; release the ED bed only at physical departure; unavailable/unsuitable bed and transport reasons visible | **pass** |
| 4 | Zone 4 branches to Home and Ward/ICU exits; boarding keeps the ED bed and can grow upstream waiting | **pass** |
| 5 | Save arrival, first assessment, effective disposition and departure timestamps; total ED time and its three mutually exclusive parts by urgency group | **pass** |
| 6 | Concrete finite ward pool and release assumptions, no unlimited sink; unfinished/capped stays visible | **pass** |
| 7 | Playwright MCP checks of discharge, suitable/unsuitable/unavailable beds, transport, boarding, departure and independently recalculated time components | **pass** |

### 1. Resources and supplied disposition
- `/state` `resources.disposition`: discharge processing 2 units (`DP1`, `DP2`), ward allocation 1 (`WA1`), transport 1 (`TR1`), 6 ward beds and 2 ICU beds with owners "Ward supervisor / bed manager". Capacity per hour: 12 (2 × 60 / 10), 4 and 4.
- Over 60 UI steps and in the event history, busy never exceeded the unit counts: max concurrent 2 discharge, 1 allocation, 1 transport. No unit had overlapping work.
- **Durations:** every discharge, allocation and transport interval in `/events` equals the supplied 25, 20 and 20 min (0 mismatches).
- **Disposition is part of the decision:** at T+5 every patient has `disposition: null` in `/state` and in the export, and `/state` contains no `free_at`. The destination appears when `decision_received` does. Each patient's route matches the supplied destination.

### 2. Eligibility, no invented clearance or bed
- For every patient the first zone 4 phase equals `effective_disposition_min`, comes after `decision_received`, and after care complete (and, with tests, results and review from ticket 04).
- **Coordination cannot create a bed:** I2 (ICU) never got a bed because IC2 is not free within the run. It stays `awaiting_ward_bed` from 70.994 to T+300 (298 min accrued, listed in `export.unfinished`). The two spare ward beds that became free (WD5, WD6) were not offered to it.
- Allocation work never started without a reserved bed (0 violations).

### 3. Bed reserved during transfer, space kept, reasons
- Order per transfer: `awaiting_ward_bed` > bed reserved > `awaiting_ward_allocation` > `ward_allocation_active` > `awaiting_transport` > `in_transport` > `departed` (0 order violations).
- At every one of the 60 steps the reserved beds equal the transfers past the bed step, and free + reserved + occupied equals the bed total for both types.
- A bed is reserved by at most one patient, is the right type (ward patient → `WD*`, ICU patient → `IC*`; 0 mismatches), and is never granted before its release time (G1/G2 at 30.3 and 44.4 with beds free at 0; U1 `WD3` at 70; G3 `WD4` at 100; G4 `WD5` at 130; I1 `IC1` at 120).
- **Urgency order:** U1 (urgent, arrived 40, waiting from 60.129) got WD3 at 70, ahead of G3 (waiting since 58.955) and G4 (59.364).
- **ED space:** every zone 4 patient holds its space (0 violations); departure events carry the released space and the bed. Example G1: `WD1` reserved at 30.335, allocation 30.335–50.335, transport 50.335–70.335, departed 70.335 from space released at that moment.
- **Reasons seen over the 60 steps** (patient `waiting_reason` in `/state`, shown in the roster):
  - "Discharge processing is busy"
  - "Ward allocation coordinator is busy"
  - "Transport team is busy"
  - "Unavailable bed: all N ward beds are occupied or reserved for other transfers" (also for ICU)
  - "Unsuitable bed: needs an ICU bed, only ward beds are free (n)"

### 4. Exits and boarding growth
- Exit pads show cumulative departures: "Home · N" and "Ward / ICU · N". At every step they equal `counts.departed_home` and `counts.departed_ward`, the zone 4 drawer, and sum to `departed_total`. Final: home 4, ward 6, equal to the `exit` field on the `departed` events.
- Boarding: patients in `awaiting_ward_bed` rose to 4 at T+65 and 3–4 patients stayed in zone 4 until T+115, each holding an ED space; occupied spaces stayed at 5–9 while the home patients left. Mean boarding for ward/ICU patients: urgent 50.2 min, medium 68.0 min, lower 100.8 min (fixture, completed transfers).
- Upstream effect: with only 2 discharge slots at 25 min the home patients H3 and H4 waited in `awaiting_discharge` (peak 1 waiting at T+40), and in the ticket 02 intake run the same slot limit delayed critical A05-1 by about 8 min (see Regression).

### 5. Timestamps and the three time parts
- `/export` per patient: `arrival_min`, `first_assessment_min`, `effective_disposition_min`, `departure_min`, plus `disposition`, `ward_bed_id`, `bed_reserved_min`, `allocation_start_min`, `transport_start_min`, `exit`, `space_grant_min` and `time_parts`.
- **Three mutually exclusive parts** (OPEN_QUESTIONS Q5): initial wait = first assessment − arrival; care and tests = effective disposition − first assessment; awaiting departure = departure − effective disposition. Boarding is the awaiting-departure part for ward/ICU transfers and null for home.
- Recomputed independently from the timestamps for every departed patient (fixture and seed 7): the parts equal `time_parts` and sum exactly to departure − arrival (0 mismatches); `ed_space_min` equals departure − space grant.
- **By urgency group** (`export.time_summary`), recomputed means match (0 mismatches). Fixture:

  | Group | Completed | Unfinished | Mean total | Initial wait | Care/tests | Awaiting departure | Transfers (mean boarding) |
  |---|---|---|---|---|---|---|---|
  | urgent | 1 | 0 | 70.3 | 6.5 | 13.7 | 50.2 | 1 (50.2) |
  | medium | 5 | 0 | 85.0 | 19.2 | 13.1 | 52.7 | 3 (68.0) |
  | lower | 4 | 1 | 107.7 | 32.1 | 12.7 | 62.9 | 2 (100.8) |

  Unfinished stays are counted separately and never averaged in as complete.
- Example G3 (lower): arrival 2, first assessment 41.54, effective 58.955, departed 140: parts 39.5 + 17.4 + 81.0 = 138.0.

### 6. Finite pool, no unlimited sink
- Beds: ward 6 and ICU 2, with the release times above; once a bed is given to an ED patient it stays occupied for the run.
- **Seed 7, 12 h** (59 patients, 53 departed): 8 transfers (7 ward, 1 ICU), all ward beds used by 596.8; the seventh ward patient (P0043, effective disposition 629.84) was still boarding at 12 h with no bed (6 unfinished in total). 0 invariant problems: max concurrent 2/1/1, no bed double-reserved, right types, nothing before release times.
- `export.unfinished` lists each unfinished patient with phase and accrued ED minutes.

## Regression
- **Ticket 01 regression** (2026-10-10T12:58Z): all sections pass (counts 7 = 7 = 7, 409, banners, keyboard, 10× → 9.95 sim min/s, determinism 92 events identical). 375/768/1024/1440: 0 label overlaps, 0 clipped, 0 targets under 44 px, no horizontal scroll (20 labels at 1024/1440).
- **Ticket 02 intake snippet:** 0 problems; triage order identical. **Critical-bypass timings changed by the new discharge limit:** A05-2 now departs at 57.839 (was 54.814) and A05-3 takes R2 at 57.839 (was 54.814), because completed patients wait for one of two discharge slots. The criterion (finite resus capacity, max 2 held) still holds. The ticket 02 evidence file records the earlier numbers for its commit.
- **Ticket 03 staffing snippet:** 0 problems (fixture and seed 7). **Ticket 04 diagnostics snippet:** 0 problems; W13 now departs at 97.603 (was 97.443) for the same reason. Both snippets now take the first zone 4 phase as the effective-disposition event (a discharge queue can sit between the two).
- Screenshot: [05-boarding-t70.png](shots/05-boarding-t70.png): T+70, 7 patients in zone 4, 3 boarding, ward beds free/reserved/occupied 0, 3, 3 of 6, Home 3 and Ward / ICU 0.

## Notes and limits
- **Bed model is simple.** A bed is free, reserved or occupied; there is no cleaning step and no return of an ED patient's bed within the run. Bed counts and release times are demo assumptions.
- **Ward owner role.** All four disposition resources are owned by "Ward supervisor / bed manager"; no other role is invented.
- **The default shift now shows boarding late in the run.** With seed 7 the six ward beds are exhausted before the 10 h mark; this follows from the assumed bed counts, not from calibration.
- **Zone 4 scene is dense** when several rows are populated (dots can sit under labels, as in zones 2 and 3). Rows hold about 5 dots before the next row's area; overflow handling is ticket 06 and the visual pass ticket 20. Exact counts are in the zone buttons and drawer.
- **Disposition and bed reasons are explanations of model state**, not clinical statements: "Unsuitable" and "Unavailable" describe bed type and occupancy only.
- Per-source freshness of the bed feed, and ward-bed availability as a received input, are ticket 08.
