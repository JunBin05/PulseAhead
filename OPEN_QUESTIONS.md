# Open questions

Spec rules that are ambiguous. Each one records the working decision so the build can continue; change the decision here if the answer differs.

## Q1. What does "reserved resuscitation space within the 24-space pool" mean? (ticket 02)

Spec §Four phases, zone 2: "Supplied critical arrivals bypass registration to a reserved resuscitation space within the 24-space pool; no unlimited critical bay."

**Working decision:**
- 2 of the 24 regular spaces (`R1`, `R2`) are resuscitation spaces held for critical-bypass patients. The other 22 (`S01`–`S22`) serve everyone else.
- A critical patient waits for a resuscitation space when both are taken. They do not spill into general spaces, and no extra bed is created.
- The number 2 is a demo assumption in `profile.py`.

**Alternative not taken:** critical patients take any free space first, with top priority.

**Decision (user, 2026-10-10):** keep as is.

## Q2. Which spaces count as "available staffed spaces" for the congestion rule? (ticket 02)

**Working decision:**
- *Available staffed spaces* counts free general spaces only, because a waiting non-critical patient cannot use a resuscitation space.
- *Patients awaiting a space* counts both queues (general and resuscitation).
- Resuscitation availability is reported separately in `resources.resus_spaces`.

**Decision (user, 2026-10-10):** keep as is. From ticket 03, "staffed" also requires the covering nurse to be on duty (see Q3).

## Q3. What are the nurse and doctor staffing units? (ticket 03)

Spec §Events/patients/resources: "Record doctor/nurse identities, availability, coverage pools, and owner roles. Shared staff are not counted as additional independent workers." The spec gives no nurse numbers.

**Working decision (fictional demo units, not staffing ratios):**
- Doctors `D1`-`D4` each hold one of the 4 clinician-work slots. Reserve physician `D5` is declared and inactive (owner: ED attending lead; activation is ticket 16).
- Nurses `N1`-`N6` each cover a fixed block of 4 spaces (`N1` S01-S04 ... `N5` S17-S20, `N6` S21, S22, R1, R2). An empty space is *staffed* only while its covering nurse is on duty.
- A nurse going off duty never evicts an occupied space; the space just cannot be granted again until coverage returns.
- Nurses and doctors are on duty for the whole shift in normal scenarios. Coverage changes come only from a supplied staffing roster in test fixtures.
- Stabilization is a supplied care task (urgent group and critical bypass only), running from first assessment alongside the doctor's work. It needs no extra worker; the covering nurse is the staffing owner.

**Alternative not taken:** a per-nurse limit on concurrent care tasks.

## Q4. How do diagnostics loop and what does a premature decision look like? (ticket 04)

Spec: "1→2→3→2→4 ... diagnostics/result review can loop without adding duplicate [time components]" and "a premature decision stays ineligible".

**Working decision:**
- A patient makes one pass through zone 3: their supplied tests run one after another (lab, then imaging), then they return to zone 2 once for result review. Repeated rounds are not modeled.
- Tests are supplied per patient (kind and turnaround) and stay hidden until the patient's first assessment ends and the tests are ordered.
- A premature decision is a supplied clinical decision that arrives at the end of first assessment, before the tests are back. It is recorded as received but not eligible; disposition starts only when tests, review and any care task are all done.
- Lab turnaround is triangular 15/28/50 min (median 30.4) and imaging 25/42/70 min (median 44.9), matching the spec's lab 30 and imaging 45 medians. Test need by urgency group and result review (3/5/8 min) are demo assumptions.

**Alternative not taken:** a second test round after review.

## Q5. What are the "three mutually exclusive parts" of total ED time, and what is boarding? (ticket 05)

Spec: "Save patient stage timestamps for the three mutually exclusive parts of total ED time" and "Show initial wait, care/tests time, time awaiting departure, boarding, occupied ED-space minutes ... separately". The spec names five quantities and calls three of them mutually exclusive.

**Working decision:**
- The three exclusive parts partition arrival to physical departure: **initial wait** (arrival to first assessment), **care and tests** (first assessment to effective disposition, including result review and any required care task), and **awaiting departure** (effective disposition to physical departure).
- **Boarding** is not a fourth part: it is the awaiting-departure part for patients going to the Ward/ICU (bed, allocation work and transport), and is null for home patients. **Occupied ED-space minutes** is a separate resource record (space grant to departure) and overlaps the parts.
- Unfinished stays report accrued minutes and are counted apart; they are never averaged as complete.

**Ward/ICU bed pool (demo assumptions):** 6 ward beds (WD1-WD6) and 2 ICU beds (IC1, IC2); WD1, WD2 and IC1 are free at the start, the others are occupied by inpatients and released at 90, 150, 240, 420 min (ward) and 200 min (ICU). Ward and ICU beds are not interchangeable. A bed given to an ED patient stays occupied for the rest of the run.

**Alternative not taken:** splitting awaiting departure into discharge processing and boarding as two exclusive parts.

## Q6. What counts as "necessary capacity unavailable", and how are the rates windowed? (ticket 06)

Spec §Zone pressure: local overload occurs when the queue reaches its threshold, "or necessary capacity is unavailable while eligible work waits", for ten continuous minutes; λ uses the previous 30 minutes and μ comes from finite staffed slots and disclosed task durations.

**Working decision:**
- *Necessary capacity unavailable* means no suitable free capacity while a patient waits for it: no free staffed general space while a general patient awaits one (or no free resuscitation space while a critical patient does), and no suitable free Ward/ICU bed while a transfer awaits one. Busy units alone are not "unavailable"; a queue at threshold covers that case.
- The staffed-space and Ward/ICU-bed services have no queue threshold. They alarm only on unavailable capacity (one waiter is enough, for 10 minutes).
- Discharge processing, ward allocation and transport use the same threshold, 3 (the spec gives one "departure processing/allocation" value).
- λ is entries into the service's queue in the previous 30 simulated minutes (the window is shorter early in the run), per hour. The first queue is entered at arrival. μ is servers × 60 / mean task minutes, using the mean of the disclosed triangular assumptions (lab and imaging: the disclosed medians). Recent throughput is completions in the same window, shown apart.
- A service whose inputs are missing shows Cannot assess. A building interval is no longer continuous and is dropped. An episode that is already confirmed stays open (it is not cleared and its zone keeps the red state), because missing inputs cannot establish recovery.
- Zone state is the worst of its services: Overloaded, then Pressure building, then Cannot assess, then Normal.
- **Assessment units (added at the 03-06 review gate).** Assessment λ and recent throughput count first assessments (patients per hour); a result review is the same patient returning to a doctor, so it has its own work-log key and is not a new arrival. Assessment μ = doctor slots × 60 / (mean first assessment + review share × mean result review), where review share = result-review entries ÷ first-assessment entries so far (capped at 1, 0 before any assessment). The queue and the alert counts still merge both kinds of waiting, because they share the same doctors.
- **Onset timing.** Local and overall onsets are taken at the one-minute monitor tick that first sees the condition, so a stored onset can be up to 1 simulated minute after the true start.
- **Unit capacities are never zero in this build.** Triage, doctors, lab, imaging, discharge, allocation and transport always have at least one staffed unit; their "capacity unavailable" flag is therefore always false. Only the staffed-space and Ward/ICU-bed services can report unavailable capacity. A scenario that removes a whole service would need its own fixture.
- **A normal 12 h shift ends with the ward-bed alert open.** A bed given to an ED patient stays occupied for the rest of the run (Q5), so beds never release after use and the ward-bed service stays Overloaded late in a normal shift. This is an honest consequence of the disclosed bed assumption, not a defect in the rule; ticket 09 scenarios revisit it.

**Alternative not taken:** treat any fully busy unit as capacity unavailable (this would raise an alert at normal load); show a zone as Cannot assess as soon as one service is missing, even with a confirmed episode.


## Q7. What is an "alert" for the camera, and who counts as "assigned on-duty" staff? (ticket 07)

Spec and ticket 07: an alert selection focuses the zone, a normal selection need not zoom, "no auto-zoom on every warning"; the drawer lists "assigned on-duty doctors/nurses".

**Working decision:**
- *Alert* means a zone whose local state is Overloaded. Building, Cannot assess and Normal zones open the drawer without zooming (the spec names only normal and overloaded and forbids zooming on every warning). Zooming happens only on a user selection; a state change never moves the camera.
- *Assigned on-duty doctors* are listed in zone 2 only: the on-duty doctors, each marked assigned when a patient in the zone's roster holds that clinician slot. Doctors are not listed in zones 1, 3 or 4, where no clinician slot is held.
- *Assigned on-duty nurses* are the on-duty nurses who cover a space held by a patient in that zone (zones 2-4), with those patients. Off-duty nurses are never listed, and zone 1 lists none because it has no treatment spaces.
- Back to overview restores the overview camera and keeps the zone selected and the drawer open; reset clears both.
- Zone details are received state only. Forecast content belongs to the selected-zone panel of ticket 10.

**Alternative not taken:** zoom on Building and Cannot assess zones too; list every on-duty doctor and nurse in every drawer.


## Q8. How are faulty, late and missing inputs treated? (ticket 08)

Spec §Data: "Process ... only when received", "Missing essential information or an update older than ten simulated minutes shows Cannot assess", "Reject/quarantine invalid inputs with a reason; do not discard genuine outliers". The spec names no heartbeat period, no list of essential sources and no outlier thresholds.

**Working decision:**
- **Sources.** Six feeds: queues, spaces and staffing are essential; diagnostics, disposition and ambulance are optional. A separate replay clock heartbeat never refreshes any of them.
- **Heartbeat and boundary.** Each healthy feed sends a heartbeat every 5 simulated minutes and an update on every change. "Older than ten minutes" is strictly more than 10: age 10.0 is fresh, 10.001 is stale. A stop that starts at minute S also loses a heartbeat that falls exactly on S.
- **Essential stale means Cannot assess for the whole ED; optional stale limits only its own part** (zone 3 reads Cannot assess when diagnostics is stale, the overall ED stays assessable).
- **A stale feed keeps its last valid values and age.** When it resumes, its next heartbeat carries the current state, so changes made during the outage appear then; the lost events stay as sequence gaps in the event log.
- **External messages never move a patient.** Only the replay feed produces transitions. An outside message is checked (id seen, event time in the future, unknown patient/ambulance, impossible next phase, stale update, impossible count) and then either quarantined or, for the ambulance announce/ETA/cancel and count reports, accepted.
- **Out of order** means an event time older than the state already received for that patient or ambulance; the newer state is kept.
- **Outliers kept and flagged, never discarded:** a test longer than 100 min (twice the longest disclosed turnaround), an ETA moved by 30 min or more, 10 or more arrivals within one minute. Counts must be whole, non-negative and no larger than the patients present; an ambulance announces 1 to 10 patients.
- **`missing_inputs` (a fixture declaring a service's inputs missing)** nulls that service's figures (busy, waiting, throughput, zone sub-counts) and marks `inputs_ok: false`. Patient dots and the zone total stay, because patient positions come from the event feeds.
- **Patients are shown as the received events describe them**, each from the one-minute sample at their newest received event.

**Alternative not taken:** let an outside valid transition move a patient (a second write path into the state); treat any stale optional feed as Cannot assess for the whole ED.

## Q9. How are the seven scenario families defined, partitioned, saved and reloaded? (ticket 09)

Spec §Scenarios and ticket 09: seven retained families, "seed partitions", "warm-up/scored duration", "workload variants", "save/load replay identity ... and completed results", and "Normal state/zone/ETA responses never expose hidden replay schedules". The spec gives no family parameters, no seed numbering and no storage format.

**Working decision:**
- **Families are parameter sets.** Each family is plain data in `profile.py` `SCENARIOS`: arrival-rate segments for walk-ins and ambulances, extra or slower tests, a heavier admission mix, a ward-bed release schedule and a nurse roster. The engine reads them through one path, so replay and forecast share it. Plain `normal` is unchanged (seed 7: 705 events, 59 patients over 720 min).
- **Demo roles.** `diagnostic-delay` = the diagnostic-backlog demo (imaging overload confirmed at T+92 on test seed 2033; zone 3 reads Overloaded at T+95 on the UI default seed), `arrival-surge` = the recovering short surge, `boarding-blockage` = the ward blockage, `no-effective-action` = the honest no-effective-action case.
- **Seed partitions** per family `i` (in listing order): development `[7]`, tuning `1000+10i+1` and `+2`, test `2000+10i+1` to `+4`. A seed outside the lists is labelled "custom" (the UI default 20261010 is custom); a fixture is labelled "fixture".
- **Warm-up (120 min) and scored (480 min) are recorded, not simulated differently.** A run still starts empty at T+0 and is treated as completed at T+600. The windows travel with the run record for the later evaluation tickets.
- **No-effective-action is a surge that passes before an action could land** (7x walk-ins and 3.5x ambulances for 45 min, then half the baseline). Ticket 09 verifies only that the scenario has this shape and that its episode clears. That no staff-approved action shows a benefit is a ranking result: tickets 17 and 19 must verify it, and must change the parameters if a best action appears.
- **Hidden future vs. evidence.** `/api/v1/scenarios` and `/api/v1/profile` name each family's kind of variant but not its time windows. The windows (and the ward-bed release schedule) are the replay's hidden future: they appear only in the export (`export.run_record`, and the bed schedule also in `export.profile`) and in saved-run records, never in `/state`, `/zones`, `/events`, `/ingest`, `/profile` or `/scenarios`.
- **Saved runs are files** under `backend/saved_runs/` (git-ignored), so they survive a backend restart. A record holds the received events, announcements, choices (empty until action tickets exist), simulation settings (forecast settings are null until ticket 10), selected zone and camera, the run record and, for a finished shift, results.
- **Load rebuilds from the seed and verifies.** Loading replays the saved scenario and seed to the saved time and compares the received events by count and SHA-256 digest. A record that does not reproduce is refused with 409 and a reason; nothing is approximated. A loaded run is a new replay with a `saved_run` label ("Saved in-progress synthetic run" or "Completed synthetic run"); a reset clears it.
- **Plain `normal` is not always quiet over 600 min.** In an exploratory probe of 7 seeds, 4 had an imaging or ward-bed overload at some point, a consequence of earlier tickets' disclosed assumptions (Q5, Q6). Not changed.

**Alternative not taken:** store hidden windows in the catalog and hide them in the UI only; store the full engine state in the saved file instead of rebuilding from the seed and checking a digest.

## Q10. How are hidden needs sampled, arrivals adjusted and deadlines placed in the forecast? (ticket 10)

Spec §Congestion and forecasting: sample "arrivals, remaining work, and ward availability from observed state and disclosed assumptions", with "forecast random seeds independent of replay seeds and hidden completion values"; an alert's latest start is "the lower end of the relevant conditional 90% onset range minus five minutes of review, its setup time, and a five-minute margin", using "the best-supported feasible action when a comparison exists; otherwise label the provisional action assumption". The spec gives no population model for unreceived needs, no arrival adjustment and no provisional action per service.

**Working decision:**
- **Isolation.** `forecast.py` takes a received snapshot plus the received events and nothing else. Each future is a fresh SimPy runner built from that plain input; no running engine is copied and no hidden schedule is read. Random values are keyed `fc:{seed}:{future}:{patient or source}` with a forecast seed (7310004) that is independent of every replay seed. Two comparison branches therefore share patient needs.
- **Unreceived patient needs.** Test kinds are known only once ordered (the public patient record gains `tests_required`, `null` until then); until then they are sampled from the disclosed need probabilities by urgency group. Test turnaround, disposition, assessment and processing times, and the stabilization task are sampled from the disclosed triangular assumptions. Work already under way is resumed conditional on its received elapsed time; past the disclosed maximum, about five more minutes.
- **Arrivals.** Announced ambulances arrive at ETA plus a normal error with the disclosed uncertainty (never before now; a delayed one arrives soon; 7% cancel). Unannounced walk-ins and ambulance runs come from the disclosed rates, scaled by received arrivals of the last 30 minutes against the expected count (two pseudo-windows of shrinkage, 0.5 to 4, half-life 30 minutes). Lab and imaging turnaround are scaled by received completed turnarounds of the last 60 minutes (three pseudo-observations, 0.5 to 3).
- **Ward availability.** Free beds are free; reserved beds stay reserved; a bed given to an ED patient stays occupied; beds held by earlier inpatients release uniformly in 10 to 300 minutes (the received free-at times are hidden, so this is a disclosed population assumption).
- **Onsets.** A "new onset" is a confirmed episode whose onset falls inside the 90-minute horizon and whose confirmation falls inside the 20-minute tail; an interval that begins and never confirms is not one. The reported range is the conditional 5th to 95th percentile among futures with an onset; the countdown is the median minus the forecast time.
- **Provisional action per service** (used only until a comparison exists, ticket 11 onward): triage to surge triage desk (10 min setup), assessment to reserve physician (15), spaces to surge spaces (20), lab and imaging to diagnostics (15), discharge to cleared-discharge support (10), allocation, transport and ward beds to ward coordination (10).
- **Warning threshold 0.4** is the spec's first candidate and is provisional; ticket 18 tunes it on tuning shifts. A forecast warning can sit on a Normal zone and is labelled as a warning, not as congestion.
- **Alert list.** Choosing an alert focuses its zone (a zone button keeps the Q7 rule: only an Overloaded zone is zoomed). Recovery and Cannot-assess items are listed apart and never get a prevention deadline.
- **Explanation.** `forecast/explain` explains the forecast already cached for the requested state version (409 when none is held; the last six versions per replay are kept). It reports observed facts, model statements, announced versus unannounced demand and a paired sensitivity with one more unit of the bottleneck service; the sensitivity is not an action.
- **Explanation sample count.** The explanation is requested with the sample count of the forecast on screen, not with the setting just chosen. After a change from 50 to 100 futures the old forecast is still shown until the new one arrives, and asking for a 100-future explanation of a state that has only a 50-future forecast returns 409 (found in `10-ui-agreement` A6 and fixed).
- **Saved forecast settings.** A saved record carries `settings.forecast` (samples chosen in the UI, model version, horizon 90, tail 20, refresh 5, forecast seed, warning threshold 0.4). Loading restores the sample selector; the loaded run is rebuilt from events as before, and no forecast is stored in the record. This completes the forecast part of ticket 09 criterion 4; `choices` stays empty until ticket 11.
- **Evaluation size (predeclared from measured cost).** 50 futures take about 0.25 s and 100 about 0.5 s on the development machine; a complete 12 h shift forecast every 5 minutes at 50 futures took 43 s. A forecast-only evaluation of 14 tuning and 28 test shifts is therefore about 30 minutes. The action-comparison cost does not exist yet (tickets 11 and 17); the size is re-confirmed against the measured comparison cost in ticket 18, with the spec's 7 + 7 fallback if the run budget requires it. No final outcome exists yet, so this choice cannot depend on one.

**Alternative not taken:** read hidden completion times from the replay engine; a time-to-onset countdown from lambda greater than mu; one pooled forecast without separate local and overall summaries.
## Q11. How do requests, approval and the action lifecycle work? (ticket 11, shared by 14)

Spec §Actions and the scope amendment: one lifecycle, approvers from resource ownership, one action in flight, partial grants reserve nothing.

**Working decision:**
- **Presets.** Two are built: ward coordination (adds one ward-allocation slot, owner "Ward supervisor / bed manager", setup 10 min) and the diagnostic reserve slot (ticket 14, lab or imaging, owner Lab manager or Radiology manager, setup 15 min). The other presets are listed as not modeled and refused with 422.
- **Owners.** Required approvers are the owner of the resource the action adds capacity to (`PROFILE["owners"]`), never the zone the alert came from. The ED shift coordinator can request but is not an owner, so a coordinator decision is refused (403).
- **Declared reserves.** `PROFILE["reserves"]`: coordinator `WA2`, lab slot `L3`, imaging slot `I2`. A fixture may declare `reserve_outages` (hidden future); the reserve is rechecked at activation and an unavailable one blocks the action with no capacity added.
- **Lifecycle.** Approval by every required owner starts review (5 min), then setup, then active (60 min), then draining (the slot takes no new work; the task on it finishes first), then completed; blocked at activation if the reserve is gone. Capacity changes only at activation and at the end of the active window. All stages are `action_*` events carried by a separate `actions` source, so they never refresh a clinical feed's heartbeat.
- **Staleness.** A request records the simulated time of the comparison it was made from. Reject and defer work any time; approve is refused with 409 once time has moved on ("an old ranking cannot be approved"). Creating a new request closes an older open one as stale. State version guards concurrent changes (409).
- **Idempotency.** A decision's identity is (role, decision_id). A repeat returns the stored outcome with no second effect; a second grant by the same role under a new id is 409.
- **Eligibility.** Ward coordination needs a decided Ward/ICU patient waiting for allocation work (a bed already reserved). If decided patients only lack a suitable bed it is not feasible and says so: more allocation work cannot help and never creates a bed.
- **Comparison cohort and follow-up.** Patients present now plus arrivals in the next 90 min; background arrivals continue; the run stops when the cohort has departed or at 12 h. Stays that do not finish carry accrued minutes in both branches and are counted apart (never dropped); a stay waiting for a ward bed that is never released in the model therefore shows as unfinished.
- **Resource-hours.** One reserve unit for its 60-minute active window (setup and review minutes are staff time before it); work on the slot finishes after the window and is not charged.
- **Saved runs.** `choices` holds each request and decision with the simulated time it was made; Load replays them through the same commands and then checks the event digest.

**Alternative not taken:** forecasts and comparisons that ignore an action in flight; an approval that is valid at any later time; modelling partial grants with several owners (every preset here has one owner, the machinery supports more).
## Q14. What does the diagnostic reserve slot change? (ticket 14, reduced)

**Working decision:** one declared reserve lab slot (`L3`) or reserve imaging slot (`I2`) adds one unit of that service for the 60-minute active window after review (5 min) and setup (15 min), through the Q11 lifecycle. Turnaround per test is a supplied per-patient value and is never changed; a task on the slot when the window ends finishes first, then the slot closes (draining). The request is feasible only while a patient is waiting for that service. Diagnostic reallocation from a donor service and donor consent are not modeled. The comparison reports the diagnostic wait (sum of waiting for a unit) beside total ED time.

**Alternative not taken:** shortening turnaround while the slot is active; reallocating a unit from another service.
## Q17. How are actions ranked, and what is "impact per resource-hour"? (ticket 17, lite)

**Working decision:** labels follow the spec amendment: Best action needs a positive mean saving in total ED patient-minutes, a positive normal-approximation 90% lower bound (mean - 1.645 x sd / sqrt(n) over the paired futures) and an urgent check that passes (mean change in urgent initial wait at most +5 min, mean change in the overdue-urgent count at most 0); fewer than 20 futures with a complete urgent outcome is Needs review. A second supported action reads "benefit supported, ranked below another". Order: feasibility, urgent check, supported saving (lower bound), resource-hours. **Resource-hours** are the reserve unit's review + setup + active minutes / 60 (ward 1.25, diagnostic 1.33). **Impact per resource-hour** is the saving (mean and lower bound) divided by that; it is patient-minutes per reserve unit-hour, never money (PRODUCT.md and the spec forbid ROI claims on synthetic data). **What if A instead of B** is the per-future difference of two actions' savings on the same keyed futures, with its own mean, sd and lower bound; only one action can run at a time, so it is the choice for the first slot. Each action's latest-start deadline is the lower onset bound minus its own review, setup and a 5-minute margin from the forecast of the same state version; an already-overloaded service has no deadline (recovery). The alert list shows impact and deadline only for a comparison made at the screen's exact time.

**Alternative not taken:** a whole-future bootstrap and nearest-rank p90 urgent checks (dropped by the amendment); forcing the top row to Best.
## Q18. How are forecasts matched to episodes and policies compared? (ticket 18 merged with 19, reduced)

**Working decision:** a no-action replay of each held-out shift is forecast every 15 simulated minutes at 50 futures with threshold 0.4 (untuned). An early warning is a forecast-risk alert for a service (or the overall ED) made at t when that key's confirmed episode has its onset in (t, t+90]; each episode is matched by its earliest such warning. A building alert made before confirmation with no earlier forecast-risk match is "late only" and earns no early-detection credit; an episode with neither is missed. Consecutive forecast-risk alerts for one key form one warning run; a run with no matching episode in (first time, last time + 90] is a false warning. The truth replay runs 110 minutes past T+600 so late warnings are not truncated. Policies run on the same seed and catalog: no action; reactive (owner approves a feasible action only once its service is Overloaded, no comparison); PulseAhead (approves the top action only if labelled Best action, every 15 minutes with none in flight). Cohort: patients arriving in T+120..T+600; unfinished stays accrue to T+600 and are counted apart. Resource-hours are review + setup + active hours of each approved reserve unit. Everything is descriptive (one shift per family).

**Alternative not taken:** tuning the threshold or changing the reactive baseline after seeing test results; reporting only the favourable shifts.
