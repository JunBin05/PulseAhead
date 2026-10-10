# 05: Show cleared discharge and constrained ward exits

**What to build:** A supervisor sees patients in disposition wait for actual discharge or a suitable Ward/ICU bed and transport, with whole ED time recorded.

**Blocked by:** 03 — Model doctor assessment and shared staffing.

**Status:** ready-for-agent

**Rubric focus:** Operational value; coupled model rigor.

- [ ] Model supplied effective disposition/clearance, finite home-discharge processing, ward-allocation work, suitable Ward/ICU beds, and transport.
- [ ] Eligibility requires completed care prerequisites and a received decision. Coordination cannot create clearance or a ward bed.
- [ ] Reserve a suitable receiving bed during transfer; release the ED bed only at physical departure. Keep unavailable/unsuitable-bed and transport reasons visible.
- [ ] Zone 4 branches to home and Ward/ICU exits. Boarding keeps the ED bed/coverage and can grow upstream waiting.
- [ ] Save arrival, first assessment, effective disposition, and departure timestamps. Report total ED time and its three mutually exclusive parts, by reporting urgency group.
- [ ] Record concrete finite ward pool/release assumptions; no unlimited downstream sink. Keep unfinished/capped stays visible.
- [ ] Playwright MCP verifies discharge, suitable/unsuitable/unavailable ward/ICU beds, transport, boarding, physical departure, and independently calculated time components.

