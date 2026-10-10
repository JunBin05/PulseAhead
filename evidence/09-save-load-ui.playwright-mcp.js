// Playwright MCP snippet used for the ticket 09 evidence (UI half). Run with browser_run_code_unsafe (Playwright
// MCP); not a standalone test runner. Expects the production build on :8000 and the saved completed run from
// 09-scenarios part B (set COMPLETED to its id). The default UI seed is used (no ?fixture=).
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const COMPLETED = '4d100c5479f0';
  const R = { at: new Date().toISOString(), checks: {}, problems: [], data: {} };
  const chk = (name, ok, detail) => { R.checks[name] = ok ? 'pass' : 'FAIL ' + JSON.stringify(detail).slice(0, 300); if (!ok) R.problems.push(name); };
  const J = (x) => JSON.stringify(x);
  const get = (p) => page.evaluate((p) => fetch(p).then(r => r.json()), p);
  const post = (p, b) => page.evaluate(async ([p, b]) => { const r = await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; }, [p, b]);
  const consoleErr = []; let replayId = null;
  page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text().slice(0, 120)); });
  page.on('response', async r => {
    if (!r.url().includes('/api/v1/') || r.request().method() !== 'POST') return;
    try { const j = await r.json(); if (j.replay_id && j.sim_time_min !== undefined) replayId = j.replay_id; } catch {}
  });
  const T = (id) => page.getByTestId(id).textContent();
  const ver = () => page.getByTestId('scene').getAttribute('data-replay-version').then(Number);
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 15000 });
  const scene = () => page.evaluate(() => {
    const d = document.querySelector('[data-testid=scene]').dataset, c = document.querySelector('canvas');
    return { v: Number(d.replayVersion), dots: Number(d.dotsTotal), camera: d.camera, meshes: Number(c?.dataset.patientMeshes) };
  });
  const meshesSettle = (n) => page.waitForFunction((n) => Number(document.querySelector('canvas')?.dataset.patientMeshes) === n, n, { timeout: 8000 });
  const sceneFull = async () => { const s = await scene(); await meshesSettle(s.dots).catch(() => {}); return scene(); };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=scenario-select] option').length === 7, null, { timeout: 8000 });
  const opts = await page.getByTestId('scenario-select').evaluate(s => [...s.options].map(o => [o.value, o.textContent]));
  chk('U1 selector lists the seven families, demo roles in the labels', opts.length === 7 && opts.some(o => /diagnostic-backlog demo/.test(o[1])) && opts.some(o => /recovering short surge/.test(o[1])) && opts.some(o => /ward blockage/.test(o[1])) && opts.some(o => /no-effective-action case/.test(o[1])), opts);
  await page.getByTestId('scenario-select').selectOption('diagnostic-delay');
  chk('U1 description of the chosen family is shown', /zone 3 backs up/.test(await T('scenario-desc')), await T('scenario-desc'));
  await page.getByTestId('start').click(); await waitV(1);
  let st = await get(`/api/v1/replays/${replayId}/state`);
  chk('U2 Start uses the selected scenario; run record shows warm-up, scored, seed partition, versions', st.scenario === 'diagnostic-delay' && /120 min \/ 480 min/.test(await T('run-warmup')) && (await T('run-seed')).includes(`${st.seed} (custom)`) && /v1/.test(await T('run-versions')) && (await T('run-versions')).includes(st.profile_id), { sc: st.scenario, w: await T('run-warmup'), s: await T('run-seed'), v: await T('run-versions') });

  // step until zone 3 reads Overloaded (engine-produced), at most 40 steps
  let steps = 0, z3 = '';
  while (steps < 40) {
    await page.getByTestId('step').click(); steps++; await waitV(1 + steps);
    z3 = await T('zone-3');
    if (/Overloaded/.test(z3)) break;
  }
  st = await get(`/api/v1/replays/${replayId}/state`);
  const z3api = st.pressure.zones.find(z => z.zone === 3);
  chk('U3 diagnostic-backlog demo: zone 3 reads Overloaded in the UI and in /state at the same version', /Overloaded/.test(z3) && z3api.state === 'overloaded' && (await ver()) === st.version, { z3, api: z3api.state, steps });
  R.data.zone3OverloadedAt = st.sim_time_min;
  await page.getByTestId('zone-3').click();
  await page.getByTestId('zone-drawer').waitFor();
  await page.waitForTimeout(700);
  R.data.camera = (await scene()).camera;
  await page.screenshot({ path: 'C:/Users/Vaas/Documents/Prototype/PulseAhead/Real/evidence/shots/09-diagnostic-zone3-overload.png' });
  await page.getByTestId('speed-5').click();
  await page.getByTestId('save-run').click();
  await page.waitForFunction(() => /Saved [0-9a-f]{12}/.test(document.querySelector('[data-testid=save-note]')?.textContent || ''), null, { timeout: 8000 });
  const note = await T('save-note');
  const sid = note.match(/Saved ([0-9a-f]{12})/)[1];
  const before = { time: await T('sim-time'), ...(await sceneFull()) };
  const rec = await get(`/api/v1/saved/${sid}`);
  const evBefore = (await get(`/api/v1/replays/${replayId}/events`)).events;
  chk('U4 Save: note names the run; it is listed; record holds zone 3, camera and speed', /in-progress/i.test(note) && (await page.getByTestId(`saved-${sid}`).count()) === 1 && rec.ui.selected_zone === 3 && rec.ui.camera === 'zone-3' && rec.settings.simulation.speed === 5 && J(rec.events) === J(evBefore), { note, ui: rec.ui, cam: R.data.camera });

  // reload the page (fresh app), then load the saved run
  await page.reload();
  await page.getByTestId(`saved-load-${sid}`).waitFor();
  await page.getByTestId(`saved-load-${sid}`).click();
  await page.waitForFunction(() => !!document.querySelector('[data-testid=loaded-run]'), null, { timeout: 15000 });
  await page.getByTestId('zone-drawer').waitFor();
  await page.waitForTimeout(700);
  const after = { time: await T('sim-time'), ...(await sceneFull()) };
  const evAfter = (await get(`/api/v1/replays/${replayId}/events`)).events;
  chk('U5 Load: same time, dot count, rendered meshes; zone 3 drawer and camera restored', after.time === before.time && after.dots === before.dots && after.meshes === after.dots && after.camera === 'zone-3' && /Zone 3|Diagnostics/i.test(await page.getByTestId('zone-drawer').innerText()) && (await page.getByTestId('speed-5').getAttribute('aria-pressed')) === 'true', { before, after });
  const loadedState = await get(`/api/v1/replays/${replayId}/state`);
  const loadedUi = await page.evaluate(() => ({ chip3: document.querySelector('[data-testid=zone-3-status]')?.textContent.trim(), bubbles: document.querySelectorAll('.alert-bubble').length, localAlert: !!document.querySelector('[data-testid=local-alert]') }));
  chk('U5 Load: the overloaded zone shows its chip, one ALERT bubble and the Local alert badge, as /state says', loadedState.pressure.zones[2].state === 'overloaded' && loadedUi.chip3 === 'Overloaded' && loadedUi.bubbles === 1 && loadedUi.localAlert, { loadedUi, api: loadedState.pressure.zones.map(z => z.state) });
  chk('U5 Load: label says the run is a saved in-progress synthetic run, with its id', (await T('loaded-run')).includes(sid) && /Saved in-progress synthetic run/.test(await T('loaded-run')), await T('loaded-run'));
  chk('U5 Load: rebuilt events equal the saved events', J(evAfter) === J(rec.events) && replayId !== null, [evAfter.length, rec.events.length]);

  // resume: one 5-minute step equals a fresh replay at the same time
  const v0 = await ver();
  await page.getByTestId('step').click(); await waitV(v0 + 1);
  const evStep = (await get(`/api/v1/replays/${replayId}/events`)).events;
  const stNow = await get(`/api/v1/replays/${replayId}/state`);
  const fresh = await post('/api/v1/replays', { scenario: 'diagnostic-delay', seed: st.seed });
  let fv = fresh.j.version;
  for (let left = stNow.sim_time_min; left > 1e-9; ) { const m = Math.min(60, left); const a = await post(`/api/v1/replays/${fresh.j.replay_id}/advance`, { minutes: m, expected_version: fv }); fv = a.j.version; left -= m; }
  const evFresh = (await get(`/api/v1/replays/${fresh.j.replay_id}/events`)).events;
  chk('U6 Resume: stepping the loaded run equals a fresh replay at the same simulated time', J(evStep) === J(evFresh) && stNow.sim_time_min === rec.identity.sim_time_min + 5, [stNow.sim_time_min, evStep.length, evFresh.length]);

  // a load drops an in-flight playback request: start playing at 10x, load at once, nothing later is applied
  await page.getByTestId('speed-10').click();
  await page.getByTestId('play-pause').click();
  await page.waitForTimeout(250);
  await page.getByTestId(`saved-load-${sid}`).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=loaded-run]') !== null, null, { timeout: 15000 });
  await page.waitForTimeout(2500);
  const stLoaded = await get(`/api/v1/replays/${replayId}/state`);
  chk('U7 Load while playing: playback stops, time is the saved time and stays there', stLoaded.sim_time_min === rec.identity.sim_time_min && (await T('sim-time')) === before.time && stLoaded.saved_run.id === sid, { t: stLoaded.sim_time_min, ui: await T('sim-time') });

  // reset after load clears label, dots, drawer and camera
  await page.getByTestId('reset').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=loaded-run]') === null, null, { timeout: 8000 });
  await page.waitForTimeout(500);
  const rs = await sceneFull();
  chk('U8 Reset after load: saved label gone, T+0, no dots or meshes, overview camera, drawer closed', (await T('sim-time')) !== before.time && rs.dots === 0 && rs.meshes === 0 && rs.camera === 'overview' && (await page.getByTestId('zone-drawer').count()) === 0 && (await page.locator('.alert-bubble').count()) === 0 && (await page.getByTestId('local-alert').count()) === 0 && (await page.getByTestId('overall-status').textContent()).trim() === 'Stable', { rs, t: await T('sim-time'), bubbles: await page.locator('.alert-bubble').count() });

  // switching scenario while a run exists shows a pending note; Reset applies it
  await page.getByTestId('scenario-select').selectOption('arrival-surge');
  chk('U9 Changing scenario mid-run shows the pending note and does not change the replay', (await page.getByTestId('scenario-pending').count()) === 1 && (await get(`/api/v1/replays/${replayId}/state`)).scenario === 'diagnostic-delay', await T('scenario-pending'));
  await page.getByTestId('reset').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=scenario-pending]') === null, null, { timeout: 8000 });
  const sa = await get(`/api/v1/replays/${replayId}/state`);
  chk('U9 Reset applies the new scenario', sa.scenario === 'arrival-surge' && sa.sim_time_min === 0, [sa.scenario, sa.sim_time_min]);

  // a completed run is listed as completed and loads with its label
  const row = page.getByTestId(`saved-${COMPLETED}`);
  chk('U10 completed run is listed as Completed', (await row.count()) === 1 && (await row.getAttribute('data-completed')) === 'true' && /Completed/.test(await row.innerText()), await row.innerText());
  await page.getByTestId(`saved-load-${COMPLETED}`).click();
  await page.waitForFunction(() => /Completed synthetic run/.test(document.querySelector('[data-testid=loaded-run]')?.textContent || ''), null, { timeout: 20000 });
  const sc = await get(`/api/v1/replays/${replayId}/state`);
  chk('U10 loading the completed run shows its label and T+600', sc.sim_time_min === 600 && sc.saved_run.completed === true && sc.saved_run.results.time_summary != null, [sc.sim_time_min, sc.saved_run.label]);
  const heights = await page.evaluate((id) => ['scenario-select', 'save-run', `saved-load-${id}`].map(t => Math.round(document.querySelector(`[data-testid="${t}"]`).getBoundingClientRect().height)), COMPLETED);
  chk('U11 controls are at least 44 px tall', heights.every(h => h >= 44), heights);
  chk('U12 no console errors during the run', consoleErr.length === 0, consoleErr);
  R.data.sid = sid; R.data.before = before; R.data.after = after;
  return R;
}
