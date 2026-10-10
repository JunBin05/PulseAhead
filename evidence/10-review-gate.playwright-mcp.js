// Playwright MCP snippet used for the ticket 10 review-gate fixes. Run with browser_run_code_unsafe (Playwright
// MCP); not a standalone test runner. Expects the production build on :8000. Set PART to 'A', 'B', 'C', 'D1' or 'D2'.
// A: explanation equal to the pre-fix baseline hashes; zone warning vs alert list; top service of overloaded zones.
// B: explain of a cached version does not wait for a forecast run; a reset during a run does not leak its result.
// C: the drawer label for a zone with and without an alert.
// D1: saves two records. Between D1 and D2 a script edits their JSON (see the evidence note: record 1 gets another
//     forecast model_version, record 2 loses settings.forecast, as an older record would). D2: loads them.
async (page) => {
  const PART = 'A';
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), part: PART, checks: {}, problems: [], data: {} };
  const chk = (n, ok, d) => { R.checks[n] = ok ? 'pass' : 'FAIL ' + JSON.stringify(d).slice(0, 500); if (!ok) R.problems.push(n); };
  await page.goto(BASE + '/');
  const post = (p, b) => page.evaluate(async ([p, b]) => { const r = await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; }, [p, b]);
  const get = (p) => page.evaluate((p) => fetch(p).then((r) => r.json()), p);
  const upTo = async (id, t) => { let cur = 0; while (cur < t) { const m = Math.min(60, t - cur); await post(`/api/v1/replays/${id}/advance`, { minutes: m }); cur += m; } };

  if (PART === 'A') {
    // A1 same explanations as before the fix (hashes of the pre-fix responses, compute time excluded)
    const BASELINE = [
      ['diagnostic-delay', 7, 80, 3, 50, '648e768f', '6f08dd0d'], ['diagnostic-delay', 7, 100, 3, 50, 'a0f2de47', 'de770941'],
      ['diagnostic-delay', 7, 80, 3, 100, '732e43e7', '6720871d'], ['fixture-queue-surge', 7, 15, 1, 50, 'd61e6602', '217f6e1a'],
      ['fixture-congestion-boundary', 7, 40, 2, 50, 'c69d69e5', 'c7c47982'], ['fixture-congestion-boundary', 7, 36, 2, 50, 'b0273444', '1043bf36'],
      ['arrival-surge', 7, 100, 3, 50, '7f922fc', '15cb9a1a'], ['arrival-surge', 7, 100, 2, 50, '22d7dd8f', '15cb9a1a'], ['busy-recovers', 7, 150, 4, 50, 'bc200543', 'f8946ce7'],
    ];
    const rows = await page.evaluate(async (cases) => {
      const post = async (u, b) => { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
      const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(16); };
      const strip = (o) => JSON.stringify(o, (k, v) => (k === 'compute' || k === 'replay_id') ? undefined : v);
      const out = [];
      for (const [sc, seed, t, zone, n, eh, fh] of cases) {
        const id = (await post('/api/v1/replays', { scenario: sc, seed })).j.replay_id;
        let cur = 0; while (cur < t) { const m = Math.min(60, t - cur); await post(`/api/v1/replays/${id}/advance`, { minutes: m }); cur += m; }
        const st = await (await fetch(`/api/v1/replays/${id}/state`)).json();
        const f = (await post(`/api/v1/replays/${id}/forecast`, { samples: n, expected_version: st.version })).j;
        const x = await post(`/api/v1/replays/${id}/forecast/explain`, { zone, samples: n, expected_version: st.version });
        out.push({ sc, t, zone, n, explainSame: hash(strip(x.j)) === eh, forecastSame: hash(strip(f)) === fh, explainMs: x.j.compute && x.j.compute.ms, forecastMs: f.compute.ms });
      }
      return out;
    }, BASELINE);
    chk('A1 the explanation of every baseline case equals the pre-fix response (cached futures give the same result as re-sampling)', rows.every((r) => r.explainSame), rows.filter((r) => !r.explainSame));
    chk('A1 the forecast response of every baseline case equals the pre-fix response', rows.every((r) => r.forecastSame), rows.filter((r) => !r.forecastSame));
    R.data.baseline = rows.map((r) => `${r.sc}@${r.t} z${r.zone} n${r.n}: explain ${r.explainMs} ms, forecast ${r.forecastMs} ms`);

    // A2 / A3 over a scan: seven families, test seed index 1, every 15 min to T+360, 50 futures
    const cat = await get('/api/v1/scenarios');
    const scan = await page.evaluate(async (fams) => {
      const post = async (u, b) => (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
      const out = [];
      for (const fam of fams) {
        const id = (await post('/api/v1/replays', { scenario: fam.id, seed: fam.seed })).replay_id;
        let t = 0;
        while (t < 360) {
          await post(`/api/v1/replays/${id}/advance`, { minutes: 15 }); t += 15;
          const s = await (await fetch(`/api/v1/replays/${id}/state`)).json();
          const f = await post(`/api/v1/replays/${id}/forecast`, { samples: 50, expected_version: s.version });
          out.push({ fam: fam.id, t, zones: f.zones, services: f.services, alerts: f.alerts, status: f.status });
        }
      }
      return out;
    }, cat.scenarios.map((s) => ({ id: s.id, seed: s.seed_partitions.test[1] })));
    const ok = scan.filter((x) => x.status === 'ok');
    let zoneRows = 0, unionOnly = 0, mism = [];
    for (const x of ok) for (const z of x.zones) {
      if (z.state !== 'normal') continue;
      zoneRows++;
      const alerted = x.alerts.actionable.some((a) => a.zone === z.zone && a.kind === 'forecast_risk');
      const svcMax = Math.max(...z.services.map((s) => x.services[s].state === 'normal' ? (x.services[s].chance || 0) : 0));
      if (z.new_overload_chance >= 0.4 && svcMax < 0.4) unionOnly++;
      if (z.warning !== alerted) mism.push([x.fam, x.t, z.zone, z.warning, alerted, z.new_overload_chance, svcMax]);
    }
    chk('A2 for every Normal zone in ' + ok.length + ' forecasts (' + zoneRows + ' zone rows) the zone warning equals the presence of a forecast-risk alert for one of its services', mism.length === 0, mism.slice(0, 3));
    R.data.unionAtOrAboveThresholdWithoutServiceAlert = unionOnly;
    let multi = 0, bad3 = [];
    for (const x of ok) for (const z of x.zones) {
      const over = z.services.filter((s) => x.services[s].state === 'overloaded');
      if (!over.length) continue;
      if (over.length >= 2) multi++;
      const least = Math.min(...over.map((s) => x.services[s].chance));
      const top = x.services[z.top_service];
      if (top.state !== 'overloaded' || top.chance !== least) bad3.push([x.fam, x.t, z.zone, z.top_service, top.chance, least]);
    }
    chk('A3 in a zone with an overloaded service the zone is represented by the overloaded service least likely to clear (' + multi + ' rows with two or more overloaded services)', bad3.length === 0, bad3.slice(0, 3));
    R.data.multiOverloadedRows = multi;
  }

  if (PART === 'B') {
    // B1 explain of a cached version while forecasts of another sample count are being computed
    const id = (await post('/api/v1/replays', { scenario: 'busy-recovers', seed: 7 })).j.replay_id;
    await upTo(id, 120);
    const st = await get(`/api/v1/replays/${id}/state`);
    await post(`/api/v1/replays/${id}/forecast`, { samples: 50, expected_version: st.version });
    const res = await page.evaluate(async ([id, version]) => {
      const post = async (u, b) => { const t = performance.now(); const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json(); return { s: r.status, j, wall: performance.now() - t }; };
      const heavy = [post(`/api/v1/replays/${id}/forecast`, { samples: 100, expected_version: version })];
      await new Promise((r) => setTimeout(r, 15));
      const ex = await post(`/api/v1/replays/${id}/forecast/explain`, { zone: 3, samples: 50, expected_version: version });
      const h = await Promise.all(heavy);
      return { explainWall: ex.wall, explainMs: ex.j.compute && ex.j.compute.ms, explainStatus: ex.s, forecastWall: h[0].wall, forecastMs: h[0].j.compute.ms };
    }, [id, st.version]);
    chk('B1 an explanation of the cached 50-future forecast is answered without waiting for the 100-future run (wall time within 100 ms of its own compute time)', res.explainStatus === 200 && res.explainWall - res.explainMs < 100, res);
    R.data.lockTiming = res;

    // B2 a reset during a run: the old run's forecast is not cached into the new run
    const id2 = (await post('/api/v1/replays', { scenario: 'busy-recovers', seed: 7 })).j.replay_id;
    await upTo(id2, 120);
    const st2 = await get(`/api/v1/replays/${id2}/state`);
    const race = await page.evaluate(async ([id, version]) => {
      const post = async (u, b) => { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
      const fc = post(`/api/v1/replays/${id}/forecast`, { samples: 100, expected_version: version });
      await new Promise((r) => setTimeout(r, 10));
      const rs = await post(`/api/v1/replays/${id}/reset`, {});
      const f = await fc;
      const ex = await post(`/api/v1/replays/${id}/forecast/explain`, { zone: 3, samples: 100, expected_version: version });
      return { resetStatus: rs.s, forecastStatus: f.s, forecastRun: f.j.source && f.j.source.run_number, newRun: rs.j.run_number, explainStatus: ex.s };
    }, [id2, st2.version]);
    chk('B2 a forecast that was running when the replay was reset is not held for the new run (its explanation is refused with 409)', race.resetStatus === 200 && race.explainStatus === 409, race);
    R.data.race = race;
  }

  if (PART === 'C') {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE + '/?fixture=fixture-queue-surge');
    const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 15000 });
    await page.getByTestId('start').click(); await waitV(1);
    for (let k = 1; k <= 3; k++) { await page.getByTestId('step').click(); await waitV(1 + k); }
    await page.waitForFunction(() => { const e = document.querySelector('[data-testid=fc-source]'); return e && e.dataset.status === 'ready' && Number(e.dataset.version) === Number(document.querySelector('[data-testid=scene]').dataset.replayVersion); }, null, { timeout: 20000 });
    const titleOf = async (z) => { await page.getByTestId(`zone-${z}`).click(); await page.getByTestId('fc-explain-title').waitFor(); await page.waitForTimeout(250); return { title: (await page.getByTestId('fc-explain-title').textContent()).trim(), warn: await page.getByTestId('fc-zone-warning').count(), state: await page.getByTestId('zone-drawer').getAttribute('data-state') }; };
    const z1 = await titleOf(1), z2 = await titleOf(2), z3 = await titleOf(3);
    chk('C1 the Overloaded zone (zone 1) says "Why this alert appeared"', z1.title === 'Why this alert appeared', z1);
    chk('C2 a Normal zone with no warning (zone 2) says "Forecast detail for this zone (no alert)" and shows no warning', z2.title === 'Forecast detail for this zone (no alert)' && z2.warn === 0, z2);
    chk('C3 a Normal zone with a forecast warning (zone 3) says "Why this alert appeared"', z3.title === 'Why this alert appeared' && z3.warn === 1, z3);
  }

  if (PART === 'D1') {
    const ids = [];
    for (let k = 0; k < 3; k++) {
      const id = (await post('/api/v1/replays', { scenario: 'diagnostic-delay', seed: 7 })).j.replay_id;
      await upTo(id, 60);
      const sv = await post(`/api/v1/replays/${id}/save`, { forecast: { samples: k === 2 ? 100 : 50 } });
      ids.push(sv.j.saved_id);
    }
    const rec = await get(`/api/v1/saved/${ids[0]}`);
    chk('D1 three records saved with the current forecast settings (the third with 100 futures)', ids.length === 3 && rec.settings.forecast.model_version === 'mc-flow-1' && (await get(`/api/v1/saved/${ids[2]}`)).settings.forecast.samples === 100, rec.settings.forecast);
    R.data.ids = ids;
  }

  if (PART === 'D2') {
    const IDS = ['REPLACE_A', 'REPLACE_B', 'REPLACE_C'];
    const a = await post(`/api/v1/saved/${IDS[0]}/load`, {});
    chk('D2 a record saved under another forecast model version is refused with 409 and the reason names the setting', a.s === 409 && /forecast settings/.test(a.j.detail) && /model_version/.test(a.j.detail), a);
    const b = await post(`/api/v1/saved/${IDS[1]}/load`, {});
    chk('D3 an older record without settings.forecast still loads (200, same time)', b.s === 200 && b.j.sim_time_min === 60, { s: b.s, t: b.j.sim_time_min });
    const c = await post(`/api/v1/saved/${IDS[2]}/load`, {});
    chk('D4 a record saved with a different sample count only (50 vs 100) loads', c.s === 200 && c.j.saved_run.settings.forecast.samples === 100, { s: c.s });
  }
  return R;
}
