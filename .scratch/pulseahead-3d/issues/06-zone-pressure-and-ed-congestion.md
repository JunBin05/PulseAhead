# 06: Distinguish local overload from ED congestion

**What to build:** An operator sees green/yellow/red/unknown zone states and a separate overall ED status, with sustained congestion and recovery detected correctly.

**Blocked by:** 02 — Show walk-ins, critical entries, and inbound ambulances; 03 — Model doctor assessment and shared staffing; 04 — Show diagnostic queues and return to the doctor; 05 — Show cleared discharge and constrained ward exits.

**Status:** ready-for-agent

**Rubric focus:** Detect and categorize; false-alert rigor.

- [ ] Implement the active spec's local queue/blocked-resource rules and recorded thresholds, with local onset/confirmation and ten-minute qualifying duration for either trigger. Clear only after five continuous minutes below the queue threshold with required capacity available; missing inputs cannot establish recovery.
- [ ] Confirm overall ED congestion only after zero available staffed spaces and at least six awaiting a space persist for 20 minutes; store original onset and confirmation separately.
- [ ] Show Building congestion before confirmation; clear overall episodes after fewer than three await a space for ten minutes without requiring an empty bed.
- [ ] Expose received incoming work and model-based staffed service capacity in matching units, with recent throughput separately. Unknown inputs do not become infinite rates/countdowns.
- [ ] Show triage/assessment rates per patient-hour and lab/imaging per task-hour; separate departure pathways and constraints.
- [ ] Node colors/ALERT bubbles follow model state, not dot pixel density. Use text/icons; a local diagnostic alert does not automatically declare overall ED congestion.
- [ ] Categorize triage/arrival, physician/space, diagnostics, departure/ward/transport, and mixed failures with source evidence and affected counts.
- [ ] Playwright MCP checks short bursts, exact local/global timing boundaries, recovery, zero-capacity waits, idle-service capacity, rate units, and diagnostic-only alerts.

