// Playwright MCP snippet used for the ticket 05 evidence. Run with browser_run_code_unsafe (Playwright MCP);
// not a standalone test runner. Expects the production build on :8000.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { base: BASE, fixture: 'fixture-boarding', at: new Date().toISOString(), checks: {} };
  const consoleMsgs = [];
  page.on('console', m => { if (m.type() === 'error') consoleMsgs.push(m.text().slice(0, 100)); });
  let replayId = null;
  page.on('response', async r => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  const api = (path) => page.evaluate((p) => fetch(p).then(r => r.json()), path);

  // Expected values from the fixture definition, independent of the engine.
  const FREE_AT = { WD1: 0, WD2: 0, WD3: 70, WD4: 100, WD5: 130, WD6: 160, IC1: 120, IC2: 100000 };
  const FIXED = { discharge: 25, allocation: 20, transport: 20 };
  const DISPO = { H1: 'home', H2: 'home', H3: 'home', H4: 'home', G1: 'ward', G2: 'ward', G3: 'ward', G4: 'ward', I1: 'icu', I2: 'icu', U1: 'ward' };
  const RANK = { urgent: 0, medium: 1, lower: 2 };
  const ZONE4 = ['awaiting_discharge', 'disposition_processing', 'awaiting_ward_bed', 'awaiting_ward_allocation', 'ward_allocation_active', 'awaiting_transport', 'in_transport'];

  // ---- pure checks over one exported run --------------------------------------------------------
  const invariants = (ex, freeAt, fixed, dispo) => {
    const out = { problems: [] };
    const bad = (m) => { if (out.problems.length < 30) out.problems.push(m); };
    const ev = ex.events;
    const rank = {}; const urg = {};
    for (const e of ev) if (e.type === 'arrival') { rank[e.patient_id] = e.payload.critical_bypass ? -1 : RANK[e.payload.urgency]; urg[e.patient_id] = e.payload.urgency; }
    const seq = {};
    for (const e of ev) if (e.type === 'phase_change') (seq[e.patient_id] ??= []).push({ to: e.payload.to, t: e.event_time_min, r: e.resources, z: e.payload.zone, p: e.payload, id: e.id });
    const rows = {}; for (const p of ex.patients) rows[p.patient_id] = p;
    const dec = {}; for (const e of ev) if (e.type === 'decision_received') dec[e.patient_id] = e;
    // 1. phase intervals per resource kind
    const kinds = { disposition_processing: [], ward_allocation_active: [], in_transport: [] };
    const reserved = {}; const grants = [];
    for (const [pid, s] of Object.entries(seq)) {
      for (let k = 0; k < s.length - 1; k++) if (kinds[s[k].to]) kinds[s[k].to].push({ pid, from: s[k].t, to: s[k + 1].t, unit: s[k].r.disposition_unit });
      const names = s.map(x => x.to);
      const iEff = s.findIndex(x => x.z === 4);
      const row = rows[pid];
      if (iEff >= 0) {
        // effective disposition = first zone 4 phase
        if (row.effective_disposition_min !== s[iEff].t) bad(`${pid} effective ${row.effective_disposition_min} vs first zone 4 phase ${s[iEff].t}`);
        const d = dec[pid];
        if (!d || d.event_time_min > s[iEff].t) bad(`${pid} zone 4 before decision`);
        if (row.care_complete_min !== null && row.care_complete_min > s[iEff].t) bad(`${pid} zone 4 before care complete`);
      }
      const transfer = names.includes('awaiting_ward_bed');
      const home = names.includes('awaiting_discharge');
      if (transfer && home) bad(`${pid} both home and transfer`);
      const want = dispo ? dispo[pid] : null;
      if (want) { if ((want === 'home') !== home && s.some(x => x.z === 4)) bad(`${pid} route ${names.join('>')} vs supplied ${want}`); }
      // space held through zone 4
      for (const x of s) if (x.z === 4 && !x.r.ed_space) bad(`${pid} no ED space in ${x.to}`);
      const iBed = names.indexOf('awaiting_ward_allocation');
      if (iBed >= 0) {
        const bed = s[iBed].r.ward_bed;
        if (!bed) bad(`${pid} allocation without a reserved bed`);
        reserved[pid] = { bed, t: s[iBed].t };
        grants.push({ pid, bed, t: s[iBed].t, kind: row ? row.disposition : null });
        const iAct = names.indexOf('ward_allocation_active'), iTr = names.indexOf('awaiting_transport'), iMove = names.indexOf('in_transport');
        if (!(iBed < iAct && iAct < iTr && iTr < iMove)) bad(`${pid} transfer order ${names.join('>')}`);
      }
      const dep = s.find(x => x.to === 'departed');
      if (dep) {
        if (!dep.r.ed_space) bad(`${pid} departure without a released space`);
        const want2 = names.includes('awaiting_discharge') ? 'home' : 'ward';
        if (dep.p.exit !== want2) bad(`${pid} exit ${dep.p.exit} vs path ${want2}`);
        if (want2 === 'ward' && dep.r.ward_bed !== reserved[pid]?.bed) bad(`${pid} departed with bed ${dep.r.ward_bed} vs reserved ${reserved[pid]?.bed}`);
        // the ED space is released at physical departure, after the last transfer step ended
        const last = s[s.length - 2];
        if (row.departure_min !== dep.t) bad(`${pid} departure_min`);
      }
    }
    // 2. finite units
    const cap = { disposition_processing: ex.profile.discharge_slots, ward_allocation_active: ex.profile.ward_allocation_slots, in_transport: ex.profile.transport_slots };
    out.max = {};
    for (const [kind, list] of Object.entries(kinds)) {
      const pts = list.flatMap(i => [[i.from, 1], [i.to, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let cur = 0, max = 0; for (const [, d] of pts) { cur += d; max = Math.max(max, cur); }
      out.max[kind] = max;
      if (max > cap[kind]) bad(`${kind} busy ${max} > ${cap[kind]}`);
      const by = {}; for (const i of list) (by[i.unit] ??= []).push(i);
      for (const [u, l] of Object.entries(by)) { l.sort((a, b) => a.from - b.from); for (let k = 1; k < l.length; k++) if (l[k].from < l[k - 1].to) bad(`${kind} unit ${u} overlap`); }
      if (fixed) {
        const want = kind === 'disposition_processing' ? fixed.discharge : kind === 'ward_allocation_active' ? fixed.allocation : fixed.transport;
        for (const i of list) if (i.to - i.from > 0 && Math.abs(i.to - i.from - want) > 1e-6) bad(`${kind} ${i.pid} lasted ${i.to - i.from}, supplied ${want}`);
      }
    }
    // 3. beds: suitable type, never two patients, not before release time
    const byBed = {};
    for (const g of grants) (byBed[g.bed] ??= []).push(g);
    for (const [bed, l] of Object.entries(byBed)) {
      if (l.length > 1) bad(`bed ${bed} reserved by ${l.map(x => x.pid)}`);
      const type = bed.startsWith('IC') ? 'icu' : 'ward';
      for (const g of l) {
        if (g.kind && g.kind !== type) bad(`${g.pid} needs ${g.kind} got ${bed}`);
        if (freeAt && g.t < freeAt[bed] - 1e-9) bad(`${g.pid} got ${bed} at ${g.t} before it was free at ${freeAt[bed]}`);
      }
    }
    // 4. urgency order for beds: nobody better (or earlier, same rank) still waiting for that type at a grant
    const waits = [];
    for (const [pid, s] of Object.entries(seq)) {
      const k = s.findIndex(x => x.to === 'awaiting_ward_bed');
      if (k < 0) continue;
      const g = s.find(x => x.to === 'awaiting_ward_allocation');
      waits.push({ pid, since: s[k].t, got: g ? g.t : Infinity, type: rows[pid].disposition });
    }
    for (const g of waits) for (const w of waits) {
      if (w.pid === g.pid || w.type !== g.type || w.since > g.got || w.got <= g.got) continue;
      if (rank[w.pid] < rank[g.pid]) bad(`bed order: ${g.pid} before ${w.pid}`);
      else if (rank[w.pid] === rank[g.pid] && w.since < g.since) bad(`bed FIFO: ${g.pid} before ${w.pid}`);
    }
    out.bedWaits = waits.map(w => `${w.pid}:${w.type}:${w.since}->${w.got === Infinity ? 'never' : w.got}`);
    // 5. time parts recomputed from timestamps
    const sums = {};
    for (const p of ex.patients) {
      if (p.departure_min === null) continue;
      const initial = p.first_assessment_min - p.arrival_min;
      const care = p.effective_disposition_min - p.first_assessment_min;
      const awaiting = p.departure_min - p.effective_disposition_min;
      const total = p.departure_min - p.arrival_min;
      const tp = p.time_parts;
      const eq = (a, b) => Math.abs(a - b) < 0.002;
      if (!eq(initial, tp.initial_wait_min) || !eq(care, tp.care_tests_min) || !eq(awaiting, tp.awaiting_departure_min) || !eq(total, tp.total_ed_min)) bad(`${p.patient_id} time parts differ`);
      if (!eq(initial + care + awaiting, total)) bad(`${p.patient_id} parts do not sum to total`);
      if (p.disposition === 'home' ? tp.boarding_min !== null : !eq(tp.boarding_min, awaiting)) bad(`${p.patient_id} boarding`);
      if (p.space_grant_min !== null && !eq(p.departure_min - p.space_grant_min, tp.ed_space_min)) bad(`${p.patient_id} ed_space_min`);
      (sums[urg[p.patient_id]] ??= []).push({ initial, care, awaiting, total, board: p.disposition !== 'home' ? awaiting : null });
    }
    const mean = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 1000) / 1000 : null;
    for (const g of ['urgent', 'medium', 'lower']) {
      const s = sums[g] || [];
      const t = ex.time_summary[g];
      if (t.completed !== s.length) bad(`summary ${g} completed ${t.completed} vs ${s.length}`);
      if (s.length) {
        const eq = (a, b) => Math.abs(a - b) < 0.01;
        if (!eq(t.mean_total_ed_min, mean(s.map(x => x.total))) || !eq(t.mean_initial_wait_min, mean(s.map(x => x.initial))) || !eq(t.mean_care_tests_min, mean(s.map(x => x.care))) || !eq(t.mean_awaiting_departure_min, mean(s.map(x => x.awaiting)))) bad(`summary ${g} means differ`);
      }
      const open = ex.patients.filter(p => urg[p.patient_id] === g && p.departure_min === null).length;
      if (t.unfinished !== open) bad(`summary ${g} unfinished ${t.unfinished} vs ${open}`);
    }
    out.unfinished = ex.unfinished.map(u => `${u.patient_id}:${u.phase}:${u.accrued_ed_min}`);
    out.summary = ex.time_summary;
    out.exitsFromEvents = { home: ev.filter(e => e.type === 'phase_change' && e.payload.to === 'departed' && e.payload.exit === 'home').length, ward: ev.filter(e => e.type === 'phase_change' && e.payload.to === 'departed' && e.payload.exit === 'ward').length };
    return out;
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/?fixture=fixture-boarding');
  await page.getByTestId('start').click();
  await waitV(1);
  await page.getByTestId('zone-4').click();

  // ---- 1. 60 UI steps of 5 min: sidebar, zone 4 drawer, exits, beds vs /state ---------------------
  const rows = []; const problems = []; const reasons = new Set(); const hiddenViolations = [];
  for (let k = 1; k <= 60; k++) {
    await page.getByTestId('step').click(); await waitV(k + 1); await page.waitForTimeout(100);
    const st = await api(`/api/v1/replays/${replayId}/state`);
    await page.waitForFunction((n) => Number(document.querySelector('canvas').dataset.patientMeshes) === n, st.patients.length, { timeout: 3000 }).catch(() => {});
    const ui = await page.evaluate(() => {
      const t = (id) => document.querySelector(`[data-testid=${id}]`)?.textContent ?? null;
      return {
        version: Number(document.querySelector('[data-testid=scene]').dataset.replayVersion),
        drawerVersion: Number(document.querySelector('[data-testid=zone-drawer]').dataset.version),
        dBusy: t('discharge-busy'), aBusy: t('allocation-busy'), tBusy: t('transport-busy'), wFree: t('ward-beds-free'), iFree: t('icu-beds-free'),
        dq: Number(t('drawer-discharge-queue')), da: t('drawer-discharge-active'), board: Number(t('drawer-boarding')),
        aq: Number(t('drawer-allocation-queue')), aa: t('drawer-allocation-active'), tq: Number(t('drawer-transport-queue')), ta: t('drawer-transport-active'),
        wb: t('drawer-ward-beds'), ib: t('drawer-icu-beds'), exH: Number(t('drawer-exit-home')), exW: Number(t('drawer-exit-ward')),
        count: Number(t('drawer-count')), zoneBtns: [1, 2, 3, 4].map(z => parseInt(t(`zone-${z}-count`))),
        meshes: Number(document.querySelector('canvas').dataset.patientMeshes),
        roster: [...document.querySelectorAll('[data-testid=roster] li')].map(li => li.innerText.replace(/\s+/g, ' ')),
        exitLabels: [...document.querySelectorAll('.zone-label')].map(e => e.textContent).filter(x => /^(Home|Ward)/.test(x)),
      };
    });
    const z = st.zones.map(x => x.patient_count); const z4 = st.zones[3]; const d = st.resources.disposition; const t = st.sim_time_min;
    for (const p of st.patients) {
      if (p.waiting_reason) reasons.add(p.waiting_reason.replace(/\(\d+\)/, '(n)').replace(/all \d+/, 'all N'));
      if (!p.decision_received && p.disposition !== null) hiddenViolations.push(`T+${t} ${p.id} disposition before decision`);
    }
    const zone4pts = st.patients.filter(p => p.zone === 4);
    const row = { t, v: st.version, zones: z, z4: { dq: z4.awaiting_discharge, da: z4.discharge_active, board: z4.awaiting_ward_bed, aq: z4.awaiting_ward_allocation, aa: z4.allocation_active, tq: z4.awaiting_transport, ta: z4.in_transport }, beds: `${d.beds.ward.free}/${d.beds.ward.reserved}/${d.beds.ward.occupied}|${d.beds.icu.free}/${d.beds.icu.reserved}/${d.beds.icu.occupied}`, exits: [st.counts.departed_home, st.counts.departed_ward], occupied: st.resources.ed_spaces.occupied };
    rows.push(row);
    const want = [
      [ui.version === st.version && ui.drawerVersion === st.version, 'version'],
      [ui.dBusy === `${d.discharge.busy} of ${d.discharge.servers}` && ui.aBusy === `${d.allocation.busy} of ${d.allocation.servers}` && ui.tBusy === `${d.transport.busy} of ${d.transport.servers}`, 'sidebar busy'],
      [ui.wFree === `${d.beds.ward.free} of ${d.beds.ward.total}` && ui.iFree === `${d.beds.icu.free} of ${d.beds.icu.total}`, 'sidebar beds'],
      [ui.dq === z4.awaiting_discharge && ui.da === `${z4.discharge_active} of ${d.discharge.servers}`, 'discharge counts'],
      [ui.board === z4.awaiting_ward_bed && ui.aq === z4.awaiting_ward_allocation && ui.aa === `${z4.allocation_active} of ${d.allocation.servers}`, 'boarding/allocation counts'],
      [ui.tq === z4.awaiting_transport && ui.ta === `${z4.in_transport} of ${d.transport.servers}`, 'transport counts'],
      [ui.wb === `${d.beds.ward.free}, ${d.beds.ward.reserved}, ${d.beds.ward.occupied} of ${d.beds.ward.total}` && ui.ib === `${d.beds.icu.free}, ${d.beds.icu.reserved}, ${d.beds.icu.occupied} of ${d.beds.icu.total}`, 'bed counts'],
      [ui.exH === st.counts.departed_home && ui.exW === st.counts.departed_ward, 'exit counts'],
      [ui.exitLabels.some(x => x === `Home · ${st.counts.departed_home}`) && ui.exitLabels.some(x => x === `Ward / ICU · ${st.counts.departed_ward}`), 'exit pad labels'],
      [ui.count === z[3] && JSON.stringify(ui.zoneBtns) === JSON.stringify(z) && ui.roster.length === z[3], 'zone 4 counts'],
      [ui.meshes === st.patients.length, 'meshes'],
      [z.reduce((a, b) => a + b, 0) === st.patients.length, 'zone sum'],
      [zone4pts.every(p => p.has_space && p.space_id), 'zone 4 patients keep their ED space'],
      [st.resources.ed_spaces.occupied === st.patients.filter(p => p.space_id).length, 'occupied equals patients holding a space'],
      [d.beds.ward.free + d.beds.ward.reserved + d.beds.ward.occupied === d.beds.ward.total && d.beds.icu.free + d.beds.icu.reserved + d.beds.icu.occupied === d.beds.icu.total, 'beds balance'],
      [d.beds.ward.reserved + d.beds.icu.reserved === st.patients.filter(p => ['awaiting_ward_allocation', 'ward_allocation_active', 'awaiting_transport', 'in_transport'].includes(p.phase)).length, 'reserved beds equal transfers past the bed step'],
      [d.discharge.busy <= d.discharge.servers && d.allocation.busy <= d.allocation.servers && d.transport.busy <= d.transport.servers, 'finite units'],
      [st.counts.departed_home + st.counts.departed_ward === st.counts.departed_total, 'exits sum to departed'],
    ];
    for (const [ok, name] of want) if (!ok) problems.push(`T+${t} ${name}`);
  }
  R.checks.stepRows = rows;
  R.checks.uiVsApiProblems = problems;
  R.checks.reasonsSeen = [...reasons].sort();
  R.checks.hiddenViolations = hiddenViolations;

  // ---- 2. event-history and timestamp checks over the fixture export ------------------------------
  const ex = await api(`/api/v1/replays/${replayId}/export`);
  const ev = await api(`/api/v1/replays/${replayId}/events`);
  const inv = invariants(ex, FREE_AT, FIXED, DISPO);
  R.checks.fixture = inv;
  R.checks.exportEqualsEvents = ex.events.length === ev.total;
  R.checks.bedEvents = ev.events.filter(e => e.type === 'ward_bed_available').map(e => `${e.payload.bed_id}@${e.event_time_min}`);
  R.checks.rows = ['H1', 'G1', 'U1', 'G3', 'I1', 'I2'].map(id => { const p = ex.patients.find(x => x.patient_id === id); return { id, disposition: p.disposition, eff: p.effective_disposition_min, bed: p.ward_bed_id, reserved: p.bed_reserved_min, alloc: p.allocation_start_min, move: p.transport_start_min, dep: p.departure_min, exit: p.exit, parts: p.time_parts }; });
  // the early state: nothing about disposition visible before the decision
  R.checks.hiddenExport = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const s = await post('/api/v1/replays', { seed: 20261010, scenario: 'fixture-boarding' });
    await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: 5 });
    const st = await fetch(`/api/v1/replays/${s.replay_id}/state`).then(r => r.json());
    const ex = await fetch(`/api/v1/replays/${s.replay_id}/export`).then(r => r.json());
    return { dispositions: [...new Set(st.patients.map(p => String(p.disposition)))], exportDispositions: [...new Set(ex.patients.map(p => String(p.disposition)))], hasFreeAtInState: JSON.stringify(st).includes('free_at') };
  });

  // ---- 3. generated demand: seed 7, 12 h ------------------------------------------------------------
  const n7 = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const s = await post('/api/v1/replays', { seed: 7, scenario: 'normal' });
    for (let t = 0; t < 720; t += 60) await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: 60 });
    return fetch(`/api/v1/replays/${s.replay_id}/export`).then(r => r.json());
  });
  const freeAt = {}; for (const b of n7.profile.ward_beds) freeAt[b.id] = b.free_at_min;
  const inv7 = invariants(n7, freeAt, null, null);
  R.checks.normalSeed7 = { problems: inv7.problems, max: inv7.max, patients: n7.patients.length, departed: n7.patients.filter(p => p.departure_min !== null).length,
    transfers: n7.patients.filter(p => p.disposition && p.disposition !== 'home').length, bedWaits: inv7.bedWaits, unfinished: inv7.unfinished.length, exits: inv7.exitsFromEvents, summary: inv7.summary };
  // determinism across chunk sizes
  R.checks.determinism = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const run = async (chunk) => { const s = await post('/api/v1/replays', { seed: 3, scenario: 'fixture-boarding' }); for (let t = 0; t < 240; t += chunk) await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: chunk }); return fetch(`/api/v1/replays/${s.replay_id}/export`).then(r => r.json()); };
    const a = await run(60), b = await run(5);
    return { events: a.events.length, identical: JSON.stringify(a.events) === JSON.stringify(b.events) };
  });
  R.console = consoleMsgs;
  return R;
}
