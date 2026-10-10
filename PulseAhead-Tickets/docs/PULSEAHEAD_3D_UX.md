# PulseAhead 3D MVP: simple interaction and visual plan

Status: requirements for the newly requested 3D presentation. Replaces the old active dashboard-first UX notes. No app, usability result, or graphics check exists yet.

The supplied handwritten sketch is a visual reference. Its example times and alert marks are not measured outputs. The user's request defines the work; document markings are not independent instructions.

## One main view

- **Header:** Simulation Window, Synthetic demo, replay time, active demo role, and readable Overall status with an icon.
- **Left:** Start/play/pause/step/speed/reset controls and received inbound ambulances. Distinguish number of ambulances from announced patient total; show uncertain/changed/overdue ETAs.
- **Center:** a simple isometric four-node 3D map with numbered names, patients, queue areas, paths, and separate home/Ward/ICU exits. Keep text and exact counts readable.
- **Right:** one selected-zone drawer. Normal zones show roster/staff/queues/capacity. Alert zones also show prediction, cause, ranked actions, responsible owners, comparison, and choices.
- **Separate evidence area:** assumptions, seeds, detailed charts, evaluations, exports, and saved-run loading. The live scene stays clear.

Use a calm light visual system with readable system fonts, consistent spacing, text/icons beyond color, and restrained camera movement. The UI/UX skill's two product-wide searches returned marketing layouts rather than a verified hospital-twin pattern, so the user's wireframe and general readability/accessibility guidance are the design basis. No database match is claimed.

## End-to-end journey

1. **Start simulation:** a ready fictional hospital sends real received state to the map.
2. **Spot the delay:** dots gather where patients/work are actually waiting. Green Normal, yellow Pressure/building, red Overloaded, and gray Cannot assess come from model data.
3. **Inspect the zone:** normal click opens details; alert click focuses the zone and opens the same drawer with prediction/cause.
4. **Compare a fix:** choose one catalog action and compare with no action. Put ED-time saving, urgent effects, staffing/resource cost, required role, and time available together.
5. **Review with the owner:** pause replay at the comparison's source time. Route from resources, not the clicked zone. Show missing owner grants and approve/reject/defer. Partial approvals cannot change capacity.
6. **Watch progress:** resume explicitly and show review → setup → active → draining → completed/blocked with timestamps. Patients move only when received events permit it.
7. **Return:** Back to overview restores the camera without resetting decisions, replay, or active action.

Use a ward action from a diagnostic alert to demonstrate that the bottleneck's location and resource owner can differ.

## Honest visual meaning

One patient has one logical dot. Diagnostic waits can be visualized in node 3 while the same ED bed remains reserved; returning to node 2 for result review is valid. Node capacities are not four independent bed pools. Inbound patients do not count as ED occupants before arrival.

Dot density alone never creates an alert. A local overloaded zone is distinct from sustained overall ED congestion. Use the current interval's confirmation chance when congestion is already building; show chance/range with estimated time to new congestion otherwise. Never present lambda>mu alone as a certain collapse countdown.

Keep Incoming work and Can process as main labels; explain lambda/mu in detail. Use patient/hour or task/hour correctly. Explain why an alert appeared, why an action may help, and what it costs or could worsen.

Render one selected-action/no-action forecast comparison with common axes and a Now marker. Conditional onset ranges and queue bands are separate. Complete-cohort ED time can use three-part bars plus a table; unfinished cohorts show accrued time/counts instead. Observed replay outcomes never silently replace predicted values.

## Accessible and resilient behavior

Visible DOM zone buttons provide the same drawer/camera selection. Dialog focus stays inside while open, Escape/cancel closes without submission, and focus returns to the opener. Announce important status changes, not every moving dot.

At 375/768/1024/1440 widths, the sidebar/drawer may stack or collapse, while status, owner approvals, and Back to overview remain reachable. Target 4.5:1 normal-text contrast and 44px primary targets.

Reduced motion uses static dots and immediate focus. Lost/unsupported graphics offers a matching 2D map/list with the same data, alerts, feeds, comparisons, and approval controls. This fallback does not replace the required 3D demo.

Use a declared render budget, exact overflow counts, and no hidden omitted patients. Target 30fps at 200 visible dots on the demo machine. Forecast/evaluation work must not freeze interaction.

Handle stale responses, lost backend, wrong role, missing owners, no help, and unknown information with clear next steps. Preserve last-valid age and selected action; stale grants require refresh. Stable conditions with high forecast risk still prompt preventive comparison.

## Required evidence

Playwright MCP checks every path above with real responses/events, patient identities/counts, camera/back behavior, owner routing, partial/stale decisions, all widths, keyboard/2D equivalence, reduced motion, context loss, performance, and deployed fresh-start behavior. Screenshots alone do not prove model correctness. No checks have run.

A short first-use session can inform labels and navigation if people are available; record human feedback separately. Neither automated checks nor a polished scene establishes clinical validity or flawless comprehension.

