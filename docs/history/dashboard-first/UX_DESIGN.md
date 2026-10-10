# PulseAhead interface direction

Status: design requirements for implementation; no screen or usability result has been verified yet.

The product should answer four questions in order: **What is happening? Why? What can help? What am I approving?** Good UI/UX is required from the first working frontend/backend ticket.

## Main view

- A short purpose statement: "Predict ED congestion and compare actions before patients wait longer." Explain ED as emergency department on first use.
- A visible Synthetic demo label, replay time, and last update.
- A clear status and a few main numbers: Congestion chance, Expected start, Patients waiting for a treatment space, and Available staffed spaces. Explain the last as empty spaces with staff available. Building congestion instead shows the chance that its existing interval will confirm, without a future-onset countdown.
- A short explanation of the main constraint, backed by visible current inputs.
- Four comparable action cards showing eligibility, review/setup delay, expected benefit, urgent-patient effects, and resource use. Show blocked reasons and no-help outcomes clearly.
- A review panel before staff choice. After approval, show review/setup progress and actual action status; the backend decides eligibility and activation.

Put patient time breakdowns, assumptions, replay settings, raw events, and evaluation detail in expandable sections or a separate demo/evidence panel. Keep the main decision view readable. Do not hide evidence needed to understand uncertainty or urgent-patient trade-offs.

## Reference-based layout

The [reference research](REFERENCE_RESEARCH.md) recommends iQueue for the shared flow overview, GE Command Center for capacity/delay summaries, and the hospital-capacity research dashboard for no-action versus intervention charts. Public materials support these patterns; complete vendor journeys were not tested.

Use one main screen, in this order:

1. **What is happening?** Status, congestion chance or building-confirmation chance, expected start when applicable, and freshness. Put the relevant Compare actions or Monitor next step here.
2. **Where is the delay?** A simple patient-stage strip: Waiting for assessment → Care and tests → Awaiting departure. Show current counts and one short bottleneck reason. Patients awaiting a space are a subset of the first stage. Diagnostics and boarding stay inside their parent stages so patients are not counted twice.
3. **What can help?** Four action cards with a consistent field order. Selecting one reveals its no-action comparison on the same screen. Only a supported Best action gets the recommended treatment; otherwise explain Needs review or no help.
4. **What am I approving?** Open the paused review panel with role, delay, resources, benefit, and urgent effects. Approve/reject/defer remains a clear staff choice.
5. **What happened next?** Show review/setup/active/draining/completed or blocked progress and timestamps. Keep predicted effects separate from observed replay outcomes.

Use one queue timeline with observed history, a Now marker, dashed forecast, and clearly labeled uncertainty. Comparing an action adds a distinguishable second forecast using the same axes, with no action as the reference. Queue crossing alone is not confirmed congestion: retain the available-space and 20-minute conditions in the explanation. Show the conditional onset range separately from the queue band.

For patient time, use two horizontal bars for no action and the selected action, split into initial wait, care/tests, and awaiting departure. Use the same complete cohort and units; incomplete follow-up shows accrued time and unfinished counts instead. Urgent delay checks and resource costs stay next to the benefit, not behind a hover. Provide a readable table and text summary for each chart.

The first-time path starts with a ready fictional profile and a simple Start demo control. Detailed scenario changes and evaluation runs stay in the demo/evidence panel. Extra maps, 3D hospitals, many charts, and animated patient dots are optional after the required loop. The stage strip itself updates from real received state.

## Visual system

Use a calm light dashboard with white panels, slate text, and a restrained teal or blue accent. Use one readable system font, 16-pixel base text, clear heading levels, consistent spacing, and aligned numbers with units. Avoid competing visual styles and excessive motion. Exact colors remain subject to Playwright contrast checks.

Stable, building congestion, congested, recovered, Cannot assess, pending, and Needs review each have a text label and a distinct icon/visual treatment. Do not rely on red/green alone. Forecast charts use clearly labeled ranges and legends, with a text/table alternative.

Keep layout usable at 375, 768, 1024, and 1440 pixels. Narrow layouts may stack sections and collapse detail; primary status and decisions remain available without page-level horizontal scrolling.

## Interaction rules

- Use explicit button labels and a clear primary next step. Preserve keyboard focus and provide labeled controls.
- Show pending feedback immediately, keep the layout stable, and prevent repeat submission while a choice is in progress.
- Backend responses expose state version, freshness, action status, and a useful blocked/error reason. Repeating the same approval identity cannot start another activation.
- Preserve useful last-known information with its timestamp after a failed request; provide retry/reconnect guidance and make its age clear.
- Missing data is Cannot assess, not a zero-risk number. No feasible or sufficiently supported action is a valid result, not a broken screen.
- Approval review shows the role, requirements, review/setup time, benefit uncertainty, urgent delays, and costs before the staff choice.
- Pause replay when comparison/review opens, show its source simulated time, and preserve the selected action on updates. Disable outdated approval with Refresh comparison. Closing review does not silently resume replay; reading the screen does not consume the modeled review delay.
- Use Simulated minutes on forecast and action delays, and Urgent delay check on cards. Best action requires supported positive benefit and passing ED/donor urgent-delay checks; explain No action shown to help and Needs review plainly.
- Offer a clear next step: stable with forecast risk at/above the warning threshold → compare preventive actions; stable below it → monitor; building → compare with timing shown; confirmed → compare recovery actions; Cannot assess → inspect inputs; blocked/no help → inspect the reason; action underway → monitor progress.
- Move focus into review dialogs, keep it inside while open, close on Escape/cancel without submitting, and return focus to the opener. Announce meaningful status changes without reading every replay tick.

## Required evidence

Playwright MCP checks the full decision journey, all target widths, keyboard focus/dialog behavior, labels and units, loading/empty/error/retry states, stale results, repeated approval requests, normal-text contrast of at least 4.5:1, and primary control targets of at least 44 pixels. Record expected/actual results and screenshots/responses; do not claim a flawless experience from automated checks alone.

Design basis: the UI/UX skill's product-wide searches returned marketing or wellness layouts that did not fit an ED operations console. This direction uses its general readability, accessibility, feedback, and responsive-layout guidance plus the agreed PulseAhead decision journey. It is a deliberate fallback, not a claimed database match or a completed usability study.
