# Ticket 08: Handle fresh, noisy, missing, and invalid inputs

Verified through Playwright MCP against the production build on :8000 (2026-10-10). Snippet: `08-feeds.playwright-mcp.js` (run once with `PART = 'A'`, once with `'B'`). Screenshots: `shots/08-cannot-assess-t45.png`, `shots/08-missing-imaging-t100.png`.

Fixtures (all test-only, listed by `/api/v1/fixtures`, selected by `?fixture=` or scenario id, never in the staff controls; the UI shows a "Fixture: ..." line when one is active):

| Fixture | Hidden schedule |
|---|---|
| `fixture-feed-staffing-stop` | staffing feed stopped T+32 to T+70; nurses N1 off at T+45, N2 off at T+55 (never reported while stopped); an ambulance ETA revision at T+40 |
| `fixture-feed-faults` | queue events delivered twice T+2 to T+12; diagnostics events 6 min late T+40 to T+90; 13 external messages (duplicate, impossible transition, stale update, negative and oversized counts, unknown/arrived ambulance, bad ETA, bad count, future event, unknown patient, one valid ETA update); a 130 min test, a 10-arrival burst, an 87 min ETA move |
| `fixture-feed-optional-stop` | ambulance feed stopped T+25 to T+60, diagnostics feed stopped T+40 to T+80 |
| `fixture-diagnostics-gap` (ticket 06) | imaging inputs missing T+90 to T+120 |

Seed 7 for every run (seed 20261010 in the UI sessions that use the fixture default).

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Identities, event/received times, payloads, deduplication and valid transitions processed only when received; newer state kept against out-of-order updates | **pass** | C1 unique ids; C2 duplicates = 10 doubled queue events + 1 re-sent message id = 11 (expected 11); C3 `X-OOO-1` and `X-ETA-3` `out_of_order` with reason, 2 of 2; C4 refused ids never in `/events`, valid `X-ETA-4` applied (A05 ETA 38 at T+24); C5 observed phase of every patient equals the last received event at T+26 and T+60 (0 differences); C8 delayed events carry `received_time_min = event_time_min + 6` only inside T+40..90 |
| 2 | Source-specific heartbeats: a healthy replay/ambulance heartbeat cannot refresh stopped queue, space or staffing data | **pass** | A1 T+33..69: `feeds.staffing.last_update_min` stays 30 while `feeds.replay.age_min` is 0 and the ambulance feed is fresh (age at most 5); A7 ambulance feed keeps delivering (A02 ETA 60 to 70 at T+40) |
| 3 | Missing essential data or an update older than ten simulated minutes shows Cannot assess; optional/stale inbound or diagnostic data carries explicit limitations | **pass** | A2 boundary: T+40 age 10 `fresh`, assessable; T+41 age 11 `stale`, label `Cannot assess`; D1 optional boundary T+30 age 10 fresh, T+31 age 11 stale; D2 stale optional feeds never make the ED Cannot assess; D3 stale diagnostics: zone 3 `unknown` T+51..79; D7 limitation + guidance text present; E1 `missing_inputs` imaging at T+100: sidebar and drawer read "Not current", `resources.diagnostics.imaging.waiting/busy` are `null`, `limited_services = ["imaging"]`, lab figures stay exact |
| 4 | Impossible values/transitions told apart from extreme but valid ones; invalid quarantined with a reason; genuine outliers kept | **pass** | C3 9 quarantined with reasons (impossible transition W04 `in_triage` to `departed`, negative count, count 99 for 7 present, ambulance already arrived, unknown ambulance A99, ETA before announcement, patient count 0, future event, unknown patient); C6 3 outliers kept and flagged: W05 130 min test (event present, `elapsed_min` 130), 10-arrival burst (all 10 `B..` arrivals in the log), A05 ETA move by 87 min; ordinary ETA noise (A02, 8 min) not flagged; C7 19 arrived, 19 departed |
| 5 | Controlled noise, delayed/duplicate/missing events, ETA faults and invalid counts exposed through the application boundary, separate from staff controls | **pass** | `/api/v1/fixtures` lists the three feed fixtures; the staff controls before Start are `start` and the four zone buttons; no fixture text in the page without `?fixture=`; the profile does not mention the fixtures. Limit: "noise" is limited to ETA revisions inside the stated uncertainty and delayed delivery; noisy observed counts are not modelled (ticket 18 owns noise behaviour) |
| 6 | Last-valid state with its age during failures; short recovery guidance; assessment restored after valid updates resume | **pass** | A3 T+41..69: no nurse off duty, 24 staffed (the last valid values), label `Cannot assess`; A4 `last_valid_label` = `Stable`; A5 T+70 first valid update restores assessment with `resumed_at_min = 70`; A6 T+71 the hidden outage appears: N1,N2 off duty, 16 staffed; D4 diagnostics recovered at T+81; E2 T+125 imaging figures exact again; B1/B2 UI shows the age ("30 min old"), the reasons text and "Resumed at T+01:10; assessment restored." |
| 7 | Playwright MCP checks: healthy aggregate heartbeat plus stopped staffing, exact freshness boundary, duplicates/out-of-order, valid outliers, impossible transitions, recovery | **pass** | Part A 24/24, part B 5/5 (see below) |

## Run results

- **Part A (API, 1-minute resolution):** 24 checks, 0 failures. A1 to A9 staffing stop, C1 to C9 faults, D1 to D7 optional stops.
- **Part B (UI, 5-minute steps):** B1 badge, feed rows, ages, reasons, stale-resources note and drawer limitation equal the API at all 16 steps (T+5..80); B2 T+40 "Current", T+45 "Stale", resumed text at T+70; E1 and E2 (see criterion 3); B3 no console errors.
- **Hidden data:** A9 no `feed_faults`, `injections`, `delay_min`, `"kind":"stop"`, `"kind":"delay"`, `"kind":"duplicate"` or `missing_inputs` in `/state`, `/events`, `/ingest`, `/export` or `/profile`.
- **Gaps:** A8 the two unreported staffing events appear only as 2 sequence gaps (`E000056..E000058`, `E000070..E000072`), never as events.

## Judgement calls (see OPEN_QUESTIONS Q8)

1. An external message can never move a patient: even a well-formed transition is quarantined ("Transitions are produced by the replay feed, not accepted from outside").
2. After a stopped feed resumes, its next heartbeat carries the current state, so hidden changes (N1/N2 off duty, the A02 announcement) become visible then, while the lost events stay gaps in the log.
3. Patients are shown as the received events describe them, but each patient's record is the one-minute sample at their newest received event, so another feed's change inside that same minute can appear.

## Defects found and fixed during the ticket

- The WIP overlaid patients and zone counts from a "queues" sample only, so a stopped diagnostics feed left zone 3 counts live while the sidebar was frozen. Patients, zones and counts are now rebuilt from the received events whenever any source is behind (C5).
- `missing_inputs` left exact `resources.diagnostics.*.waiting`, `zones[].lab_queue` and the sidebar visible (deferred review finding). Services listed there now report `null` figures and `inputs_ok: false`; the drawer and sidebar read "Not current".
- The overall congestion monitor ignored `missing_inputs` for the space service; it now degrades like a stale essential feed.
- Outliers were logged at delivery time (wrong for delayed events) and an external ETA update did not refresh the ETA baseline. Both fixed (C6 reports the A05 shift as 87, measured from the externally set ETA).
- The `fixture-feed-faults` fixture never produced a diagnostic event inside its delay window; W02 and W03 now carry short tests.
- Deferred finding "`freshness.age_min` is always 0": the top-level value is the replay heartbeat and is still 0 by design; per-source ages are in `feeds.*` and `freshness.oldest_essential_age_min`.

## Regressions on the final build

| Snippet | Result |
|---|---|
| `01-regression` | pass: counts agree across UI/meshes/API/events/export; widths 375/768/1024/1440 0 overlaps, 0 clipped, 0 small targets; cadence 1.98 and 9.89 min/s; 409 on stale; determinism identical |
| `02-intake` | pass: 0 problems over 12 steps |
| `03-staffing` | pass: 0 UI-vs-API problems over 28 steps, 0 invariant violations (fixture and seed 7 12 h) |
| `04-diagnostics` | pass: 0 problems over 56 steps, fixture and seed 7 |
| `05-disposition` | pass: 0 problems over 60 steps, fixture and seed 7 |
| `06-pressure` engine and seed7 | pass: 0 mismatches in 7 runs (boundaries 31/51/85, 31/41/103, 3/13/119 unchanged). The snippet's expectation for `resources.diagnostics.imaging` throughput under a declared gap was changed from a number to `null`, as criterion 3 requires |
| `06-ui`, `06-zone4-layout`, `06-label-geometry` | pass: 0 problems; 30 cases, 0 overlaps/clips |
| `07-zones` | pass: 624 zone responses, 0 problems; overlay and focus geometry 0 problems |

## Not run / limits

- `07-ease` (camera easing) was not re-run: the scene and camera code were not touched.
- Observation noise (jittered counts) is not modelled; ticket 18 owns it.
- `_sample` keeps 400 one-minute samples per session that has scripted faults; a stop longer than about 300 simulated minutes would read the oldest sample. No fixture is that long.
