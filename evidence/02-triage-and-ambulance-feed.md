# Evidence: ticket 02, walk-ins, critical entries and inbound ambulances

Date: 2026-10-10. Tool: Playwright MCP (`browser_run_code_unsafe`, `browser_evaluate`) against the production build on `:8000`. The snippet is in [02-intake.playwright-mcp.js](02-intake.playwright-mcp.js).

Fixtures:
- **`fixture-intake`**, started through the UI with the test-only `?fixture=fixture-intake` URL parameter. That parameter is not linked anywhere in the staff UI; fixtures are listed only at `GET /api/v1/fixtures`, and `GET /api/v1/profile` lists staff scenarios only. Default seed `20261010`. The script has no background arrivals:
  - Walk-ins: W01 (lower), W02 (medium), W03 (lower) and W04 (urgent), all at T+2.
  - A01: 2 patients, ETA 10, arrives 11.
  - A02: ETA 18, updated at 9 to ETA 26, arrives 27.
  - A03: cancelled at 12.
  - A04: ETA 15, acuity unknown, arrives 30.
  - A05: 3 critical-bypass patients, ETA 35, arrives 35.
- **`normal`**, seed 7, 12 h, for the random stream.

Design decisions for the ambiguous "reserved resuscitation space" rule are in [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) (Q1, Q2).

## Results per acceptance criterion

| # | Criterion | Result |
|---|---|---|
| 1 | One finite triage desk and a declared reserve team; walk-ins queue for triage | **pass** |
| 2 | Supplied acuity system/score, separate urgency group and critical-bypass input; the model does not assign acuity | **pass** |
| 3 | Critical bypass enters zone 2 and needs a resuscitation space in the 24-space pool | **pass** |
| 4 | Announcements: identity, received time, uncertain ETA, patient count, optional acuity, freshness, status | **pass** |
| 5 | Sidebar lists ETAs, separates ambulance count from patient total; one identity per update/cancel/arrival; no duplicates | **pass** |
| 6 | En-route patients outside the ED; overdue ETA shows Delayed, not arrived | **pass** |
| 7 | Known incoming demand exposed separately from background; no hidden replay time as an ETA | **pass** |
| 8 | Playwright MCP checks of all of the above | **pass** |

### 1. Triage desk and reserve team
- `/state` reports `resources.triage_desk = {total 1, busy, waiting, owner "Triage charge nurse", reserve_team {size 1, active false}}`.
- The zone 1 drawer at T+20 reads: "Waiting for triage 2 · At the triage desk 1 of 1 · Reserve triage team Declared, not active · No treatment beds here."
- **At T+5:** W01 is `in_triage` at desk T1; W02, W03 and W04 are `awaiting_triage`. Triage busy is 1/1 with 3 waiting.
- **Triage intervals from `/events`** (one desk, never overlapping):

  | Patient | Start → end (min) |
  |---|---|
  | W01 | 2 → 7.83 |
  | W04 | 7.83 → 11.44 |
  | W02 | 11.44 → 18.73 |
  | A01-1 | 18.73 → 24.12 |
  | W03 | 24.12 → 30.44 |
  | A04-1 | 30.44 → 36.62 |
  | A02-1 | 36.62 → 42.10 |
  | A01-2 | 42.10 → 48.29 |

  Urgent W04 went before W02 and W03, which arrived at the same time; medium A01-1 went before lower W03. W01 started first and was not interrupted.

### 2. Supplied acuity
- Patients carry `acuity_system`, `acuity_score`, `urgency`, `critical_bypass`, `arrival_mode` and `ambulance_id`, all taken from the scenario inputs (`scenario.py` / `fixtures.py`). The engine only reads them.
- The roster shows "ESI 3 (supplied)".
- The synthetic ESI ↔ group relationship is disclosed in `profile.assumptions.acuity_by_group`.

### 3. Finite critical bypass (A05, 3 critical patients, 2 resuscitation spaces)
- **A05-1:** arrival 35 at `awaiting_space` (zone 2) → R1 at 35 → assessment 35 → decision 49.19 → departs 57.55.
- **A05-2:** → R2 at 35 → assessment 37.17 → decision 44.19 → departs 54.81.
- **A05-3:** waits for a space at arrival 35, then gets **R2 at 54.814**, the moment A05-2 departed.
- No A05 patient has a triage event. At most 2 resuscitation spaces were held. At T+35 the UI showed "Resuscitation spaces free 0 of 2" and `/state` showed `resus.awaiting = 1`. No extra bed was created.
- With seed 7, normal scenario, over 12 h: 3 critical patients, 0 triaged.

### 4–6. Ambulance feed: sidebar vs `/state` at every 5-minute UI step (12 steps)

| Time | Sidebar (ambulances / patients) | `/state` inbound |
|---|---|---|
| T+5 | 4 / 5 | A01 eta10 2p, A02 eta18, A03 eta20, A04 eta15 |
| T+10 | 4 / 5 | A02 now **eta26** (updated at 9, `source_updated_min` 9) |
| T+15 | 2 / 2 | A01 arrived at 11 (A01-1 and A01-2 entered triage at 11), A03 cancelled at 12 |
| T+20 | 3 / 5 | **A04 delayed, 5 min overdue** (ETA 15), A05 announced (3p, 3 critical bypass) |
| T+25 | 3 / 5 | A04 delayed, 10 min overdue |
| T+30 | 1 / 3 | A02 arrived at 27, A04 arrived at 30 |
| T+35–60 | 0 / 0 | "No ambulances are currently announced. Last ambulance update at T+00:35." |

- **Identity from `/events`** (one id per lifecycle):
  - A01: announced@1 → arrived@11
  - A02: announced@3 → updated@9 (eta 26) → arrived@27
  - A03: announced@4 → cancelled@12
  - A04: announced@5 → arrived@30
  - A05: announced@20 → arrived@35
- **Per-step checks (0 problems over 12 steps):**
  - The sidebar count and patient total equal `inbound_summary`.
  - The sidebar list ids equal the API inbound ids.
  - There are no duplicate inbound ids.
  - No patient whose ambulance is still inbound is in the ED.
  - The mesh count equals the patient count.
  - The zone buttons equal the zone counts.
- **Delayed is never treated as arrival.** A04 stayed "Delayed, ETA overdue" (text, triangle icon, amber tint) from 15 until its arrival event at 30, and `counts.arrived_total` stayed at 6 throughout.
- **Seed 7, normal, 12 h:**
  - 7 runs: 6 arrived, 1 cancelled, 2 updated. Every lifecycle starts with `announced` and has at most one terminal event.
  - Ambulance patients exist only for runs that arrived.
  - The events are identical whether built in 60- or 5-minute chunks.

### 7. Known vs background demand; no hidden data
- `incoming_demand.known` lists only received announcements (ambulances, patients, ETA ± uncertainty, status).
- `incoming_demand.background` gives the disclosed profile rates: walk-ins 4.8/h and unannounced ambulances 1.0/h for `normal`, and 0 for the scripted fixture. It notes that announced ambulances are counted only as known demand.
- **No hidden data:**
  - Announcement objects have exactly the keys `acuity, closed_min, eta_min, eta_uncertainty_min, id, minutes_overdue, patient_count, received_min, source_updated_min, status`.
  - At no step before arrival did A02 or A04 expose their hidden arrival times (27, 30). A04 kept showing ETA 15 while overdue.
  - The export has no hidden run data (no `arrive_min`).

## Also re-verified
The ticket 01 regression ([01-regression.playwright-mcp.js](01-regression.playwright-mcp.js)) passed again on the new model at 2026-10-10T12:21Z, covering:
- the counts agreement (7 = 7 = 7);
- 409 stale handling, pending and error banners;
- keyboard;
- the widths 375/768/1024/1440, with 0 label overlaps (13 labels at desktop);
- determinism.

Screenshot: [02-fixture-t20.png](shots/02-fixture-t20.png) (A04 delayed, A05 with 3 critical, zone 1 drawer).

## Notes
- Seed 7 (normal) gave 59 arrivals in 12 h (4.9/h). The expected value from the assumptions is about 6.4/h (walk-ins 4.8/h × daily wave, plus about 1.15 ambulance patients/h). This is one seed's sample, not a calibration.
- The 2 resuscitation spaces come out of the 24 (`S01`–`S22` general, `R1`–`R2` resus). "Available staffed spaces" counts general spaces, as decided in OPEN_QUESTIONS Q2.
- Normal-scenario runs had no overdue ambulance with seed 7. The overdue path is covered by the fixture.
