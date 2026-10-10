// Playwright MCP snippet used for the ticket 10 evidence (isolation from the hidden future). Run with
// browser_run_code_unsafe (Playwright MCP); not a standalone test runner. Expects the production build on :8000.
// Forecasts of identical received states must be identical whatever the hidden future holds; they may differ
// only once the received state differs. Pairs: fixture-hidden-future-a/-b (hidden surge from T+75) and
// fixture-eta-private-a/-b (same announced ETA 40, private arrival 36 vs 44).
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), checks: {}, problems: [], data: {} };
  const chk = (n, ok, d) => { R.checks[n] = ok ? 'pass' : 'FAIL ' + JSON.stringify(d).slice(0, 500); if (!ok) R.problems.push(n); };
  await page.goto(BASE + '/');
  const o = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = async (u, b) => { const r = await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
    const mk = async (sc, seed) => (await post('/api/v1/replays', { scenario: sc, seed })).j.replay_id;
    const go = (id, m) => post(`/api/v1/replays/${id}/advance`, { minutes: m });
    const fc = async (id, n = 50) => (await post(`/api/v1/replays/${id}/forecast`, { samples: n })).j;
    const st = async (id) => (await fetch(`/api/v1/replays/${id}/state`)).json();
    const DROP = ['replay_id', 'compute', 'cached', 'created_at', 'saved_run'];
    // The two fixtures of a pair differ in their scenario identity (and the hidden variant, which no state
    // response carries); everything else in the received state must be equal.
    const IDENT = ['scenario', 'scenario_name', 'scenario_id', 'scenario_label', 'fixture', 'name', 'run_record'];
    const normS = (x) => JSON.stringify(x, (k, v) => (DROP.includes(k) || IDENT.includes(k)) ? undefined : v);
    const paths = (a, b, p = '', out = []) => {
      if (out.length > 6) return out;
      if (typeof a !== typeof b || (a && typeof a === 'object') !== (b && typeof b === 'object')) { out.push(p); return out; }
      if (a && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (!DROP.includes(k)) paths(a[k], b[k], p + '/' + k, out); } return out; }
      if (a !== b) out.push(p);
      return out;
    };
    const norm = (x) => JSON.stringify(x, (k, v) => DROP.includes(k) ? undefined : v);
    const BAD = ['arrive_min', 'cancel_min', 'care_task_min', 'surges', 'test_boosts', 'turnaround_scales', 'disposition_boost',
      'free_at_min', 'rate_ceiling', 'rng', 'extra_prob', 'feed_faults', 'injections', 'missing_inputs', 'actual_arrival'];
    const bad = (x) => { const s = JSON.stringify(x); return BAD.filter(k => s.includes('"' + k + '"')); };
    const res = { pairs: {}, scan: [] };
    async function pair(name, a, b, times) {
      const ia = await mk(a, 7), ib = await mk(b, 7);
      res.pairs[name] = [];
      let cur = 0;
      for (const t of times) {
        await go(ia, t - cur); await go(ib, t - cur); cur = t;
        const fa = await fc(ia), fb = await fc(ib);
        const sa = await st(ia), sb = await st(ib);
        res.pairs[name].push({ t, version: [fa.source.version, fb.source.version], stateSame: normS(sa) === normS(sb), statePaths: paths(sa, sb), fcSame: norm(fa) === norm(fb),
          chance: [fa.overall && fa.overall.chance, fb.overall && fb.overall.chance], samples: fa.model.settings.samples,
          norm: norm(fa), announced: fa.inputs && fa.inputs.announced_ambulances, announcedPatients: fa.inputs && fa.inputs.announced_patients,
          bad: [...bad(fa), ...bad(fb)], status: [fa.status, fb.status] });
        res.scan.push(...bad(fa), ...bad(fb));
      }
      return [ia, ib];
    }
    const [ha, hb] = await pair('hidden', 'fixture-hidden-future-a', 'fixture-hidden-future-b', [60, 70, 120]);
    const [ea, eb] = await pair('eta', 'fixture-eta-private-a', 'fixture-eta-private-b', [30, 35, 50]);
    // The same received state in a brand-new replay gives the same forecast (a function of received data only).
    const ia2 = await mk('fixture-hidden-future-a', 7); await go(ia2, 60); await go(ia2, 10);
    const f2 = await fc(ia2);
    res.fresh = { same: norm(f2) === res.pairs.hidden[1].norm, version: f2.source.version };
    // Explanation at T+70 is identical across the hidden pair and carries no hidden field.
    const ja = await mk('fixture-hidden-future-a', 7), jb = await mk('fixture-hidden-future-b', 7);
    await go(ja, 60); await go(jb, 60); await go(ja, 10); await go(jb, 10);
    const ga = await fc(ja), gb = await fc(jb);
    const xa = await post(`/api/v1/replays/${ja}/forecast/explain`, { zone: 3, samples: 50, expected_version: ga.source.version });
    const xb = await post(`/api/v1/replays/${jb}/forecast/explain`, { zone: 3, samples: 50, expected_version: gb.source.version });
    res.explain = { s: [xa.s, xb.s], same: norm(xa.j) === norm(xb.j), bad: [...bad(xa.j), ...bad(xb.j)], zone: xa.j.zone, service: xa.j.service };
    // A stale expected_version is refused; an explanation needs a held forecast.
    await go(ja, 5);
    const stale = await post(`/api/v1/replays/${ja}/forecast`, { samples: 50, expected_version: ga.source.version });
    const cur = (await st(ja)).version;
    const held = await post(`/api/v1/replays/${ja}/forecast/explain`, { zone: 3, samples: 50, expected_version: ga.source.version });
    const noHeld = await post(`/api/v1/replays/${ja}/forecast/explain`, { zone: 3, samples: 50, expected_version: cur });
    const missing = await post(`/api/v1/replays/${ja}/forecast/explain`, { zone: 3, samples: 50 });
    res.refused = { stale: stale.s, noHeld: noHeld.s, missingVersion: missing.s, olderStillHeld: held.s, cur, old: ga.source.version };
    // Repeating a request for the same version is cached and equal.
    const again = await fc(ja), again2 = await fc(ja);
    res.cache = { cached: again2.cached, same: norm(again) === norm(again2) };
    return res;
  });
  const hp = o.pairs.hidden, ep = o.pairs.eta;
  chk('I1 hidden-future pair: received state and forecast identical at T+60 and T+70', hp[0].stateSame && hp[0].fcSame && hp[1].stateSame && hp[1].fcSame, hp.slice(0, 2));
  chk('I1 hidden-future pair: at T+120 the received state differs and so may the forecast', !hp[2].stateSame && !hp[2].fcSame, hp[2]);
  chk('I2 private arrival vs announced ETA: identical received state and forecast at T+30 and T+35', ep[0].stateSame && ep[0].fcSame && ep[1].stateSame && ep[1].fcSame, ep.slice(0, 2));
  chk('I2 only the received announcement enters (1 ambulance, 2 patients at T+30)', ep[0].announced === 1 && ep[0].announcedPatients === 2, ep[0]);
  chk('I2 once the earlier arrival is received (T+50) the received state differs', !ep[2].stateSame, ep[2].statePaths);
  chk('I3 no hidden schedule or private value in any forecast or explanation response', o.scan.length === 0 && o.explain.bad.length === 0, { scan: o.scan, explain: o.explain.bad });
  chk('I4 a fresh replay at the same received state gives the same forecast', o.fresh.same, o.fresh);
  chk('I5 explanation is identical across the hidden pair at T+70', o.explain.s[0] === 200 && o.explain.s[1] === 200 && o.explain.same, o.explain);
  chk('I6 stale expected_version, a version never forecast and a missing version are refused (409, 409, 422); a recent older version is still explained (200)', o.refused.stale === 409 && o.refused.noHeld === 409 && o.refused.missingVersion === 422 && o.refused.olderStillHeld === 200, o.refused);
  chk('I7 repeating a request for one version returns the cached, equal result', o.cache.cached === true && o.cache.same, o.cache);
  R.data.statePaths = { hidden: hp.map(x => x.statePaths), eta: ep.map(x => x.statePaths) };
  for (const p of [...hp, ...ep]) delete p.norm;
  R.data = { ...R.data, hidden: hp.map(x => ({ t: x.t, stateSame: x.stateSame, fcSame: x.fcSame, chance: x.chance })), eta: ep.map(x => ({ t: x.t, stateSame: x.stateSame, fcSame: x.fcSame, chance: x.chance })), explain: { service: o.explain.service, zone: o.explain.zone } };
  return R;
}
