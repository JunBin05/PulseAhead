// Playwright MCP snippet used for the ticket 01 evidence. Run with the browser_run_code_unsafe tool
// (Playwright MCP); it is not a standalone test runner. Expects the production build on :8000.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { base: BASE, at: new Date().toISOString(), checks: {} };
  const consoleMsgs = []; const httpErrors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text().slice(0, 100)); });
  page.on('response', r => { if (r.status() >= 400) httpErrors.push(r.status() + ' ' + r.url().replace(BASE, '')); });
  let replayId = null;
  page.on('response', async r => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });

  const ver = () => page.getByTestId('scene').getAttribute('data-replay-version').then(Number);
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  const text = (id) => page.getByTestId(id).textContent();
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName);
  const api = (path) => page.evaluate((p) => fetch(p).then(r => r.json()), path);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/');

  // 1. First start + header labels
  const headerBefore = await page.evaluate(() => document.querySelector('header').innerText);
  await page.getByTestId('start').click();
  await waitV(1);
  R.checks.firstStart = {
    header: headerBefore.replace(/\s+/g, ' '),
    afterStart: { time: await text('sim-time'), version: await ver(), status: await text('overall-status'), replayId },
    zoneButtons: await page.evaluate(() => [1, 2, 3, 4].map(z => document.querySelector(`[data-testid=zone-${z}]`).innerText.replace(/\s+/g, ' '))),
    sceneLabels: await page.evaluate(() => [...document.querySelectorAll('.zone-label, .area-label')].map(e => e.textContent)),
  };

  // 2. Step x24 then compare UI, scene, rendered meshes, API state, events and export
  for (let k = 1; k <= 24; k++) { await page.getByTestId('step').click(); await waitV(k + 1); }
  await page.waitForTimeout(500);
  const st = await api(`/api/v1/replays/${replayId}/state`);
  const ev = await api(`/api/v1/replays/${replayId}/events`);
  const ex = await api(`/api/v1/replays/${replayId}/export`);
  const ui = await page.evaluate(() => {
    const d = document.querySelector('[data-testid=scene]').dataset;
    const t = (id) => document.querySelector(`[data-testid=${id}]`).textContent;
    return { time: t('sim-time'), version: Number(d.replayVersion), dots: Number(d.dotsTotal), meshes: Number(document.querySelector('canvas').dataset.patientMeshes), z: [d.dotsZ1, d.dotsZ2, d.dotsZ3, d.dotsZ4].map(Number), zoneBtn: [1, 2, 3, 4].map(z => parseInt(t(`zone-${z}-count`))), occupied: Number(t('occupied-spaces')), inEd: Number(t('in-ed')), departed: Number(t('departed')) };
  });
  let occ = 0; const bad = [];
  for (const e of ev.events) {
    if (e.type !== 'phase_change') continue;
    if (e.payload.to === 'awaiting_clinician') occ++;
    if (e.payload.to === 'departed') { occ--; if (!e.resources.ed_space) bad.push(e.id + ' departure without released space'); }
    if (['assessment_active', 'disposition_processing'].includes(e.payload.to) && !e.resources.ed_space) bad.push(e.id + ' no space during care');
    if (e.event_time_min > ev.sim_time_min) bad.push(e.id + ' future event');
  }
  R.checks.counts = {
    ui, api: { version: st.version, sim: st.sim_time_min, inEd: st.counts.in_ed, zones: st.zones.map(z => z.patient_count), occupied: st.resources.ed_spaces.occupied, departed: st.counts.departed_total, patients: st.patients.length },
    occupiedFromEvents: occ, eventProblems: bad, exportVersion: ex.version, exportEvents: ex.events.length, eventsTotal: ev.total,
    agree: ui.version === st.version && ui.dots === st.patients.length && ui.meshes === st.patients.length && ui.inEd === st.counts.in_ed && ui.occupied === st.resources.ed_spaces.occupied && occ === st.resources.ed_spaces.occupied && JSON.stringify(ui.zoneBtn) === JSON.stringify(st.zones.map(z => z.patient_count)) && JSON.stringify(ui.z) === JSON.stringify(st.zones.map(z => z.patient_count)) && ex.events.length === ev.total,
  };

  // 3. One patient from arrival to departure
  const seqs = {};
  for (const e of ev.events) (seqs[e.patient_id] ??= []).push({ t: e.event_time_min, to: e.type === 'arrival' ? 'arrival' : e.payload.to, space: e.resources?.ed_space ?? null, clin: e.resources?.clinician_slot ?? null });
  const done = Object.entries(seqs).find(([, s]) => s.at(-1).to === 'departed');
  R.checks.patientJourney = { patient: done[0], events: done[1], exportRow: ex.patients.find(p => p.patient_id === done[0]) };

  // 4. Drawer shows space / clinician identities
  await page.getByTestId('zone-2').click();
  await page.getByTestId('zone-drawer').waitFor(); // the zone response is fetched after the click
  R.checks.drawer = { heading: await page.locator('#drawer-h').textContent(), roster: await page.evaluate(() => [...document.querySelectorAll('[data-testid=roster] li')].map(li => li.innerText.replace(/\s+/g, ' '))) };
  await page.getByTestId('zone-2').click();

  // 5. Play / pause / speed cadence
  const speeds = {};
  for (const s of [10, 2]) {
    await page.getByTestId(`speed-${s}`).click();
    const v0 = await ver();
    await page.getByTestId('play-pause').click();
    const t0 = Date.now(); await page.waitForTimeout(5000); await page.getByTestId('play-pause').click();
    const wall = (Date.now() - t0) / 1000; await page.waitForTimeout(400);
    speeds[s] = { simMinutes: (await ver()) - v0, wallSec: wall, perSec: +(((await ver()) - v0) / wall).toFixed(2) };
  }
  const vp = await ver(); await page.waitForTimeout(2000);
  R.checks.playPause = { speeds, pausedVersionBefore: vp, pausedVersionAfter2s: await ver() };

  // 6. Stale response: delay one step, reset while in flight
  const statuses = [];
  const onResp = r => { if (r.url().endsWith('/advance')) statuses.push(r.status()); };
  page.on('response', onResp);
  await page.route('**/advance', async (route) => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); }, { times: 1 });
  const beforeStale = { time: await text('sim-time'), version: await ver() };
  await page.getByTestId('step').click(); await page.waitForTimeout(200);
  await page.getByTestId('reset').click(); await page.waitForTimeout(2500);
  const stAfter = await api(`/api/v1/replays/${replayId}/state`);
  page.off('response', onResp);
  R.checks.staleAndReset = {
    beforeStale, ui: { time: await text('sim-time'), version: await ver(), dots: await page.getByTestId('scene').getAttribute('data-dots-total'), meshes: await page.locator('canvas').getAttribute('data-patient-meshes'), inEd: await text('in-ed'), departed: await text('departed') },
    backend: { version: stAfter.version, sim: stAfter.sim_time_min, run: stAfter.run_number, patients: stAfter.patients.length }, lateAdvanceStatus: statuses,
  };
  const vs = await ver(); await page.getByTestId('step').click(); await waitV(vs + 1);
  R.checks.staleAndReset.nextStep = { time: await text('sim-time'), version: await ver() };

  // 7. Error path: backend unreachable for advance
  const lastGood = { time: await text('sim-time'), version: await ver() };
  await page.route('**/advance', (route) => route.abort('connectionrefused'));
  await page.getByTestId('step').click(); await page.waitForTimeout(800);
  const banner = page.getByTestId('conn-error');
  R.checks.errorPath = { lastGood, bannerText: (await banner.textContent()).replace(/received \d+s ago/, 'received Ns ago'), timeShown: await text('sim-time') };
  await page.unroute('**/advance');
  await banner.getByRole('button', { name: 'Retry' }).click(); await page.waitForTimeout(600);
  R.checks.errorPath.afterRetry = { bannerGone: (await page.getByTestId('conn-error').count()) === 0, time: await text('sim-time'), version: await ver() };

  // 8. Keyboard only (fresh page)
  await page.goto(BASE + '/');
  const kb = [];
  for (let i = 0; i < 10 && (await focused()) !== 'start'; i++) await page.keyboard.press('Tab');
  kb.push(['focus', await focused(), await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return `${c.outlineStyle} ${c.outlineWidth}`; })]);
  await page.keyboard.press('Enter'); await waitV(1); await page.waitForTimeout(100);
  kb.push(['after Enter on Start, focus', await focused()]);
  await page.keyboard.press('Tab');
  for (let k = 0; k < 3; k++) { const v = await ver(); await page.keyboard.press('Space'); await waitV(v + 1); }
  kb.push(['3x Space on', await focused(), 'time', await text('sim-time')]);
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(1200); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  kb.push(['play/pause by keyboard, pressed', await page.getByTestId('play-pause').getAttribute('aria-pressed'), 'version', await ver()]);
  const order = []; for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); order.push(await focused()); }
  kb.push(['tab order', order.join(' > ')]);
  await page.getByTestId('zone-2').focus(); await page.keyboard.press('Enter');
  kb.push(['zone 2 by keyboard', await page.getByTestId('zone-drawer').getAttribute('data-zone')]);
  R.checks.keyboard = kb;

  // 9. Widths
  const widths = {};
  for (const w of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: w < 800 ? 812 : 900 }); await page.waitForTimeout(700);
    widths[w] = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('.zone-label, .area-label')].map(e => ({ t: e.textContent, r: e.getBoundingClientRect() }));
      let overlaps = 0;
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) { const a = labels[i].r, b = labels[j].r; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++; }
      const c = document.querySelector('canvas').getBoundingClientRect();
      const clipped = labels.filter(x => x.r.left < c.left - 0.5 || x.r.right > c.right + 0.5 || x.r.top < c.top - 0.5 || x.r.bottom > c.bottom + 0.5).length;
      const small = [...document.querySelectorAll('button')].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44).length;
      return { horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, labels: labels.length, overlaps, clipped, targetsUnder44: small };
    });
  }
  R.checks.widths = widths;
  await page.setViewportSize({ width: 1440, height: 900 });

  // 10. Same-origin routes
  R.checks.sameOrigin = await page.evaluate(async () => {
    const s = async (p) => { const r = await fetch(p); return `${r.status} ${r.headers.get('content-type')}`; };
    return { root: await s('/'), deepLink: await s('/some/route'), unknownApi: await s('/api/v1/nope'), health: await s('/api/health') };
  });


  // 11. Review-fix checks: pending banner, live staleness age, canvas pick toggles like DOM buttons
  await page.goto(BASE + '/');
  await page.getByTestId('start').click(); await waitV(1);
  await page.route('**/advance', async (route) => { await new Promise(r => setTimeout(r, 2500)); await route.continue(); }, { times: 1 });
  await page.getByTestId('step').click();
  await page.waitForTimeout(250);
  const pendingEarly = await page.getByTestId('conn-pending').count();
  await page.waitForTimeout(700);
  const pendingText1 = await page.getByTestId('conn-pending').textContent().catch(() => null);
  await page.waitForTimeout(1100);
  const pendingText2 = await page.getByTestId('conn-pending').textContent().catch(() => null);
  await waitV(2); await page.waitForTimeout(200);
  R.checks.pending = { shownBefore500ms: pendingEarly, at950ms: pendingText1, at2050ms: pendingText2, goneAfter: (await page.getByTestId('conn-pending').count()) === 0, time: await text('sim-time') };
  await page.route('**/advance', (route) => route.abort('connectionrefused'));
  await page.getByTestId('step').click(); await page.waitForTimeout(400);
  const age1 = await page.getByTestId('conn-error').textContent();
  await page.waitForTimeout(2200);
  const age2 = await page.getByTestId('conn-error').textContent();
  await page.unroute('**/advance');
  R.checks.liveAge = { first: age1.match(/received (\d+)s ago/)?.[1], afterWait: age2.match(/received (\d+)s ago/)?.[1] };
  await page.getByTestId('conn-error').getByRole('button', { name: 'Retry' }).click(); await page.waitForTimeout(400);
  const lab = await page.locator('.area-label', { hasText: 'Awaiting clinician' }).boundingBox();
  const pressed = () => page.evaluate(() => [1, 2, 3, 4].filter(z => document.querySelector(`[data-testid=zone-${z}]`).getAttribute('aria-pressed') === 'true'));
  await page.mouse.click(lab.x + 20, lab.y + lab.height / 2);
  const afterFirst = await pressed();
  await page.mouse.click(lab.x + 20, lab.y + lab.height / 2);
  const afterSecond = await pressed();
  R.checks.canvasToggle = { afterFirstCanvasClick: afterFirst, afterSecondCanvasClick: afterSecond };
  // 12. Determinism after the run_until boundary change (seed 7: 2x60 vs 120x1), plus monitor tick at the boundary
  R.checks.determinism = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const run = async (chunk) => { const s = await post('/api/v1/replays', { seed: 7 }); for (let t = 0; t < 120; t += chunk) await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: chunk }); return (await fetch(`/api/v1/replays/${s.replay_id}/export`).then(r => r.json())); };
    const a = await run(60), b = await run(1);
    return { events: a.events.length, identical: JSON.stringify(a.events) === JSON.stringify(b.events) && JSON.stringify(a.patients) === JSON.stringify(b.patients) };
  });
  R.console = consoleMsgs;
  R.httpErrors = httpErrors;
  return R;
}
