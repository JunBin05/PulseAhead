# Prompt for the next Claude Code session

Paste this into a new chat. The working directory should be `C:\Users\xuzhe\Documents\PulseAhead\PulseAhead`.

---

Continue the PulseAhead build. Repo: `C:\Users\xuzhe\Documents\PulseAhead\PulseAhead`, branch `pulseahead-mvp`.

Read first, in order:
1. `CLAUDE.md`
2. The "START HERE" section at the top of `HANDOFF.md`
3. `UX_REDESIGN_BRIEF.md`
4. `PROBLEM_AND_SOLUTION.md`

Then check `git log --oneline -5` and `git status`. Expect `f8cd69c` or a later handoff commit, and a clean tree.

Goal: a functional, demo-ready product for a 3-minute Track 1 pitch. The guided demo must run beats A to F end to end on the real backend, and every number must come from an API response.

Do, in order (one commit each; smoke after each slice; update `HANDOFF.md`):
1. Build the frontend. Restart the backend without `--reload`. Run regression 01 (`evidence/01-regression.playwright-mcp.js`, via Playwright MCP `browser_run_code_unsafe` with `filename`) and `node evidence/18-smoke.mjs`. Fix anything the redesign broke.
2. Re-run the demo-partition evaluation (`node evidence/demo-partition-eval.mjs`) under engine flow-5, and update the evidence with the measured numbers.
3. In beat F, label plainly that the held-out result predates the surge action (flow-4). Do NOT run a new held-out evaluation without asking me.
4. Pitch polish:
   - shorter captions in beats C-E;
   - the Act tab top action as a decision card;
   - alert cards;
   - a check of the 2D list view.

   Re-check widths 375-1440, keyboard and reduced motion in Playwright, and save screenshots to `evidence/shots/`.
5. Measure 200 dots at 30 fps (best effort), and run `/code-review` on the latest commits.

Rules:
- Backend owns all state. No mocks, fake alerts or forced Best action.
- Bump `ENGINE_VERSION` on any engine change; seed 7 normal must stay 705 events / 59 patients.
- Never tune on test seeds.
- Keep the Synthetic label and the `data-testid` hooks.
- Write patch scripts with the Write tool, not shell heredocs.
- Commit with `git -c user.name=Vaas -c user.email=airscan.health@gmail.com commit ...` plus the session's attribution trailer.
- When done, push to both remotes: `git push xuzhe pulseahead-mvp` and `git push origin pulseahead-mvp:xuzhe-demo-redesign`. `origin`'s own `pulseahead-mvp` returns 403.
- Ask me before hosting (ticket 21) or a new held-out run. The rehearsal (ticket 22) is mine.
