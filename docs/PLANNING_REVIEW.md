# PulseAhead planning review

Historical review of the dashboard-first spec and 16-ticket set. It does not review or approve the later 3D/rubric scope. Current documents are [the 3D spec](PULSEAHEAD_3D_MVP_SPEC.md) and [22-ticket plan](PULSEAHEAD_3D_TICKET_PLAN.md).

Date: 10 October 2026. Scope: document consistency and build readiness, not application testing.

At the user's request, three agents independently reviewed spec/ticket coverage, product clarity, and simulation/evidence rules. All 54 user stories have coverage in the 16 tickets. The dependency graph has no cycles. No additional ticket is needed for the fixes below.

| Finding | Recorded fix | Main tickets |
| --- | --- | --- |
| Building congestion could misleadingly show zero new-onset risk | Separate current-interval confirmation chance; no future-onset countdown | 07 |
| A harmful or zero-benefit action could win | Best requires supported positive savings versus no action | 12 |
| Review and activation timing left races open | Paused demo review, atomic reservation, exact lifecycle, activation rechecks, draining accounting | 08–11, 15 |
| Urgent evidence was not reproducible | Explicit paired-future uncertainty, sample counts, empty/sparse handling, and delay limits | 12 |
| Diagnostic reallocation could harm urgent donor patients | Donor delay records/checks; missing evidence cannot win | 11–12 |
| Preset clearance could bypass delayed tests | Both required care/tests and received decision must complete before eligibility | 03 |
| Heartbeats could hide a stopped feed | Preserve source-specific freshness | 06 |
| Baselines and scoring could vary by implementation | Fixed calculations, tuning rules, one-to-one warning matching, denominators, and end-of-window truth | 13–14 |
| Evidence run might exceed the available time | Early full-shift benchmark; balanced fallback locked before final outcomes | 07, 13–14 |
| First ward-action demo could imply new beds | Allocation-backlog success fixture, separate unavailable-bed failure fixture | 08 |
| Interface next steps and dialog behavior were vague | State-specific next steps, simulated units, keyboard focus/cancel/return, readable status announcements | 01, 08, 15 |

The implementation spec, ticket criteria, build plan, interface direction, glossary, and brief carry the relevant changes. The spec remains the source for exact shared numerical rules; the tickets require those rules through real frontend/backend behavior and Playwright MCP evidence.

A second agent pass found and tightened the high-risk stable-state prompt, inclusion of singleton urgent futures, the simulated staff-response trigger, separation of baseline approval from predictive gates, and shift-level uncertainty. The one-shift-per-family fallback is descriptive evidence with no claimed within-family precision.

All three agents then reread their targeted fixes and confirmed that their remaining material findings were resolved. This is agreement on the reviewed documents, not a guarantee of completeness or product quality.

No code, hospital evidence, application tests, or human usability results exist yet. Every acceptance criterion remains unchecked. The 16-hour schedule is a target with measured checkpoints, not proof that every feature will fit.

Organizer acceptance of synthetic-only evidence remains unresolved. Breakdown approval and tracker choice remain pending, so ticket files are drafts. Neither document review nor agent agreement establishes hospital performance or a flawless product.
