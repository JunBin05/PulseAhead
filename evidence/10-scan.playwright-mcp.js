// Playwright MCP snippet used for the ticket 10 evidence (invariants over many real forecasts). Run with
// browser_run_code_unsafe (Playwright MCP); not a standalone test runner. Expects the production build on :8000.
// Set PART to 'A' (families 0-3) or 'B' (families 4-6). Each family runs on its second test seed to T+360 with a
// forecast every 15 simulated minutes (50 futures). Checks alert ordering with 2+ alerts, the deadline formula,
// countdown values, lambda > mu without a sampled onset, and the chance = events / samples identity.
async (page) => {
  const PART = 'A';
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), part: PART, checks: {}, problems: [], data: {} };
  const chk = (n, ok, d) => { R.checks[n] = ok ? 'pass' : 'FAIL ' + JSON.stringify(d).slice(0, 500); if (!ok) R.problems.push(n); };
  await page.goto(BASE + '/');
  const o = await page.evaluate(async (PART) => {
    const H = { 'content-type': 'application/json' };
    const post = async (u, b) => (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).json();
    const st = async (id) => (await fetch(`/api/v1/replays/${id}/state`)).json();
    const cat = await fetch('/api/v1/scenarios').then(r => r.json());
    const fams = cat.scenarios.filter((_, i) => PART === 'A' ? i < 4 : i >= 4);
    const res = { fams: [], forecasts: [], ms: [] };
    for (const fam of fams) {
      const seed = fam.seed_partitions.test[1];
      const id = (await post('/api/v1/replays', { scenario: fam.id, seed })).replay_id;
      let t = 0;
      while (t < 360) {
        await post(`/api/v1/replays/${id}/advance`, { minutes: 15 }); t += 15;
        const s = await st(id);
        const f = await post(`/api/v1/replays/${id}/forecast`, { samples: 50, expected_version: s.version });
        const sig = Object.entries(s.pressure.services).filter(([, v]) => v.rates && v.rates.pressure_signal).map(([k]) => k);
        res.forecasts.push({ fam: fam.id, seed, t, f, sig, ov: s.overall_status.state });
        res.ms.push(f.compute.ms);
      }
      res.fams.push({ id: fam.id, seed });
    }
    return res;
  }, PART);
  const F = o.forecasts, ok = F.filter(x => x.f.status === 'ok');
  const dlv = (a) => a.deadline.latest_start_min;
  const orderOk = (a) => a.every((x, i) => { if (i === 0) return true; const p = a[i - 1], d1 = dlv(p), d2 = dlv(x);
    if (d1 !== null && d2 !== null) return d1 < d2 || (d1 === d2 && p.affected_patients >= x.affected_patients);
    if (d1 === null && d2 !== null) return false;
    if (d1 === null && d2 === null) return p.affected_patients >= x.affected_patients;
    return true; });
  const multi = ok.filter(x => x.f.alerts.actionable.length >= 2);
  chk('S1 ' + F.length + ' forecasts over ' + o.fams.length + ' families; every one returned a status and a state version', F.every(x => ['ok', 'cannot_assess'].includes(x.f.status) && x.f.source.version > 0), null);
  chk('S2 alert ordering holds in all ' + multi.length + ' lists with 2+ actionable alerts (deadline first, then affected patients; no-deadline last)', multi.length > 0 && multi.every(x => orderOk(x.f.alerts.actionable)), multi.filter(x => !orderOk(x.f.alerts.actionable)).slice(0, 1).map(x => x.f.alerts.actionable.map(a => [a.service, dlv(a), a.affected_patients])));
  chk('S2 recovery alerts are kept apart from actionable ones and ordered by affected patients', ok.every(x => x.f.alerts.recovery.every(a => a.state === 'overloaded') && x.f.alerts.actionable.every(a => a.state !== 'overloaded') && x.f.alerts.recovery.every((a, i, l) => i === 0 || l[i - 1].affected_patients >= a.affected_patients)), null);
  const withDl = ok.flatMap(x => x.f.alerts.actionable.filter(a => dlv(a) !== null && a.onset));
  chk('S3 deadline = lower onset bound - 5 - setup - 5 for all ' + withDl.length + ' alerts with a deadline; status open iff the latest start is not before now', withDl.length > 0 && ok.every(x => x.f.alerts.actionable.filter(a => dlv(a) !== null && a.onset).every(a => Math.abs(dlv(a) - (a.onset.low_min - 5 - a.deadline.setup_min - 5)) < 0.11 && (a.deadline.status === 'open') === (dlv(a) >= x.f.forecast_time_min))), null);
  chk('S3 a building alert never has a deadline and a recovery alert says recovery', ok.every(x => x.f.alerts.actionable.filter(a => a.kind === 'building').every(a => dlv(a) === null && a.deadline.status === 'unavailable') && x.f.alerts.recovery.every(a => a.deadline.status === 'recovery' && dlv(a) === null)), null);
  const nums = [];
  const walk = (v, p) => { if (v && typeof v === 'object') for (const [k, w] of Object.entries(v)) { if (['expected_in_min', 'low_in_min', 'high_in_min'].includes(k) && typeof w === 'number') nums.push(w); walk(w, p + '.' + k); } };
  F.forEach(x => walk(x.f, ''));
  chk('S4 all ' + nums.length + ' countdown values are positive', nums.length > 0 && nums.every(v => v > 0), nums.filter(v => !(v > 0)).slice(0, 3));
  const bld = ok.flatMap(x => [x.f.overall, ...Object.values(x.f.services)].filter(y => y.kind === 'confirmation' || (y.kind === 'recovery' && y.onset)));
  chk('S4 building intervals carry no onset range; recovery estimates carry only a clearing median', bld.every(y => y.kind === 'confirmation' ? y.onset === null : (y.onset.low_in_min === undefined)), bld.slice(0, 1));
  const sig = ok.flatMap(x => x.sig.filter(sid => x.f.services[sid].kind === 'new_onset').map(sid => ({ fam: x.fam, t: x.t, sid, chance: x.f.services[sid].chance, onset: x.f.services[sid].onset, ev: x.f.services[sid].events })));
  const sig0 = sig.filter(s => s.ev === 0);
  chk('S5 lambda > mu without a sampled onset gives no timer: ' + sig.length + ' pressure-signal services, ' + sig0.length + ' with no onset in 50 futures, none has a range', sig0.every(s => s.onset === null) && sig.every(s => s.ev > 0 ? s.onset !== null : s.onset === null), sig0.filter(s => s.onset !== null).slice(0, 2));
  chk('S6 chance = events / samples for every overall and service summary', ok.every(x => [x.f.overall, ...Object.values(x.f.services)].every(y => y.chance === null || Math.abs(y.chance - y.events / y.samples) < 1e-9)), null);
  const ms = o.ms.slice().sort((a, b) => a - b);
  R.data = { families: o.fams, forecasts: F.length, cannotAssess: F.length - ok.length, multiLists: multi.length, maxAlerts: Math.max(...ok.map(x => x.f.alerts.actionable.length)), deadlines: withDl.length,
    tooLate: withDl.filter(a => a.deadline.status === 'too_late').length, pressureSignalCases: sig.length, pressureSignalNoOnset: sig0.length, countdownValues: nums.length,
    computeMs: { median: ms[Math.floor(ms.length / 2)], p90: ms[Math.ceil(0.9 * ms.length) - 1], max: ms[ms.length - 1] },
    overallKinds: ok.reduce((m, x) => { m[x.f.overall.kind] = (m[x.f.overall.kind] || 0) + 1; return m; }, {}) };
  return R;
}
