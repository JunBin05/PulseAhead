# 08: Handle fresh, noisy, missing, and invalid inputs

**What to build:** An operator can tell whether predictions have usable data, while faulty events and ambulance announcements cannot corrupt the observed state.

**Blocked by:** 01 — Start a real four-zone 3D ED replay; 02 — Show walk-ins, critical entries, and inbound ambulances.

**Status:** done

**Rubric focus:** Predictive rigor and data robustness.

- [x] Process identities, event/received times, patient/resource payloads, deduplication, and valid transitions only when received. Preserve newer state against out-of-order updates.
- [x] Keep source-specific heartbeats/update times. A healthy replay/ambulance heartbeat cannot refresh stopped queue, space, or staffing information.
- [x] Missing essential information or an update older than ten simulated minutes shows Cannot assess; optional/stale inbound or diagnostic data carries explicit limitations.
- [x] Distinguish impossible values/transitions from extreme but valid delays or demand surges. Reject/quarantine invalid inputs with a reason; do not discard genuine outliers to reduce false alarms.
- [x] Expose controlled noise, delayed/duplicate/missing events, ETA faults, and invalid-count fixtures through the application boundary, separate from staff controls.
- [x] Preserve last-valid state with its age during failures; show short recovery/retry guidance and restore assessment after valid updates resume.
- [x] Playwright MCP checks healthy aggregate heartbeat plus stopped staffing, exact freshness boundary, duplicates/out-of-order data, valid outliers, impossible transitions, and recovery.

