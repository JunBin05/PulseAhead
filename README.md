# PulseAhead

PulseAhead is a synthetic 3D operational digital twin of an emergency department (ED). Patient dots move through four zones, showing queues, diagnostics, boarding, and departures. Staff inspect a bottleneck, compare operational actions, approve with the right resource owner, and watch its delayed effect.

## What it aims to do

- Estimate how soon ED demand may exceed effective processing capacity.
- Identify the main operational bottleneck, such as inpatient bed availability, diagnostic delays, or a surge in arrivals.
- Estimate the likely effect on waiting times and highlight actions that could help stabilize flow.

## How it works

The planned demo shows four connected phases:

1. **Arrival and triage:** walk-ins, supplied critical-bypass arrivals, and received inbound ambulance announcements.
2. **Doctor assessment:** finite clinician work, staffed treatment spaces, and result review.
3. **Diagnostics and testing:** lab/imaging queues while ED beds remain occupied; results return to the doctor.
4. **Disposition:** supplied clearance, home discharge, or suitable Ward/ICU transfer with finite beds and transport.

The retained ED congestion rule is zero available staffed spaces and at least six awaiting a space for 20 minutes. Forecasts look 90 minutes ahead using independent possible futures. Local overload is separate from overall congestion; a rate imbalance alone is not a certain-collapse countdown. The new spec has six finite-resource action presets and department-owner approvals.

## Intended users

An ED shift coordinator working with triage charge nurses, the ED attending lead, lab/radiology managers, and ward supervisors/bed managers. Command-center escalation records unresolved requests without creating free capacity.

## Demo direction

Start simulation → inspect the alert → focus the zone → compare an action → collect supervisor approvals → watch setup and flow changes. The scene uses received simulation state, not fabricated progress. A matching 2D/keyboard mode preserves access when graphics or motion are unsuitable.

## Data and safety

The concept uses time-stamped patient-flow and resource signals, such as arrivals, queue lengths, staffing, diagnostic turnaround, available ED spaces, boarded patients, and ward beds. Any real deployment would require approved data governance and privacy controls. Predictions should show uncertainty and support staff judgment; they should not replace clinical judgment. Simulated inputs must be clearly labeled as simulated.

## Project status

The user approved the revised 22-ticket breakdown and local-file tracker on 10 October 2026. The active spec and tickets are ready-for-agent. Implementation, deployment, measured results, and rehearsal have not started.

- [Approved brief](docs/PROJECT_BRIEF.md)
- [3D MVP spec](docs/PULSEAHEAD_3D_MVP_SPEC.md)
- [22-ticket plan](docs/PULSEAHEAD_3D_TICKET_PLAN.md)
- [3D build checkpoints](docs/PULSEAHEAD_3D_BUILD_PLAN.md)
- [3D interface direction](docs/PULSEAHEAD_3D_UX.md)
- [Rubric and evidence map](docs/PULSEAHEAD_RUBRIC_MAP.md)
- [Website and dashboard references](docs/REFERENCE_RESEARCH.md)
- [Agent planning review](docs/PLANNING_REVIEW.md)
- [Evidence checklist](docs/TRACK_1_CHECKLIST.md)
- [Design decisions](docs/DESIGN_DISCOVERY.md)
- [Glossary](GLOSSARY.md)

The hackathon uses one fictional 24-space ED and synthetic data only. Organizer acceptance of synthetic-only evidence remains an open external check.

All application testing and verification uses Playwright MCP; no application checks have run. The [local tracker](.scratch/pulseahead-3d/README.md) links the canonical spec and all 22 approved tickets. Ticket 01 is the first available task; later tickets follow their blockers.

The supplied Track 1 rubric has five equally weighted criteria. The plan requires forecasts/false-alert evidence, useful actions, clear explanations, operational value, and a verified deployed synthetic demo. Scores and hospital performance are not guaranteed.

Old active spec, ticket plan, build plan, and UX filenames have been replaced. Previous context and superseded drafts remain under history and are not the active build queue.
