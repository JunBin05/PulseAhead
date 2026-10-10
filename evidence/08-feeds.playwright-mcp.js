// Playwright MCP snippet used for the ticket 08 evidence. Run with browser_run_code_unsafe (Playwright MCP);
// not a standalone test runner. Expects the production build on :8000. Run once per part: set PART to 'A' (API,
// 1-minute resolution) or 'B' (UI parity at 5-minute steps).
async (page) => {
  const PART = 'A';
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), part: PART, checks: {}, problems: [], data: {} };
  const chk = (name, ok, detail) => { R.checks[name] = ok ? 'pass' : 'FAIL ' + JSON.stringify(detail); if (!ok) R.problems.push(name); };
  const get = (p) => page.evaluate((p) => fetch(p).then(r => r.json()), p);
  const post = (p, b) => page.evaluate(async ([p, b]) => { const r = await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; }, [p, b]);
  const mk = async (scn) => {
    const c = await post('/api/v1/replays', { scenario: scn, seed: 7 });
    let v = c.j.version; const id = c.j.replay_id;
    return {
      id,
      adv: async (m) => { const a = await post(`/api/v1/replays/${id}/advance`, { minutes: m, expected_version: v }); if (a.s !== 200) throw new Error('advance ' + a.s); v = a.j.version; return a.j; },
      events: () => get(`/api/v1/replays/${id}/events`),
      ingest: () => get(`/api/v1/replays/${id}/ingest`),
      state: () => get(`/api/v1/replays/${id}/state`),
      exp: () => get(`/api/v1/replays/${id}/export`),
    };
  };
  const pick = (s) => ({
    t: s.sim_time_min, label: s.overall_status.label, assess: s.overall_status.assessable,
    last: s.overall_status.last_valid_label ?? null,
    st: [s.feeds.staffing.status, s.feeds.staffing.last_update_min, s.feeds.staffing.age_min, s.feeds.staffing.resumed_at_min ?? null],
    amb: [s.feeds.ambulance.status, s.feeds.ambulance.last_update_min, s.feeds.ambulance.age_min],
    dg: [s.feeds.diagnostics.status, s.feeds.diagnostics.last_update_min, s.feeds.diagnostics.age_min, s.feeds.diagnostics.as_of_min],
    rep: s.feeds.replay.age_min, off: s.resources.staff.off_duty_nurses, staffed: s.resources.ed_spaces.staffed_total,
    annIds: s.ambulance_announcements.map(a => a.id), inbound: s.inbound_ambulances.map(a => a.id),
    eta: Object.fromEntries(s.ambulance_announcements.map(a => [a.id, a.eta_min])),
    lab: s.pressure.services.lab?.state ?? s.pressure.services?.find?.(x => x.id === 'lab')?.state,
    z3: s.pressure.zones.find(z => z.zone === 3)?.state,
  });
  const src = (e) => {
    const t = e.type;
    if (t === 'phase_change') {
      const to = e.payload.to;
      if (['awaiting_space', 'awaiting_clinician', 'departed'].includes(to)) return 'spaces';
      if (['awaiting_lab', 'in_lab', 'awaiting_imaging', 'in_imaging'].includes(to)) return 'diagnostics';
      if (['awaiting_discharge', 'disposition_processing', 'awaiting_ward_bed', 'awaiting_ward_allocation', 'ward_allocation_active', 'awaiting_transport', 'in_transport'].includes(to)) return 'disposition';
      return 'queues';
    }
    if (t === 'test_completed') return 'diagnostics';
    if (t.startsWith('staff_')) return 'staffing';
    if (t === 'ward_bed_available') return 'disposition';
    if (t.startsWith('ambulance_')) return 'ambulance';
    return 'queues';
  };
  const HIDDEN = ['feed_faults', 'injections', 'delay_min', '"kind":"stop"', '"kind":"delay"', '"kind":"duplicate"', 'missing_inputs'];

  if (PART === 'A') {
    // ---- A. staffing feed stopped T+32..70 while the replay and ambulance feeds stay healthy --------------
    {
      const r = await mk('fixture-feed-staffing-stop');
      await r.adv(29);
      const rows = {};
      for (let t = 30; t <= 72; t++) rows[t] = pick(await r.adv(1));
      R.data.staffing = Object.fromEntries([30, 35, 40, 41, 45, 55, 69, 70, 71].map(t => [t, rows[t]]));
      let ok = true; const bad = [];
      for (let t = 33; t <= 70; t++) { const x = rows[t]; if (!(x.st[1] === 30 && x.rep === 0 && x.amb[0] === 'fresh' && x.amb[2] <= 5) && t < 70) { ok = false; bad.push(t); } }
      chk('A1 healthy replay+ambulance heartbeat never refreshes staffing (T+33..69)', ok, bad);
      chk('A2 boundary: age exactly 10 is fresh and assessable; 11 is stale and Cannot assess',
        rows[40].st[0] === 'fresh' && rows[40].st[2] === 10 && rows[40].assess === true &&
        rows[41].st[0] === 'stale' && rows[41].st[2] === 11 && rows[41].assess === false && rows[41].label === 'Cannot assess', [rows[40], rows[41]]);
      const frozen = []; for (let t = 41; t <= 69; t++) if (rows[t].off.length !== 0 || rows[t].staffed !== 24 || rows[t].assess !== false) frozen.push(t);
      chk('A3 last valid staffing kept (no nurse off duty, 24 staffed) while stale; label Cannot assess', frozen.length === 0, frozen);
      chk('A4 last valid label kept beside Cannot assess', rows[50].last !== null && rows[50].label === 'Cannot assess', rows[50]);
      chk('A5 recovery: first valid update at T+70 restores assessment with the resume time',
        rows[70].st[0] === 'fresh' && rows[70].st[1] === 70 && rows[70].st[3] === 70 && rows[70].assess === true && rows[70].label !== 'Cannot assess', rows[70]);
      chk('A6 hidden outage shown once received: N1,N2 off duty and 16 staffed at T+71',
        JSON.stringify(rows[71].off) === '["N1","N2"]' && rows[71].staffed === 16, rows[71]);
      const ambOk = []; for (let t = 30; t <= 39; t++) if (rows[t].eta.A02 !== 60) ambOk.push(t);
      for (let t = 40; t <= 70; t++) if (rows[t].eta.A02 !== 70) ambOk.push(t);
      chk('A7 ambulance feed keeps delivering during the staffing stop (A02 ETA 60 -> 70 at T+40)', ambOk.length === 0, ambOk);
      const ev = await r.events(); const ing = await r.ingest();
      const staffEv = ev.events.filter(e => e.type.startsWith('staff_'));
      const missing = ing.sequence_gaps.reduce((n, g) => n + g.missing, 0);
      chk('A8 stopped feed events never received; shows as sequence gaps (2 staffing changes)', staffEv.length === 0 && missing === 2, { staffEv: staffEv.length, gaps: ing.sequence_gaps });
      const leaks = {};
      for (const [k, b] of Object.entries({ state: await r.state(), events: ev, ingest: ing, exp: await r.exp(), profile: await get('/api/v1/profile') })) {
        const s = JSON.stringify(b); const hit = HIDDEN.filter(n => s.includes(n)); if (hit.length) leaks[k] = hit;
      }
      chk('A9 hidden fault schedule absent from state, events, ingest, export, profile', Object.keys(leaks).length === 0, leaks);
    }

    // ---- C. duplicates, delays, out-of-order, invalid inputs, valid outliers ----------------------------
    {
      const r = await mk('fixture-feed-faults');
      const rows = {}; let mid = null;
      await r.adv(25);
      for (let t = 26; t <= 100; t++) {
        const s = await r.adv(1); rows[t] = pick(s);
        if (t === 26 || t === 60) {
          const ev = await r.events();
          const last = {};
          for (const e of ev.events) if (e.patient_id) last[e.patient_id] = e.type === 'arrival' ? e.payload.phase : e.payload.to;
          const st = s.patients.map(p => p.id);
          const diff = [];
          for (const p of s.patients) if (last[p.id] !== p.phase) diff.push(`${p.id}:${p.phase}!=${last[p.id]}`);
          for (const [id, to] of Object.entries(last)) if (!st.includes(id) && to !== 'departed') diff.push(`${id}:missing(${to})`);
          (mid ??= {})[t] = { patients: s.patients.length, diff };
        }
      }
      for (let t = 110; t <= 180; t += 10) await r.adv(10);
      const ev = await r.events(); const ing = await r.ingest(); const st = await r.state();
      const ids = ev.events.map(e => e.id);
      chk('C1 received event ids unique', new Set(ids).size === ids.length, ids.length);
      const doubled = ev.events.filter(e => src(e) === 'queues' && e.event_time_min >= 2 && e.event_time_min < 12).length;
      const dupEntries = ing.log.filter(l => l.kind === 'duplicate');
      chk('C2 duplicates: each doubled queue event ignored once, plus the re-sent message id', ing.counts.duplicates === doubled + 1 && dupEntries.length === ing.counts.duplicates, { doubled, counts: ing.counts, entries: dupEntries.length });
      const want = {
        'X-IMP-1': ['quarantined', /Impossible transition/], 'X-OOO-1': ['out_of_order', /older than the state already received/],
        'X-NEG-1': ['quarantined', /Negative count/], 'X-CNT-1': ['quarantined', /exceeds/], 'X-ETA-1': ['quarantined', /already arrived/],
        'X-ETA-2': ['quarantined', /Unknown ambulance/], 'X-ANN-1': ['quarantined', /earlier than the announcement/],
        'X-ANN-2': ['quarantined', /outside 1 to 10/], 'X-ETA-3': ['out_of_order', /older than the announcement/],
        'X-FUT-1': ['quarantined', /future/], 'X-UNK-1': ['quarantined', /Unknown patient/],
      };
      const wrong = [];
      for (const [id, [kind, re]] of Object.entries(want)) { const l = ing.log.find(x => x.id === id); if (!l || l.kind !== kind || !re.test(l.reason)) wrong.push([id, l && [l.kind, l.reason]]); }
      chk('C3 each invalid/out-of-order input has the right kind and a reason', wrong.length === 0 && ing.counts.quarantined === 9 && ing.counts.out_of_order === 2, { wrong, counts: ing.counts });
      const leakedIds = ids.filter(i => i.startsWith('X-'));
      const eta4 = ev.events.find(e => e.type === 'ambulance_updated' && e.ambulance_id === 'A05' && e.payload.eta_min === 38);
      chk('C4 refused ids never enter the received log; the one valid external ETA update is applied', leakedIds.length === 0 && !!eta4 && !ing.log.find(x => x.id === 'X-ETA-4'), { leakedIds, eta4: !!eta4 });
      chk('C5 observed state equals the received events (T+26 after injections, T+60 during delay)', mid[26].diff.length === 0 && mid[60].diff.length === 0, mid);
      const kept = ing.log.filter(l => l.kind === 'outlier_kept');
      const burst = ev.events.filter(e => e.type === 'arrival' && /^B\d\d$/.test(e.patient_id));
      const w05 = ev.events.find(e => e.type === 'test_completed' && e.patient_id === 'W05');
      chk('C6 extreme but valid kept: 130 min test, 10-arrival burst, 87 min ETA move; ordinary ETA noise not flagged',
        kept.length === 3 && ing.counts.outliers_kept === 3 && !!w05 && w05.payload.elapsed_min === 130 && burst.length === 10 &&
        kept.some(l => l.subject === 'W05' && /130/.test(l.reason)) && kept.some(l => l.subject === 'B10') &&
        kept.some(l => l.subject === 'A05' && /moved by/.test(l.reason)) && !kept.some(l => l.subject === 'A02'), { kept: kept.map(l => [l.id, l.subject]), burst: burst.length, w05: !!w05 });
      chk('C7 burst patients all counted (19 arrived)', st.counts.arrived_total === 19 && st.counts.departed_total === 19, st.counts);
      const late = ev.events.filter(e => e.received_time_min !== e.event_time_min);
      chk('C8 delayed diagnostics events carry received = event + 6 and only inside T+40..90',
        late.length >= 1 && late.every(e => src(e) === 'diagnostics' && Math.abs(e.received_time_min - e.event_time_min - 6) < 0.01 && e.event_time_min >= 40 && e.event_time_min < 90), late.map(e => [e.id, e.type, e.event_time_min, e.received_time_min]));
      const inWin = []; for (let t = 40; t < 90; t++) if (rows[t]) { if (Math.abs(rows[t].dg[3] - (t - 6)) > 0.01 || rows[t].dg[0] !== 'fresh' || rows[t].assess !== true) inWin.push(t); }
      chk('C9 delayed (6 min) feed shows its as-of time, stays fresh and assessable (delay under 10 min)', inWin.length === 0, inWin);
      R.data.faults = { counts: ing.counts, late: late.length, mid };
    }

    // ---- D. optional feeds stopped: ambulance T+25..60, diagnostics T+40..80 ------------------------------
    {
      const r = await mk('fixture-feed-optional-stop');
      await r.adv(20);
      const rows = {};
      for (let t = 21; t <= 90; t++) rows[t] = pick(await r.adv(1));
      R.data.optional = Object.fromEntries([30, 31, 36, 45, 50, 59, 60, 61, 81].map(t => [t, rows[t]]));
      chk('D1 ambulance boundary (stop T+25 loses the T+25 heartbeat, last valid T+20): age 10 fresh at T+30, 11 stale at T+31', rows[30].amb[0] === 'fresh' && rows[30].amb[1] === 20 && rows[30].amb[2] === 10 && rows[31].amb[0] === 'stale' && rows[31].amb[2] === 11, [rows[30].amb, rows[31].amb]);
      const notAssess = []; for (let t = 21; t <= 90; t++) if (rows[t].assess !== true || rows[t].label === 'Cannot assess') notAssess.push(t);
      chk('D2 optional feeds stale never make the ED Cannot assess', notAssess.length === 0, notAssess);
      const fe = await get(`/api/v1/replays/${r.id}/state`);
      const unk = []; for (let t = 51; t <= 79; t++) if (rows[t].z3 !== 'unknown') unk.push([t, rows[t].z3]);
      chk('D3 stale diagnostics: zone 3 is Cannot assess (never low risk) while the overall ED stays assessable', unk.length === 0, unk);
      chk('D4 diagnostics recovered at T+81: zone 3 no longer unknown', rows[81].z3 !== 'unknown' && rows[81].dg[0] === 'fresh', rows[81]);
      const duringStop = []; for (let t = 25; t <= 59; t++) if (rows[t]?.annIds.includes('A02')) duringStop.push(t);
      const ev = await r.events(); const ing = await r.ingest();
      const gapped = ing.sequence_gaps.reduce((n, g) => n + g.missing, 0);
      const a02 = ev.events.filter(e => e.ambulance_id === 'A02' && e.type === 'ambulance_announced');
      const a02Pts = ev.events.filter(e => e.type === 'arrival' && e.patient_id?.startsWith('A02'));
      chk('D5 announcement sent during the ambulance stop: not shown while stopped, its event never received (a gap), patients still arrive via the queue feed; the resumed feed state lists it at T+60',
        duringStop.length === 0 && a02.length === 0 && gapped >= 1 && a02Pts.length >= 1 && rows[60].annIds.includes('A02'), { duringStop, a02: a02.length, gapped, a02Pts: a02Pts.length, at60: rows[60].annIds });
      chk('D6 ambulance arrived during the stop is not still shown inbound (A01 patients are in the ED)', !rows[50].inbound.includes('A01'), rows[50].inbound);
      const gl = fe.feeds.ambulance;
      R.data.optional.limitationAt90 = gl.limitation;
      const lim = await (async () => { const rr = await mk('fixture-feed-optional-stop'); await rr.adv(50); const s = await rr.state(); return { amb: s.feeds.ambulance.limitation, ambGuidance: s.feeds.ambulance.guidance, dg: s.feeds.diagnostics.limitation }; })();
      chk('D7 stale optional feeds carry an explicit limitation and retry guidance', !!lim.amb && !!lim.dg && /limitation/.test(lim.ambGuidance), lim);
    }
  }

  if (PART === 'B') {
    const consoleMsgs = [];
    page.on('console', m => { if (m.type() === 'error') consoleMsgs.push(m.text().slice(0, 120)); });
    let replayId = null;
    page.on('response', async r => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });
    const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
    const WORD = { fresh: 'Current', stale: 'Stale', missing: 'Missing' };
    await page.setViewportSize({ width: 1440, height: 900 });

    // ---- B. UI parity on the staffing-stop fixture --------------------------------------------------------
    await page.goto(BASE + '/?fixture=fixture-feed-staffing-stop');
    await page.getByTestId('start').click(); await waitV(1);
    const probs = []; const seen = {};
    for (let k = 1; k <= 16; k++) {
      await page.getByTestId('step').click(); await waitV(k + 1); await page.waitForTimeout(150);
      const st = await get(`/api/v1/replays/${replayId}/state`);
      const t = st.sim_time_min;
      if (t === 45) {
        await page.getByTestId('zone-2').click(); await page.waitForTimeout(200);
        await page.screenshot({ path: 'PulseAhead/Real/evidence/shots/08-cannot-assess-t45.png' });
      }
      const ui = await page.evaluate(() => {
        const q = (id) => document.querySelector(`[data-testid="${id}"]`);
        return {
          badge: q('overall-status')?.textContent.trim(),
          assessable: q('feeds-summary')?.dataset.assessable,
          staff: q('feed-staffing-status')?.textContent.trim(), staffAge: q('feed-staffing-age')?.textContent.replace(/\s+/g, ' '),
          amb: q('feed-ambulance-status')?.textContent.trim(),
          reasons: q('feeds-reasons')?.textContent.trim() ?? null,
          resumed: q('feed-staffing-resumed')?.textContent.trim() ?? null,
          staleNote: !!q('resources-stale'), drawer: !!q('zone-drawer'), limits: !!q('drawer-limitations'),
          limitStaff: q('drawer-limit-staffing')?.textContent.replace(/\s+/g, ' ') ?? null,
        };
      });
      const f = st.feeds.staffing;
      if (!ui.badge.includes(st.overall_status.label)) probs.push(`t${t} badge ${ui.badge} vs ${st.overall_status.label}`);
      if (ui.assessable !== String(st.data_quality.assessable)) probs.push(`t${t} assessable ${ui.assessable}`);
      if (ui.staff !== WORD[f.status]) probs.push(`t${t} staff status ${ui.staff} vs ${f.status}`);
      if (f.age_min !== null && !ui.staffAge.includes(`${f.age_min} min old`)) probs.push(`t${t} staff age ${ui.staffAge} vs ${f.age_min}`);
      if (ui.amb !== 'Current') probs.push(`t${t} ambulance ${ui.amb}`);
      if (st.data_quality.assessable === false && ui.reasons !== st.data_quality.reasons.join(' ')) probs.push(`t${t} reasons`);
      if (f.status !== 'fresh' && !ui.staleNote) probs.push(`t${t} no stale-resources note`);
      if (t >= 45 && t < 70 && ui.drawer && !(ui.limits && /last valid update/.test(ui.limitStaff ?? ''))) probs.push(`t${t} drawer limitation missing`);
      seen[t] = [ui.badge, ui.staff, ui.staffAge?.replace(/.*update /, ''), ui.resumed ? 'resumed' : '', ui.limits ? 'limits' : ''];
    }
    chk('B1 UI badge, feed rows, ages, reasons and drawer limitation equal the API at every 5-min step (T+5..80)', probs.length === 0, probs);
    const t40 = seen[40], t45 = seen[45], t70 = seen[70];
    chk('B2 UI at the exact boundary: T+40 Current (age 10), T+45 Stale; resumed text at T+70', t40?.[1] === 'Current' && t45?.[1] === 'Stale' && /Resumed/.test(String((await page.getByTestId('feed-staffing-resumed').textContent().catch(() => '')))), { t40, t45, t70 });
    R.data.ui = seen;

    // ---- E. missing inputs for one service: figures are Not current, never exact ---------------------------
    await page.goto(BASE + '/?fixture=fixture-diagnostics-gap');
    await page.getByTestId('start').click(); await waitV(1);
    for (let k = 1; k <= 20; k++) { await page.getByTestId('step').click(); await waitV(k + 1); }
    await page.waitForTimeout(200);
    await page.getByTestId('zone-3').click(); await page.waitForTimeout(250);
    const st100 = await get(`/api/v1/replays/${replayId}/state`);
    const u100 = await page.evaluate(() => ({
      img: document.querySelector('[data-testid=imaging-busy]').textContent.trim(),
      lab: document.querySelector('[data-testid=lab-busy]').textContent.trim(),
      imgQ: document.querySelector('[data-testid=drawer-imaging-queue]')?.textContent.trim(),
      labQ: document.querySelector('[data-testid=drawer-lab-queue]')?.textContent.trim(),
      zone3: document.querySelector('[data-testid=zone-3-count]').textContent.trim(),
    }));
    await page.screenshot({ path: 'PulseAhead/Real/evidence/shots/08-missing-imaging-t100.png' });
    const z3 = st100.zones.find(z => z.id === 3);
    chk('E1 T+100 imaging inputs missing: sidebar and drawer say Not current; lab figures stay exact; patient count unchanged',
      st100.sim_time_min === 100 && u100.img === 'Not current' && u100.imgQ === 'Not current' && /^\d+ of 2/.test(u100.lab) && u100.labQ === String(z3.lab_queue) &&
      JSON.stringify(st100.limited_services) === '["imaging"]' && st100.resources.diagnostics.imaging.waiting === null && st100.resources.diagnostics.imaging.inputs_ok === false &&
      parseInt(u100.zone3, 10) === z3.patient_count, { u100, limited: st100.limited_services });
    for (let k = 21; k <= 25; k++) { await page.getByTestId('step').click(); await waitV(k + 1); }
    await page.waitForTimeout(200);
    const u125 = await page.evaluate(() => document.querySelector('[data-testid=imaging-busy]').textContent.trim());
    const st125 = await get(`/api/v1/replays/${replayId}/state`);
    chk('E2 T+125 inputs back: imaging figures exact again and equal the API',
      st125.sim_time_min === 125 && /^\d+ of 1/.test(u125) && st125.limited_services === undefined && u125.startsWith(`${st125.resources.diagnostics.imaging.busy} of`), { u125, busy: st125.resources.diagnostics.imaging.busy });
    chk('B3 no console errors', consoleMsgs.length === 0, consoleMsgs);
  }

  R.pass = R.problems.length === 0;
  return R;
}
