# Evidence: ticket 06, local overload versus ED congestion

Date: 2026-10-10. Tool: Playwright MCP (`browser_run_code_unsafe`, `browser_evaluate`, `browser_take_screenshot`) against the production build on `:8000`. Snippets: [06-pressure.playwright-mcp.js](06-pressure.playwright-mcp.js) (engine and API, parts `engine` and `seed7`) and [06-ui.playwright-mcp.js](06-ui.playwright-mcp.js) (UI). Layout and label checks added at the review gate: [06-zone4-layout.playwright-mcp.js](06-zone4-layout.playwright-mcp.js) and [06-label-geometry.playwright-mcp.js](06-label-geometry.playwright-mcp.js). Screenshots are in `evidence/shots/06-*.png`.

**Status after the ticket 03-06 review gate:** all eight criteria still pass. The numbers in sections 4 and 5 below were re-run on the gate build (see "Review-gate fixes" for what changed against `3ecc56c`).

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
- **μ** = servers × 60 / mean task minutes (mean of the triangular assumption; lab and imaging use the disclosed median). Examples: triage 11.25 patients/h, lab 4 tasks/h, imaging 1.33, discharge 11.25, allocation 3.83, transport 3.6. **Assessment** μ = 4 doctor slots × 60 / (mean first assessment 11.67 min + review share × mean result review 5.33 min); the review share is result-review entries ÷ first-assessment entries so far. It is 20.57 before any review and falls as reviews accumulate: `fixture-diagnostics` gives 20.57 (T+30, 0 of 5), 19.67 (T+60, 1 of 10), 18.61 (T+90, 3 of 13), 17.5 (T+120, 5 of 13), 16.05 (T+150, 8 of 13); each value equals the independent formula (minute by minute, 0 mismatches).
- **Units:** triage, assessment, discharge, allocation and transport are patients per hour; lab and imaging are tasks per hour, separate rows; ward beds report free ward/ICU beds instead of a rate; the staffed-space service has no per-hour capacity (null, "Not modelled per hour").
- **Throughput** is separate: completions in the same window, `min(t, 30)` minutes (the diagnostics resource view uses the same span, so `resources.diagnostics.*.recent_throughput_tasks_per_hour` equals the pressure panel at every minute). Assessment λ and throughput count first assessments; a result review is the same patient returning and is logged under its own key (λ 10/h, throughput 12/h at T+60 in `fixture-diagnostics`). Idle capacity: lab at T+1 shows μ 4 tasks/h with throughput 0 and queue 0.
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

- **Zone 4 (review gate):** waiting and active areas are now seven separate single-row areas (Awaiting discharge, Discharge processing, Awaiting ward/ICU bed, Awaiting ward allocation, Ward allocation, Awaiting transport, In transport), pitch 1.18, each with its own exact count. `fixture-boarding`, 40 steps: 138 dot positions all on their own row (`z` within 0.02), max layer 0, every label count equal to `/state`, 0 label overlaps.
- **Fixed:** wait lines now use 8 columns (step 0.62), two rows per layer; further patients stack upward in layers (0.6 high) at the same slots instead of running into the next area. Each area label shows its exact count ("Awaiting space · 4"), taken from all patients, so the number is right even when dots are capped at 200.
- **Check** (`fixture-queue-surge`, 4 steps, 23 patients awaiting triage): every rendered mesh position lies inside its own area box (0 outside), `y` sits on a layer (max layer 1), no dot beyond the platform, mesh count equals patients. The check reads real mesh positions from `canvas.dataset.meshPositions`, a test hook added to the scene.
- **Not fixed:** area labels can still sit under dots (ticket 20 owns the visual pass).

## Widths (`fixture-congestion-boundary` at T+60, zone 2 drawer open)

| Width | Horizontal scroll | Zone buttons min h x w (px) | Chips inside buttons | ALERT bubble inside canvas |
|---|---|---|---|---|
| 375 | none | 117 x 151 | yes | n/a: compact scene, status icon beside the zone number, no bubble |
| 768 | none | 117 x 196 | yes | n/a: compact scene (as above) |
| 1024 | none | 137 x 158 | yes | yes |
| 1440 | none | 137 x 168 | yes | yes |

The first run found the chip overflowing its zone button at 768 px (buttons only 94 px wide). At the review gate the zone bar became a container query on the map column: 2 × 2 by default and 4 across from 640 px of map width (375 and 768: 2 rows × 2 columns; 1024 and 1440: 1 row × 4 columns). The rerun on the final build gives the same button sizes and chips inside their buttons at every width.

## Regression

Rerun on the review-gate build (2026-10-10T13:51-13:53Z): `01-regression` (counts agree, cadence 1.99 and 9.95 sim min/s, 409 on stale reset, 0 label overlaps, 0 clipped labels and 0 targets under 44 px at 375/768/1024/1440, deterministic), `02-intake`, `03-staffing`, `04-diagnostics`, `05-disposition`: 0 problems in each. The zone button text includes the status chip. An earlier run of this gate build failed the overlap/clip check in 01 (6-7 overlaps, 1 clipped label at 1024 and 1440); the layout was reworked and 01 then passed, see below.

## Review-gate fixes (after `3ecc56c`)

Run on the working tree before the review-gate commit; 0 problems in every check unless noted.

| Finding | Change | Result |
|---|---|---|
| Assessment λ/μ in unlike units | result review has its own log key; λ and throughput count first assessments; μ uses doctor minutes per patient (above); queue and alert counts still merge both waits | `06-pressure` engine (6 fixtures, 1 min steps) and seed7 (720 min): 0 mismatches with the independent formula |
| Two different μ for discharge/allocation/transport | `resources.disposition.*.capacity_patients_per_hour` uses the same triangular mean as the panel | equals the pressure μ at every minute of every run |
| Throughput window differs | diagnostics throughput divides by `min(t, 30)` | equals the pressure panel at every minute |
| Hidden bed schedule served by the profile | `free_at_min` removed from `/api/v1/profile`, kept in `export.profile` | profile bed keys `[id, type]`, export keys `[id, type, free_at_min]` |
| Mixed only a global flag | each alert has `mixed` and `also_active`; drawer shows a Mixed tag | per alert and minute equal to the other active categories (sorted labels), 0 mismatches |
| Normal/Building had no in-scene text or icon | every zone label carries the status icon and word (compact scene: icon beside the number, word screen-reader only) | all four widths: label status equals the zone chip equals `/state` at every step |
| No data read as Normal | before Start every chip and label reads "Not started", platforms gray, no bubbles; after the first state they follow `/state` | `noDataAndLabels.pass` true |
| Zone 4 queue and active areas shared one area | seven separate areas (above) | 40 steps, 0 problems |
| `font-weight: 750`, `auto-fit` zone bar, DESIGN.md wording | 650; container-query zone bar; one sentence allowing the zone tint | widths table above; `06-ui` 0 problems |
| Mesh-position hook always on | written only with `?fixture=` | absent on `/` after Start (`hook: absent`), present for fixture runs |
| ALERT bubble overlapped its zone label (found while fixing the above) | the bubble is a child of the zone label (above it for zone 1, left of it for zones 2-4; none in the compact scene, where the status icon carries the alert) | `06-label-geometry`: 5 fixtures with an alert in each of zones 1-4, six viewports (375x812 to 1920x1080), 30 cases, 0 overlaps, 0 clipped |

Layout rework detail: zone 4's seven rows put adjacent area labels about 10.5 px apart at a 679-719 px canvas, less than the 12 px they had. Area labels are now 10 px with line-height 1, and the scene switches to its compact form when a zone 4 row pitch would project below 10.2 px (map canvas narrower than about 660 px at the usual height, or any canvas height of 300 px). The stacked zone label (name and count over status) hangs below its anchor so it grows away from the rows above it.

## Not run / limits

- The "Open episode" row in the drawer for a service with missing inputs is in the tested build but the snippet does not read it; it was neither asserted nor inspected (not-run).
- A recovered local episode shows no recovery clock in the UI after clearing (the export carries it). Only the in-progress clock is shown.
- In the compact scene (map canvas under about 660 px) area labels and the ALERT bubble are not drawn; counts and status words remain in the zone buttons and the drawer. The 1280 px viewport is compact for this reason (the drawer column narrows the map to 559 px).
- The `06-pressure` engine and seed7 parts were run once after the backend changes and were not repeated after the later frontend-only label work (no backend file changed in between).
- The mesh-position hook is read by `06-ui` and `06-zone4-layout`, so those runs require `?fixture=`.
- `ward_beds` capacity unavailable is "a waiter exists" (the engine only queues when no suitable bed is free). Verified through the fixture episodes, not through an independent bed-schedule model.
- The 12 h seed 7 run gives only one local alert (ward beds, 630/640, never cleared); only ward beds reach Overloaded and the overall status stays Stable.
- Forecast-based zone warnings and the selected-zone forecast panel belong to ticket 10.
- Zone selection by canvas pick, drawer layout in a narrow column and label/dot overlap remain ticket 07 and 20 work.
