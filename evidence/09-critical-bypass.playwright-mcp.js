// Playwright MCP snippet used for the ticket 09 evidence (critical-bypass coverage across test seeds). Run with
// browser_run_code_unsafe (Playwright MCP); not a standalone test runner. Expects the production build on :8000.
// 09-scenarios part A runs each family on one test seed; two of those runs had no critical arrival. This runs
// every test seed of every family to 600 min and counts critical-bypass arrivals that enter zone 2 directly.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), checks: {}, problems: [], data: {} };
  await page.goto(BASE + '/');
  const out = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const cat = await fetch('/api/v1/scenarios').then(r => r.json());
    const res = {};
    for (const s of cat.scenarios) {
      res[s.id] = [];
      for (const seed of s.seed_partitions.test) {
        const c = await post('/api/v1/replays', { scenario: s.id, seed });
        for (let t = 0; t < 600; t += 60) await post(`/api/v1/replays/${c.replay_id}/advance`, { minutes: 60 });
        const ev = (await fetch(`/api/v1/replays/${c.replay_id}/events`).then(r => r.json())).events;
        const crit = ev.filter(e => e.type === 'arrival' && e.payload.critical_bypass);
        res[s.id].push({ seed, critical: crit.length, directToZone2: crit.every(e => e.payload.zone === 2), announced: ev.filter(e => e.type === 'ambulance_announced').length });
      }
    }
    return res;
  });
  R.data = out;
  const all = Object.entries(out);
  R.checks.everyFamilyHasCriticalBypassOnSomeTestSeed = all.every(([, l]) => l.some(x => x.critical > 0)) ? 'pass' : 'FAIL';
  R.checks.everyCriticalEntersZone2 = all.every(([, l]) => l.every(x => x.directToZone2)) ? 'pass' : 'FAIL';
  R.checks.everyRunHasAnnouncements = all.every(([, l]) => l.every(x => x.announced > 0)) ? 'pass' : 'FAIL';
  R.problems = Object.entries(R.checks).filter(([, v]) => v !== 'pass').map(([k]) => k);
  R.summary = Object.fromEntries(all.map(([k, l]) => [k, l.map(x => x.critical).join('/')]));
  delete R.data;
  return R;
}
