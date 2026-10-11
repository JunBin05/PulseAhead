# 12: Compare cleared ED discharge support

**What to build:** A resource-owning bed manager compares extra cleared-discharge processing, makes the required choice, and sees its delayed effect on real ED departures.

**Blocked by:** 11 — Compare ward coordination and route supervisor approval.

**Status:** ready-for-agent

**Rubric focus:** Actionability; operational benefit.

- [ ] Add one discharge-processing slot using declared reserve support, with five-minute review, ten-minute setup, and the shared 60-minute/expiry rules.
- [ ] Only already-cleared ED discharges with completed prerequisites are eligible; this is not inpatient clinical discharge or manufactured ward-bed release.
- [ ] Route to the profile's owner role and use common versioned requests, decisions, resource checks, pairing, and incomplete-follow-up rules.
- [ ] Show departure-delay/total ED changes, urgent effects, resources, and preventive/recovery timing in the shared panel.
- [ ] Physical departure still frees the ED bed; extra capacity does not shorten clinical tasks or instantly complete discharge.
- [ ] Playwright MCP checks useful/blocked/ineffective cases, uncleared patients, missing support, owner approvals, setup boundaries, and paired departure/time records.

