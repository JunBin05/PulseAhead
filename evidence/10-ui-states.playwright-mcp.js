// Playwright MCP snippet used for the ticket 10 evidence (forecast UI states). Run with browser_run_code_unsafe
// (Playwright MCP); not a standalone test runner. Expects the production build on :8000. Set PART to 'A' (pending,
// stale, expired estimate, error and retry, using page.route on the real forecast endpoint) or 'B' (Cannot assess
// with fixture-feed-staffing-stop; widths with fixture-queue-surge).
async (page) => {
  const PART = 'A';
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), part: PART, checks: {}, problems: [], data: {} };
  const chk = (n, ok, d) => { R.checks[n] = ok ? 'pass' : 'FAIL ' + JSON.stringify(d).slice(0, 500); if (!ok) R.problems.push(n); };
  const T = (id) => page.getByTestId(id).textContent();
  const A = (id, a) => page.getByTestId(id).first().getAttribute(a);
  const ver = () => page.getByTestId('scene').getAttribute('data-replay-version').then(Number);
  const waitV = (v, ms = 15000) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: ms });
  const src = (cond, arg, ms = 20000) => page.waitForFunction(([c, a]) => { const e = document.querySelector('[data-testid=fc-source]'); if (!e) return false; const v = Number(document.querySelector('[data-testid=scene]').dataset.replayVersion);
    return c === 'ready-current' ? e.dataset.status === 'ready' && Number(e.dataset.version) === v : c === 'status' ? e.dataset.status === a : false; }, [cond, arg], { timeout: ms });
  const step = async () => { const v = await ver(); await page.getByTestId('step').click(); await waitV(v + 1); return v + 1; };
  const POST = '**/api/v1/replays/*/forecast';
  const start = async (fixture, scenario) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE + '/' + (fixture ? '?fixture=' + fixture : ''));
    if (scenario) { await page.waitForFunction(() => document.querySelectorAll('[data-testid=scenario-select] option').length === 7); await page.getByTestId('scenario-select').selectOption(scenario); }
    await page.getByTestId('start').click(); await waitV(1);
  };

  if (PART === 'A') {
    await start(null, 'diagnostic-delay');
    await page.getByTestId('zone-3').click(); await page.getByTestId('zone-drawer').waitFor();
    for (let i = 0; i < 6; i++) await step();
    await src('ready-current');
    // S1: a slow forecast. The previous one stays visible and labelled older; the map and controls stay usable.
    let delayed = 0;
    await page.route(POST, async (route) => { delayed++; await new Promise(r => setTimeout(r, 1800)); await route.continue(); });
    const v0 = await ver(); const beforeChance = await T('fc-chance'); const beforeVer = Number(await A('fc-source', 'data-version'));
    await page.getByTestId('step').click(); await waitV(v0 + 1);
    await src('status', 'pending', 5000);
    const pend = { text: await T('fc-source'), dataVersion: Number(await A('fc-source', 'data-version')), chance: await T('fc-chance'), status: await A('fc-source', 'data-status') };
    const t0 = Date.now();
    await page.getByTestId('zone-2').click();
    const drawer2 = await page.getByTestId('zone-drawer').textContent();
    await page.getByTestId('step').click(); await waitV(v0 + 2, 4000);
    const stepMs = Date.now() - t0;
    chk('P1 while a forecast is pending: status pending, the previous forecast (v' + beforeVer + ') stays with an "older than the state on screen" note, not shown as current', pend.status === 'pending' && /refreshing/.test(pend.text) && /older than the state on screen/.test(pend.text) && pend.dataVersion === beforeVer && pend.dataVersion < v0 + 1 && pend.chance === beforeChance, pend);
    chk('P2 the map stays interactive during the pending forecast: a zone selection and a replay step complete in ' + stepMs + ' ms (forecast delayed 1800 ms)', /Forecast for zone 2|Zone 2/.test(drawer2) && stepMs < 1500 && (await ver()) === v0 + 2, { drawer2: drawer2.slice(0, 80), stepMs });
    await src('ready-current', null, 25000);
    chk('P3 once the delayed responses arrive the forecast is current again (source version = state version) and no stale one replaces a newer one', Number(await A('fc-source', 'data-version')) === await ver() && delayed >= 1, { delayed });
    await page.unroute(POST);
    R.data.delayedRequests = delayed;

    // S2: an expired estimate asks for a refresh instead of a zero or negative timer.
    await page.getByTestId('zone-3').click();
    let found = null;
    for (let i = 0; i < 24 && !found; i++) {
      await step(); await src('ready-current');
      const t = await T('fc-local');
      const m = t.match(/about ([0-9.]+) simulated min/);
      if (m) found = { text: t, left: Number(m[1]), at: await ver(), time: await T('sim-time') };
    }
    if (!found) { chk('E1 expired estimate shows refresh (needs a zone 3 local countdown)', false, 'no countdown appeared in 24 steps (not-run)'); }
    else {
      const held = [];
      await page.route(POST, async (route) => { held.push(route); });
      let expired = null, n = 0, seenTexts = [];
      const limit = Math.ceil(found.left / 5) + 3;
      while (n < limit && !expired) {
        await step(); n++; await page.waitForTimeout(150);
        const t = await T('fc-local'); seenTexts.push(t.slice(0, 90));
        if (/estimate expired, refresh pending/.test(t)) expired = t;
      }
      const strip = await T('fc-expected'), allText = await page.getByTestId('zone-drawer').textContent();
      chk('E1 expired estimate (left ' + found.left + ' min, forecast held back for ' + n + ' steps): zone panel says "estimate expired, refresh pending"; no zero or negative timer anywhere', !!expired && !/about (0|-)/.test(allText + strip) && !/-[0-9]+(\.[0-9]+)? simulated min/.test(allText + strip), { expired, seenTexts, strip });
      await page.unroute(POST);
      for (const r of held) await r.continue().catch(() => {});
      await src('ready-current', null, 25000);
      chk('E2 after the refresh the panel shows a current estimate or none, never the expired text', !/expired/.test(await T('fc-local')), await T('fc-local'));
    }

    // S3: a failed refresh is reported, the last valid forecast stays labelled, retry works, no retry storm.
    let aborted = 0;
    await page.route(POST, async (route) => { aborted++; await route.abort(); });
    const keepVer = Number(await A('fc-source', 'data-version'));
    await step(); await src('status', 'error', 8000);
    await page.waitForTimeout(2000);
    const err = { text: await T('fc-source'), retry: await page.getByTestId('fc-retry').isVisible(), calls: aborted, shownVersion: Number(await A('fc-source', 'data-version')), chance: await T('fc-chance') };
    chk('R1 failed refresh: status error, "refresh failed" with the last valid forecast (v' + keepVer + ') still labelled, Retry visible, one request only (no retry storm)', /refresh failed/.test(err.text) && err.retry && err.shownVersion === keepVer && err.calls === 1 && !/Computing/.test(err.chance), err);
    await page.unroute(POST);
    await page.getByTestId('fc-retry').click();
    await src('ready-current', null, 20000);
    chk('R2 Retry after the fault clears recomputes from the current state; the error and Retry button are gone', !(await page.getByTestId('fc-retry').count()) && !/refresh failed/.test(await T('fc-source')), await T('fc-source'));
    await page.route(POST, async (route) => { await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ detail: 'state version changed; request a fresh forecast' }) }); });
    await step(); await src('status', 'error', 8000);
    chk('R3 a 409 from the server is shown as a failed refresh with its reason, not as a forecast', /refresh failed/.test(await T('fc-source')) && /state version changed/.test(await T('fc-source')), await T('fc-source'));
    await page.unroute(POST);
    await page.getByTestId('fc-retry').click(); await src('ready-current', null, 20000);
  } else {
    // S4: stale essential feed -> Cannot assess in every forecast surface; resumes when the feed does.
    await start('fixture-feed-staffing-stop');
    await page.getByTestId('zone-2').click(); await page.getByTestId('zone-drawer').waitFor();
    for (let i = 0; i < 6; i++) await step();
    await src('ready-current');
    const before = await T('fc-chance');
    for (let i = 0; i < 3; i++) await step();
    await src('ready-current');
    const sim = await T('sim-time');
    const lines = []; for (const z of [1, 2, 3, 4]) lines.push(await T(`zone-${z}-forecast`));
    chk('C1 stale staffing feed (' + sim + '): strip says Cannot assess with the reason and next step; every zone line says cannot assess; no alert list; no low-risk wording', (await T('fc-chance')) === 'Cannot assess' && /Staff on duty/.test(await T('fc-next')) && /Cannot assess/.test(await T('fc-next')) && lines.every(l => l === 'Forecast: cannot assess') && !(await page.getByTestId('fc-alerts').count()) && !(await page.getByTestId('fc-no-alerts').count()), { chance: await T('fc-chance'), lines, next: await T('fc-next') });
    chk('C1 the zone panel says Cannot assess and that low risk is not implied', /No forecast is shown, and low risk is not implied/.test(await T('fc-zone-cannot')), await T('fc-zone-cannot'));
    chk('C1 before the outage the strip showed a forecast (' + before + ')', !/Cannot assess/.test(before), before);
    for (let i = 0; i < 6; i++) await step();
    await src('ready-current');
    chk('C2 after the feed resumes (T+70) the forecast returns', (await T('fc-chance')) !== 'Cannot assess' && !/Cannot assess/.test(await T('fc-next')), { chance: await T('fc-chance'), time: await T('sim-time') });

    // S5: widths with alerts on screen (triage overload + lab warning at T+15).
    await start('fixture-queue-surge');
    for (let i = 0; i < 3; i++) await step();
    await src('ready-current');
    const rows = [];
    for (const w of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(350);
      rows.push(await page.evaluate((w) => {
        const rect = (e) => e.getBoundingClientRect();
        const q = (id) => [...document.querySelectorAll(`[data-testid=${id}]`)];
        const strip = rect(document.querySelector('[data-testid=fc-strip]')), scene = rect(document.querySelector('[data-testid=scene]'));
        const alerts = q('fc-alerts').length ? [...document.querySelectorAll('button[data-testid^="fc-alert-"][data-kind]')].map(rect) : [];
        const zl = [1, 2, 3, 4].map(z => document.querySelector(`[data-testid=zone-${z}-forecast]`));
        return { w, hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, stripIn: strip.left >= -0.5 && strip.right <= window.innerWidth + 0.5,
          stripAboveScene: strip.bottom <= scene.top + 1, alerts: alerts.length, alertsIn: alerts.every(r => r.left >= -0.5 && r.right <= window.innerWidth + 0.5), alertH: alerts.length ? Math.min(...alerts.map(r => r.height)) : null,
          zoneLinesClipped: zl.filter(e => e && e.scrollWidth > e.clientWidth + 1).length, zoneLinesIn: zl.every(e => { const r = rect(e); return r.left >= -0.5 && r.right <= window.innerWidth + 0.5; }) };
      }, w));
    }
    chk('W1 at 375/768/1024/1440: no horizontal scroll, strip and alert buttons inside the viewport, strip above the scene, alert targets >= 44 px, zone forecast lines inside and unclipped', rows.every(r => !r.hscroll && r.stripIn && r.stripAboveScene && r.alerts >= 2 && r.alertsIn && r.alertH >= 44 && r.zoneLinesClipped === 0 && r.zoneLinesIn), rows);
    R.data.widths = rows;
  }
  return R;
}
