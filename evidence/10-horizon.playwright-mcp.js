// Playwright MCP snippet used for the ticket 10 evidence (horizon cases through the API). Run with
// browser_run_code_unsafe (Playwright MCP); not a standalone test runner. Expects the production build on :8000.
// Fixtures: fixture-congestion-boundary (overall onset 31, confirmed 51, cleared 85; local space 31/41/103; the
// announced 8-critical ambulance has ETA 30.5), fixture-queue-surge (triage-only overload), fixture-diagnostics-gap
// (imaging inputs missing T+90 to T+120), fixture-feed-staffing-stop (staffing feed stopped from T+32 to T+70).
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), checks: {}, problems: [], data: {} };
  const chk = (n, ok, d) => { R.checks[n] = ok ? 'pass' : 'FAIL ' + JSON.stringify(d).slice(0, 500); if (!ok) R.problems.push(n); };
  await page.goto(BASE + '/');
  const o = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = async (u, b) => (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).json();
    const st = async (id) => (await fetch(`/api/v1/replays/${id}/state`)).json();
    const rows = {};
    async function run(fx, times) {
      const id = (await post('/api/v1/replays', { scenario: fx, seed: 7 })).replay_id;
      let cur = 0; const out = [];
      for (const t of times) {
        while (cur < t) { const m = Math.min(60, t - cur); await post(`/api/v1/replays/${id}/advance`, { minutes: m }); cur += m; }
        const s = await st(id);
        const f = await post(`/api/v1/replays/${id}/forecast`, { samples: 50, expected_version: s.version });
        out.push({ t, f, s: { version: s.version, time: s.sim_time_min, overall: s.overall_status, zones: s.pressure.zones, svc: s.pressure.services, spaces: s.resources.ed_spaces } });
      }
      rows[fx] = out;
    }
    await run('fixture-congestion-boundary', [10, 20, 31, 36, 40, 45, 50, 52, 60, 80]);
    await run('fixture-queue-surge', [1, 4, 15, 40, 100]);
    await run('fixture-diagnostics-gap', [85, 95, 110, 125]);
    await run('fixture-feed-staffing-stop', [35, 40, 41, 42, 60, 72]);
    return rows;
  });
  const at = (fx, t) => o[fx].find(r => r.t === t);
  const cb = (t) => at('fixture-congestion-boundary', t);
  const all = Object.values(o).flat();
  const ok = all.filter(r => r.f.status === 'ok');

  // Source, version and settings agree with the state the forecast was requested for.
  chk('H0 every forecast carries the state version and time it was computed from, and its settings', all.every(r => r.f.source.version === r.s.version && r.f.source.sim_time_min === r.s.time && r.f.forecast_time_min === r.s.time && r.f.model.settings.samples === 50 && r.f.model.settings.horizon_min === 90 && r.f.model.settings.tail_min === 20 && r.f.model.settings.refresh_every_min === 5 && typeof r.f.model.version === 'string'), all.map(r => [r.t, r.f.source.version, r.s.version]).slice(0, 4));
  chk('H0 chance = events / samples and no-event fraction = 1 - chance for every overall and service summary', ok.every(r => [r.f.overall, ...Object.values(r.f.services)].every(x => x.chance === null || (Math.abs(x.chance - x.events / x.samples) < 1e-9 && Math.abs(x.no_event_fraction - (1 - x.chance)) < 1e-9))), null);

  // Announced demand: the received announcement (8 critical patients) is the only reason for the early risk.
  const a10 = cb(10).f, a20 = cb(20).f;
  chk('H1 known inbound demand: T+10 and T+20 overall new-onset chance >= 0.8, 90% range ordered and in the future, median = median_min - forecast time', [a10, a20].every(f => f.overall.kind === 'new_onset' && f.overall.chance >= 0.8 && f.overall.onset.low_in_min <= f.overall.onset.expected_in_min && f.overall.onset.expected_in_min <= f.overall.onset.high_in_min && f.overall.onset.low_in_min > 0 && Math.abs(f.overall.onset.expected_in_min - (f.overall.onset.median_min - f.forecast_time_min)) < 0.11), [a10.overall, a20.overall]);
  chk('H1 the announcement is counted once (1 ambulance, 8 patients) at T+10 and T+20', [a10, a20].every(f => f.inputs.announced_ambulances === 1 && f.inputs.announced_patients === 8), [a10.inputs, a20.inputs]);
  R.data.knownDemand = { actualOverallOnset: 31, t10: a10.overall.onset, t20: a20.overall.onset, chance: [a10.overall.chance, a20.overall.chance] };

  // Building interval: confirmation chance, elapsed time from the received onset, no new-onset countdown.
  const bt = [36, 40, 45, 50].map(cb);
  chk('H2 building: kind confirmation, elapsed = forecast time - received onset, no onset range or countdown', bt.every(r => r.s.overall.state === 'building' && r.f.overall.kind === 'confirmation' && r.f.overall.onset === null && Math.abs(r.f.overall.elapsed_min - (r.t - r.s.overall.onset_min)) < 0.11 && r.f.overall.chance >= 0 && r.f.overall.chance <= 1), bt.map(r => [r.t, r.s.overall.state, r.f.overall]));
  R.data.building = bt.map(r => ({ t: r.t, onset: r.s.overall.onset_min, elapsed: r.f.overall.elapsed_min, confirmChance: r.f.overall.chance }));
  chk('H2 the building local space interval also reports confirmation, no countdown, and a building alert with no latest start', cb(36).f.services.space.kind === 'confirmation' && cb(36).f.services.space.onset === null && cb(36).f.alerts.actionable.some(a => a.service === 'space' && a.kind === 'building' && a.deadline.latest_start_min === null), cb(36).f.alerts.actionable);

  // Confirmed interval: current status and recovery comparison, not a new-onset risk.
  const c52 = cb(52), c60 = cb(60), c80 = cb(80);
  chk('H3 confirmed: kind recovery with time since confirmation; the local alert is Recovery, not a prevention deadline', [c52, c60].every(r => r.s.overall.state === 'confirmed' && r.f.overall.kind === 'recovery' && Math.abs(r.f.overall.since_confirmed_min - (r.t - r.s.overall.confirmed_min)) < 0.11) && c52.f.alerts.recovery.some(a => a.service === 'space' && a.deadline.status === 'recovery' && a.deadline.latest_start_min === null), [c52.f.overall, c52.f.alerts.recovery]);
  chk('H3 recovering (below the clear threshold, T+80): still recovery kind with a short clearing estimate', c80.f.overall.kind === 'recovery' && c80.f.overall.onset && c80.f.overall.onset.expected_in_min > 0, c80.f.overall);

  // Local versus overall horizons.
  const q15 = at('fixture-queue-surge', 15), q4 = at('fixture-queue-surge', 4), q1 = at('fixture-queue-surge', 1);
  chk('H4 triage-only overload (T+15): triage recovery kind, zone 1 overloaded, overall still stable with its own new-onset forecast', q15.f.services.triage.kind === 'recovery' && q15.f.zones.find(z => z.zone === 1).state === 'overloaded' && q15.s.overall.state === 'stable' && q15.f.overall.kind === 'new_onset', { tri: q15.f.services.triage.kind, ov: q15.f.overall.kind, st: q15.s.overall.state });
  chk('H4 triage building (T+4): confirmation chance for the local interval, overall unchanged', q4.f.services.triage.kind === 'confirmation' && q4.f.overall.kind === 'new_onset' && q4.f.overall.chance === 0, { tri: q4.f.services.triage, ov: q4.f.overall });
  chk('H4 a forecast warning can sit on a Normal zone (T+15 lab risk >= warning threshold) and is not shown as congestion', q15.f.alerts.actionable.some(a => a.kind === 'forecast_risk' && a.state === 'normal' && a.chance >= q15.f.model.settings.warning_threshold) && q15.f.zones.some(z => z.warning && z.state === 'normal'), q15.f.alerts.actionable.map(a => [a.service, a.kind, a.chance]));
  chk('H4 no sampled onset is explicit: T+1 overall chance 0, no onset range, no-event fraction 1', q1.f.overall.chance === 0 && q1.f.overall.onset === null && q1.f.overall.no_event_fraction === 1 && q1.f.overall.events === 0, q1.f.overall);

  // Missing and stale inputs.
  const g95 = at('fixture-diagnostics-gap', 95), g110 = at('fixture-diagnostics-gap', 110), g125 = at('fixture-diagnostics-gap', 125);
  chk('H5 missing imaging inputs: imaging unknown with no chance or countdown, listed apart; other services and overall still forecast', [g95, g110].every(r => r.f.status === 'ok' && r.f.services.imaging.kind === 'unknown' && r.f.services.imaging.chance === null && !r.f.services.imaging.onset && r.f.alerts.unknown.some(u => u.service === 'imaging') && r.f.overall.kind === 'new_onset' && r.f.services.lab.kind === 'new_onset') && g125.f.alerts.unknown.length === 0, [g95.f.services.imaging, g95.f.alerts.unknown]);
  chk('H5 the limitation names the service with missing inputs', g95.f.limitations.some(l => /imaging/i.test(l)), g95.f.limitations);
  const s40 = at('fixture-feed-staffing-stop', 40), s41 = at('fixture-feed-staffing-stop', 41), s60 = at('fixture-feed-staffing-stop', 60), s72 = at('fixture-feed-staffing-stop', 72);
  chk('H6 stale essential feed: age 10 still forecasts, age 11 is Cannot assess with no ranking or countdown; resumed feed forecasts again', s40.f.status === 'ok' && [s41, s60].every(r => r.f.status === 'cannot_assess' && r.f.overall === null && r.f.zones.length === 0 && r.f.alerts.actionable.length === 0 && r.f.next_step.code === 'inspect_inputs' && r.f.reasons.length > 0 && r.s.overall.assessable === false) && s72.f.status === 'ok', [s40.f.status, s41.f.status, s60.f.status, s72.f.status, s41.f.reasons]);

  // Countdown rules across every forecast returned above.
  const nums = [];
  const walk = (x, path) => { if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (['expected_in_min', 'low_in_min', 'high_in_min'].includes(k) && typeof v === 'number') nums.push([path + '.' + k, v]); walk(v, path + '.' + k); } };
  all.forEach(r => walk(r.f, String(r.t)));
  chk('H7 no negative or zero countdown anywhere in ' + all.length + ' forecasts (' + nums.length + ' countdown values)', nums.length > 0 && nums.every(([, v]) => v > 0), nums.filter(([, v]) => !(v > 0)).slice(0, 5));
  const bad = ok.flatMap(r => [r.f.overall, ...Object.values(r.f.services)].filter(x => (x.kind === 'confirmation') && (x.onset !== null && x.onset !== undefined)));
  chk('H7 no new-onset countdown for any building interval', bad.length === 0, bad.slice(0, 2));
  // Pressure signal (lambda > mu) without a sampled onset gives no timer.
  const press = ok.flatMap(r => Object.entries(r.s.svc).filter(([sid, v]) => v.rates && v.rates.pressure_signal && r.f.services[sid].kind === 'new_onset').map(([sid, v]) => ({ t: r.t, sid, onset: r.f.services[sid].onset, chance: r.f.services[sid].chance })));
  chk('H7 lambda > mu alone never creates a timer: every pressure-signal service without a sampled onset has none (' + press.length + ' cases examined, ' + press.filter(p => p.chance === 0).length + ' with chance 0)', press.filter(p => p.chance === 0).every(p => p.onset === null), press.filter(p => p.chance === 0 && p.onset !== null).slice(0, 3));
  R.data.pressureCases = press.length;

  // Alert order: earliest latest-start first; those without a deadline after, by affected patients.
  const ord = ok.map(r => r.f.alerts.actionable).filter(a => a.length > 1);
  const sorted = (a) => a.every((x, i) => i === 0 || (() => { const p = a[i - 1], d1 = p.deadline.latest_start_min, d2 = x.deadline.latest_start_min; if (d1 !== null && d2 !== null) return d1 < d2 || (d1 === d2 && p.affected_patients >= x.affected_patients); if (d1 === null && d2 !== null) return false; if (d1 === null && d2 === null) return p.affected_patients >= x.affected_patients; return true; })());
  chk('H8 actionable alerts with 2+ entries are ordered by deadline then affected patients (' + ord.length + ' lists)', ord.every(sorted), ord.filter(a => !sorted(a)).slice(0, 1));
  const dl = ok.flatMap(r => r.f.alerts.actionable.filter(a => a.deadline.latest_start_min !== null && a.onset).map(a => ({ a, low: a.onset.low_min })));
  chk('H8 each deadline = lower onset bound - 5 min review - setup - 5 min margin (' + dl.length + ' alerts)', dl.length > 0 && dl.every(({ a, low }) => Math.abs(a.deadline.latest_start_min - (low - a.deadline.review_min - a.deadline.setup_min - a.deadline.margin_min)) < 0.11 && a.deadline.review_min === 5 && a.deadline.margin_min === 5), dl.slice(0, 2));
  chk('H8 impact stays unavailable until a comparison exists', ok.every(r => [...r.f.alerts.actionable, ...r.f.alerts.recovery].every(a => a.impact === null)), null);
  R.data.counts = { forecasts: all.length, ok: ok.length, countdownValues: nums.length, deadlines: dl.length };
  return R;
}
