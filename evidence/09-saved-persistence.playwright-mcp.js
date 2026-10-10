// Playwright MCP snippet used for the ticket 09 evidence (tampered and restarted saved runs). Run with
// browser_run_code_unsafe (Playwright MCP); not a standalone test runner. Expects the production build on :8000.
// PART 'A': two tampered copies of a saved record (event digest changed; seed changed) must be refused.
// PART 'B': after a backend restart, the saved runs are still listed and load to the same events.
// Set IN_PROGRESS and COMPLETED to the saved ids written by 09-scenarios part B.
async (page) => {
  const PART = 'A';
  const IN_PROGRESS = '414ebcf3252f', COMPLETED = '4d100c5479f0', SEED = 2033;
  const R = { at: new Date().toISOString(), part: PART, checks: {}, problems: [], data: {} };
  const chk = (name, ok, detail) => { R.checks[name] = ok ? 'pass' : 'FAIL ' + JSON.stringify(detail).slice(0, 300); if (!ok) R.problems.push(name); };
  const get = (p) => page.evaluate((p) => fetch(p).then(r => r.json()), p);
  const post = (p, b) => page.evaluate(async ([p, b]) => { const r = await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; }, [p, b]);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  await page.goto('http://127.0.0.1:8000/');
  if (PART === 'A') {
    for (const [id, why] of [['aaaaaaaaaaaa', 'digest'], ['bbbbbbbbbbbb', 'seed']]) {
      const r = await post(`/api/v1/saved/${id}/load`, {});
      chk(`tampered (${why}) is refused with 409 and a reason, nothing approximated`, r.s === 409 && /does not reproduce/.test(r.j.detail || ''), r);
      R.data[why] = r.j.detail;
    }
    const ok = await post(`/api/v1/saved/${IN_PROGRESS}/load`, {});
    chk('the untampered record still loads (200)', ok.s === 200 && ok.j.saved_run.id === IN_PROGRESS, ok.s);
  } else {
    const list = await get('/api/v1/saved');
    const ids = list.saved.map(s => s.saved_id);
    chk('saved runs survive the restart and are listed', ids.includes(IN_PROGRESS) && ids.includes(COMPLETED), ids);
    for (const id of [IN_PROGRESS, COMPLETED]) {
      const rec = await get(`/api/v1/saved/${id}`);
      const ld = await post(`/api/v1/saved/${id}/load`, {});
      const ev = (await get(`/api/v1/replays/${ld.j.replay_id}/events`)).events;
      chk(`${id}: loads in the new backend process with the saved events and time`, ld.s === 200 && eq(ev, rec.events) && ld.j.sim_time_min === rec.identity.sim_time_min && ld.j.saved_run.label === rec.label, { s: ld.s, n: ev.length, saved: rec.event_count });
      R.data[id] = { label: ld.j.saved_run.label, t: ld.j.sim_time_min, events: ev.length };
    }
  }
  return R;
}
