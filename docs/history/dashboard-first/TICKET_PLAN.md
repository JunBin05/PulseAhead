# PulseAhead ticket breakdown

Status: 16 ticket drafts updated with the user's product-clarity and UI/UX requirements. The revised spec includes both frontend and backend in every feature. Breakdown approval and tracker choice are pending; the tickets are not published or marked ready-for-agent. No application code or Playwright verification exists yet.

Each ticket makes a usable feature work through its engine/state, application API, dashboard, and Playwright MCP checks. There are no existing modules to refactor first. Ticket order places blockers first; a ticket can start when its listed blockers are complete.

Three agents reviewed spec coverage, product clarity, and simulation/evidence rules. Their fixes are incorporated in the existing 16 tickets: building-interval confirmation risk, supported positive benefit, donor urgent delays, exact approval timing, source freshness, reproducible uncertainty, baseline/scoring rules, and an early compute-budget gate. See [PLANNING_REVIEW.md](PLANNING_REVIEW.md). This was document review, not application verification.

Build the clear frontend and real backend contract together from ticket 01, using a small labeled replay first. Expand the varied synthetic scenario generator in ticket 05. Product understanding, consistent design, readable feedback, and accessibility are core acceptance requirements throughout. [UX_DESIGN.md](UX_DESIGN.md) records the interface direction.

The [reference research](REFERENCE_RESEARCH.md) informs the one-screen journey and simple stage/timeline/comparison visuals. These fit existing tickets 01, 07, 12, and 15; the ticket count and blockers stay the same. Public vendor material is inspiration, not proof of usability or PulseAhead performance.

## Proposed tickets

1. **[Build a clear dashboard and working ED replay](../.scratch/pulseahead/issues/01-observed-ed-replay.md)**. **Blocked by:** none. **Delivers:** a clear first-time experience, consistent interface, real backend patient flow, live counts, and replay controls.

2. **[Show diagnostic delays and urgency-based flow](../.scratch/pulseahead/issues/02-diagnostic-delays-and-urgency.md)**. **Blocked by:** 01. **Delivers:** lab/imaging queues, urgency ordering, and their effects on occupied ED spaces.

3. **[Show ward boarding and physical departure constraints](../.scratch/pulseahead/issues/03-boarding-and-physical-departure.md)**. **Blocked by:** 01. **Delivers:** finite ward/transport/discharge pathways, retained ED spaces, and the full ED time breakdown.

4. **[Show sustained congestion and recovery](../.scratch/pulseahead/issues/04-congestion-and-recovery.md)**. **Blocked by:** 01. **Delivers:** building, confirmed, and recovered states with correct timestamps.

5. **[Select realistic scenarios and reload saved replays](../.scratch/pulseahead/issues/05-scenarios-and-saved-replays.md)**. **Blocked by:** 02, 03, 04. **Delivers:** seven disclosed scenario families and reproducible save/load.

6. **[Handle delayed, stale, and faulty information](../.scratch/pulseahead/issues/06-received-information-and-faults.md)**. **Blocked by:** 01. **Delivers:** received-event handling, freshness, validation, and Cannot assess.

7. **[Forecast congestion from received information](../.scratch/pulseahead/issues/07-congestion-forecast.md)**. **Blocked by:** 02, 03, 04, 06. **Delivers:** independent possible futures, congestion chance/range, and input-linked explanations.

8. **[Compare and approve ward-transfer coordination](../.scratch/pulseahead/issues/08-ward-transfer-action.md)**. **Blocked by:** 07. **Delivers:** the first matched action comparison, staff choices, resource checks, and delayed execution.

9. **[Compare and approve cleared-discharge support](../.scratch/pulseahead/issues/09-cleared-discharge-action.md)**. **Blocked by:** 08. **Delivers:** cleared-discharge capacity changes and measured effects through the shared action flow.

10. **[Compare and approve staffed surge spaces](../.scratch/pulseahead/issues/10-staffed-surge-action.md)**. **Blocked by:** 08. **Delivers:** staffed reserve-space activation, costs, and safe resource release after patients leave.

11. **[Compare and approve diagnostic capacity changes](../.scratch/pulseahead/issues/11-diagnostic-capacity-action.md)**. **Blocked by:** 08. **Delivers:** reserve activation/reallocation and visible donor-pathway costs.

12. **[Rank actions with urgent-patient delay checks](../.scratch/pulseahead/issues/12-urgent-aware-action-ranking.md)**. **Blocked by:** 09, 10, 11. **Delivers:** four-action ranking, urgent-delay guardrails, uncertainty, and truthful no-help results.

13. **[Measure forecast quality against simple warnings](../.scratch/pulseahead/issues/13-forecast-baseline-evidence.md)**. **Blocked by:** 05, 07. **Delivers:** held-out warning evidence, simple baselines, false alarms, timing, and coverage.

14. **[Measure action-policy benefit against fair baselines](../.scratch/pulseahead/issues/14-action-policy-benefit-evidence.md)**. **Blocked by:** 12, 13. **Delivers:** matched policy results for ED time, urgent delays, resource costs, and unfinished patients.

15. **[Make the decision journey clear and reliable](../.scratch/pulseahead/issues/15-product-usability.md)**. **Blocked by:** 12. **Delivers:** the complete risk-to-approval journey, responsive/accessibility behavior, helpful feedback, and frontend/backend agreement during retries and failures.

16. **[Finish the demonstration and evidence pack](../.scratch/pulseahead/issues/16-demonstration-and-evidence-pack.md)**. **Blocked by:** 14, 15. **Delivers:** a fresh-start demo, saved fallback, complete functionality/usability evidence, and pitch preparation.

## Why these blockers

- Diagnostic flow, boarding, episode status, and feed handling share the working replay but do not block one another.
- The complete scenario catalog needs diagnostic, boarding, and episode behavior. Forecasts need the coupled flow, episode rules, and received state, but do not require save/load first.
- The ward action establishes common pairing, cohort accounting, resource checks, and approval timing. The other three action tickets extend that working path.
- Four-action ranking requires all four families. Forecast-quality evidence can proceed before action ranking because it scores no-action shifts.
- Policy benefit needs warning baselines and ranked actions. The dedicated usability pass needs the full action journey but does not wait for policy evaluation. The final evidence pack needs both measured policy results and the usable decision flow.

These are completion dependencies, not a demand for multiple developers or new chats. Work the available tickets in the current project.

## Spec coverage

| User stories | Main tickets |
| --- | --- |
| 1–4: queues, spaces, boarding, diagnostics | 01–03 |
| 5–7: freshness and congestion states | 04, 06 |
| 8–13: risk, onset, no-event reporting, explanation | 07 |
| 14–21: actions, roles, feasibility, delays, prevention/recovery | 08–12 |
| 22–26: whole ED time, urgency results, guarded ranking, no help | 03, 08, 12, 14 |
| 27–31: staff choices, current comparisons, reserve use | 08–12 |
| 32–35: replay, reproducibility, synthetic labels, clear result types | 01, 05, 07, 12, 15–16 |
| 36–37: future isolation and paired scenarios | 06–08, 14 |
| 38–40: held-out tests, fair baselines, warning evidence | 13–14 |
| 41–42: unfinished stays, changed workloads, faulty inputs | 03, 05–06, 08, 12–14 |
| 43–44: exports, assumptions, sample counts, saved evidence | 05, 13–14, 16 |
| 45: every verification through Playwright MCP | Every ticket |
| 46–48: first-time understanding, clear journey, short labels | 01, 07, 12, 15 |
| 49–51: responsive/accessibility behavior and useful feedback | 01, 06, 15 |
| 52–53: approval review, retries, and frontend/backend agreement | 07–12, 15 |
| 54: clear staff view with separate demo/evidence detail | 01, 05, 13–16 |

## Build window and completion

Use the approved 16-hour budget as a checkpoint guide: start with the interface foundation and real backend replay, establish coupled simulation/received state in the first four hours; forecast through hour six; all actions and ranking through hour nine; complete the decision-journey usability pass and evaluation controls through eleven; run locked comparisons through fourteen; freeze and rehearse through sixteen. UI work and Playwright checks are part of each ticket rather than separate unfinished layers.

At ticket 07, benchmark a complete development shift through Playwright MCP and record the full evaluation cost. Before final outcomes, lock the balanced full set or the spec's seven-tuning/seven-test fallback. The 16-hour target requires this measured gate; fewer runs must remain disclosed and cannot be selected for favorable results.

Cut optional learned models, extra screens, decorative animation, action combinations, and deployment before cutting product clarity, accessible controls, useful feedback, core resource rules, future isolation, urgent-delay checks, or measured baseline evidence.

Each acceptance criterion remains unchecked until actual Playwright MCP evidence supports it. Screenshots alone do not establish numerical correctness. A missing connection or failed/unrun check remains visible. This ticketing task does not claim that the product works or is ready to present.

## Publication

The project has no provided issue-tracker configuration. The files above are local drafts following the requested one-file-per-ticket format. If the user approves the breakdown and chooses local files as the tracker, promote these files to ready-for-agent, retaining their blocking numbers/titles and unchecked criteria. Ready-for-agent means specified, not implemented; start only tickets whose blockers are complete.

For an external tracker, run `/setup-matt-pocock-skills` to provide the destination and triage vocabulary. Publish each approved ticket in dependency order, use native blocking links where supported, and retain ready-for-agent unless instructed otherwise. There is no parent tracker issue to close or modify.

Organizer acceptance of synthetic-only evidence remains the separate external check from the approved spec.
