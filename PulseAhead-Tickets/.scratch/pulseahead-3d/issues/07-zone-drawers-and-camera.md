# 07: Inspect zones and focus the alert camera

**What to build:** A user selects a normal or overloaded zone, reads real zone details, focuses the alert area, and returns to overview without changing patient flow.

**Blocked by:** 04 — Show diagnostic queues and return to the doctor; 05 — Show cleared discharge and constrained ward exits; 06 — Distinguish local overload from ED congestion.

**Status:** done. Evidence: [evidence/07-zone-drawers-and-camera.md](../../../../evidence/07-zone-drawers-and-camera.md) (all 7 criteria pass; Playwright MCP, 2026-10-10)

**Rubric focus:** Explainability; clear UX; live execution.

- [x] Normal-zone selection opens count/roster, assigned on-duty doctors/nurses, queues, relevant capacity/bed use, and freshness from a versioned zone response.
- [x] Zone 1 states that it has no treatment beds. Zones 2/3 disclose their shared ED-bed pool rather than adding capacities or duplicate patients.
- [x] Alert selection smoothly focuses the selected zone and opens its drawer; a normal selection need not zoom. Visible DOM zone buttons provide the same access.
- [x] Back to overview restores the overview camera without resetting replay, decisions, or active actions. Camera changes never mutate simulated time.
- [x] Switching alerts updates zone/title/source version together. Reset clears obsolete selections; normal updates retain the selection without confusing old data with current state.
- [x] Use readable overlays/callouts that do not cover controls, and a short cause/blocked-reason summary. No auto-zoom on every warning.
- [x] Playwright MCP checks normal/alert selection, focus/back, switching, keyboard access, roster/API agreement, source versions, and unchanged engine state during camera moves.

