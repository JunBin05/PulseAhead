# Ticket 09: Generate varied shifts and reproduce saved replays

Verified through Playwright MCP against the production build on :8000 (2026-10-10, backend restarted after the last Python edit). Snippets, all in `evidence/`:

| Snippet | What it covers | Result |
|---|---|---|
| `09-scenarios.playwright-mcp.js` `PART = 'A'` | catalog, seven families on a test seed to T+600, hidden-field scan at five times, run record | 63/63 pass |
| `09-scenarios.playwright-mcp.js` `PART = 'B'` | hidden-future fixture pair, save, load, resume, reset, completed run | 14/14 pass |
| `09-critical-bypass.playwright-mcp.js` | critical-bypass and announcements on all 4 test seeds of every family | 3/3 pass |
| `09-saved-persistence.playwright-mcp.js` `PART = 'A'` / `'B'` | two tampered records refused; saved runs survive a backend restart | 6/6 pass |
| `09-save-load-ui.playwright-mcp.js` | scenario selector, Start, zone 3 overload, Save, page reload, Load, resume, load while playing, reset, completed run | 18/18 pass |

Screenshot: `shots/09-diagnostic-zone3-overload.png` (diagnostic-backlog demo, UI default seed 20261010, zone 3 Overloaded at T+95, drawer and camera on zone 3).

Test setup that sits outside the app boundary: for the tamper check two copies of a saved record were written into `backend/saved_runs/` with a script (one with `event_digest` zeroed, one with `identity.seed` + 1), loaded through the API, then deleted. The saved-run ids in the snippets (`414ebcf3252f`, `4d100c5479f0`) were created by part B in this session; the files are git-ignored, so rerun part B and update the constants.

Seeds: each family's run uses its third test seed (`2000 + 10i + 3`: normal 2003, busy-recovers 2013, arrival-surge 2023, diagnostic-delay 2033, boarding-blockage 2043, mixed-cascade 2053, no-effective-action 2063). Versions: API `v1`, engine `flow-3`, profile `fictional-ed-24`, scenario catalog `1`.

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Seven families with received inbound announcements, critical-bypass cases, diagnostic loops and different bottlenecks | **pass** | A1 `/api/v1/scenarios` lists exactly `normal, busy-recovers, arrival-surge, diagnostic-delay, boarding-blockage, mixed-cascade, no-effective-action`. A2 per family at T+600: announcements all precede arrival (8 to 17 per run); diagnostic loops 2→3→2 with review after the last test (7 to 34 patients per run); the family bottleneck recomputed from `/events` (table below). `09-critical-bypass`: every family has critical-bypass arrivals on at least one of its 4 test seeds (counts per seed: normal 1/0/2/2, busy 1/1/2/1, surge 1/3/0/1, diagnostic 2/1/0/2, boarding 0/0/2/3, mixed 2/1/2/2, no-action 0/1/2/2) and every one enters zone 2 directly. On the single seed used in A2, arrival-surge and diagnostic-delay had 0 critical arrivals; the other seeds have them |
| 2 | Record fictional profile, staffing/ward resources, task/route assumptions, warm-up/scored duration, seed partitions, versions, workload variants | **pass** | A3 `export.run_record` (mixed-cascade, test seed 2051): `profile` equals `export.profile` (24 spaces, 4 doctors, 6 nurses, 8 ward/ICU beds each with a release time), `profile.assumptions` equals `/api/v1/profile` assumptions, `warmup_min` 120, `scored_min` 480, `seed_partition` `test`, `versions` equal `/api/v1/scenarios`, `scenario.parameters` carry `surges`, `test_boosts`, `turnaround_scales`, `disposition_boost`, `ward_beds`, `staffing`. A fixture run is labelled `fixture`. The UI shows warm-up / scored, seed with partition, and versions (U2) |
| 3 | Diagnostic-backlog demo with engine-produced zone 3 overload, a recovering short surge, a ward blockage, an honest no-effective-action case | **pass** (see the caveat) | Diagnostic-backlog: A2 imaging episode onset 82, confirmed 92, queue at onset 2 recomputed from events against threshold 2; in the UI U3 zone 3 reads Overloaded at T+95 and equals `/state` at the same version. Recovering surge: arrival rate 24.0/h inside T+45..70 against 5.63/h outside (4.26×); triage episode 58→68, cleared 88. Ward blockage: ward-bed episode onset 95, confirmed 105; at onset the one waiting ward patient has no suitable free bed (bed schedule from the run record minus reservations from the export). No-effective-action: 20.0/h for T+0..45 then 2.92/h (6.85×); triage 14→24→86 cleared. **Caveat:** that no staff-approved action shows a benefit is a ranking result. It is **not-run** here and is owned by tickets 17 and 19 (Q9) |
| 4 | Save/load replay identity, observed events, announcements, choices, simulation/forecast settings, selected zone/camera, completed results | **pass** (see the caveat) | B2 record equals the live run: identity (replay id, run number, state version, scenario, seed, time), `events` (66) equal `/events`, SHA-256 digest, `announcements` equal `/state`, `ui` `{selected_zone: 3, camera: 'zone-3', view_mode: '3d'}`, `settings.simulation` `{speed: 5, step_min: 5}`, `run_record` equals the export. B3 completed run (arrival-surge seed 2021, T+600, 844 events): `results.time_summary`, `unfinished`, `congestion_episodes`, `local_episodes` and scored window `[120, 600]` equal the export. **Caveat:** `choices` is `[]` and `settings.forecast` is `null` because no actions (tickets 11-12) or forecast (ticket 10) exist yet; those tickets must populate and re-verify them |
| 5 | State/zone/ETA responses never expose hidden schedules, eventual disposition, future completion or private random values | **pass** | A2 for all 7 families at T+60/150/300/450/600: none of `surges, test_boosts, turnaround_scales, disposition_boost, free_at_min, rate_ceiling, feed_faults, injections, missing_inputs, arrive_min, cancel_min, care_task_min, rng, extra_prob` in `/state`, `/zones/1..4`, `/events`, `/ingest`, `/scenarios`, `/profile`; the export carries no private future values (it holds the workload variant and bed schedule on purpose). Disposition is `null` until `decision_received` in every sample, and the check is not vacuous (2, 19, 6, 4, 3, 9, 6 patients were undecided at T+150 and decided later). No event has `received_time_min` beyond the state's time. B1 fixtures hidden-future A and B (same seed; only B has a surge and imaging backlog from T+75): state, zones 1-4, events and ingest are identical at T+60 (10 events) and T+70 (18 events) and differ at T+120 |
| 6 | Reset/load rebuilds one consistent scene and deletes obsolete dots/alerts/requests; saved outcomes labelled as completed synthetic runs | **pass** | U5 after a page reload and Load: same time `T+01:35`, 9 dots = 9 meshes, camera `zone-3`, zone 3 drawer open, speed 5× restored, one ALERT bubble and the Local alert badge as `/state` says, events equal the saved events. U7 Load while playing at 10×: playback stops, time stays at the saved time for 2.5 s (no later advance applied). U8 Reset after load: label gone, T+0, 0 dots, 0 meshes, overview camera, drawer closed, 0 bubbles, no Local alert badge, status Stable. U9 a scenario change mid-run shows the pending note and changes nothing until Reset. B3/U10: completed run listed as Completed, loads at T+600 with the label "Completed synthetic run" |
| 7 | Playwright MCP reproduces matched histories/counts, resumes a loaded replay, checks original assumptions/versions, inspects observation responses for hidden fields | **pass** | B2 loaded run equals the saved run (events, counts, patients, announcements); +30 min on the loaded run equals the original +30 and a fresh replay at T+120 (event lists identical, and longer than the saved 66); U6 a 5-minute UI step on the loaded run equals a fresh replay at the same time; loaded `saved_run.versions` equal the catalog versions; tampered records refused with 409 (digest: "all 66 events rebuilt but their digest differs from the saved digest"; seed: "36 events rebuilt, 66 saved"); after a backend restart both saved runs are listed and load to identical events; hidden-field scans as in criterion 5 |

## Family bottlenecks recomputed from `/events` (A2, T+600)

| Family (seed) | Events / arrivals | Check | Value |
|---|---|---|---|
| normal (2003) | 706 / 63 | no workload variant; 6.3 arrivals/h | one imaging episode 414→424→432 |
| busy-recovers (2013) | 973 / 80 | window T+60..150: 18.0/h inside, 6.24/h outside (2.89×) | triage 120→130→270, lab 185→195→207 and 211→221→320, imaging 305→315→327 clear; ward beds 329→339 stays open |
| arrival-surge (2023) | 707 / 64 | window T+45..70: 24.0/h against 5.63/h (4.26×) | triage 58→68→88 clears |
| diagnostic-delay (2033) | 440 / 61 | first overload is imaging, onset 82, confirmed 92, queue 2 against threshold 2 | 41% of patients need imaging; imaging stays open to T+600; space 236→246 and overall congestion 332→352 follow |
| boarding-blockage (2043) | 692 / 66 | ward beds onset 95, confirmed 105; 1 ward waiter, 0 free ward beds | triage 74→84→98 and 382→392→445, space 452→462, overall 573→593 open |
| mixed-cascade (2053) | 736 / 68 | imaging 95→105 and ward beds 152→162 overlap; N3 off duty T+100, on T+220 received | triage 543→553→592 |
| no-effective-action (2063) | 505 / 42 | 20.0/h for T+0..45 against 2.92/h after (6.85×) | triage 14→24→86, lab 84→94→102, imaging 97→107→155, ward beds 389→399→425 all clear |

## Judgement calls and limits (see OPEN_QUESTIONS Q9)

1. **A saved record is evidence and carries the workload variant.** `GET /api/v1/saved/{id}` (the "Open record" link in the sidebar) shows the scenario's hidden time windows. No observation response does. Anyone opening that link during a live demo sees the future; it is labelled as evidence in the record's `note`.
2. **No-effective-action is verified as a shape only** (early surge, then quiet, episodes clear). Whether an action can help is decided by the ranking tickets (17, 19).
3. **Plain `normal` is not always quiet over 600 min** (one imaging episode on test seed 2003; 4 of 7 seeds in an earlier exploratory probe). It comes from earlier tickets' disclosed assumptions and was left alone.
4. **Warm-up and scored are recorded labels.** The run starts empty at T+0; nothing is simulated differently before T+120.
5. **Load rebuilds from the seed** and compares events by count and digest, so it is as exact as the engine is deterministic and refuses on any change of engine, profile or scenario.
6. **Version label `flow-3`** is a manual constant: a later engine change must bump it, otherwise old records fail the digest check with a mismatch rather than a version message.

## Defects found and fixed during the ticket

- The digest-mismatch message read "66 events rebuilt, 66 saved", which says nothing about the cause. It now says the digest differs when the counts match.
- Regression 06 and 07 snippets needed no change; `01` tab order now includes the new panel (`reset > scenario-select > save-run > saved-load-… > A`), as expected.

## Visual limits left for ticket 20

- The scenario selector clips the demo role in the option text at the 1440 px sidebar width ("Diagnostic backlog (diagnostic-back…").
- The "Warm-up / scored" label wraps over three lines in the narrow key/value list.

## Regressions on the final build

| Snippet | Result |
|---|---|
| `01-regression` | pass: counts agree across UI/meshes/API/events/export; widths 375/768/1024/1440 0 overlaps, 0 clipped, 0 targets under 44 px; cadence 1.98 and 9.89 min/s; 409 on stale; determinism identical |
| `02-intake` | pass: 0 problems over 12 steps; A05-2 departs 57.839 as before |
| `03-staffing` | pass: 0 UI-vs-API problems over 28 steps, 0 invariant violations (fixture and seed 7 12 h: 705 events, 59 patients) |
| `04-diagnostics` | pass: 0 problems over 56 steps, fixture and seed 7; W13 departs 97.603 |
| `05-disposition` | pass: 0 problems over 60 steps, fixture and seed 7 |
| `06-pressure` engine and seed7 | pass: 0 mismatches in 7 runs; boundaries 31/51/85, 31/41/103, 3/13/119 unchanged |
| `06-ui`, `06-zone4-layout`, `06-label-geometry` | pass: 0 problems; 138 dot rows; 30 cases, 0 overlaps/clips |
| `07-zones` | pass: 624 zone responses, 0 problems; 0 UI problems |
