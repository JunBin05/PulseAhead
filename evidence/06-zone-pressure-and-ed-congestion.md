# Evidence: ticket 06, local overload versus ED congestion

Date: 2026-10-10. Tool: Playwright MCP (`browser_run_code_unsafe`, `browser_evaluate`, `browser_take_screenshot`) against the production build on `:8000`. Snippets: [06-pressure.playwright-mcp.js](06-pressure.playwright-mcp.js) (engine and API, parts `engine` and `seed7`) and [06-ui.playwright-mcp.js](06-ui.playwright-mcp.js) (UI). Screenshots are in `evidence/shots/06-*.png`.

## How the checks work

- **Independent rules.** The snippet rebuilds per-minute queues for the nine services from `/events` (phase at minute t = last phase event with time ≤ t; space occupancy from `resources.ed_space`; feed gaps from the fixture definition). It then applies both rules written from the spec, not from the engine:
  - Local: threshold (triage 3, assessment 6, lab 4, imaging 2, departure 3) or blocked capacity with a waiter for 10 continuous min to confirm; clear after 5 continuous min below threshold with capacity available; missing inputs cannot establish recovery.
  - Overall: 0 available staffed general spaces and at least 6 awaiting for 20 min to confirm; clear after fewer than 3 awaiting for 10 min.
- **Per-minute comparison.** `/advance` is called 1 min at a time and the compact `/state` is compared with the reconstruction at every minute: overall state, label, recovering flag, onset and confirmation, zone state, each service's state/queue/λ/μ/throughput/unit, failure category and affected/urgent counts, and local alert. Episodes are compared with `export.local_episodes` and `export.congestion_episodes`.
- **UI.** The UI is driven by clicks (Start, Step 5 min, zone buttons). At each step the chips, ALERT bubbles, area-label counts, drawer cards and mesh count are compared with `/state` at the same version.

Runs: `fixture-congestion-boundary` (150 min), `fixture-diagnostics` (200), `fixture-diagnostics-gap` (200), `fixture-intake` (120), `fixture-queue-surge` (180), `fixture-boarding` (200), and `normal` seed 7 for 720 min. All used seed 20261010 except `normal`.

## Results per acceptance criterion

| # | Criterion | Result |
|---|---|---|
| 1 | Local rules, onset/confirmation stored separately, 10 min to confirm, clear after 5 min, missing inputs cannot establish recovery | **pass** |
| 2 | Overall congestion confirmed only after 20 min of zero staffed spaces and at least 6 awaiting; onset and confirmation separate | **pass** |
| 3 | Building congestion before confirmation; clear after fewer than 3 awaiting for 10 min without needing an empty bed | **pass** |
| 4 | Received work and staffed capacity in matching units, recent throughput apart, no infinite rate or countdown | **pass** |
| 5 | Triage/assessment per patient-hour, lab/imaging per task-hour, departure pathways separate | **pass** |
| 6 | Colours and ALERT bubbles follow model state; text and icons; a local alert does not declare overall congestion | **pass** |
| 7 | Failure categories with source evidence and affected counts | **pass** |
| 8 | Playwright MCP checks of bursts, exact boundaries, recovery, zero-capacity waits, idle capacity, units, diagnostic-only alerts | **pass** |

### 1. Local rule

- **Independent comparison:** 0 mismatches over all six fixture runs and the 12 h run (each service, each minute). Status counts compared: for example `fixture-congestion-boundary` 1278 normal, 10 building, 62 overloaded service-minutes.
- **Exact timing** (`fixture-congestion-boundary`, local `space` service, nurses N1-N5 off so only S21 and S22 are staffed and both are held by 400 min care tasks):
  - Episode onset 31, confirmed 41, cleared 103; the export episode equals the independent one.
  - Minute-by-minute: building at onset + 9 (T+40), `overloaded` at onset + 10 (T+41) with `onset_min` 31 and `confirmed_min` 41 kept apart.
- **Short burst** (`fixture-intake`, four walk-ins at T+2 against one desk): the triage queue is at or above 3 for 15 min in total between T+2 and T+30. No single stretch reached 10 min, so it only ever showed Building, was never confirmed, `local_episodes.triage` is empty and zone 1 was never Overloaded.
- **Surge** (`fixture-queue-surge`, 24 walk-ins at T+2.5): triage onset 3, confirmed 13, cleared 119 (export equals independent).
- **Missing inputs** (`fixture-diagnostics-gap`, imaging feed missing T+90 to T+120):
  - Imaging reads `Cannot assess` (30 service-minutes). Queue, λ, throughput and pressure signal are null; μ stays 1.33 tasks/h because it comes from the staffed slot.
  - The open imaging episode (onset 68, confirmed 78) is not cleared during the gap. It clears at 154; the same fixture without the gap clears that episode at 99 and has a second one (112/122/154). The independent reconstruction with the gap gives the same 68/78/154.
  - UI: at every 5 min step from T+90 to T+115 the imaging card shows "Cannot assess", queue "Unknown (threshold 2)", λ and throughput "Unknown", μ "1.33 tasks/h" and "Cannot be established while inputs are missing". The drawer also carries an "Open episode: Confirmed T+01:18; stays open while inputs are missing" row for these services; the snippet does not assert that row (see not-run below).

### 2. Overall congestion

`fixture-congestion-boundary`, independent and export both give onset 31, confirmed 51, cleared 85.
- T+30 stable; T+31 building (onset 31); T+50 "Building congestion" (onset + 19); T+51 "Congested" with `onset_min` 31 and `confirmed_min` 51 (onset + 20).
- Overall onset and local `space` onset are both 31, but the local alert confirms at 41 while the overall status is still Building (rows 41 to 50 show Local alert with "Building congestion").

### 3. Building and recovery

- Recovery clock starts at 75 (fewer than 3 awaiting): `Congested, recovering` for T+75 to T+84 (10 rows), `Congested` at T+74, `Stable` at T+85 (below-since + 10). `recovery_since_min` is 75.
- At T+85: `available_staffed` 0 of 24, 2 awaiting, 4 occupied. The episode cleared without an empty bed.

### 4 and 5. Rates and units

Checked at every minute for all services (0 mismatches):
- **λ** = work entries into the service's queue in the previous 30 min × 60 / window (window = min(t, 30)). The first queue entered at arrival (triage or critical bypass) counts: this was a defect in the first backend version (arrivals never reached the entry log, so triage λ would always have been 0). It was found by reading the code before the run and fixed in `engine.py` `_spawn`.
- **μ** = servers × 60 / mean task minutes (mean of the triangular assumption; lab and imaging use the disclosed median). Examples: triage 11.25 patients/h, assessment 20.57, lab 4 tasks/h, imaging 1.33, discharge 11.25, allocation 3.83, transport 3.6.
- **Units:** triage, assessment, discharge, allocation and transport are patients per hour; lab and imaging are tasks per hour, separate rows; ward beds report free ward/ICU beds instead of a rate; the staffed-space service has no per-hour capacity (null, "Not modelled per hour").
- **Throughput** is separate: completions in the same window. Idle capacity: lab at T+1 shows μ 4 tasks/h with throughput 0 and queue 0.
- **λ > μ** is a pressure signal only: triage in the surge fixture has λ 48 against μ 11.25 at T+30 and `pressure_signal` true; `confirms_in_min` is null whenever a service is Normal. No response contained NaN or Infinity (`nonFinite` 0 in every run).

### 6. Colours, bubbles and the overall status

- Every UI step (26 steps on the boundary fixture, 4 on the surge, 24 on the gap fixture) matched `/state`: zone chips (Normal, Pressure building, Overloaded, Cannot assess; each with an icon and text), ALERT bubbles on exactly the Overloaded zones (and "Cannot assess" on unknown ones), the Local alert chip equal to "any zone overloaded", and the overall label.
- **Diagnostic-only alert** (`fixture-diagnostics`): zone 3 Overloaded for 53 minutes (imaging 68/78/99 and 112/122/154, triage 2/12/64) while the overall status was `stable` throughout and Local alert showed in all 53 rows. Overall episodes: none.
- Triage-only (`fixture-queue-surge`): zone 1 Overloaded 106 minutes, overall `stable` throughout.
- Bubbles and tints come from `pressure.zones[].state`. The surge screenshot (`06-surge-layers.png`) shows zone 1 yellow with 24 dots and the other zones green.

### 7. Categories and counts

Every alert row (all runs) has the category implied by its service (triage → triage/arrival; assessment and space → physician/space; lab and imaging → lab/imaging; discharge, allocation, transport and ward beds → departure/ward/transport), `affected_patients` equal to the patients in that queue in `/state`, and `urgent_group_waiting` equal to the urgent patients in it. Evidence text appears in the drawer. **Mixed** was seen: `fixture-boarding` T+43 to T+46 (triage overloaded plus ward beds building) and `fixture-intake` T+55 to T+57 (space overloaded plus discharge building); `mixed` equalled "more than one category" at every minute of every run.

### 8. Coverage

Short bursts, exact 10/20 min onsets, 5/10 min recovery, zero-capacity waits (`space` queue 6 with `capacity_unavailable` true, μ null, no division), idle capacity, units, diagnostic-only and triage-only alerts, missing inputs: see 1 to 7.

## Layout (deferred finding from ticket 01)

- **Fixed:** wait lines now use 8 columns (step 0.62), two rows per layer; further patients stack upward in layers (0.6 high) at the same slots instead of running into the next area. Each area label shows its exact count ("Awaiting space · 4"), taken from all patients, so the number is right even when dots are capped at 200.
- **Check** (`fixture-queue-surge`, 4 steps, 23 patients awaiting triage): every rendered mesh position lies inside its own area box (0 outside), `y` sits on a layer (max layer 1), no dot beyond the platform, mesh count equals patients. The check reads real mesh positions from `canvas.dataset.meshPositions`, a test hook added to the scene.
- **Not fixed:** area labels can still sit under dots (ticket 20 owns the visual pass).

## Widths (`fixture-congestion-boundary` at T+60, zone 2 drawer open)

| Width | Horizontal scroll | Zone buttons min h x w (px) | Chips inside buttons | ALERT bubble inside canvas |
|---|---|---|---|---|
| 375 | none | 117 x 151 | yes | yes |
| 768 | none | 117 x 196 | yes (after fix) | yes |
| 1024 | none | 137 x 158 | yes | yes |
| 1440 | none | 137 x 168 | yes | yes |

The first run found the chip overflowing its zone button at 768 px (buttons only 94 px wide). The zone bar now uses `auto-fit` columns of at least 150 px, and the rerun passes.

## Regression

Rerun on the final build: `01-regression` (counts agree, cadence 1.99 and 9.92 sim min/s, 409 on stale reset, no overlaps, 0 targets under 44 px, deterministic), `02-intake`, `03-staffing`, `04-diagnostics`, `05-disposition`: 0 problems in each. The zone button text now includes the status chip.

## Not run / limits

- The "Open episode" row in the drawer for a service with missing inputs is in the tested build but the snippet does not read it; it was neither asserted nor inspected (not-run).
- A recovered local episode shows no recovery clock in the UI after clearing (the export carries it). Only the in-progress clock is shown.
- `ward_beds` capacity unavailable is "a waiter exists" (the engine only queues when no suitable bed is free). Verified through the fixture episodes, not through an independent bed-schedule model.
- The 12 h seed 7 run gives only one local alert (ward beds, 630/640, never cleared); only ward beds reach Overloaded and the overall status stays Stable.
- Forecast-based zone warnings and the selected-zone forecast panel belong to ticket 10.
- Zone selection by canvas pick, drawer layout in a narrow column and label/dot overlap remain ticket 07 and 20 work.
