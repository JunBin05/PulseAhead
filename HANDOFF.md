# HANDOFF: PulseAhead build

Updated 2026-10-10. Branch `pulseahead-mvp`. Repo root is `PulseAhead/Real/`.

## Goal and rules

Build the approved spec (`PulseAhead-Tickets/docs/PULSEAHEAD_3D_MVP_SPEC.md`, 22 tickets in `PulseAhead-Tickets/.scratch/pulseahead-3d/issues/`) in blocker order. Plans: `C:\Users\Vaas\.claude\plans\serene-nibbling-wirth.md` (master) and `continue-the-pulseahead-build-glistening-seahorse.md` (this session).

- Implement directly in the main session; no `/implement-spec`.
- `code-review` skill is the only review gate, after tickets 01 ✅, 06, 10, 11, 17, 19, 21.
- All verification goes through Playwright MCP. Tick a checkbox only with passing evidence.
- Stop at ticket 21 (needs an authorized hosting target) and at ticket 22 (rehearsal stays with the user).

## Done

- **Ticket 01** is complete: all 8 criteria pass, review gate passed and findings fixed. See `evidence/01-working-3d-replay.md`. The review's deferred items are listed there under "Deferred to the ticket that owns them" (02, 05, 06, 08); pick them up in those tickets.
- `DESIGN.md` ("The Charge Desk") and `.impeccable/design.json` are written. `impeccable detect` finds nothing.
- `CLAUDE.md` now lists the run, build, type-check and detector commands.

## Next

Ticket 02: walk-ins, critical entries and inbound ambulances. Blocked only by 01, which is done.
- Add a finite triage desk and a reserve team to the profile.
- Accept supplied acuity, urgency group and critical-bypass inputs.
- Route critical bypass straight into zone 2, using a space from the shared pool.
- Keep one identity per ambulance announcement across update, cancel, overdue ("delayed") and arrival.
- Show the ambulance count and the inbound patient total separately in the sidebar; this replaces the static "0" placeholder.
- Keep en-route patients out of the ED.
- Expose known incoming demand separately from background arrivals.

Controlled fixtures go through the API, kept separate from the staff workflow.

## Environment notes

- The backend runs with `backend/.venv/Scripts/python.exe -m uvicorn pulseahead.api:app --app-dir backend --port 8000`. Restart it after backend edits. Don't use `--reload` on Windows: its worker survived a restart and kept serving old code.
- Vite dev server on 5173; production build served from :8000 after `npm run build` (dist is detected at backend startup).
- Playwright MCP's Chrome window is visible on the desktop. A previous session's Chrome can lock the profile; stop only that Chrome process tree.
- The Playwright regression snippet for ticket 01 is `evidence/01-regression.playwright-mcp.js`. Copy it under `C:\Users\Vaas\Documents\Prototype\` to run it with `browser_run_code_unsafe` (`filename`).
- Stray old screenshots live outside the repo (`Prototype/evidence/shots/`, `Prototype/Real/evidence/shots/`); they were left untouched.
