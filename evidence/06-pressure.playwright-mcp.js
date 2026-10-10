// Playwright MCP snippet used for the ticket 06 evidence. Run with browser_run_code_unsafe (Playwright MCP);
// not a standalone test runner. Expects the production build on :8000. Set PART to 'engine' or 'seed7' (the UI checks are in 06-ui.playwright-mcp.js).
async (page) => {
  const PART = 'engine';
  const BASE = 'http://127.0.0.1:8000';
  const R = { base: BASE, part: PART, at: new Date().toISOString(), checks: {} };
  const consoleMsgs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleMsgs.push(m.text().slice(0, 120)); });
  let replayId = null;
  page.on('response', async (r) => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  const api = (path) => page.evaluate((p) => fetch(p).then((r) => r.json()), path);
  await page.goto(BASE + '/');

  // ---- the rules, written from the spec and applied to reconstructed queues (not engine internals) ------
  const SPEC = {
    thresholds: { triage: 3, assessment: 6, lab: 4, imaging: 2, discharge: 3, allocation: 3, transport: 3 },
    localConfirm: 10, localClear: 5,
    overallAvailable: 0, overallAwaiting: 6, overallConfirm: 20, overallClearBelow: 3, overallClear: 10,
  };
  const SERVICES = ['triage', 'assessment', 'space', 'lab', 'imaging', 'discharge', 'allocation', 'transport', 'ward_beds'];
  const ZONE_OF = { triage: 1, assessment: 2, space: 2, lab: 3, imaging: 3, discharge: 4, allocation: 4, transport: 4, ward_beds: 4 };
  const WAIT = { awaiting_triage: 'triage', awaiting_space: 'space', awaiting_clinician: 'assessment', awaiting_result_review: 'assessment_review', awaiting_lab: 'lab', awaiting_imaging: 'imaging', awaiting_discharge: 'discharge', awaiting_ward_bed: 'ward_beds', awaiting_ward_allocation: 'allocation', awaiting_transport: 'transport' };
  const DONE = { in_triage: 'triage', assessment_active: 'assessment', result_review_active: 'assessment_review', in_lab: 'lab', in_imaging: 'imaging', disposition_processing: 'discharge', ward_allocation_active: 'allocation', in_transport: 'transport', awaiting_space: 'space', awaiting_ward_bed: 'ward_beds' };
  const LOCAL_LABEL = { normal: 'Normal', building: 'Pressure building', overloaded: 'Overloaded', unknown: 'Cannot assess' };
  // Waiting queues: first assessment and result review share the same doctors, so one queue.
  const QWAIT = { ...WAIT, awaiting_result_review: 'assessment' };
  const CAT_LABEL = { triage_arrival: 'Triage / arrival pressure', physician_space: 'Physician / staffed-space constraint', lab_imaging: 'Lab / imaging delay', departure_ward_transport: 'Departure / ward / transport blockage' };
  const OVERALL_LABEL = { stable: 'Stable', building: 'Building congestion', confirmed: 'Congested' };

  const timelines = (events) => {
    const tl = {};
    for (const e of events) {
      if (e.type === 'arrival') tl[e.patient_id] = [{ t: e.event_time_min, phase: e.payload.phase, space: e.resources.ed_space ?? null, critical: !!e.payload.critical_bypass, arrival: true }];
      else if (e.type === 'phase_change') tl[e.patient_id].push({ t: e.event_time_min, phase: e.payload.to, space: e.resources.ed_space ?? null });
    }
    return tl;
  };
  const phaseAt = (line, t) => { let cur = null; for (const x of line) { if (x.t <= t) cur = x; else break; } return cur; };

  // Reconstructs per-minute queues from /events, then runs both rules. `opts.staffedGeneral` lists the
  // general spaces whose covering nurse is on duty (whole run), `opts.missing` the feed gaps.
  const reconstruct = (events, tMax, opts) => {
    const tl = timelines(events);
    const q = {}; const blocked = {}; const avail = []; const awaiting = []; const unknownAt = {};
    for (const s of SERVICES) { q[s] = []; blocked[s] = []; }
    for (let t = 1; t <= tMax; t++) {
      const cnt = {}; let gWait = 0, rWait = 0; const occ = new Set();
      for (const line of Object.values(tl)) {
        const x = phaseAt(line, t);
        if (!x || x.phase === 'departed') continue;
        if (QWAIT[x.phase]) cnt[QWAIT[x.phase]] = (cnt[QWAIT[x.phase]] || 0) + 1;
        if (x.phase === 'awaiting_space') { if (line[0].critical) rWait++; else gWait++; }
        if (x.space) occ.add(x.space);
      }
      const freeGeneral = opts.staffedGeneral.filter((id) => !occ.has(id)).length;
      const freeResus = ['R1', 'R2'].filter((id) => !occ.has(id)).length;
      for (const s of SERVICES) q[s][t] = cnt[s] || 0;
      blocked.space[t] = (gWait > 0 && freeGeneral === 0) || (rWait > 0 && freeResus === 0);
      blocked.ward_beds[t] = (cnt.ward_beds || 0) > 0;
      avail[t] = freeGeneral; awaiting[t] = gWait + rWait;
    }
    const missing = (s, t) => (opts.missing || []).some(([a, b, list]) => a <= t && t < b && list.includes(s));
    const local = {}; const localEp = {};
    for (const s of SERVICES) {
      let st = 'normal', onset = null, conf = null, below = null; const eps = []; const out = [];
      for (let t = 1; t <= tMax; t++) {
        if (missing(s, t)) { below = null; if (st === 'building') { st = 'normal'; onset = null; } out[t] = { api: 'unknown', raw: st, unknown: true }; continue; }
        const thr = SPEC.thresholds[s];
        const over = thr !== undefined && q[s][t] >= thr;
        const cond = over || (blocked[s][t] && q[s][t] >= 1);
        if (st === 'normal') { if (cond) { st = 'building'; onset = t; } }
        else if (st === 'building') {
          if (!cond) { st = 'normal'; onset = null; }
          else if (t - onset >= SPEC.localConfirm) { st = 'overloaded'; conf = t; eps.push({ onset_min: onset, confirmed_min: t, cleared_min: null }); }
        } else {
          if (!over && !blocked[s][t]) {
            if (below === null) below = t;
            else if (t - below >= SPEC.localClear) { eps[eps.length - 1].cleared_min = t; st = 'normal'; onset = conf = below = null; }
          } else below = null;
        }
        out[t] = { api: st, raw: st, unknown: false, onset, conf, below };
      }
      local[s] = out; localEp[s] = eps;
    }
    const overall = []; const overallEp = [];
    { let st = 'stable', onset = null, conf = null, below = null;
      for (let t = 1; t <= tMax; t++) {
        const cond = avail[t] <= SPEC.overallAvailable && awaiting[t] >= SPEC.overallAwaiting;
        if (st === 'stable') { if (cond) { st = 'building'; onset = t; } }
        else if (st === 'building') {
          if (!cond) { st = 'stable'; onset = null; }
          else if (t - onset >= SPEC.overallConfirm) { st = 'confirmed'; conf = t; overallEp.push({ onset_min: onset, confirmed_min: t, cleared_min: null }); }
        } else {
          if (awaiting[t] < SPEC.overallClearBelow) {
            if (below === null) below = t;
            else if (t - below >= SPEC.overallClear) { overallEp[overallEp.length - 1].cleared_min = t; st = 'stable'; onset = conf = below = null; }
          } else below = null;
        }
        overall[t] = { state: st, recovering: st === 'confirmed' && below !== null, onset, conf, below };
      } }
    const zone = (z, t) => {
      const raws = SERVICES.filter((s) => ZONE_OF[s] === z).map((s) => local[s][t]);
      if (raws.some((r) => r.raw === 'overloaded')) return 'overloaded';
      if (raws.some((r) => r.raw === 'building')) return 'building';
      if (raws.some((r) => r.unknown)) return 'unknown';
      return 'normal';
    };
    return { q, blocked, avail, awaiting, local, localEp, overall, overallEp, zone, tl };
  };

  // Per-minute /state sampler: advances 1 min at a time and keeps only what the checks need.
  const sample = (scenario, seed, totalMin) => page.evaluate(async ({ scenario, seed, totalMin }) => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then((r) => r.text());
    const first = JSON.parse(await post('/api/v1/replays', { seed, scenario }));
    const id = first.replay_id;
    const rows = []; let nonFinite = 0;
    for (let t = 1; t <= totalMin; t++) {
      const text = await post(`/api/v1/replays/${id}/advance`, { minutes: 1 });
      if (/NaN|Infinity/.test(text)) nonFinite++;
      const s = JSON.parse(text);
      const svc = {};
      for (const [k, v] of Object.entries(s.pressure.services)) {
        svc[k] = { state: v.state, queue: v.queue, blocked: v.capacity_unavailable, ok: v.inputs_ok, onset: v.onset_min, conf: v.confirmed_min, confirmsIn: v.confirms_in_min, recSince: v.recovery_since_min, lam: v.rates.received_per_hour, thr: v.rates.recent_throughput_per_hour, mu: v.rates.capacity_per_hour, sig: v.rates.pressure_signal, unit: v.rates.unit, win: v.rates.window_min, servers: v.rates.servers ?? null, mean: v.rates.mean_task_min ?? null, cat: v.category };
      }
      rows.push({ t: s.sim_time_min, v: s.version, overall: { state: s.overall_status.state, label: s.overall_status.label, onset: s.overall_status.onset_min, conf: s.overall_status.confirmed_min, rec: s.overall_status.recovering, recSince: s.overall_status.recovery_since_min, localAlert: s.overall_status.local_alert }, zones: s.pressure.zones.map((z) => z.state), zoneLabels: s.pressure.zones.map((z) => z.label), alerts: s.pressure.alerts.map((a) => ({ svc: a.service, cat: a.category, affected: a.affected_patients, urgent: a.urgent_group_waiting, state: a.state, mixed: a.mixed, also: a.also_active })), res: { labThr: s.resources.diagnostics.lab.recent_throughput_tasks_per_hour, imgThr: s.resources.diagnostics.imaging.recent_throughput_tasks_per_hour, disp: Object.fromEntries(['discharge', 'allocation', 'transport'].map((k) => [k, s.resources.disposition[k].capacity_patients_per_hour])) }, mixed: s.pressure.mixed, svc, patients: s.patients.map((p) => ({ id: p.id, phase: p.phase, urgency: p.urgency })), availGeneral: s.resources.ed_spaces.available_staffed, awaitingSpace: s.resources.ed_spaces.awaiting_space });
    }
    const ex = await fetch(`/api/v1/replays/${id}/export`).then((r) => r.json());
    const profile = await fetch('/api/v1/profile').then((r) => r.json());
    const freeAtInProfile = (profile.profile.ward_beds || []).some((b) => 'free_at_min' in b);
    const freeAtInExport = ((ex.profile && ex.profile.ward_beds) || []).some((b) => 'free_at_min' in b);
    return { id, rows, nonFinite, ex, assumptions: profile.profile.assumptions, freeAtInProfile, freeAtInExport };
  }, { scenario, seed, totalMin });

  const ALL_GENERAL = Array.from({ length: 22 }, (_, i) => 'S' + String(i + 1).padStart(2, '0'));
  const round2 = (x) => Math.round(x * 100) / 100;

  // Compares one sampled run against the independent reconstruction.
  const compare = (run, opts, tMax) => {
    const rec = reconstruct(run.ex.events, tMax, opts);
    const out = { problems: [], counts: {}, episodes: {} };
    const bad = (m) => { if (out.problems.length < 25) out.problems.push(m); };
    const A = run.assumptions;
    const meanOf = (s) => { const a = { triage: A.triage_dwell_minutes, assessment: A.active_assessment_minutes, discharge: A.disposition_processing_minutes, allocation: A.ward_allocation_minutes, transport: A.transport_minutes }[s]; return a ? (a.min + a.mode + a.max) / 3 : null; };
    const medOf = { lab: A.lab_turnaround_minutes.median, imaging: A.imaging_turnaround_minutes.median };
    // work entries/completions straight from the timelines
    const entries = {}; const dones = {};
    for (const line of Object.values(rec.tl)) {
      for (let i = 0; i < line.length; i++) {
        if (WAIT[line[i].phase]) (entries[WAIT[line[i].phase]] ??= []).push(line[i].t);
        if (i > 0 && DONE[line[i - 1].phase]) (dones[DONE[line[i - 1].phase]] ??= []).push(line[i].t);
      }
    }
    const missingAt = (s, t) => (opts.missing || []).some(([a, b, l]) => a <= t && t < b && l.includes(s));
    const tally = { normal: 0, building: 0, overloaded: 0, unknown: 0 };
    const rateSamples = [];
    for (const row of run.rows) {
      const t = row.t;
      if (t > tMax) break;
      const o = rec.overall[t];
      if (row.overall.state !== o.state) bad(`T+${t} overall ${row.overall.state} vs ${o.state}`);
      if (row.overall.rec !== o.recovering) bad(`T+${t} recovering ${row.overall.rec} vs ${o.recovering}`);
      const wantLabel = o.recovering ? 'Congested, recovering' : OVERALL_LABEL[o.state];
      if (row.overall.label !== wantLabel) bad(`T+${t} label ${row.overall.label} vs ${wantLabel}`);
      if (row.overall.onset !== o.onset && !(o.state === 'stable' && row.overall.onset === null)) bad(`T+${t} overall onset ${row.overall.onset} vs ${o.onset}`);
      if (o.state === 'confirmed' && row.overall.conf !== o.conf) bad(`T+${t} overall confirmed ${row.overall.conf} vs ${o.conf}`);
      if (row.availGeneral !== rec.avail[t] || row.awaitingSpace !== rec.awaiting[t]) bad(`T+${t} spaces avail ${row.availGeneral}/${rec.avail[t]} awaiting ${row.awaitingSpace}/${rec.awaiting[t]}`);
      for (let z = 1; z <= 4; z++) if (row.zones[z - 1] !== rec.zone(z, t)) bad(`T+${t} zone ${z} ${row.zones[z - 1]} vs ${rec.zone(z, t)}`);
      const anyOver = row.zones.includes('overloaded');
      if (row.overall.localAlert !== anyOver) bad(`T+${t} local_alert ${row.overall.localAlert} vs ${anyOver}`);
      const w = Math.min(t, 30);
      for (const s of SERVICES) {
        const a = row.svc[s]; const e = rec.local[s][t];
        tally[a.state] = (tally[a.state] || 0) + 1;
        if (a.state !== e.api) bad(`T+${t} ${s} ${a.state} vs ${e.api}`);
        if (a.ok === missingAt(s, t)) bad(`T+${t} ${s} inputs_ok ${a.ok}`);
        if (a.ok && a.queue !== rec.q[s][t]) bad(`T+${t} ${s} queue ${a.queue} vs ${rec.q[s][t]}`);
        if (!a.ok && (a.queue !== null || a.lam !== null || a.thr !== null || a.sig !== null)) bad(`T+${t} ${s} unknown inputs leaked numbers`);
        if (a.state === 'normal' && a.confirmsIn !== null) bad(`T+${t} ${s} countdown while normal`);
        if (a.state === 'building' && a.onset !== e.onset) bad(`T+${t} ${s} onset ${a.onset} vs ${e.onset}`);
        if (a.state === 'overloaded' && (a.onset !== e.onset || a.conf !== e.conf)) bad(`T+${t} ${s} onset/conf ${a.onset}/${a.conf} vs ${e.onset}/${e.conf}`);
        if (a.ok) {
          const lam = round2((entries[s] || []).filter((x) => x > t - w && x <= t).length * 60 / w);
          const thr = round2((dones[s] || []).filter((x) => x > t - w && x <= t).length * 60 / w);
          if (Math.abs(a.lam - lam) > 0.006) bad(`T+${t} ${s} lambda ${a.lam} vs ${lam}`);
          if (Math.abs(a.thr - thr) > 0.006) bad(`T+${t} ${s} throughput ${a.thr} vs ${thr}`);
          let mean = meanOf(s) ?? medOf[s] ?? null;
          if (s === 'assessment') {
            const assessed = (entries.assessment || []).filter((x) => x <= t).length;
            const reviewed = (entries.assessment_review || []).filter((x) => x <= t).length;
            const share = assessed ? Math.min(1, reviewed / assessed) : 0;
            mean = meanOf('assessment') + share * (A.result_review_minutes.min + A.result_review_minutes.mode + A.result_review_minutes.max) / 3;
          }
          if (a.servers !== null) {
            const mu = round2(a.servers * 60 / mean);
            if (Math.abs(a.mu - mu) > 0.006) bad(`T+${t} ${s} mu ${a.mu} vs ${mu}`);
            if (a.sig !== (a.lam > a.mu)) bad(`T+${t} ${s} signal ${a.sig}`);
            const wantUnit = ['lab', 'imaging'].includes(s) ? 'tasks per hour' : 'patients per hour';
            if (a.unit !== wantUnit) bad(`${s} unit ${a.unit}`);
          } else if (a.mu !== null || a.sig !== null) bad(`T+${t} ${s} capacity invented`);
          if (a.sig === true && a.state === 'normal' && a.confirmsIn !== null) bad(`T+${t} ${s} countdown from lambda>mu`);
          if (t % 30 === 0 || (a.thr === 0 && a.mu > 0 && a.queue === 0 && rateSamples.length < 6)) rateSamples.push({ t, s, lam: a.lam, mu: a.mu, thr: a.thr, unit: a.unit, sig: a.sig });
        }
      }
      // The diagnostics resource view and the pressure panel use one window and one basis.
      for (const [k, s2] of [['labThr', 'lab'], ['imgThr', 'imaging']]) {
        const want = round2((dones[s2] || []).filter((x) => x > t - w && x <= t).length * 60 / w);
        if (Math.abs(row.res[k] - want) > 0.006) bad(`T+${t} resources.diagnostics ${s2} throughput ${row.res[k]} vs ${want}`);
      }
      for (const s2 of ['discharge', 'allocation', 'transport']) if (Math.abs(row.res.disp[s2] - row.svc[s2].mu) > 0.006) bad(`T+${t} disposition ${s2} capacity ${row.res.disp[s2]} vs pressure mu ${row.svc[s2].mu}`);
      // failure categories, affected and urgent-group counts from /state patients
      const phaseSvc = (p) => QWAIT[p.phase];
      for (const al of row.alerts) {
        const inQ = row.patients.filter((p) => phaseSvc(p) === al.svc);
        if (al.affected !== inQ.length) bad(`T+${t} alert ${al.svc} affected ${al.affected} vs ${inQ.length}`);
        if (al.urgent !== inQ.filter((p) => p.urgency === 'urgent').length) bad(`T+${t} alert ${al.svc} urgent ${al.urgent}`);
        const want = { triage: 'triage_arrival', assessment: 'physician_space', space: 'physician_space', lab: 'lab_imaging', imaging: 'lab_imaging', discharge: 'departure_ward_transport', allocation: 'departure_ward_transport', transport: 'departure_ward_transport', ward_beds: 'departure_ward_transport' }[al.svc];
        if (al.cat !== want) bad(`T+${t} alert ${al.svc} category ${al.cat}`);
        const others = [...new Set(row.alerts.map((a) => a.cat).filter((c) => c !== al.cat))].map((c) => CAT_LABEL[c]).sort();
        if (al.mixed !== (others.length > 0)) bad(`T+${t} alert ${al.svc} mixed ${al.mixed}`);
        if (JSON.stringify(al.also) !== JSON.stringify(others)) bad(`T+${t} alert ${al.svc} also_active ${JSON.stringify(al.also)} vs ${JSON.stringify(others)}`);
      }
      const cats = new Set(row.alerts.map((a) => a.cat));
      if (row.mixed !== (cats.size > 1)) bad(`T+${t} mixed ${row.mixed}`);
    }
    out.counts = tally;
    out.rateSamples = rateSamples.slice(0, 14);
    // episodes: independent vs the export
    const exp = run.ex.local_episodes || {};
    for (const s of SERVICES) {
      const got = JSON.stringify((exp[s] || []).map((x) => [x.onset_min, x.confirmed_min, x.cleared_min]));
      const want = JSON.stringify(rec.localEp[s].filter((x) => x.confirmed_min <= tMax).map((x) => [x.onset_min, x.confirmed_min, x.cleared_min]));
      out.episodes[s] = { export: JSON.parse(got), independent: JSON.parse(want) };
      if (got !== want) bad(`episodes ${s} export ${got} vs independent ${want}`);
    }
    const gotO = JSON.stringify((run.ex.congestion_episodes || []).map((x) => [x.onset_min, x.confirmed_min, x.cleared_min]));
    const wantO = JSON.stringify(rec.overallEp.map((x) => [x.onset_min, x.confirmed_min, x.cleared_min]));
    out.overallEpisodes = { export: JSON.parse(gotO), independent: JSON.parse(wantO) };
    if (gotO !== wantO) bad(`overall episodes export ${gotO} vs independent ${wantO}`);
    out.freeAtMinHidden = { profileEndpoint: run.freeAtInProfile ? 'EXPOSED' : 'absent', exportRunRecord: run.freeAtInExport ? 'present' : 'absent' };
    if (run.freeAtInProfile) bad('free_at_min is exposed by /api/v1/profile');
    if (!run.freeAtInExport) bad('export.profile lost the bed release schedule');
    out.nonFinite = run.nonFinite;
    if (run.nonFinite) bad(`non-finite numbers in ${run.nonFinite} responses`);
    out.rec = rec;
    return out;
  };

  const brief = (c) => { const { rec, ...rest } = c; return rest; };
  const at = (run, t) => run.rows.find((r) => r.t === t);

  if (PART === 'engine') {
    // 1. congestion boundary fixture: exact 20/10-minute overall and 10/5-minute local timing, minute by minute
    const cb = await sample('fixture-congestion-boundary', 20261010, 150);
    const cbc = compare(cb, { staffedGeneral: ['S21', 'S22'] }, 150);
    const oe = cbc.overallEpisodes.independent[0] || [];
    const [oOnset, oConf, oClear] = oe;
    const sp = cbc.episodes.space.independent[0] || [];
    const rowAt = (t) => at(cb, t);
    R.checks.congestionBoundary = {
      compare: brief(cbc),
      overall: { onset: oOnset, confirmed: oConf, cleared: oClear },
      statusAtOnsetPlus19: oOnset != null ? [rowAt(oOnset + 19).overall.state, rowAt(oOnset + 19).overall.label] : null,
      statusAtOnsetPlus20: oOnset != null ? [rowAt(oOnset + 20).overall.state, rowAt(oOnset + 20).overall.onset, rowAt(oOnset + 20).overall.conf] : null,
      beforeOnset: oOnset != null ? rowAt(oOnset - 1).overall.state : null,
      local_space: { onset: sp[0], confirmed: sp[1], cleared: sp[2] },
      localAtOnsetPlus9: sp[0] != null ? rowAt(sp[0] + 9).svc.space.state : null,
      localAtOnsetPlus10: sp[0] != null ? [rowAt(sp[0] + 10).svc.space.state, rowAt(sp[0] + 10).svc.space.onset, rowAt(sp[0] + 10).svc.space.conf] : null,
      localAlertWhileOverallBuilding: cb.rows.filter((r) => r.overall.state === 'building' && r.overall.localAlert).map((r) => r.t).slice(0, 3),
      recoveryRows: cb.rows.filter((r) => r.overall.rec).map((r) => r.t),
      zeroCapacityWait: cb.rows.filter((r) => r.svc.space.queue > 0 && r.svc.space.blocked).slice(0, 1).map((r) => ({ t: r.t, queue: r.svc.space.queue, blocked: r.svc.space.blocked, mu: r.svc.space.mu, lam: r.svc.space.lam, thr: r.svc.space.thr, sig: r.svc.space.sig })),
      allNodesAtT60: at(cb, 60).svc.space,
    };
    // recovery boundary: label is "Congested, recovering" from below-since to clear, stable at clear
    if (oClear != null) {
      const belowSince = oClear - SPEC.overallClear;
      R.checks.congestionBoundary.recoveryBoundary = {
        belowSince, labelAtBelowSince: rowAt(belowSince).overall.label, labelAtClearMinus1: rowAt(oClear - 1).overall.label,
        labelAtClear: rowAt(oClear).overall.label, labelBeforeBelowSince: rowAt(belowSince - 1).overall.label,
      };
    }
    // 2. diagnostic-only alert (no overall congestion) and unknown inputs
    const dg = await sample('fixture-diagnostics', 20261010, 200);
    const dgc = compare(dg, { staffedGeneral: ALL_GENERAL }, 200);
    R.checks.diagnosticsOnly = {
      compare: brief(dgc),
      overallStatesSeen: [...new Set(dg.rows.map((r) => r.overall.state))],
      rowsWithZone3Overloaded: dg.rows.filter((r) => r.zones[2] === 'overloaded').length,
      localAlertWhileStable: dg.rows.filter((r) => r.zones[2] === 'overloaded' && r.overall.state === 'stable' && r.overall.localAlert).length,
      firstZone3Alert: (dg.rows.find((r) => r.alerts.some((a) => a.cat === 'lab_imaging')) || {}).t ?? null,
      mixedSeen: dg.rows.filter((r) => r.mixed).length,
    };
    const gp = await sample('fixture-diagnostics-gap', 20261010, 200);
    const gpc = compare(gp, { staffedGeneral: ALL_GENERAL, missing: [[90, 120, ['imaging']]] }, 200);
    R.checks.missingInputs = {
      compare: brief(gpc),
      rowsUnknown: gp.rows.filter((r) => r.svc.imaging.state === 'unknown').map((r) => r.t).filter((t, i, a) => i === 0 || i === a.length - 1),
      zone3DuringGap: [at(gp, 95).zones[2], at(gp, 95).zoneLabels[2]],
      imagingDuringGap: at(gp, 95).svc.imaging,
      imagingEpisodeIndependentWithGap: gpc.episodes.imaging.independent,
      imagingEpisodeNoGap: dgc.episodes.imaging.independent,
    };
    // 3. short burst: four walk-ins at once, queue >= 3 for fewer than 10 minutes (no confirmed alert)
    const bu = await sample('fixture-intake', 20261010, 120);
    const buc = compare(bu, { staffedGeneral: ALL_GENERAL }, 120);
    const triageBuilding = bu.rows.filter((r) => r.svc.triage.state === 'building').map((r) => r.t);
    R.checks.shortBurst = {
      compare: brief(buc),
      triageBuildingMinutes: triageBuilding.length ? [triageBuilding[0], triageBuilding[triageBuilding.length - 1], triageBuilding.length] : [],
      triageEverConfirmed: bu.rows.some((r) => r.svc.triage.state === 'overloaded'),
      triageOverloadedZone1Rows: bu.rows.filter((r) => r.zones[0] === 'overloaded').length,
      localEpisodesTriage: bu.ex.local_episodes.triage,
    };
    // 4. triage surge: one local overload while the overall status stays Stable
    const su = await sample('fixture-queue-surge', 20261010, 180);
    const suc = compare(su, { staffedGeneral: ALL_GENERAL }, 180);
    R.checks.triageSurge = {
      compare: brief(suc),
      overallStates: [...new Set(su.rows.map((r) => r.overall.state))],
      zone1Overloaded: su.rows.filter((r) => r.zones[0] === 'overloaded').length,
      localAlertRows: su.rows.filter((r) => r.overall.localAlert).length,
      triageAt30: su.rows.find((r) => r.t === 30).svc.triage,
      firstAlert: (su.rows.find((r) => r.alerts.length) || {}).alerts?.[0] ?? null,
    };
    // 5. boarding fixture, departure services
    const bo = await sample('fixture-boarding', 20261010, 200);
    const boc = compare(bo, { staffedGeneral: ALL_GENERAL }, 200);
    R.checks.boardingFixture = { compare: brief(boc), zone4States: [...new Set(bo.rows.map((r) => r.zones[3]))], alertCategories: [...new Set(bo.rows.flatMap((r) => r.alerts.map((a) => a.svc + ':' + a.state)))] };
  }

  if (PART === 'seed7') {
    const n7 = await sample('normal', 7, 720);
    const c7 = compare(n7, { staffedGeneral: ALL_GENERAL }, 720);
    R.checks.normalSeed7 = {
      compare: brief(c7),
      overallStatesSeen: [...new Set(n7.rows.map((r) => r.overall.state))],
      zonesEverOverloaded: [1, 2, 3, 4].filter((z) => n7.rows.some((r) => r.zones[z - 1] === 'overloaded')),
      firstTransferBoard: (n7.rows.find((r) => r.svc.ward_beds.state === 'overloaded') || {}).t ?? null,
      episodes: n7.ex.local_episodes,
    };
  }

  R.console = consoleMsgs;
  return R;
}
