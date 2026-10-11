# 23 - LLM analyst and planner (Groq)

**Blocked by:** 11, 14, 17 (comparison, request and ranking machinery).
**Status:** built and smoke-verified against a stubbed model output; live Groq output not yet run (needs `GROQ_API_KEY`).

## Delivers

An operator opens the comparison, asks the analyst, and reads cited causes, proposals the simulation has
priced and ranked, and a separate list of untested ideas. Numbers and rank labels always come from the
paired comparison; the model supplies none.

## Rules

- Evidence index is built only from the received snapshot, forecast and comparison. Causes cite its keys;
  uncited or unknown claims show as unknown; invalid keys are removed.
- A proposal naming a declared, feasible reserve is priced by the existing `compare()` and requested through
  the existing request/approval flow (approvers from resource ownership).
- Anything else (combinations, ideas without a resource) is an untested idea: no number, rank or approval.
- Clinical-decision wording and effect-size claims are dropped and listed under "not shown".
- No key, timeout or malformed output: status `unavailable`, comparison unaffected. A recorded analysis
  (`demo_analysis.json`, via `record_analysis.py`) is shown only when labeled recorded.
- Declared reserves added: reserve transport team (TR2), reserve discharge-processing slot (DP3), both owned
  by Ward supervisor / bed manager. Presets `transport_coordination`, `discharge_support`.

## Acceptance (checked by `evidence/23-smoke.mjs`)

- [x] Transport and discharge presets are feasible only when decided patients wait, are priced on paired futures and route to the owner.
- [x] `POST /replays/{id}/analysis` is versioned; a stale `expected_version` returns 409.
- [x] Uncited "supported" causes are downgraded to unknown; invalid citations removed.
- [x] Clinical wording and effect-size ideas are rejected and listed; combinations are untested ideas.
- [x] A structured proposal's rank equals the comparison row's rank.
- [x] No key: `unavailable`, comparison still returned.
- [x] Live Groq output (`openai/gpt-oss-120b`) passes the same structural checks (`MODE=live`).
- [x] Recorded demo analysis shipped for mixed-cascade seed 3052 at T+285 (`demo_analysis.json`).
