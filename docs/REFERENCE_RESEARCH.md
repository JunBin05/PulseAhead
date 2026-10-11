# PulseAhead reference research

Historical design research. The newer wireframe makes 3D the primary presentation; use [current UX](PULSEAHEAD_3D_UX.md) and [the active spec](PULSEAHEAD_3D_MVP_SPEC.md) for build decisions. Domain references remain useful; the earlier prose-only layout recommendation is superseded.

Researched 10 October 2026. Public, first-party product pages, research publications, and project documentation. This is reference research, not application testing. No vendor application was operated, no demo was requested, and no usability or accessibility result is claimed.

## Best starting references

**LeanTaaS iQueue for Inpatient Flow** is the closest reference for a shared patient-flow overview. **GE HealthCare Command Center** is the strongest reference for showing capacity, boarding, and forecasts together. Use their operational ideas, then build a much smaller PulseAhead journey around the approved scope.

| Reference | Useful pattern | Public material | Limit |
|---|---|---|---|
| [iQueue for Inpatient Flow](https://leantaas.com/products/inpatient-flow/) | Overview → bottleneck → next action → follow-through | Product illustrations and embedded explainer | Actual product offered through a demo request |
| [GE HealthCare Command Center](https://www.gehealthcare.com/en-us/products/software/command-center) | Capacity states, boarding delays, forecast tiles | Tile previews and public catalog PDF | Public material does not expose the complete working application |
| [TeleTracking Hospital Command Center](https://try.teletracking.com/hospital-command-center/) | Visible transfer stages and resource ownership | Public process story and vendor-hosted case study | Some current main-site pages returned 403; older material is historical |
| [Qventus Inpatient Capacity](https://www.qventus.com/solutions/discharge-planning/) | Specific blockers linked to responsible teams | Product explanation and illustrated solution brief | EHR-based product; not a public interactive sandbox |

## 1. LeanTaaS iQueue: shared overview and clear next steps

The official page describes shared views of incoming demand, patient placement, likely discharges, staffing, and care barriers. It also describes capturing decisions and tracking follow-through. Its image descriptions identify summary counts, patient tables, a forecasted-ED-arrivals chart, and boarder categories. These are vendor descriptions, not a hands-on review. [Product page](https://leantaas.com/products/inpatient-flow/).

Public reference assets:

- [Flow overview illustration](https://leantaas.com/wp-content/uploads/2023/05/products-if-illustration1-min-1024x753.png).
- [Care progression illustration](https://leantaas.com/wp-content/uploads/2026/08/care-progression-700x475-1.png).
- [Admission planning illustration](https://leantaas.com/wp-content/uploads/2026/08/admission-planning-700x475-1.png).
- [Embedded 2024 explainer](https://player.vimeo.com/video/974501157?autopause=0&byline=0&color=&loop=0&muted=0&portrait=0&title=0); video content was not evaluated during this research.

**Design inference for PulseAhead:** use a few summary numbers above a simple flow view. Selecting a blocked stage should reveal its cause and relevant actions. Keep full patient tables behind a details button. Do not copy the entire hospital-wide product.

## 2. GE HealthCare: connect present pressure with future demand

GE's public product page separates capacity, patient coordination, boarding, and forecasting into named tiles. Capacity includes occupied, assigned, unassigned, and blocked states. Its Digital Twin description covers testing possible changes before committing resources. [Product page](https://www.gehealthcare.com/en-us/products/software/command-center).

The public catalog explicitly describes ED capacity pressure, lab/imaging sequencing, surge resources, boarding delays, and census forecasts. It also notes that information freshness depends on updates in source systems. These are vendor feature descriptions, not PulseAhead performance evidence. [Executive brief and tile catalog](https://www.gehealthcare.com/content/dam/gehc/global/products/software/command-center/outcomes/documents/command-center-outcomes-executive-brief-br-jb29667xx-en.pdf).

**Design inference for PulseAhead:** show usable spaces separately from physical spaces; connect ward blockage to ED boarding. Use one clearly labeled forecast chart with an uncertainty band. Keep the update time visible. Comparison should answer “What changes if we approve this action?” beside the current forecast.

## 3. TeleTracking: show what happens after a decision

TeleTracking's public campaign page describes patient placement, transport coordination, and discharge resource priorities. [Command-center overview](https://try.teletracking.com/hospital-command-center/).

A vendor-hosted Health First case study describes bed assignment followed by transport when a clinician marks a patient ready to move. It distinguishes occupied, cleaning, and available beds, and includes a patient-flow process diagram. The case was originally published in 2015 and sponsored by TeleTracking; it supports a historical workflow reference, not a claim about the current interface. [Case study](https://www.teletracking.com/wp-content/uploads/2023/09/teletracking-client-success-case-study-health-first-rand-pfq1.pdf).

An official registration page describes a Capacity Management Suite demo held on 12 October 2023. It is not evidence of a currently accessible recording or live demo. [Historical demo page](https://try.teletracking.com/capacity-management-suite-demo-registration/).

**Design inference for PulseAhead:** show transfer progress as “Waiting for ward bed → Bed reserved → Transport → Departed.” Approval should lead to a visible action status and elapsed time. Retain the ED-space count until physical departure. Do not add cleaning as a new simulation feature just because this reference includes it.

## 4. Qventus: make each bottleneck actionable

Qventus describes discharge planning, ancillary-service priorities, care gaps, and role-specific operational dashboards within existing EHR workflows. Its solution brief illustrates a sequence of discharge planning, progress checks, gap identification, and ancillary-order prioritization. [Product page](https://www.qventus.com/solutions/discharge-planning/), [two-page solution brief](https://www.qventus.com/wp-content/uploads/2024/10/Qventus_Solution-Brief_Inpatient.pdf).

**Design inference for PulseAhead:** name the blocked step and its approving role on each action card. Explain the operational reason in one sentence. Keep clinician decisions supplied as inputs, as already agreed; do not copy Qventus' clinical discharge prediction or autonomous EHR actions.

## Proposed simple PulseAhead journey

Two additional references help with visualization:

- **[Hospital Capacity Management Dashboard](https://hcm-dashboard.optimal-lab.com/about)**: the authors' [paper, Figures 4–5](https://arxiv.org/pdf/2403.15634) documents same-chart comparisons with and without intervention and a simple capacity timeline with detailed views available. Borrow that comparison pattern. Its multi-hospital, multi-week setting differs from our one-ED, 90-minute scope. The public interactive `/open` route could not be read by the research tool; its running behavior was not tested. The [authors' repository](https://github.com/flixpar/hospital-capacity-management-dashboard) provides another source for the documented features.
- **[HSMA patient-flow simulation examples](https://github.com/hsma-programme/simpy_visualisation)**: the project documents logged patient movement through queues/resources and healthcare pathway animations. Borrow the idea of showing where patients accumulate, using a simple stage view first. Its linked Streamlit app redirected to an authentication route in the research tool; the GitHub Pages version was unreadable there. Live access remains unconfirmed. Animated patient dots are optional after the core loop; a single replay animation is not evidence of average benefit.

This is our design recommendation, not an observed workflow verified in any vendor application:

1. **See the risk:** current status, congestion chance within 90 minutes, expected start range, and last update.
2. **See the cause:** Waiting → Treatment and tests → Awaiting departure, with counts and delays. Split discharge and ward transfer inside the final stage.
3. **Compare actions:** current plan beside one selected action, showing ED time, congestion risk, urgent-patient delay check, setup time, and resources.
4. **Review and approve:** responsible role, expected benefit, trade-offs, and approve/reject/defer choices.
5. **Follow progress:** review, setup, active, and completed status; predicted benefit stays separate from the result observed in replay.

Use a light interface, direct labels, labeled units, restrained alerts, and readable charts with a text alternative. Keep scenario settings and evaluation reports in a separate demo/evidence area. Avoid hospital-wide wallboards, unexplained scores, decorative gauges, and many competing charts.

## What to visualize in PulseAhead

These are product decisions drawn from the references, not copied interfaces or verified usability findings:

| User question | Simple visual |
| --- | --- |
| Where are patients stuck? | A stage strip: Waiting for assessment → Care and tests → Awaiting departure. Counts come from mutually exclusive received patient states. Show patients awaiting a space as a subset of the first stage; show diagnostic and ward delays inside their parent stage, not as extra patients. |
| When might congestion start? | One queue-over-time chart with observed history, a visible Now marker, dashed forecast, and labeled uncertainty. A queue threshold alone must not imply confirmed congestion; show the space and duration conditions alongside it. |
| What changes with an action? | Overlay no action and one selected action on the same time axis. Separately compare mean total ED time as horizontal bars, broken into the three agreed time components. Keep urgent delays, resources, and uncertainty visible beside them. |
| Has approval taken effect? | A review → setup → active → draining → completed progress strip, with blocked reasons and simulated timestamps. Capacity changes only when the backend says the action is active. |

Show one default comparison at a time; other action families remain reachable through the four action cards. Never draw all future branches on the main screen. Tables and short text summaries provide the same important values without hover. Incomplete stays show accrued time and unfinished counts, not full-stay savings bars.

The UI/UX chart guidance supports simple bars for precise comparisons and labeled text/table alternatives. Its first search favored radar charts for generic multi-variable comparisons, which does not fit this task; we retained the explicit grouped-bar alternative for comparable time values. This is targeted guidance, not a new product-wide style match.

## Evidence limits and next check

No public material here establishes that a complete operator journey is simple or obvious. Vendor outcome and accuracy claims must not become PulseAhead claims. The reference assets are inspiration; do not copy logos, patient data, proprietary UI assets, or vendor performance figures into the product.

Once PulseAhead exists, use Playwright MCP to check the complete journey, keyboard access, narrow screens, stale data, failed requests, blocked actions, deferred approval, and action progress. Passing those checks will establish demonstrated behavior, not staff comprehension; a short first-use session with unfamiliar people should also inform the wording and layout.
