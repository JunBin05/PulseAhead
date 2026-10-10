# 20: Make the 3D decision journey usable and reliable

**What to build:** A first-time user completes start → alert → focus → comparison → supervisor review → progress, with reliable keyboard/2D/reduced-motion alternatives and errors handled.

**Blocked by:** 17 — Rank actions (lite).

**Status:** ready-for-agent, lite (scope amendment 2026-10-11)

**Rubric focus:** Explainability and trust; seamless live UX.

### Criteria (scope amendment, final build)

- [ ] The journey works end to end: start → zone alert → focus → compare → owner review and approval → progress → effect, with the spec's next-step text for each state.
- [ ] Keyboard operation (dialog focus, Escape, focus return), reduced motion (camera jumps, static dots) and a 2D list view with the same counts, alerts, comparison and approvals.
- [ ] Widths 375/768/1024/1440: no horizontal scroll, 44 px primary targets.
- [ ] Guards: stale and late responses, reconnect, reset or load during a request, wrong-role, partial and stale grants.
- [ ] One Playwright MCP end-to-end journey on the final build (diagnostic-delay zone 3 alert → compare → approve as owner → delayed effect), plus regression 01.

Best-effort: the 200-dot / 30 fps measurement with forecast work running. Descoped: per-criterion Playwright MCP evidence and first-use feedback collection.

### Original criteria (reference only; superseded by the scope amendment)

- Use the supplied wireframe's header/left feed/central scene/right drawer consistently. Keep normal details, predictions, action comparison, owner grants, and actual progress easy to find.
- Stable but high forecast risk prompts preventive comparison; low risk prompts monitoring; building/confirmed/missing/no-help/active states have clear next steps.
- Keep review source time paused, selections preserved on stale changes, useful refresh/retry guidance, and no silent resume or duplicate action.
- Implement visible DOM zone controls, dialog focus/Escape/cancel/return, labeled controls/statuses, text/chart alternatives, 4.5:1 normal-text contrast, and 44-pixel primary targets.
- Support 375/768/1024/1440 widths. Reduced motion skips camera travel and uses static dots; lost/unavailable graphics switches to the equivalent functional 2D view.
- Measure the 200-visible-dot/30fps target and interaction while forecast work runs on the named machine. Lower visual detail, not data correctness; label overflow aggregates.
- Guard disconnect/reconnect, late/stale responses, source errors, reset/load reconciliation, wrong-role/partial/stale grants, and no-event countdown cases.
- Playwright MCP exercises the full good/degraded journey, every width, keyboard/camera/2D equivalence, frame and response performance, and actual scene/API/count agreement.
- Record specific behavior evidence and any available first-use feedback separately; do not claim flawless or clinically validated usability.
