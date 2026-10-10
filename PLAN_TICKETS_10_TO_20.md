# PulseAhead: finish ticket 10, then tickets 11 to 20

## Context

`PulseAhead/Real`, branch `pulseahead-mvp`. Tickets 01-09 are committed (HEAD `d7b2b37`). Ticket 10 (forecast and alert panel) is written but uncommitted and unverified. The request is to verify and commit it, run its review gate, then build 11 -> 20 in blocker order, one commit per ticket, verified only through Playwright MCP against the real app. Stop before ticket 21 (hosting); ticket 22 stays with the user.

This session was in plan mode, so everything below was read-only orientation. No restarts, builds, or Playwright runs have happened yet.

## What was checked (all read-only)

- `git log`: HEAD is `d7b2b37`, matching HANDOFF.md.
- `git status` / `git diff --stat`: modified `backend/pulseahead/{api,engine,replay}.py`, `frontend/src/{App.tsx,api.ts,app.css,types.ts}` and `HANDOFF.md` (the WIP section is itself uncommitted); new `backend/pulseahead/forecast.py` (1157 lines), `frontend/src/Forecast.tsx` (570 lines), `evidence/shots/10-first-look.png` (exploratory, not evidence). This matches the "Ticket 10 WIP" section.
- Diff coherence: `engine.py` only adds `tests_required` to the public patient record (null until tests are ordered). `replay.py` adds a cached `forecast()` (keyed by version and samples, built under the session lock, sampled outside it) and `forecast_explain()`. `api.py` adds `POST .../forecast` and `.../forecast/explain` (409 on stale version). `App.tsx` wires the strip, alert list, zone-button forecast line, drawer panel and a 50/100 selector. Keep it; nothing contradicts the spec.
- `forecast.py` parses (`ast.parse`). It builds from `snapshot` plus received events only, with futures keyed `fc:{seed}:{k}:{patient}` and an independent seed. Monitor episodes are appended only on confirmation, so "new onset" means a confirmed onset, as the spec intends.
- Listeners: :8000 (pid 21620) and :5173 (pid 36112). The :8000 backend predates the last `next_step` edit, so it must be restarted.

## Step 0: preflight (first actions after approval)

1. `py_compile` `forecast.py`; `cd frontend && npx tsc --noEmit && npm run build`.
2. Kill every `python.exe` whose command line contains `uvicorn pulseahead.api:app`, confirm `netstat` shows :8000 free, start the backend from `Real/` (hidden, log `%TEMP%\pulse-backend.log`).
3. Confirm Playwright MCP loads a page. If the profile is locked, stop only Chrome processes whose command line contains `mcp-chrome-ac24c5d`.

## Step 1: finish ticket 10

- **Q10** in `OPEN_QUESTIONS.md`: sampled hidden attributes from disclosed assumptions, arrival and turnaround adjustment, bed release, alert-list click focuses its zone, provisional warning threshold 0.4, provisional action per service for the deadline, `tests_required` exposure, explanation keyed to a cached version.
- **Evidence snippets** (small files, one concern each, in `evidence/10-*.playwright-mcp.js`):
  - `10-isolation`: `fixture-hidden-future-a`/`-b` give identical forecasts at T+60 and T+70 (ignoring replay id and `compute.ms`) and differ at T+120; plus a private arrival time vs announced ETA case; no hidden fields in input or output.
  - `10-horizon`: `fixture-congestion-boundary` (overall 31/51/85, local space 31/41/103), `fixture-queue-surge`, `fixture-diagnostics-gap` (Cannot assess for imaging), `fixture-feed-staffing-stop` (`cannot_assess`). Building shows confirmation chance with no countdown, confirmed shows recovery, no negative or lambda>mu-only timer, an expired estimate shows refresh.
  - `10-ui`: strip, zone-button line, alert list, drawer explanation and source line equal `/state`, `/zones` and `/forecast` at the same version per step; alert ordering (deadline, then affected count; recovery and unknown apart); pending/stale/error via `page.route` delay and abort on `**/forecast`; map stays interactive.
  - `10-bench`: 50 vs 100 samples (latency, onset-chance difference on `diagnostic-delay`, `busy-recovers`, `arrival-surge` development seeds) and one full seed 7 normal shift to T+720 forecasting every 5 min. Record machine and timings; predeclare the evaluation size (14 tuning + 28 test, fallback 7 + 7) from the measured cost.
- **Regression**: `01` always; `02`-`05`; `06-*` (pressure engine + seed7, ui, zone4, label-geometry); `07-zones`. The strip and zone-button line change layout, so re-check 375/768/1024/1440 widths and label overlap.
- Write `evidence/10-forecast-and-alert-panel.md` (pass/fail/not-run, seed/fixture/version, expected vs actual). Tick only passed boxes, set ticket status, update HANDOFF.md, commit `ticket 10: Predict bottlenecks and explain the time remaining`.
- **Gate**: `code-review` skill with subagents (allowed for gates only); fix in-scope findings, re-verify, commit `review: fixes after ticket 10 gate`.

## Step 2: tickets 11 -> 20 (blocker order, one commit each)

Each ticket: read its file and the spec sections, add an `OPEN_QUESTIONS.md` entry for each ambiguous rule, backend + API + UI together, split evidence snippets, regression 01 (plus 02-07 and label-geometry when flow, shapes or labels change), update HANDOFF.md, commit `ticket NN: <title>`.

**11 (gate after): ward coordination and approval. This builds the shared action machinery that 12-16 reuse.** Proposed design, to confirm against the code at the start of the ticket:
- *Elastic capacity*: reuse `forecast.Future(extra=...)`. For timed activation, hold the extra slots with top-priority dummy requests, release them at activation, and re-acquire them at expiry so occupied work drains without eviction. The same mechanism goes into `engine.py` for the replay, as a capacity-change hook that emits `action_*` events.
- *Paired comparison*: extend `Future`/`outcome()` to export per-patient arrival, first assessment, effective disposition, departure (total ED time, urgent initial wait, overdue count), the cohort (present at decision plus 90 min of arrivals, background arrivals continuing) and a follow-up cap of 12 h. Pair by `fc:{seed}:{k}:{patient}`, which already exists.
- *Requests*: a versioned request object in `ReplaySession` with required owner roles resolved from `profile.py` resource ownership (not zone), per-role decision identities (idempotent), pending/granted/rejected/deferred/stale/escalated states, one in-flight action, 5 min review, setup, 60 min active, draining, terminal; 20 min start gap.
- *Replay determinism*: decisions enter the saved record's `choices` (the placeholder from ticket 09) and load must re-verify; bump `ENGINE_VERSION`; the no-action path must stay bit-identical (seed 7 normal: 705 events, 59 patients).
- *UI*: comparison panel opened from a zone alert (pauses replay, shows source time, Refresh comparison on stale), demo-role switcher, approve/reject/defer, progress. No "Best action" label until 17.
- Then the ticket's Playwright checks: allocation-backlog success, unavailable bed, wrong owner, concurrent and duplicate approvals, setup resource loss, actual timing.

**12** discharge slot, **13** four staffed surge spaces (needs closing-space behaviour in `SpacePool`), **14** diagnostics with donor consent (all distinct owners must grant; capacity conservation), **15** triage desk, **16** reserve physician: each reuses 11's machinery with its own eligibility and checks.

**17 (gate after)**: ranking: exact whole-future bootstrap (1,000 resamples, recorded seed), nearest-rank p90, singleton and empty-cohort handling, 20-future minimum gate, donor checks, deadline and recovery labels; No action shown to help / Needs review / Cannot assess; verify panel vs export. **No forced winner.**

**18**: forecast evaluation on tuning/test shifts (matching, lead time, false warnings, reactive and simple-flow baselines, noise and missing-feed cases) with progress and cancel; independently recompute metrics from exported records. Size from the step-1 benchmark.

**19 (gate after)**: policy benefit and operational value vs no action and fair simple baselines on matched shifts; patient-minutes and resource-hours only; keep unfavorable results.

**20**: journey, keyboard/2D/reduced-motion fallback, widths 375-1440, 200-dot/30 fps measurement, failure-path guards.

## Stop points and constraints

- Stop before **21** and ask for an authorized hosting target; leave **22** to the user.
- No unit-test files, no mocked engine; follow spec and tickets only. Subagents only for gates (10, 11, 17, 19, 21).
- Tooling: patch scripts via the Write tool run with `node` (source files are CRLF); stage snippets as UTF-8 without BOM with leading `//` lines stripped, copied to `Prototype/.playwright-mcp/`; `/advance` max 60 min per call; commit with `git -c user.name=Vaas -c user.email=airscan.health@gmail.com commit` plus the attribution trailer from the session reminder.
- Keep HANDOFF.md current after each ticket and before the session ends.

## Risks to watch

- **Scope**: tickets 11-20 are large; the handoff must be left accurate if the session ends mid-ticket (commit a `WIP ticket NN` marker only with an honest "unverified" note, as earlier sessions did).
- **Layout regressions**: any label or strip change has failed regression 01 before; re-run 01 and `06-label-geometry` after UI changes.
- **Forecast cost**: 100 futures took about 0.45 s; the comparison (six actions plus no action, up to 12 h follow-up) must meet the 5 s target, so measure before committing to the sample size.
- **No-effective-action family**: tickets 17 and 19 must verify that no action shows a benefit there and change its parameters if one does (recorded in Q9).
