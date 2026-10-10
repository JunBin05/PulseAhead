# Evidence: ticket 01, Start a real four-zone 3D ED replay

Date: 2026-10-10. Tool: Playwright MCP (confirmed working before the checks: navigate, click, evaluate, screenshot, `page.route`).
Builds: the Vite dev server (`:5173`, proxying `/api` to `:8000`) and the production build served by FastAPI from one origin (`:8000`).
The final regression ran against the production build. Its raw output is in [01-regression-results.json](01-regression-results.json); the snippet is [01-regression.playwright-mcp.js](01-regression.playwright-mcp.js).

Fixtures:
- The UI runs use the default seed `20261010`, scenario `normal`, profile `fictional-ed-24`.
- The determinism and identity runs use seed `7`.

## Results per acceptance criterion

| # | Criterion | Result |
|---|---|---|
| 1 | Engine, API and 3D scene run together; one real replay drives the view | **pass** |
| 2 | Header labels, four numbered zones, Home and Ward/ICU exits | **pass** |
| 3 | Fictional profile, 24 spaces, patient/resource identities, versions, assessment → cleared departure | **pass** |
| 4 | Start, pause, step, speed, reset through the API; frame rate does not change sim time or durations | **pass** |
| 5 | Stable dot identities, one received phase, transition timestamps; interpolation cannot free beds; reset clears state | **pass** |
| 6 | Simple isometric geometry, readable DOM overlays, pending/error feedback with last-valid time, config outside the scene | **pass** |
| 7 | Stable pinned dependencies, deployment-ready same-origin boundary, no alpha graphics features | **pass** |
| 8 | Playwright MCP checks of first start, counts, assessment/departure, pause/step/reset, labels, keyboard, narrow layout | **pass** |

### 1. One real replay drives the view
- Start calls `POST /api/v1/replays`, which returns replay `2028e922bd54`, v1, T+00:00, status Stable.
- After 24 UI steps (v25, 120 sim min), these all agree at **4** with `/state`:
  - drawn patient meshes in the R3F scene (`canvas[data-patient-meshes]`, counted by traversing the scene)
  - the scene's dot list
  - zone dots `[0,1,0,3]` and zone buttons `[0,1,0,3]`
  - Patients in the ED
  - Occupied spaces, and occupancy recomputed from the 79 events
- The export matches too: v25, 79 events.

### 2. Header, zones, exits
- Header text: "Simulation Window · Synthetic demo · Simulated time T+00:00 · Demo role ED shift coordinator · Overall status Not started", which becomes "Stable" (with an icon) after start.
- Scene labels: zones "1 · Arrival and triage", "2 · Doctor assessment", "3 · Diagnostics and testing", "4 · Disposition", plus "Home" and "Ward / ICU" exits.
- DOM zone buttons "Zone 1…4" show names and counts.

### 3. Profile, identities, versions, route
- `GET /api/v1/profile` returns 24 regular spaces and 4 clinician slots, with owners and disclosed demo assumptions.
- Every event carries `id`, `event_time_min`, `received_time_min`, `patient_id` and `resources {ed_space, clinician_slot}`.
- **Seed 7, 720 min** (72 arrivals, 424 events): 0 identity problems.
  - No space or clinician slot was held by two patients at once.
  - Each patient kept the same space from acquisition to departure.
  - The clinician slot is released at the decision.
  - Each departure event names the space it released.
  - Peak use: 6 spaces held, 4 clinician slots held.
  - `/state` ids `S02,S03` / `C2` equal the ids replayed from events.
- **Example journey, P0001 (seed 20261010):** arrival 6.636 → awaiting space 10.242 → space S01 10.242 → clinician C1 10.242 → decision 23.692 → departed 33.694, releasing S01. The export row has identical timestamps.
- The drawer roster shows identities: "P0014 With a clinician · Space S02 · Clinician slot C2".

### 4. Controls through the API; frame rate independence
- Step: +5 sim min and +1 version per press (v1 → v25 over 24 presses = 120 min).
- Pause: version 85 stays 85 after 2 s.
- Speed is measured simulated minutes per wall second; each tick is one `advance(1)` call:

  | Setting | Expected | Measured |
  |---|---|---|
  | 10× | 10 | 9.97 (9.95 on the post-review re-run) |
  | 5× | 5 | 4.97 |
  | 2× | 2 | 1.99 |
  | 1× | 1 | 0.99 |

- Speed cannot change service durations. Seed 7 was built three ways: 2 × 60 min, 24 × 5 min and 120 × 1 min. The event lists and patient timestamps are **byte-identical** (65 events). The same held for 4 × 60 vs 240 × 1 with resource ids.
- Bounds: `minutes: 0` → 422, `minutes: 61` → 422.

### 5. Dots, phases, interpolation, reset
- Dots are keyed by patient id; positions come only from the received `phase`.
- The renderer only eases toward received positions (`Scene.tsx` `Dot`). Counts, spaces and phases come from `/state`, so the mesh count equals the API patient count.
- **Reset** (v85, T+03:00 → v86, T+00:00, run 2) leaves 0 meshes, 0 dots, 0 in the ED and 0 departed.
- **Stale response:**
  - Test: one step was delayed by 1.5 s with `page.route`, and Reset was pressed while it was in flight.
  - Result: the backend answered the late step with **409** (`expected_version` mismatch) and stayed at v86, T+00:00, run 2. The UI showed the same. The next step went to T+00:05, v87.

### 6. Overlays, feedback, configuration
- At 1024/1440px, 12 DOM labels show with 0 overlaps and 0 clipped.
- At 375/768px the scene switches to compact labels (zone numbers and exits; the zone buttons carry names and counts): 6 labels, 0 overlaps, 0 clipped.
- **Error path:**
  - Test: advance was aborted with `connectionrefused`.
  - Result: the banner read "The simulation service is not reachable. Showing the last valid state from T+00:05, received Ns ago. It may be out of date. Retry". Time stayed at T+00:05 and the dots stayed on screen.
  - Retry cleared the banner, and the next step worked.
- Seed, scenario and run show only in the controls footer; there are no configuration panels in the scene.

### 7. Dependencies and deployment boundary
Exact stable pins:
- react 19.3.0, three 0.186.1, @react-three/fiber 9.8.1, drei 10.7.9, Vite 8.3.4, TypeScript 5.9.3
- fastapi 0.143.0, uvicorn 0.54.0, simpy 4.1.2, pydantic 2.14.0

No alpha or beta packages; drei `Html` is not used.

`npm run build` succeeds. Results on `:8000`:
- `/` → 200 HTML; deep link `/some/route` → 200 HTML.
- `/api/health` → 200 JSON; unknown `/api/v1/nope` → **404 JSON** (this was 200 HTML before a fix).
- Traversal attempts return `index.html`.

### 8. Keyboard and narrow layout
- **Keyboard:**
  - Tab reaches Start, with a 2.4px solid focus outline. Enter starts the replay, and focus moves to Play.
  - Tab → Step, then 3 × Space → T+00:15. Focus stays on Step.
  - Shift+Tab → Play; Enter plays and Enter pauses.
  - Tab order: step > speed 1/2/5/10 > reset > zone 1–4.
  - Enter on Zone 2 opens its drawer.
- **Widths 375/768/1024/1440:** no horizontal scroll and 0 buttons under 44 × 44 px.
- Screenshots:
  - [01-desktop-1440.png](shots/01-desktop-1440.png)
  - [01-mobile-375.png](shots/01-mobile-375.png)
  - [01-prod-same-origin.png](shots/01-prod-same-origin.png)

## Bugs found by these checks and fixed

1. **A late command could move a newer run.** A delayed step arriving after reset advanced run 2 to T+00:05 while the UI showed T+00:00. Fix: `advance` takes `expected_version` and returns 409 on a mismatch; the UI reloads `/state` on 409.
2. **Speed was slow.** 10× ran at 9.0–9.55 min/s because request time was added to every tick. Fix: ticks are scheduled against a fixed start; measured rates are in the table above.
3. **Keyboard focus was lost** after Start (the button unmounts) and on every Step (the button was disabled while busy). Fix: focus moves to Play, and Step is no longer disabled while busy (the busy guard still drops duplicates: 5 rapid Enters gave 1 step).
4. **Overlapping labels.** The scene labels overlapped at 1440px (zone 2 heading over "Awaiting space") and badly at 375px (8 overlapping pairs, 1 clipped). Fix: zone headings moved to the front edge; area labels are anchored to their own row; compact labels below 560px; the zoom floor was lowered.
5. **Missing resource identities.** Events lacked resource identity (spec §137). Fix: added named spaces S01–S24 and clinician slots C1–C4.
6. **Wrong 404s.** Unknown `/api/*` paths returned the SPA HTML with 200. Fix: they now return a JSON 404.
7. **Small fixes:** favicon 404 (now an inline icon); "1 patients" text.

## Code review gate (`code-review` skill, Standards + Spec, base `3841ced`)

**Fixed.** The full regression was re-run on the production build at 2026-10-10T12:12Z; all checks above still pass.

| Finding | Fix | Re-check |
|---|---|---|
| `env.run(until=t)` skipped events at exactly `t`, so the per-minute congestion tick showed one advance late | `run_until` also steps every event at `t` | seed 7, 2×60 vs 120×1: identical |
| Reset cleared the busy flag while an older request was still in flight | Request tokens: only the latest request clears busy; start/reset override and bump the epoch | stale test: 409, run 2, T+00:00 |
| Start was disabled while busy (DESIGN.md "Disabled" rule) | Removed; the busy guard ignores duplicates | — |
| Pending feedback appeared only before the first state | A banner appears after 500 ms on a slow request | hidden at 250 ms; shown at 950 ms (1s ago) and 2050 ms (2s ago); gone after |
| The "received Ns ago" age froze | The banner refreshes every second while shown | 0s → 2s |
| A canvas pick only selected; a DOM button toggled (spec: same behaviour) | One shared `toggleZone` | canvas click → [2], again → [] |
| Off-palette scene tints; accent hover/pressed hex not tokenised | Tints use `accent-soft` and `surface-sunken`; added `--accent-hover`/`--accent-pressed` | — |
| Status label duplicated in the UI | The UI shows the backend's `overall_status.label`; only tone and icon map locally | "Stable" |
| Duplicated helpers, unclear names, double cast | Single `lastValid`, `_base_rate_per_min`; renamed `_triangular` and the Dot prop `instant`; `as T` | tsc passes |

**Deferred to the ticket that owns them** (not ticked as done anywhere):
- **Ticket 02 (next):** the inbound ambulance panel still shows the static "0 / No announcements" placeholder rather than API values.
- **Ticket 06:**
  - Wait-area rows overflow into the next area above 15 waiting patients ("Queues cluster in distinct waiting areas"); this needs a congestion fixture to verify.
  - Recovery is not labelled separately from Congested.
  - The monitor's threshold boundaries are untested.
- **Ticket 05:** departures have no exit destination yet; the Home and Ward/ICU pads are static.
- **Ticket 08:** per-source freshness (currently one aggregate `age_min: 0`).

**Kept by judgement:**
- `@react-three/drei` stays pinned though unused (it is part of the agreed stack and may serve camera work in ticket 07).
- `ZONE_NAMES` duplicates the profile so zones can be named before the first snapshot.
- The congestion monitor, zone drawer and `/events`/`/export` endpoints go beyond the minimum but are needed for the Overall status and for numeric verification.

## Known items, not failures of this ticket

- Console warning `THREE.Clock: This module has been deprecated` comes from @react-three/fiber 9.8.1 internals on three 0.186; it is not in our code. It repeats once per Canvas mount.
- Under the `normal` scenario (about 6 arrivals/h) the map is sparse (at most 6 in the ED). Dense-row layout gets checked once congestion fixtures exist (ticket 06/09).
- No ward routing yet, so the Ward/ICU exit pad is unused until ticket 05. Zone 3 says "Not modeled yet" until ticket 04.
- Observed once, not reproduced: the zone selection changed with no scripted click in this session (zone 3 selected after a zone 2 click; later 3 → 1). Three exact reruns with a mutation/pointer log showed only the scripted change. Likely cause: manual clicks in the visible Playwright Chrome window. The backend log also showed one `reset` this session did not send. It stays recorded here as an open observation.
- The JS bundle is 1.15 MB (316 KB gzip), mostly three.js; ticket 20/21 decides whether to code-split.
