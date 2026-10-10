# PulseAhead 3D MVP: rubric-aligned ticket plan

Status: approved on 10 October 2026. The user selected local files as the tracker. All 22 tickets are published locally with ready-for-agent status; none is implemented or verified. This replaces the old active 16-ticket plan.

The [active spec](PULSEAHEAD_3D_MVP_SPEC.md) is the source of shared rules. [UX direction](PULSEAHEAD_3D_UX.md), [build checkpoints](PULSEAHEAD_3D_BUILD_PLAN.md), and [rubric map](PULSEAHEAD_RUBRIC_MAP.md) explain presentation, timing, and judge-facing evidence. Previous dashboard-first context is historical.

## Amended breakdown (2026-10-11, final build)

The spec's "Scope amendment" applies. Ticket states after it:

| Ticket | State in this build | Blocked by |
|---|---|---|
| 01-10 | done (10 including its review gate) | as below |
| 11 Ward coordination and owner approval | active; builds the shared comparison, request and lifecycle machinery | 10 |
| 12 Cleared discharge support | **descoped** (not modeled in this build) | n/a |
| 13 Staffed surge spaces | **descoped** | n/a |
| 14 Diagnostic reserve slot | active, **reduced** to the reserve lab/imaging slot; donor reallocation descoped | 11 |
| 15 Surge triage desk | **descoped** | n/a |
| 16 Reserve physician | **descoped** | n/a |
| 17 Rank actions (lite) | active, lite ranking rule | 11, 14 |
| 18 Forecast and policy evidence (merged with 19) | active, merged and reduced | 11, 17 |
| 19 Decision benefit and value | **merged into 18** | n/a |
| 20 Decision journey and fallback (lite) | active, lite | 17 |
| 21 Deployment | unchanged; needs the user's authorized hosting target | 18, 20 |
| 22 Rubric evidence and rehearsal | unchanged; stays with the user | 18, 21 |

Verification is an API smoke check per ticket plus one Playwright MCP end-to-end journey on the final build (spec amendment, "Verification"). The breakdown below is the original reference.

## Approved breakdown

Each ticket is a complete path through real simulation/state, API, visible interaction, and Playwright MCP evidence. A finished ticket is demoable on its own; implementation details must not be substituted for external behavior checks.

1. **[Start a real four-zone 3D ED replay](../.scratch/pulseahead-3d/issues/01-working-3d-replay.md)**. **Blocked by:** none. **Delivers:** A first-time user starts a synthetic ED replay and sees received patient dots move through a simple four-zone 3D map, with real controls and live counts.

2. **[Show walk-ins, critical entries, and inbound ambulances](../.scratch/pulseahead-3d/issues/02-triage-and-ambulance-feed.md)**. **Blocked by:** 01. **Delivers:** An operator sees received ambulance ETAs and patient totals, then watches walk-ins pass through triage and supplied critical arrivals enter the finite resuscitation route.

3. **[Model doctor assessment and shared staffing](../.scratch/pulseahead-3d/issues/03-assessment-and-staffing.md)**. **Blocked by:** 02. **Delivers:** An operator sees doctor-assessment queues, assigned staff, urgency-based work, and finite treatment-space coverage that affects patient progress.

4. **[Show diagnostic queues and return to the doctor](../.scratch/pulseahead-3d/issues/04-diagnostics-and-return-flow.md)**. **Blocked by:** 03. **Delivers:** Patients needing tests visibly gather in zone 3, keep their ED beds, and return to the clinician for result review before a decision.

5. **[Show cleared discharge and constrained ward exits](../.scratch/pulseahead-3d/issues/05-disposition-and-exits.md)**. **Blocked by:** 03. **Delivers:** A supervisor sees patients in disposition wait for actual discharge or a suitable Ward/ICU bed and transport, with whole ED time recorded.

6. **[Distinguish local overload from ED congestion](../.scratch/pulseahead-3d/issues/06-zone-pressure-and-ed-congestion.md)**. **Blocked by:** 02, 03, 04, 05. **Delivers:** An operator sees green/yellow/red/unknown zone states and a separate overall ED status, with sustained congestion and recovery detected correctly.

7. **[Inspect zones and focus the alert camera](../.scratch/pulseahead-3d/issues/07-zone-drawers-and-camera.md)**. **Blocked by:** 04, 05, 06. **Delivers:** A user selects a normal or overloaded zone, reads real zone details, focuses the alert area, and returns to overview without changing patient flow.

8. **[Handle fresh, noisy, missing, and invalid inputs](../.scratch/pulseahead-3d/issues/08-received-data-and-robustness.md)**. **Blocked by:** 01, 02. **Delivers:** An operator can tell whether predictions have usable data, while faulty events and ambulance announcements cannot corrupt the observed state.

9. **[Generate varied shifts and reproduce saved replays](../.scratch/pulseahead-3d/issues/09-synthetic-scenarios-and-save-load.md)**. **Blocked by:** 06, 08. **Delivers:** A presenter selects varied synthetic shifts and reloads the same received events, visual state, decisions, and results without leaking private future data.

10. **[Predict bottlenecks and explain the time remaining](../.scratch/pulseahead-3d/issues/10-forecast-and-alert-panel.md)**. **Blocked by:** 06, 07, 08. **Delivers:** Clicking a zone alert shows independent-future congestion estimates, a plain cause, chance/range, and a truthful estimated countdown tied to the selected zone.

11. **[Compare ward coordination and route supervisor approval](../.scratch/pulseahead-3d/issues/11-ward-action-and-owner-approval.md)**. **Blocked by:** 10. **Delivers:** A bed manager compares ward coordination with no action, receives the correctly routed request, approves/rejects/defers it, and watches a delayed real effect.

12. **[Compare cleared ED discharge support](../.scratch/pulseahead-3d/issues/12-cleared-discharge-action.md)**. **Blocked by:** 11. **Delivers:** A resource-owning bed manager compares extra cleared-discharge processing, makes the required choice, and sees its delayed effect on real ED departures.

13. **[Compare staffed surge treatment spaces](../.scratch/pulseahead-3d/issues/13-staffed-surge-action.md)**. **Blocked by:** 11. **Delivers:** The ED attending lead compares and approves four reserve spaces with their staff team and watches queued patients use them after setup.

14. **[Compare diagnostics with donor consent and effects](../.scratch/pulseahead-3d/issues/14-diagnostic-action-and-donor-approval.md)**. **Blocked by:** 11. **Delivers:** The correct lab/radiology manager compares diagnostic capacity and, for reallocation, obtains donor approval while seeing both ED and donor consequences.

15. **[Compare a staffed surge triage desk](../.scratch/pulseahead-3d/issues/15-surge-triage-action.md)**. **Blocked by:** 11. **Delivers:** The triage charge nurse compares and approves extra triage processing when a real inbound/registration backlog and reserve team justify it.

16. **[Compare reserve physician assessment capacity](../.scratch/pulseahead-3d/issues/16-reserve-physician-action.md)**. **Blocked by:** 11. **Delivers:** The ED attending lead compares a reserve physician slot and sees whether assessment work improves without additional physical beds.

17. **[Rank six actions by benefit, urgent delays, and time to act](../.scratch/pulseahead-3d/issues/17-rank-actions-and-operational-urgency.md)**. **Blocked by:** 12, 13, 14, 15, 16. **Delivers:** An operator sees all six actions ranked with honest benefit, urgent-delay checks, costs, and preventive/recovery timing, without a forced winner.

18. **[Measure forecast quality and resilience on held-out shifts](../.scratch/pulseahead-3d/issues/18-forecast-evidence-and-noise.md)**. **Blocked by:** 09, 10. **Delivers:** An evaluator runs locked synthetic shifts from the app and reads prediction quality, false alarms, lead time, noise behavior, and simple-baseline comparisons.

19. **[Measure decision benefit and operational value](../.scratch/pulseahead-3d/issues/19-policy-benefit-and-value.md)**. **Blocked by:** 17, 18. **Delivers:** A judge compares PulseAhead's complete decision policy with no action and fair simple policies, seeing total ED time, urgent delays, resource cost, and failures.

20. **[Make the 3D decision journey usable and reliable](../.scratch/pulseahead-3d/issues/20-complete-ux-and-graphics-fallback.md)**. **Blocked by:** 07, 17. **Delivers:** A first-time user completes start → alert → focus → comparison → supervisor review → progress, with reliable keyboard/2D/reduced-motion alternatives and errors handled.

21. **[Deploy and verify the complete synthetic demo](../.scratch/pulseahead-3d/issues/21-deployed-synthetic-demo.md)**. **Blocked by:** 18, 20. **Delivers:** A judge opens a stable demo URL and runs the real synthetic 3D workflow with a working backend, protected run isolation, and a saved-run fallback.

22. **[Package rubric evidence and rehearse the live pitch](../.scratch/pulseahead-3d/issues/22-rubric-evidence-and-timed-demo.md)**. **Blocked by:** 19, 21. **Delivers:** The presenter demonstrates a real diagnostic blockage and supervisor intervention within the rubric timing, then answers questions using saved evidence and limitations.

## Why these blockers

- The first real 3D replay provides state/version/controls, not a separate frontend-only mock.
- Arrivals/triage precede assessment. Diagnostics and disposition both extend assessment; neither needs the other's feature complete.
- Local pressure needs all phase resources. Zone inspection needs real diagnostic/disposition details and pressure states. Received-data faults can progress without cameras.
- Scenario save/load needs coupled phases and feed handling. Forecasting needs those received-state boundaries and the selected-zone interface, but does not need save/load first.
- Ward coordination establishes the common comparison, role routing, owner grants, and delayed action lifecycle. Five other presets extend that complete path independently.
- Six-action ranking requires every preset. Forecast-quality evaluation can proceed before actions because it scores no-action shifts.
- Policy benefit needs ranked actions and locked warning baselines. The usability/graphics pass needs the full interaction path; deployment needs that plus actual evaluation controls. Final pitch/evidence needs both policy results and the deployed verified journey.

These are completion blockers, not an instruction to create new chats or hire a team. Start only tickets whose blockers are complete. Within a ticket, deliver frontend and backend together.

## Spec coverage

| Stories | Main tickets |
| --- | --- |
| 1–4 queues/spaces/boarding/diagnostics | 01–07 |
| 5–7 freshness/episode state | 06, 08 |
| 8–13 risk/range/no-event/cause | 10 |
| 14–21 original actions/eligibility/delays | 11–14, 17 |
| 22–26 ED time/urgent effects/no help | 05, 11, 17, 19 |
| 27–31 staff choices/versions/reserves | 11–17 |
| 32–35 replay/synthetic labels/result types | 01, 09, 17, 22 |
| 36–37 forecast isolation/paired demand | 08, 10–11, 19 |
| 38–40 held-out/baseline/warning evidence | 18–19 |
| 41–44 unfinished/faults/exports/assumptions | 05, 08–11, 18–19, 22 |
| 45 all verification through Playwright MCP | Every ticket |
| 46–54 clarity/keyboard/errors/review/evidence panel | 01, 07–11, 17–22 |
| 55–58 3D phases/particles/queues/exits | 01, 04–07 |
| 59–62 inbound ETA/critical entry/acuity | 02–03, 08, 10 |
| 63–64 zone details/camera return | 07, 20 |
| 65–68 local/global alerts/rates/countdown/cause | 06, 10, 17 |
| 69–70 triage/physician actions | 15–16 |
| 71–73 resource-owner routing/joint approvals/escalation | 11–14, 20 |
| 74–77 2D/keyboard/motion/replay/count agreement | 01, 07, 09, 20, 22 |
| 78–83 value/priority/noise/explanation/deployment/pitch | 10, 17–22 |

## Rubric adjustments

The supplied Track 1 rubric assigns 20 points each to problem/value, prediction/data rigor, decision/actionability, explainability/trust, and live execution/pitch. The tickets add explicit deadlines/impact, noise/outlier evidence, clear owner routing, operational value units, a deployed demo, and timed Q&A. The 3D scene does not substitute for reliable model output.

Six MVP presets make the phase proposal concrete: ward coordination, cleared ED discharge support, staffed surge spaces, diagnostic capacity, surge triage, and reserve physician work. Diversion, novel batching, holding units, and clinical inpatient discharge remain extension examples until their own mechanisms are specified. Command-center escalation records a request; it is not a free-capacity action.

## Completion and publication

Acceptance criteria stay unchecked until actual Playwright MCP evidence supports them. Record pass/fail/not-run, fixture/version, expected/actual values, and browser/API/export evidence. No score, hospital benefit, or flawless UX is established by these documents.

The user approved all 22 tickets and selected local files on 10 October 2026. The [local tracker](../.scratch/pulseahead-3d/README.md) links the canonical spec and this index; each individual ticket is ready-for-agent. This means specified and approved for implementation, not completed. Acceptance criteria remain unchecked. Ticket 01 has no blockers and is the first available task; later tickets start only when their listed blockers are complete. No external tracker setup is required, and no parent issue is modified.

The 16-hour target remains ambitious. Benchmark a full shift early; lock balanced evaluation counts before final outcomes; keep the last two hours for freeze/rehearsal. Cut realism, physics, VR, extra screens, nominal ML, and decorative effects before the required 3D loop, data correctness, approval constraints, and evidence. Any missed feature/check remains disclosed.

Organizer acceptance of synthetic-only evidence remains an external check.

