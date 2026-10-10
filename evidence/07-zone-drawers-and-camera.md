# Evidence: ticket 07, inspect zones and focus the alert camera

Date: 2026-10-10. Tool: Playwright MCP (`browser_run_code_unsafe`, `page.screenshot`) against the production build on `:8000` (backend restarted on the final build). Snippets: [07-zones.playwright-mcp.js](07-zones.playwright-mcp.js) (zone responses, drawer, camera, geometry) and [07-ease.playwright-mcp.js](07-ease.playwright-mcp.js) (camera easing).

Runs:
- **Part A (API only):** `GET /api/v1/replays/{id}/zones/{zone}` for zones 1-4 after every step of five scenarios, each compared with `/state` at the same version: `fixture-staffing` (140 min, 5 min steps), `fixture-diagnostics` (200), `fixture-boarding` (200), `fixture-intake` (120), `normal` seed 7 (720 min, 30 min steps). 156 steps x 4 zones = 624 zone responses.
- **Part B (UI):** `fixture-staffing` through `?fixture=fixture-staffing` (seed `20261010`), stepped 5 min at a time. Zone 1 is Overloaded from T+15 and zones 1 and 2 are both Overloaded from T+30 (zone states read from `/state` as o/b/n/u per zone: `onnn` at T+15, `obnn` at T+20-25, `oonn` at T+30-45; the run was stepped to T+45). That overlap is what makes switching between two alerts testable.
- **B12 geometry:** `fixture-staffing` T+30 (zones 1 and 2), `fixture-diagnostics` T+85 (zone 3) and `fixture-boarding` T+60 (zone 4), each at 375, 768, 1024 and 1440 px wide.

## Results per acceptance criterion

| # | Criterion | Result |
|---|---|---|
| 1 | Normal-zone selection opens count/roster, assigned on-duty doctors/nurses, queues, relevant capacity/bed use and freshness from a versioned zone response | **pass** (freshness age is always 0, see limits) |
| 2 | Zone 1 states it has no treatment beds; zones 2/3 disclose the shared ED-bed pool without adding capacities or duplicating patients | **pass** |
| 3 | Alert selection smoothly focuses the zone and opens its drawer; a normal selection need not zoom; DOM zone buttons give the same access | **pass** |
| 4 | Back to overview restores the overview camera without resetting replay, decisions or active actions; camera changes never mutate simulated time | **pass** (no decisions or actions exist yet, see limits) |
| 5 | Switching alerts updates zone, title and source version together; reset clears obsolete selections; normal updates retain the selection without confusing old and current data | **pass** |
| 6 | Readable overlays that cover no controls; short cause/blocked-reason summary; no auto-zoom on every warning | **pass** |
| 7 | Playwright MCP checks of normal/alert selection, focus/back, switching, keyboard access, roster/API agreement, source versions and unchanged engine state | **pass** |

### 1. Versioned zone response and drawer content
- **Version:** all 624 zone responses carry the same `version`, `sim_time_min`, `replay_id` and `run_number` as `/state` read at the same moment (0 mismatches).
- **Roster:** every response's roster is the zone's `patient_ids` from `/state`, and each patient object is identical to the one in `/state` (0 differences). No patient appears in two zones; the four zones hold exactly `patients.length` patients at every step.
- **Counts and queues:** the zone's counts equal the `/state` zone fields, and the queue rows restate them (zone 1 triage queue/active, zone 2 awaiting space/clinician/review/care completion/with clinician, zone 3 lab and imaging queue/active, zone 4 discharge, boarding, allocation and transport queue/active): 0 mismatches.
- **Assigned staff:**
  - Zone 2 lists exactly the 4 on-duty doctors, each with `assigned` equal to whether a patient in the roster holds that clinician slot, and the patient id (171 assigned rows seen).
  - Zones 2-4 list the nurses covering a space held by a patient in that zone, with the same patient ids as the roster (424 nurse rows seen).
  - Off-duty nurses were never listed.
  - Zone 1 lists none (`staff.nurses` empty, no doctors).
- **Capacity:** zone 4 reports `spaces_retained` with occupied spaces equal to `/state` and the ward bed free/reserved/occupied/total equal to `resources.disposition.beds.ward`.
- **Freshness and summary:** `freshness` equals `/state.freshness`; `summary.state` and `pressure.state` equal the pressure zone state; `pressure.alerts` equal the alerts of that zone; an Overloaded zone's headline starts "Overloaded: " and its cause contains an alert's evidence text; a Normal zone says "No local alert" with no blocked reason; a Building zone's headline starts "Pressure building: ".
- **No hidden fields:** no response contained `free_at_min`, `tests_required`, `arrival_time` or `hidden`.
- **Drawer vs API (UI):** at each B1/B2/B3/B4/B5/B6/B8 check the drawer's zone, version, heading `Zone N · name`, patient count, roster ids in order, doctor and nurse rows, headline, cause and blocked text equal the zone response and `/state` at one version (`uiProblems: []`).
- **Error codes:** zone `0` and `5` return 404, `abc` returns 422, unknown replay returns 404, zone `2` returns 200.

### 2. Zone 1 and the shared pool
- Zone 1: `capacity.kind` is `none` and its text is "No treatment beds here. Patients wait for registration and triage." at all 156 steps; the drawer shows it at T+10.
- Zones 2 and 3: `capacity.kind` is `shared_ed_spaces`, `shared_with_zone` is the other zone, and `total`, `occupied`, `available_staffed`, `staffed_total` equal `/state.resources.ed_spaces` (0 mismatches). The two zones reported the same `occupied` at all 156 steps. `held_by_patients_here` equals the roster patients holding a space.
- **Capacity is not double counted:** the sum over the four zones of roster patients holding a space equals `ed_spaces.occupied` at every step (0 mismatches).
- UI text at T+10: zone 2 "ED spaces are one shared pool for zones 2 and 3: 1 of 24 occupied, 1 general spaces free. 2 of 2 resuscitation spaces (held for supplied critical bypass) free. 1 of the 1 occupied spaces are held by patients in this zone. The same pool is shown for zone 3; the two are not added together." Zone 3's drawer shows the pool text and the "not added together" note.

### 3. Focus, drawer and DOM access
- **Normal selection (T+10, all zones Normal):** selecting zones 1, 2 and 3 left `data-camera=overview`, zoom 1, no callout.
- **Alert selection:** at T+40 (version 9) clicking zone 1 (Overloaded) set `data-camera=zone-1`, zoom 1.9, callout "Focused on zone 1 · Arrival and triage" and opened the drawer: state `overloaded`, headline "Overloaded: Triage / arrival pressure", cause "7 waiting for triage (threshold 3). Affected patients: 7; urgent group waiting: 1.", blocked "The waiting line is at or above its threshold of 3."
- **Smooth movement** ([07-ease.playwright-mcp.js](07-ease.playwright-mcp.js), sampled every 30 ms): zoom 1.00 at 0 ms, 1.44 at 100 ms, 1.73 at 199 ms, 1.86 at 297 ms, 1.90 from about 400 ms; 11 distinct intermediate values, monotonic.
- **Reduced motion:** with `prefers-reduced-motion: reduce` the zoom was already 1.9 after 60 ms (jump, no easing).
- **DOM access:** every selection above used the visible `zone-N` buttons; Back used the `back-to-overview` button. The canvas platform click uses the same selection handler (regression 01, "canvasToggle": first click selects zone 2, second click deselects).

### 4. Back to overview and engine state
- Focused on zone 2 at T+45 (v10), Back to overview: camera `overview`, zoom 1, callout gone, drawer still zone 2 at version 10. `/state` before and after: version 10/10, time 45/45, run 1/1, same patient count.
- B3: clicking an alert zone left version, simulated time and run number unchanged (the camera did not step the replay).
- Selecting, focusing and going back never changed the version; versions moved only on my explicit step clicks.

### 5. Switching, retention, reset
- **Switching alerts (zone 1 to zone 2, sampled 24 times at about 25 ms):** 0 samples where the heading's zone number differed from the drawer's `data-zone`; 1 sample showed the loading state; the zone/version pair seen was `2@9`; the settled state was zone 2, zoom 1.9, state `overloaded`.
- **Normal updates keep the selection:** zone 2 stayed selected over 6 steps (T+15 to T+40) while zones turned into alerts; at each step the drawer version equalled `/state.version` and the camera stayed `overview` at zoom 1.
- **Update while focused:** one more step with zone 2 focused: drawer version 10 equals state version 10, focus kept.
- **Slow and stale responses:** a zone-3 response delayed 1.5 s showed the loading state with the "Zone 3" heading and no zone body, then the zone 3 drawer at version 10. A response altered to `version - 1` was discarded (loading state shown, no zone data) and the drawer recovered at version 12 on the next step.
- **Reset:** with zone 1 focused, Reset returned `data-camera=overview`, removed the callout, emptied the drawer ("Zone details", no zone) and showed no loading state.

### 6. Overlays, summary and no auto-zoom
- **Callout:** at 375/768/1024/1440 the callout was inside the map, covered no other button/link/input, the Back button was 170 x 44 px, and the page had no horizontal scroll.
- **Geometry while focused (B12, 16 cases):**
  - The focused zone's label and its ALERT bubble (drawn at 768, 1024 and 1440) were inside `.scene-canvas`, and no two of `.area-label`, `.zone-label`, `.alert-bubble` overlapped.
  - At 375 px the scene is compact: no bubble or area labels are drawn; the status icon, the callout and the drawer carry the alert.
- **No auto-zoom:** in B2 zone 1 became Overloaded at T+15 and zone 2 at T+30 while zone 2 was selected; the camera stayed overview at every step.
- **Summary:** the drawer shows the headline, the cause and, when set, a "Blocked:" line, from the zone response.

### 7. Keyboard and regressions
- Keyboard only: `Enter` on the zone 1 button focused the camera (`zone-1`), `Enter` on Back returned to overview; the zone button's focus outline was solid 2.4 px.
- **Regression on the final build (production build, backend restarted):**
  - `01-regression`: counts agree across UI/meshes/zone buttons/`/state`/`/events`/`/export`, determinism identical; 0 overlaps, 0 clipped, 0 targets under 44 px at all four widths; cadence 9.92 and 1.98 sim min/s.
  - `02-intake`, `03-staffing`, `04-diagnostics`, `05-disposition`: 0 problems each.
  - `06-label-geometry`: 30 cases, 0 overlap or clip.
  - `06-ui`: 0 problems, and `bubbleInsideCanvas` true at 768/1024/1440 (null at 375, compact scene).
  - `06-zone4-layout`: 40 steps, 0 problems.

Screenshots: [07-alert-focus-zone1.png](shots/07-alert-focus-zone1.png), [07-alert-focus-zone2.png](shots/07-alert-focus-zone2.png), [07-focus-375.png](shots/07-focus-375.png), [07-focus-768.png](shots/07-focus-768.png), [07-focus-1024.png](shots/07-focus-1024.png), [07-focus-1440.png](shots/07-focus-1440.png).

## Defects found and fixed during verification
- **Bubble placement while focused.** With a zone focused at 768 px the default left-hand ALERT bubble ended outside the map (zone 2: x -9 to 64; zone 3: x -21 to 52). Moving it to the right fixed zone 2 but, for zone 3, overlapped the "Ward allocation" area label. A probe of left/right/above for zones 2-4 at 768/1024/1440 showed "above" fitted with no collisions in all 9 cases, so the focused zone's bubble now sits above its label, as zone 1's already did.
- **Test timing, not an app defect.** `data-patient-meshes` is written every 15th rendered frame, so a read taken 100-120 ms after a step can lag a departure by one dot. `03-staffing` and `06-ui` section C raised 7 and 4 mesh mismatches for that reason. A probe showed the count was exactly one too high for under 500 ms and then equalled `/state` in all four cases. Both snippets now wait for the counter as 02, 04 and 05 already did.
- **Staging artifact, not an app defect.** A PowerShell copy re-encoded the "·" in the staged 07 snippet and produced 14 heading mismatches; restaging with node fixed it.

## Limits and not-run
- **Freshness is not yet per source:** `freshness.age_min` is always 0 in the zone response because it restates the replay-wide freshness; per-source heartbeats and ages are ticket 08.
- **Decisions and actions:** none exist before tickets 10-11, so "without resetting decisions or active actions" is shown only for the replay (version, time, run, patients). Re-check it in ticket 11.
- **No forecast:** zone details are received state only; the forecast panel is ticket 10.
- **Failed zone request:** the drawer does not retry a failed zone request until the next state version (the loading text stays). Not exercised beyond the slow and stale cases.
- **Compact scene:** at about 660 px of map width or less the focused zone is zoomed but no bubble or area labels are drawn.
- **Alert meaning:** only Overloaded zones zoom (see OPEN_QUESTIONS Q7).
