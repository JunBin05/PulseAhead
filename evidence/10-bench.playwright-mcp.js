// Playwright MCP snippet used for the ticket 10 evidence (50 vs 100 futures and a full development shift). Run with
// browser_run_code_unsafe (Playwright MCP); not a standalone test runner. Expects the production build on :8000.
// PART 'A': 50 vs 100 futures at development checkpoints (development seed 7) of diagnostic-delay, busy-recovers
// and arrival-surge. PART 'B': one full development shift (seed 7 normal, T+720), a forecast every 5 minutes.
// The first 50 of the 100 futures are the same keyed futures (k = 0..49), so differences come from the extra 50.
async (page) => {
  const PART = 'A';
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), part: PART, checks: {}, problems: [], data: {} };
  const chk = (n, ok, d) => { R.checks[n] = ok ? 'pass' : 'FAIL ' + JSON.stringify(d).slice(0, 500); if (!ok) R.problems.push(n); };
  await page.goto(BASE + '/');
  const o = await page.evaluate(async (PART) => {
    const H = { 'content-type': 'application/json' };
    const post = async (u, b) => { const t = performance.now(); const j = await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).json(); return { j, wall: performance.now() - t }; };
    const out = { machine: { cores: navigator.hardwareConcurrency, ua: navigator.userAgent.slice(0, 90) } };
    if (PART === 'A') {
      out.rows = [];
      for (const fam of ['diagnostic-delay', 'busy-recovers', 'arrival-surge']) {
        const id = (await post('/api/v1/replays', { scenario: fam, seed: 7 })).j.replay_id;
        let t = 0;
        for (const cp of [30, 60, 90, 120, 150, 180, 240, 300, 360]) {
          while (t < cp) { const m = Math.min(60, cp - t); await post(`/api/v1/replays/${id}/advance`, { minutes: m }); t += m; }
          const a = await post(`/api/v1/replays/${id}/forecast`, { samples: 50 });
          const b = await post(`/api/v1/replays/${id}/forecast`, { samples: 100 });
          const pick = (f) => ({ overall: { k: f.overall.kind, c: f.overall.chance, med: f.overall.onset && f.overall.onset.expected_in_min }, svc: Object.fromEntries(Object.entries(f.services).map(([k, v]) => [k, { k: v.kind, c: v.chance, med: v.onset && v.onset.expected_in_min }])),
            alerts: [...f.alerts.actionable, ...f.alerts.recovery].map(x => x.service + ':' + x.kind) });
          out.rows.push({ fam, t: cp, a: pick(a.j), b: pick(b.j), ms: [a.j.compute.ms, b.j.compute.ms], wall: [a.wall, b.wall] });
        }
      }
    } else {
      const id = (await post('/api/v1/replays', { scenario: 'normal', seed: 7 })).j.replay_id;
      const rows = []; const t0 = performance.now();
      for (let t = 5; t <= 720; t += 5) {
        await post(`/api/v1/replays/${id}/advance`, { minutes: 5 });
        const r = await post(`/api/v1/replays/${id}/forecast`, { samples: 50 });
        const f = r.j;
        rows.push({ t, st: f.status, k: f.overall && f.overall.kind, c: f.overall && f.overall.chance, ms: f.compute.ms, wall: r.wall, al: f.alerts.actionable.length, rec: f.alerts.recovery.length, unk: f.alerts.unknown.length, ver: f.source.version });
      }
      out.shift = rows; out.total = performance.now() - t0;
      out.final = (await (await fetch(`/api/v1/replays/${id}/state`)).json()).sim_time_min;
    }
    return out;
  }, PART);
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.max(0, Math.min(s.length - 1, Math.ceil(p * s.length) - 1))]; };
  R.data.machine = o.machine;
  if (PART === 'A') {
    const cmp = [];
    for (const r of o.rows) {
      const add = (name, x, y) => { if (x.c === null || y.c === null || x.c === undefined) return; const p = (x.c + y.c) / 2, se = Math.sqrt(p * (1 - p) * (1 / 50 + 1 / 100)); cmp.push({ fam: r.fam, t: r.t, name, c50: x.c, c100: y.c, d: Math.abs(x.c - y.c), se, same: x.k === y.k }); };
      add('overall', r.a.overall, r.b.overall);
      for (const k of Object.keys(r.a.svc)) add(k, r.a.svc[k], r.b.svc[k]);
    }
    const d = cmp.map(x => x.d), live = cmp.filter(x => x.c50 > 0 || x.c100 > 0);
    const ov = cmp.filter(x => x.name === 'overall');
    const over2 = cmp.filter(x => x.se > 0 && x.d > 2 * x.se);
    chk('B1 ' + o.rows.length + ' checkpoints x (overall + 9 services): kind (new onset / confirmation / recovery) is the same at 50 and 100 futures', cmp.every(x => x.same), cmp.filter(x => !x.same).slice(0, 3));
    chk('B2 the onset-chance difference between 50 and 100 futures stays within the binomial noise of the pair: max |difference| <= 0.2 and at most 5% of the ' + live.length + ' non-zero comparisons exceed 2 standard errors', Math.max(...d) <= 0.2 && over2.length <= Math.ceil(0.05 * live.length), { max: Math.max(...d), over2: over2.length, live: live.length });
    const alertsSame = o.rows.filter(r => JSON.stringify(r.a.alerts) === JSON.stringify(r.b.alerts)).length;
    R.data.chanceDifference = { comparisons: cmp.length, nonZero: live.length, mean: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(4), meanNonZero: +(live.reduce((a, b) => a + b.d, 0) / Math.max(1, live.length)).toFixed(4), max: +Math.max(...d).toFixed(3),
      overallMax: +Math.max(...ov.map(x => x.d)).toFixed(3), over2se: over2.length, worst: cmp.slice().sort((a, b) => b.d - a.d).slice(0, 4).map(x => [x.fam, x.t, x.name, x.c50, x.c100]) };
    R.data.alertListsIdentical = alertsSame + ' of ' + o.rows.length;
    const w50 = o.rows.map(r => r.wall[0]), w100 = o.rows.map(r => r.wall[1]), m50 = o.rows.map(r => r.ms[0]), m100 = o.rows.map(r => r.ms[1]);
    R.data.latencyMs = { n: o.rows.length, f50: { computeMedian: q(m50, 0.5), computeP90: q(m50, 0.9), wallMedian: Math.round(q(w50, 0.5)), wallMax: Math.round(Math.max(...w50)) }, f100: { computeMedian: q(m100, 0.5), computeP90: q(m100, 0.9), wallMedian: Math.round(q(w100, 0.5)), wallMax: Math.round(Math.max(...w100)) } };
    chk('B3 forecast latency target 2 s: every 50- and 100-future forecast (client wall time, including the HTTP round trip) is under 2000 ms', Math.max(...w50, ...w100) < 2000, R.data.latencyMs);
  } else {
    const s = o.shift;
    const wall = s.map(x => x.wall), ms = s.map(x => x.ms);
    chk('F1 a complete development shift: 144 forecasts, T+5 to T+720, each with its own state version and a status', s.length === 144 && s.every((x, i) => x.t === 5 * (i + 1) && ['ok', 'cannot_assess'].includes(x.st)) && new Set(s.map(x => x.ver)).size === 144 && o.final === 720, { n: s.length, final: o.final });
    chk('F2 every forecast of the shift (50 futures) is under the 2 s target (client wall time)', Math.max(...wall) < 2000, { max: Math.max(...wall) });
    const kinds = s.reduce((m, x) => { m[x.k] = (m[x.k] || 0) + 1; return m; }, {});
    R.data.shift = { forecasts: s.length, totalSeconds: +(o.total / 1000).toFixed(1), computeMs: { median: q(ms, 0.5), p90: q(ms, 0.9), max: Math.max(...ms) }, wallMs: { median: Math.round(q(wall, 0.5)), p90: Math.round(q(wall, 0.9)), max: Math.round(Math.max(...wall)) },
      overallKinds: kinds, maxActionable: Math.max(...s.map(x => x.al)), maxRecovery: Math.max(...s.map(x => x.rec)), cannotAssess: s.filter(x => x.st !== 'ok').length, peakOverallChance: Math.max(...s.map(x => x.c || 0)) };
    R.data.perHourComputeMs = [...Array(12).keys()].map(h => Math.round(ms.slice(h * 12, h * 12 + 12).reduce((a, b) => a + b, 0) / 12));
  }
  return R;
}
