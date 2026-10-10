# Ticket 23 - LLM analyst and planner: smoke-verified, not per-criterion

Fixture/version: scenario `busy-recovers`, seed 7, advanced until transport is feasible (T+245); engine `flow-5`; API `v1`.
Backend started with `PULSEAHEAD_ANALYST_STUB=evidence/23-stub-analyst.json` (validator boundary check, no network), then with no key.

| Check | Result |
|---|---|
| `MODE=stub node evidence/23-smoke.mjs` | pass, 22/22 |
| `MODE=nokey node evidence/23-smoke.mjs` | pass: `unavailable`, comparison intact |
| Regression `evidence/11,14,17,18-smoke.mjs` | pass (11 and 17 `not_modeled` count updated 4 to 3) |
| `npx tsc --noEmit`, `npm run build` | pass |
| Playwright MCP: Act tab > Compare > Ask the analyst | panel renders causes, untested ideas, "not shown" list; screenshot `evidence/shots/23-analyst-panel.png` |

**Not run:** live Groq output (no `GROQ_API_KEY` in this session); recording the demo analysis. A defect found by the UI check and fixed: the clinical deny-list matched "day surgery" in an operational idea; it now matches only performing or ordering a procedure.

Note: the stub output is test input written for the validator, not model output. The "proposals the simulation priced" section was empty in the UI run because transport was not feasible at T+22; the priced path is covered by the API smoke at T+245.

## Live run (added)

`MODE=live node evidence/23-smoke.mjs` against real Groq (`openai/gpt-oss-120b`, key in git-ignored `backend/.env`): pass.
`record_analysis.py mixed-cascade 3052 285` recorded the demo analysis; re-validated against live evidence: 4 causes (one invented citation, `service.imaging.pressure_signal`, dropped), 3 priced proposals (imaging reserve, surge space, discharge reserve), 3 untested ideas, 0 rejected. A first attempt hit HTTP 429; `call_model` now waits the advertised retry-after (capped 8 s) before its one retry. The model also cited `reserve.*.feasible` keys that were not in the evidence; they are now added to the index.
