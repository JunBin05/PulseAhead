# 10: Predict bottlenecks and explain the time remaining

**What to build:** Clicking a zone alert shows independent-future congestion estimates, a plain cause, chance/range, and a truthful estimated countdown tied to the selected zone.

**Blocked by:** 06 — Distinguish local overload from ED congestion; 07 — Inspect zones and focus the alert camera; 08 — Handle fresh, noisy, missing, and invalid inputs.

**Status:** ready-for-agent

**Rubric focus:** Forecast rigor; explainability; detection and urgency.

- [ ] Reconstruct fresh runners from plain received state/history; sample independent arrivals, elapsed-conditioned remaining work, and ward availability without copying a running simulation.
- [ ] Use only received inbound announcements with uncertain ETAs plus unannounced demand, without duplication or hidden actual arrival times.
- [ ] Refresh every five simulated minutes across 90 minutes plus the confirmation tail. Carry current interval history; forecast local overload separately from overall ED congestion.
- [ ] Start with 50 futures, compare with 100 at development checkpoints, and expose versions, settings, sample counts, no-event fractions, and conditional 90% onset ranges.
- [ ] Show the spec's estimated median-onset countdown with source time/range/chance; no lambda>mu-only timer, negative countdown, or new-onset timer for building/confirmed intervals.
- [ ] The selected-zone panel says why the alert appeared using real queues/resources/rates. Separate local risk, overall risk, and model explanation from observed facts.
- [ ] Prioritize alerts by intervention deadline then supported patient impact; unknown impact remains unavailable. Keep the map interactive and pending/stale/error responses truthful.
- [ ] Playwright MCP compares identical received states with changed hidden futures, checks known ETA vs private arrival isolation, local/global horizon cases, building-confirmation probability, and displayed explanation/source agreement.
- [ ] Benchmark 50/100 samples, forecast latency, and a full development shift through Playwright MCP; predeclare balanced evaluation size from measured cost before final outcomes.

