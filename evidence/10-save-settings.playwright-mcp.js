// Playwright MCP snippet used for the ticket 10 evidence (forecast settings in the saved record, the ticket 09
// criterion 4 carry-over). Run with browser_run_code_unsafe (Playwright MCP); not a standalone test runner.
// Expects the production build on :8000. Saves with 100 futures selected, checks the record against the live
// forecast settings, reloads the page, loads the record and checks the selector, then repeats with 50.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), checks: {}, problems: [], data: {} };
  const chk = (n, ok, d) => { R.checks[n] = ok ? 'pass' : 'FAIL ' + JSON.stringify(d).slice(0, 500); if (!ok) R.problems.push(n); };
  let replayId = null;
  page.on('response', async (r) => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });
  const get = (p) => page.evaluate((p) => fetch(p).then((r) => r.json()), p);
  const post = (p, b) => page.evaluate(async ([p, b]) => (await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json(), [p, b]);
  const T = (id) => page.getByTestId(id).textContent();
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 15000 });
  const sourceReady = (n) => page.waitForFunction((n) => { const e = document.querySelector('[data-testid=fc-source]'); return e && e.dataset.status === 'ready' && new RegExp(n + ' sampled futures').test(e.textContent); }, n, { timeout: 25000 });
  const J = JSON.stringify;
  const pressed = (n) => page.getByTestId(`fc-samples-${n}`).getAttribute('aria-pressed');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=scenario-select] option').length === 7, null, { timeout: 8000 });
  await page.getByTestId('scenario-select').selectOption('diagnostic-delay');
  await page.getByTestId('start').click(); await waitV(1);
  await page.getByTestId('fc-samples-100').click();
  for (let k = 1; k <= 4; k++) { await page.getByTestId('step').click(); await waitV(1 + k); }
  await sourceReady(100);
  await page.getByTestId('save-run').click();
  await page.waitForFunction(() => /Saved [0-9a-f]{12}/.test(document.querySelector('[data-testid=save-note]')?.textContent || ''), null, { timeout: 8000 });
  const sid100 = (await T('save-note')).match(/Saved ([0-9a-f]{12})/)[1];
  const rec100 = await get(`/api/v1/saved/${sid100}`);
  const live = await post(`/api/v1/replays/${replayId}/forecast`, { samples: 100 });
  const want = { samples: 100, model_version: live.model.version, horizon_min: live.model.settings.horizon_min, tail_min: live.model.settings.tail_min,
    refresh_every_min: live.model.settings.refresh_every_min, seed: live.model.settings.seed, warning_threshold: live.model.settings.warning_threshold };
  chk('K1 record saved with 100 futures selected holds settings.forecast equal to the live model settings (samples, version, horizon, tail, refresh, seed, warning threshold)', J(rec100.settings.forecast) === J(want) && want.samples === 100 && want.horizon_min === 90 && want.tail_min === 20 && want.refresh_every_min === 5, { rec: rec100.settings.forecast, want });
  chk('K2 the simulation settings and the (still empty) choices are unchanged in the record', rec100.settings.simulation.step_min === 5 && Array.isArray(rec100.choices) && rec100.choices.length === 0, { sim: rec100.settings.simulation, choices: rec100.choices });
  R.data.record100 = rec100.settings;

  // back to 50 and save again: the record follows the selector
  await page.getByTestId('fc-samples-50').click();
  await sourceReady(50);
  await page.getByTestId('save-run').click();
  await page.waitForFunction((prev) => { const m = (document.querySelector('[data-testid=save-note]')?.textContent || '').match(/Saved ([0-9a-f]{12})/); return m && m[1] !== prev; }, sid100, { timeout: 8000 });
  const sid50 = (await T('save-note')).match(/Saved ([0-9a-f]{12})/)[1];
  const rec50 = await get(`/api/v1/saved/${sid50}`);
  chk('K3 a second record saved with 50 futures selected holds samples 50', rec50.settings.forecast.samples === 50 && rec50.settings.forecast.model_version === want.model_version, rec50.settings.forecast);

  // fresh page, load the 100-futures record: selector, source line and rebuilt events agree with the record
  await page.reload();
  await page.getByTestId(`saved-load-${sid100}`).waitFor();
  await page.getByTestId(`saved-load-${sid100}`).click();
  await page.waitForFunction(() => !!document.querySelector('[data-testid=loaded-run]'), null, { timeout: 15000 });
  await sourceReady(100);
  const ev = (await get(`/api/v1/replays/${replayId}/events`)).events;
  chk('K4 Load restores the 100-futures selector and the forecast on screen is computed with 100 futures', (await pressed(100)) === 'true' && (await pressed(50)) === 'false' && /100 sampled futures/.test(await T('fc-source')), { p100: await pressed(100), p50: await pressed(50), src: await T('fc-source') });
  chk('K5 the loaded run still equals the saved events (loading the settings changed no simulation state)', J(ev) === J(rec100.events), [ev.length, rec100.events.length]);

  // load the 50-futures record on the same page
  await page.getByTestId(`saved-load-${sid50}`).click();
  await page.waitForFunction((id) => (document.querySelector('[data-testid=loaded-run]')?.textContent || '').includes(id), sid50, { timeout: 15000 });
  await sourceReady(50);
  chk('K6 loading the 50-futures record restores 50', (await pressed(50)) === 'true' && (await pressed(100)) === 'false', { p50: await pressed(50), p100: await pressed(100) });

  // a save without any forecast field (older client) still works and records the default
  const s = await post('/api/v1/replays', { seed: 7 });
  const sv = await post(`/api/v1/replays/${s.replay_id}/save`, {});
  const recDef = await get(`/api/v1/saved/${sv.saved_id}`);
  chk('K7 a save request without forecast settings records the default of 50 futures', recDef.settings.forecast && recDef.settings.forecast.samples === 50, recDef.settings);
  return R;
}
