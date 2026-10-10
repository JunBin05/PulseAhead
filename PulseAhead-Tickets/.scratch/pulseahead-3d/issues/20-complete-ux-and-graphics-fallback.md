# 20: Make the 3D decision journey usable and reliable

**What to build:** A first-time user completes start → alert → focus → comparison → supervisor review → progress, with reliable keyboard/2D/reduced-motion alternatives and errors handled.

**Blocked by:** 07 — Inspect zones and focus the alert camera; 17 — Rank six actions by benefit, urgent delays, and time to act.

**Status:** ready-for-agent

**Rubric focus:** Explainability and trust; seamless live UX.

- [ ] Use the supplied wireframe's header/left feed/central scene/right drawer consistently. Keep normal details, predictions, action comparison, owner grants, and actual progress easy to find.
- [ ] Stable but high forecast risk prompts preventive comparison; low risk prompts monitoring; building/confirmed/missing/no-help/active states have clear next steps.
- [ ] Keep review source time paused, selections preserved on stale changes, useful refresh/retry guidance, and no silent resume or duplicate action.
- [ ] Implement visible DOM zone controls, dialog focus/Escape/cancel/return, labeled controls/statuses, text/chart alternatives, 4.5:1 normal-text contrast, and 44-pixel primary targets.
- [ ] Support 375/768/1024/1440 widths. Reduced motion skips camera travel and uses static dots; lost/unavailable graphics switches to the equivalent functional 2D view.
- [ ] Measure the 200-visible-dot/30fps target and interaction while forecast work runs on the named machine. Lower visual detail, not data correctness; label overflow aggregates.
- [ ] Guard disconnect/reconnect, late/stale responses, source errors, reset/load reconciliation, wrong-role/partial/stale grants, and no-event countdown cases.
- [ ] Playwright MCP exercises the full good/degraded journey, every width, keyboard/camera/2D equivalence, frame and response performance, and actual scene/API/count agreement.
- [ ] Record specific behavior evidence and any available first-use feedback separately; do not claim flawless or clinically validated usability.

