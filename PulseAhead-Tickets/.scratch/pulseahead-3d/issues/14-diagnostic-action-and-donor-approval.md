# 14: Compare diagnostics with donor consent and effects

**What to build:** The correct lab/radiology manager compares diagnostic capacity and, for reallocation, obtains donor approval while seeing both ED and donor consequences.

**Blocked by:** 11 — Compare ward coordination and route supervisor approval.

**Status:** ready-for-agent, reduced (scope amendment 2026-10-11)

**Rubric focus:** Decision loop; urgent-aware actionability.

### Criteria (scope amendment, final build)

- [ ] Declare one reserve lab slot and one reserve imaging slot in the profile, owned by "Lab manager" and "Radiology manager". A request names lab or imaging; the receiving service determines the owner.
- [ ] Review 5 min, setup 15 min, then the shared 60-minute active / draining lifecycle from ticket 11. Tests are never shortened, results never manufactured; occupied tasks finish before the slot returns.
- [ ] The same paired comparison as ticket 11 (no action vs this action), showing diagnostic waits and total ED time.
- [ ] API smoke: on diagnostic-delay seed 7 the Radiology manager approves an imaging reserve slot and imaging capacity is 2 during the active window and back to 1 after draining; the Lab manager is refused for imaging.

Descoped: diagnostic donor reallocation, donor consent and donor urgent checks.

### Original criteria (reference only; superseded by the scope amendment)

- Use one declared reserve lab/imaging slot or a matching transferable donor slot; receiving service determines the manager role.
- Apply five-minute review and 15-minute setup, then the shared 60-minute active/draining lifecycle. Do not shorten clinical tests or manufacture results.
- Reallocation requires every distinct receiving/donor resource-owner approval; partial grants have no effect. Moving one slot subtracts it from the donor.
- Finish occupied tasks before taking/returning a slot. Preserve capacity, resource ownership, actual charged time, and stale-grant revalidation.
- Keep donor patients' supplied urgency, diagnostic wait, and paired task records; show donor costs and unavailable evidence next to ED benefit.
- Use actual capacity activation as the fast-track mechanism. Novel lab batching remains unavailable until explicitly modeled.
- Playwright MCP checks reserve/reallocation success and failure, wrong manager, partial/full/rejected donor grants, capacity conservation, setup loss, and donor urgent harm.
