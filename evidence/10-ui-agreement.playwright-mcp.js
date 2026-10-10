// Playwright MCP snippet used for the ticket 10 evidence (UI vs API agreement). Run with browser_run_code_unsafe
// (Playwright MCP); not a standalone test runner. Expects the production build on :8000. Default UI seed, scenario
// diagnostic-delay (zone 3 imaging backlog). Steps 5 minutes at a time to T+120 with zone 3 open and compares the
// forecast strip, zone-button lines, alert list and the zone 3 explanation with the API at the same version.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), checks: {}, problems: [], data: {} };
  const chk = (n, ok, d) => { R.checks[n] = ok ? 'pass' : 'FAIL ' + JSON.stringify(d).slice(0, 500); if (!ok) R.problems.push(n); };
  const bad = {};
  const note = (k, d) => { (bad[k] = bad[k] || []).length < 3 && bad[k].push(d); };
  let replayId = null; const forecastPosts = []; const consoleErr = [];
  page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text().slice(0, 100)); });
  page.on('request', r => { if (r.method() === 'POST' && /\/forecast$/.test(r.url()) && !r.headers()['x-test']) forecastPosts.push(JSON.parse(r.postData() || '{}').samples); });
  page.on('response', async r => { if (r.url().includes('/api/v1/replays') && r.request().method() === 'POST' && !/forecast/.test(r.url())) { try { const j = await r.json(); if (j.replay_id) replayId = j.replay_id; } catch {} } });
  const post = (p, b) => page.evaluate(async ([p, b]) => (await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test': '1' }, body: JSON.stringify(b) })).json(), [p, b]);
  const get = (p) => page.evaluate((p) => fetch(p).then(r => r.json()), p);
  const T = (id) => page.getByTestId(id).textContent();
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 15000 });
  const ready = (v) => page.waitForFunction((v) => { const e = document.querySelector('[data-testid=fc-source]'); return e && Number(e.dataset.version) === v && e.dataset.status === 'ready'; }, v, { timeout: 20000 });
  const explained = (v, z) => page.waitForFunction(([v, z]) => { const e = document.querySelector('[data-testid=fc-observed]'); const s = document.querySelector('[data-testid=fc-source]'); return e && s && Number(s.dataset.version) === v && !document.body.innerText.includes('Computing the explanation'); }, [v, 3], { timeout: 20000 });
  const pct = (x) => x === null || x === undefined ? '—' : Math.round(x * 100) + '%';
  const clock = (m) => { const t = Math.floor(m); return 'T+' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const line = (f, z) => { if (f.status === 'cannot_assess') return 'Forecast: cannot assess'; const q = f.zones.find(x => x.zone === z); const top = f.services[q.top_service];
    if (q.state === 'unknown') return 'Forecast: cannot assess'; if (q.state === 'overloaded') return 'Overloaded now'; if (q.state === 'building') return 'Building: ' + pct(top.chance) + ' to confirm';
    return 'Forecast risk ' + pct(q.new_overload_chance) + (q.warning ? ' (warning)' : ''); };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=scenario-select] option').length === 7, null, { timeout: 8000 });
  await page.getByTestId('scenario-select').selectOption('diagnostic-delay');
  await page.getByTestId('start').click(); await waitV(1);
  await page.getByTestId('zone-3').click(); await page.getByTestId('zone-drawer').waitFor();
  let steps = 0, compared = 0; const seen = { kinds: new Set(), alertKinds: new Set(), maxAlerts: 0, zone3Local: new Set(), warned: false };
  const compare = async () => {
    const s = await get(`/api/v1/replays/${replayId}/state`);
    await ready(s.version);
    const f = await post(`/api/v1/replays/${replayId}/forecast`, { samples: 50, expected_version: s.version });
    if (f.source.version !== s.version) { note('version', [f.source.version, s.version]); return; }
    const src = await page.getByTestId('fc-source').getAttribute('data-version');
    if (Number(src) !== s.version) note('source-version', [src, s.version]);
    const o = f.overall; seen.kinds.add(o.kind);
    const chance = await T('fc-chance');
    if (!chance.includes(pct(o.chance))) note('strip-chance', [chance, o.chance]);
    const sp = s.resources.ed_spaces;
    if ((await T('fc-awaiting')) !== String(sp.awaiting_space)) note('awaiting', [await T('fc-awaiting'), sp.awaiting_space]);
    if ((await T('fc-available')) !== `${sp.available_staffed} of ${sp.total}`) note('available', [await T('fc-available'), sp]);
    const next = await T('fc-next'); if (!next.includes(f.next_step.text)) note('next', [next, f.next_step.text]);
    const src2 = await T('fc-source'); if (!src2.includes(`T+${String(Math.floor(f.forecast_time_min / 60)).padStart(2, '0')}`) || !src2.includes(`${f.model.settings.samples} sampled futures`) || !src2.includes(f.model.version)) note('source-text', src2);
    for (const z of [1, 2, 3, 4]) { const t = await T(`zone-${z}-forecast`); if (t !== line(f, z)) note('zone-line', [z, t, line(f, z)]); }
    // alert list: same members in the same order as the API
    const ids = await page.$$eval('button[data-testid^="fc-alert-"][data-kind]', els => els.map(e => e.dataset.testid.replace('fc-alert-', '')));
    const exp = [...f.alerts.actionable, ...f.alerts.recovery, ...f.alerts.unknown].map(a => a.service);
    if (JSON.stringify(ids) !== JSON.stringify(exp)) note('alert-order', [ids, exp]);
    seen.maxAlerts = Math.max(seen.maxAlerts, f.alerts.actionable.length);
    for (const a of f.alerts.actionable) {
      seen.alertKinds.add(a.kind);
      const tx = await T(`fc-alert-${a.service}-text`), dl = await T(`fc-alert-${a.service}-deadline`);
      if (!tx.includes(pct(a.chance))) note('alert-text', [a.service, tx, a.chance]);
      const d = a.deadline;
      const wantDl = d.status === 'too_late' ? 'May be too late to prevent' : d.status === 'open' ? clock(d.latest_start_min) : 'Deadline unavailable';
      if (!dl.includes(wantDl)) note('alert-deadline', [a.service, dl, d]);
      if (a.impact !== null || !(await page.getByTestId(`fc-alert-${a.service}`).textContent()).includes('Impact: unavailable')) note('alert-impact', a.service);
    }
    for (const a of f.alerts.recovery) { const dl = await T(`fc-alert-${a.service}-deadline`); if (!dl.includes('Recovery')) note('recovery-text', [a.service, dl]); }
    // zone 3 drawer: local and overall forecast apart, observed facts equal the API explanation
    const z3 = f.zones.find(z => z.zone === 3); const top = f.services[z3.top_service]; seen.zone3Local.add(top.kind);
    if ((await page.getByTestId('fc-local').getAttribute('data-kind')) !== top.kind) note('local-kind', [await page.getByTestId('fc-local').getAttribute('data-kind'), top.kind]);
    if ((await page.getByTestId('fc-overall').getAttribute('data-kind')) !== o.kind) note('overall-kind', [await page.getByTestId('fc-overall').getAttribute('data-kind'), o.kind]);
    if (await page.getByTestId('fc-zone-warning').count()) seen.warned = true;
    await explained(s.version, 3);
    const ex = await post(`/api/v1/replays/${replayId}/forecast/explain`, { zone: 3, samples: 50, expected_version: s.version });
    const obs = await page.$$eval('[data-testid=fc-observed] li', els => els.map(e => e.textContent.trim()));
    const wantObs = ex.why_this_alert.observed.map(x => `${x.label}: ${x.value}`);
    if (JSON.stringify(obs) !== JSON.stringify(wantObs)) note('observed', [obs, wantObs]);
    const mdl = await page.$$eval('[data-testid=fc-model] li', els => els.map(e => e.textContent.trim()));
    if (JSON.stringify(mdl) !== JSON.stringify(ex.why_this_alert.model)) note('model', [mdl, ex.why_this_alert.model]);
    // the observed queue equals the received pressure service at the same version
    const q = s.pressure.services[ex.service].queue;
    if (q !== null && !obs.some(x => x.endsWith(`${q}`) || x.includes(`: ${q} `) || x.includes(`: ${q}(`) || x.includes(`: ${q} (`))) note('queue-in-explanation', [ex.service, q, obs]);
    if (ex.source.version !== s.version || ex.zone !== 3) note('explain-source', [ex.source, ex.zone]);
    compared++;
  };
  await compare();
  while (steps < 24) { await page.getByTestId('step').click(); steps++; await waitV(1 + steps); await compare(); }
  const mid = await get(`/api/v1/replays/${replayId}/state`);
  chk('A1 strip, zone-button lines, alert list (order, text, deadline, impact) and zone 3 explanation equal the API at the same version in all ' + compared + ' steps (T+0 to T+120)', Object.keys(bad).length === 0 && compared === 25, bad);
  chk('A2 the run exercised new-onset, building or recovery forecasts, at least one actionable alert and a zone 3 local forecast', seen.kinds.size >= 1 && (seen.alertKinds.size >= 1 || seen.maxAlerts >= 1) && seen.zone3Local.size >= 1, { kinds: [...seen.kinds], alerts: [...seen.alertKinds], z3: [...seen.zone3Local], max: seen.maxAlerts });
  R.data.seen = { overallKinds: [...seen.kinds], alertKinds: [...seen.alertKinds], zone3Kinds: [...seen.zone3Local], maxActionable: seen.maxAlerts, zoneWarningShown: seen.warned, endTime: mid.sim_time_min, overallState: mid.overall_status.state };

  // Refresh cadence: one forecast request per five simulated minutes stepped, none for repeated renders.
  chk('A3 one forecast request per 5-minute step (' + forecastPosts.length + ' requests for ' + (steps + 1) + ' states), all with 50 futures', forecastPosts.length >= steps && forecastPosts.length <= steps + 3 && forecastPosts.every(n => n === 50), { posts: forecastPosts.length, steps });

  // Selecting an alert focuses its zone; back restores the overview.
  const first = await page.$eval('button[data-testid^="fc-alert-"][data-kind]', e => ({ id: e.dataset.testid, zone: Number(e.dataset.zone) })).catch(() => null);
  if (first) {
    await page.getByTestId(first.id).click(); await page.waitForTimeout(700);
    const cam = await page.getByTestId('scene').getAttribute('data-camera');
    const heading = await page.getByTestId('zone-drawer').textContent();
    chk('A4 clicking an alert focuses its zone (camera and drawer) and Back to overview restores the overview', cam === `zone-${first.zone}` && heading.includes(`Forecast for zone ${first.zone}`) && (await (async () => { await page.getByTestId('back-to-overview').click(); await page.waitForTimeout(600); return (await page.getByTestId('scene').getAttribute('data-camera')) === 'overview'; })()), { cam, first });
  } else chk('A4 clicking an alert focuses its zone', false, 'no alert present at T+120');
  // 100-future setting: the next request carries 100 and the source line says so.
  await page.getByTestId('fc-samples-100').click();
  await page.getByTestId('step').click(); await waitV(1 + steps + 1);
  await page.waitForFunction(() => /100 sampled futures/.test(document.querySelector('[data-testid=fc-source]')?.textContent || ''), null, { timeout: 20000 });
  chk('A5 choosing 100 futures: the next request and the source line say 100; the response has 100 samples', forecastPosts[forecastPosts.length - 1] === 100 && /100 sampled futures/.test(await T('fc-source')), forecastPosts.slice(-3));
  const s2 = await get(`/api/v1/replays/${replayId}/state`);
  const f2 = await post(`/api/v1/replays/${replayId}/forecast`, { samples: 100, expected_version: s2.version });
  chk('A5 the 100-future forecast reports samples 100 and its compute time', f2.model.settings.samples === 100 && f2.overall.samples === 100 && typeof f2.compute.ms === 'number', { ms: f2.compute.ms });
  R.data.ms100 = f2.compute.ms;
  chk('A6 no console errors during the run', consoleErr.length === 0, consoleErr.slice(0, 3));
  return R;
}
