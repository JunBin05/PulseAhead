// Playwright MCP snippet used for the ticket 04 evidence. Run with browser_run_code_unsafe (Playwright MCP);
// not a standalone test runner. Expects the production build on :8000.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { base: BASE, fixture: 'fixture-diagnostics', at: new Date().toISOString(), checks: {} };
  const consoleMsgs = [];
  page.on('console', m => { if (m.type() === 'error') consoleMsgs.push(m.text().slice(0, 100)); });
  let replayId = null;
  page.on('response', async r => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  const api = (path) => page.evaluate((p) => fetch(p).then(r => r.json()), path);

  // Expected supplied turnaround per patient, from the fixture definition (independent of the engine).
  const EXPECT = { W01: [['lab', 40]], W02: [['lab', 40]], W03: [['lab', 40]], W04: [['imaging', 60]], W05: [['imaging', 60]],
    W06: [], W07: [], W08: [['lab', 35], ['imaging', 50]], W09: [['lab', 30]], W10: [['lab', 30]], W11: [['imaging', 55]],
    W12: [['lab', 40]], W13: [['lab', 20]] };
  const RANK = { urgent: 0, medium: 1, lower: 2 };
  const ZONE3 = ['awaiting_lab', 'in_lab', 'awaiting_imaging', 'in_imaging'];

  // ---- pure checks over one exported run -----------------------------------------------------
  const invariants = (ex, expect) => {
    const out = { problems: [] };
    const bad = (m) => { if (out.problems.length < 30) out.problems.push(m); };
    const ev = ex.events;
    const rank = {};
    for (const e of ev) if (e.type === 'arrival') rank[e.patient_id] = e.payload.critical_bypass ? -1 : RANK[e.payload.urgency];
    const seq = {}; const spaceOf = {};
    for (const e of ev) {
      if (e.type !== 'phase_change') continue;
      (seq[e.patient_id] ??= []).push({ to: e.payload.to, t: e.event_time_min, r: e.resources, z: e.payload.zone, id: e.id });
      const sp = e.resources.ed_space;
      if (sp && ['awaiting_clinician', 'assessment_active', 'awaiting_lab', 'in_lab', 'awaiting_imaging', 'in_imaging', 'awaiting_result_review', 'result_review_active', 'awaiting_care_completion', 'disposition_processing', 'departed'].includes(e.payload.to)) {
        if (spaceOf[e.patient_id] && spaceOf[e.patient_id] !== sp) bad(`${e.patient_id} moved space ${spaceOf[e.patient_id]} -> ${sp} at ${e.event_time_min}`);
        spaceOf[e.patient_id] = sp;
        if (!sp) bad(`${e.id} no space`);
      }
      if (ZONE3.includes(e.payload.to)) {
        if (e.payload.zone !== 3) bad(`${e.id} ${e.payload.to} not zone 3`);
        if (e.resources.clinician_slot) bad(`${e.id} ${e.patient_id} holds a doctor in ${e.payload.to}`);
        if (!e.resources.ed_space) bad(`${e.id} ${e.patient_id} lost its space in ${e.payload.to}`);
      }
      if (['awaiting_result_review', 'result_review_active'].includes(e.payload.to) && e.payload.zone !== 2) bad(`${e.id} review not zone 2`);
    }
    // route shape per patient
    const routes = {};
    for (const [pid, s] of Object.entries(seq)) {
      const names = s.map(x => x.to);
      routes[pid] = names.filter(n => n !== 'in_triage' && n !== 'awaiting_triage' && n !== 'awaiting_space').join('>');
      const hasZ3 = names.some(n => ZONE3.includes(n));
      const wants = expect ? expect[pid] : null;
      if (wants && wants.length === 0 && hasZ3) bad(`${pid} direct route entered zone 3`);
      if (hasZ3) {
        const iA = names.indexOf('assessment_active');
        const iFirst = names.findIndex(n => ZONE3.includes(n));
        const iRev = names.indexOf('result_review_active');
        const iDisp = names.indexOf('disposition_processing');
        // A patient still mid-route at the end of the export only has a prefix to check.
        if (!(iA >= 0 && iA < iFirst)) bad(`${pid} zone 3 before assessment: ${names.join('>')}`);
        if (iRev >= 0 && !(iFirst < iRev)) bad(`${pid} review before tests: ${names.join('>')}`);
        if (iDisp >= 0 && !(iRev >= 0 && iRev < iDisp)) bad(`${pid} disposition without result review: ${names.join('>')}`);
        if (iRev >= 0 && names.indexOf('awaiting_result_review') < 0) bad(`${pid} no result-review wait`);
      } else if (names.includes('disposition_processing') && names.includes('result_review_active')) bad(`${pid} review without tests`);
    }
    // tests: units, durations, order, finite capacity
    const tests = [];
    for (const e of ev) if (e.type === 'test_completed') tests.push({ pid: e.patient_id, kind: e.payload.test, unit: e.payload.unit, elapsed: e.payload.elapsed_min, end: e.event_time_min, id: e.id });
    const startOf = {};
    for (const [pid, s] of Object.entries(seq)) for (const x of s) if (x.to === 'in_lab' || x.to === 'in_imaging') (startOf[pid] ??= []).push({ kind: x.to === 'in_lab' ? 'lab' : 'imaging', start: x.t, unit: x.r.diagnostic_unit });
    const intervals = { lab: [], imaging: [] };
    for (const t of tests) {
      const st = (startOf[t.pid] || []).find(x => x.kind === t.kind && Math.abs(x.start + t.elapsed - t.end) < 1e-6);
      if (!st) { bad(`${t.pid} ${t.kind} no matching start (end ${t.end}, elapsed ${t.elapsed})`); continue; }
      if (st.unit !== t.unit) bad(`${t.pid} unit mismatch ${st.unit} vs ${t.unit}`);
      intervals[t.kind].push({ pid: t.pid, unit: t.unit, start: st.start, end: t.end });
    }
    const cap = { lab: ex.profile.lab_slots, imaging: ex.profile.imaging_slots };
    for (const kind of ['lab', 'imaging']) {
      const pts = intervals[kind].flatMap(i => [[i.start, 1], [i.end, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let cur = 0, max = 0; for (const [, d] of pts) { cur += d; max = Math.max(max, cur); }
      out[`max_${kind}_busy`] = max;
      if (max > cap[kind]) bad(`${kind} busy ${max} > ${cap[kind]}`);
      const byUnit = {};
      for (const i of intervals[kind]) (byUnit[i.unit] ??= []).push(i);
      for (const [u, list] of Object.entries(byUnit)) { list.sort((a, b) => a.start - b.start); for (let k = 1; k < list.length; k++) if (list[k].start < list[k - 1].end) bad(`${kind} unit ${u} overlap ${list[k - 1].pid}/${list[k].pid}`); }
    }
    // queue discipline: at each test start nobody better (or earlier, same rank) still waits for that kind
    const waitFor = { lab: [], imaging: [] };
    for (const [pid, s] of Object.entries(seq)) for (let k = 0; k < s.length; k++) {
      const kind = s[k].to === 'awaiting_lab' ? 'lab' : s[k].to === 'awaiting_imaging' ? 'imaging' : null;
      if (!kind) continue;
      const started = s.slice(k).find(x => x.to === (kind === 'lab' ? 'in_lab' : 'in_imaging'));
      waitFor[kind].push({ pid, since: s[k].t, started: started ? started.t : Infinity, seqId: s[k].id });
    }
    for (const kind of ['lab', 'imaging']) for (const g of waitFor[kind]) for (const w of waitFor[kind]) {
      if (w.pid === g.pid || w.since > g.started || w.started <= g.started) continue;
      if (rank[w.pid] < rank[g.pid]) bad(`${kind} order: ${g.pid} before ${w.pid}`);
      else if (rank[w.pid] === rank[g.pid] && w.since < g.since) bad(`${kind} FIFO: ${g.pid} before ${w.pid}`);
    }
    // doctors: assessment and review holds never overlap per doctor; at most 4 at once
    const holds = {};
    for (const [pid, s] of Object.entries(seq)) for (let k = 0; k < s.length - 1; k++) {
      if (['assessment_active', 'result_review_active'].includes(s[k].to)) (holds[s[k].r.clinician_slot] ??= []).push({ pid, from: s[k].t, to: s[k + 1].t });
    }
    for (const [d, list] of Object.entries(holds)) { list.sort((a, b) => a.from - b.from); for (let k = 1; k < list.length; k++) if (list[k].from < list[k - 1].to) bad(`doctor ${d} overlap ${list[k - 1].pid}/${list[k].pid}`); }
    out.doctors = Object.keys(holds).sort();
    // decisions, results, review and eligibility timestamps
    const dec = {}; for (const e of ev) if (e.type === 'decision_received') dec[e.patient_id] = e;
    const rows = {}; for (const p of ex.patients) rows[p.patient_id] = p;
    const early = [];
    for (const [pid, p] of Object.entries(rows)) {
      const want = expect ? expect[pid] : null;
      if (p.tests_required !== null) {
        if (want && JSON.stringify(p.tests_required) !== JSON.stringify(want.map(x => x[0]))) bad(`${pid} tests_required ${p.tests_required}`);
      }
      const mine = tests.filter(t => t.pid === pid);
      if (want) {
        for (const [kind, mins] of want) { const t = mine.find(x => x.kind === kind); if (t && Math.abs(t.elapsed - mins) > 1e-6) bad(`${pid} ${kind} turnaround ${t.elapsed} != supplied ${mins}`); }
        if (p.departure_min !== null && mine.length !== want.length) bad(`${pid} ran ${mine.length} tests, supplied ${want.length}`);
      }
      if (mine.length) {
        const last = Math.max(...mine.map(t => t.end));
        if (p.results_received_min !== null && Math.abs(p.results_received_min - last) > 1e-6) bad(`${pid} results ${p.results_received_min} != last test ${last}`);
        if (p.review_start_min !== null && p.review_start_min < p.results_received_min) bad(`${pid} review before results`);
        if (p.review_end_min !== null && !(p.review_end_min > p.review_start_min)) bad(`${pid} review length`);
        if (p.review_end_min !== null) { const len = p.review_end_min - p.review_start_min; if (len < 3 - 1e-6 || len > 8 + 1e-6) bad(`${pid} review ${len} outside 3-8`); }
        if (p.effective_disposition_min !== null) {
          const need = Math.max(p.decision_min, p.results_received_min, p.review_end_min, p.care_complete_min ?? 0);
          if (Math.abs(p.effective_disposition_min - need) > 1e-6) bad(`${pid} effective ${p.effective_disposition_min} != max prerequisites ${need}`);
          const disp = seq[pid].find(x => x.to === 'disposition_processing');
          if (disp && disp.t !== p.effective_disposition_min) bad(`${pid} disposition phase time`);
        }
        const d = dec[pid];
        if (d && d.event_time_min < p.results_received_min) {
          early.push({ pid, decision: d.event_time_min, results: p.results_received_min, eligibleAtDecision: d.payload.eligible, testsComplete: d.payload.tests_complete, effective: p.effective_disposition_min });
          if (d.payload.eligible !== false) bad(`${pid} early decision marked eligible`);
        } else if (d && d.payload.tests_complete !== true) bad(`${pid} decision after results but tests_complete false`);
      }
    }
    out.earlyDecisions = early;
    out.testCount = tests.length;
    out.routes = routes;
    return out;
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/?fixture=fixture-diagnostics');
  await page.getByTestId('start').click();
  await waitV(1);
  await page.getByTestId('zone-3').click();

  // ---- 1. 56 UI steps of 5 min: sidebar, zone 3 drawer, counts and retained beds vs /state -----
  const rows = []; const problems = []; let prevMaxOcc = 0;
  for (let k = 1; k <= 56; k++) {
    await page.getByTestId('step').click(); await waitV(k + 1); await page.waitForTimeout(100);
    const st = await api(`/api/v1/replays/${replayId}/state`);
    await page.waitForFunction((n) => Number(document.querySelector('canvas').dataset.patientMeshes) === n, st.patients.length, { timeout: 3000 }).catch(() => {});
    const ui = await page.evaluate(() => {
      const t = (id) => document.querySelector(`[data-testid=${id}]`)?.textContent ?? null;
      return {
        version: Number(document.querySelector('[data-testid=scene]').dataset.replayVersion),
        drawerVersion: Number(document.querySelector('[data-testid=zone-drawer]').dataset.version),
        labBusy: t('lab-busy'), imagingBusy: t('imaging-busy'), occupied: Number(t('occupied-spaces')),
        labQ: Number(t('drawer-lab-queue')), imgQ: Number(t('drawer-imaging-queue')),
        labA: t('drawer-lab-active'), imgA: t('drawer-imaging-active'),
        labRate: t('drawer-lab-rate'), imgRate: t('drawer-imaging-rate'),
        count: Number(t('drawer-count')), zoneBtns: [1, 2, 3, 4].map(z => parseInt(t(`zone-${z}-count`))),
        meshes: Number(document.querySelector('canvas').dataset.patientMeshes),
        roster: [...document.querySelectorAll('[data-testid=roster] li')].map(li => li.innerText.replace(/\s+/g, ' ')),
      };
    });
    const z = st.zones.map(x => x.patient_count); const z3 = st.zones[2];
    const d = st.resources.diagnostics; const t = st.sim_time_min;
    const ids = st.zones.flatMap(x => x.patient_ids);
    const row = { t, v: st.version, zones: z, lab: `${d.lab.busy}/${d.lab.servers}+${d.lab.waiting}q`, imaging: `${d.imaging.busy}/${d.imaging.servers}+${d.imaging.waiting}q`, occupied: st.resources.ed_spaces.occupied, withSpace: st.patients.filter(p => p.space_id).length, z3withSpace: st.patients.filter(p => p.zone === 3 && p.space_id).length };
    rows.push(row);
    const want = [
      [ui.version === st.version && ui.drawerVersion === st.version, 'version'],
      [ui.labBusy.startsWith(`${d.lab.busy} of ${d.lab.servers}`), 'lab busy'], [ui.imagingBusy.startsWith(`${d.imaging.busy} of ${d.imaging.servers}`), 'imaging busy'],
      [ui.labQ === z3.lab_queue && ui.imgQ === z3.imaging_queue, 'queues'],
      [ui.labA === `${z3.lab_active} of ${d.lab.servers}` && ui.imgA === `${z3.imaging_active} of ${d.imaging.servers}`, 'active'],
      [ui.count === z[2], 'drawer count'], [JSON.stringify(ui.zoneBtns) === JSON.stringify(z), 'zone buttons'],
      [ui.meshes === st.patients.length, 'meshes'], [ui.roster.length === z[2], 'roster rows'],
      [z.reduce((a, b) => a + b, 0) === st.patients.length, 'zone sum'],
      [new Set(ids).size === ids.length && ids.length === st.patients.length, 'no duplicate patient across zones'],
      [d.lab.busy <= d.lab.servers && d.imaging.busy <= d.imaging.servers, 'finite units'],
      [z3.lab_queue === d.lab.waiting && z3.lab_active === d.lab.busy && z3.imaging_queue === d.imaging.waiting && z3.imaging_active === d.imaging.busy, 'zone 3 equals resource counts'],
      [row.z3withSpace === z[2], 'zone 3 patients keep their ED space'],
      [st.resources.ed_spaces.occupied === row.withSpace, 'occupied spaces equals patients holding a space'],
      [d.lab.capacity_tasks_per_hour === 4 && d.imaging.capacity_tasks_per_hour === 1.33, 'capacity rates'],
      [ui.labRate.startsWith('4 tasks/h') && ui.imgRate.startsWith('1.33 tasks/h'), 'rate text'],
    ];
    for (const [ok, name] of want) if (!ok) problems.push(`T+${t} ${name}`);
    prevMaxOcc = Math.max(prevMaxOcc, row.occupied);
  }
  R.checks.stepRows = rows;
  R.checks.uiVsApiProblems = problems;
  R.checks.peakRetainedBeds = prevMaxOcc;

  // ---- 2. event-history checks over the fixture export ---------------------------------------
  const ex = await api(`/api/v1/replays/${replayId}/export`);
  const ev = await api(`/api/v1/replays/${replayId}/events`);
  const inv = invariants(ex, EXPECT);
  R.checks.fixture = { problems: inv.problems, max_lab_busy: inv.max_lab_busy, max_imaging_busy: inv.max_imaging_busy, doctors: inv.doctors, earlyDecisions: inv.earlyDecisions, testCount: inv.testCount, routes: inv.routes };
  R.checks.exportEqualsEvents = ex.events.length === ev.total;
  R.checks.lastState = await api(`/api/v1/replays/${replayId}/state`).then(s => ({ t: s.sim_time_min, inEd: s.counts.in_ed, departed: s.counts.departed_total, arrived: s.counts.arrived_total }));
  R.checks.timestamps = ['W06', 'W08', 'W09', 'W13'].map(id => ex.patients.find(p => p.patient_id === id));

  // lab-queue priority: W13 (urgent, arrived 30) against patients already waiting
  const w13 = ev.events.filter(e => e.patient_id === 'W13' && e.type === 'phase_change').map(e => `${e.payload.to}@${e.event_time_min}`);
  const waitingAtW13Start = (() => {
    const s = ev.events.filter(e => e.type === 'phase_change');
    const start = s.find(e => e.patient_id === 'W13' && e.payload.to === 'in_lab')?.event_time_min;
    const waiting = [];
    for (const e of s) if (e.payload.to === 'awaiting_lab' && e.event_time_min <= start) {
      const began = s.find(x => x.patient_id === e.patient_id && x.payload.to === 'in_lab')?.event_time_min;
      if (e.patient_id !== 'W13' && began > start) waiting.push(`${e.patient_id}(waiting since ${e.event_time_min}, started ${began})`);
    }
    return { start, waiting };
  })();
  R.checks.urgentLab = { W13: w13, passedOver: waitingAtW13Start };

  // premature decision, from raw events
  R.checks.prematureW09 = ev.events.filter(e => e.patient_id === 'W09').map(e => `${e.event_time_min} ${e.type === 'phase_change' ? e.payload.to : e.type + JSON.stringify(e.payload)}`);

  // hidden-data checks: tests unknown before first assessment ends, no turnaround in /state
  const hid = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const s = await post('/api/v1/replays', { seed: 20261010, scenario: 'fixture-diagnostics' });
    const a = await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: 3 });
    const exp = await fetch(`/api/v1/replays/${s.replay_id}/export`).then(r => r.json());
    return { stateKeysHaveTests: JSON.stringify(a).includes('"tests"') , statuses: [...new Set(a.patients.map(p => p.tests_status))], exportTestsRequired: [...new Set(exp.patients.map(p => String(p.tests_required)))], hasTurnaround: /turnaround_min"?:\s*\d+\.\d/.test(JSON.stringify(a)) };
  });
  R.checks.hidden = hid;

  // ---- 3. rates recomputed from events at three times -----------------------------------------
  R.checks.rates = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const s = await post('/api/v1/replays', { seed: 20261010, scenario: 'fixture-diagnostics' });
    const out = [];
    for (const adv of [60, 30, 45]) {
      const st = await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: adv });
      const ev = await fetch(`/api/v1/replays/${s.replay_id}/events`).then(r => r.json());
      const now = st.sim_time_min;
      const comp = (kind) => ev.events.filter(e => e.type === 'test_completed' && e.payload.test === kind && e.event_time_min > now - 30).length;
      const startedN = (kind) => ev.events.filter(e => e.type === 'phase_change' && e.payload.to === (kind === 'lab' ? 'in_lab' : 'in_imaging') && e.event_time_min > now - 30).length;
      const d = st.resources.diagnostics;
      out.push({ t: now, labDone: [d.lab.completed_last_30_min, comp('lab')], labStarted: [d.lab.started_last_30_min, startedN('lab')], imgDone: [d.imaging.completed_last_30_min, comp('imaging')], imgStarted: [d.imaging.started_last_30_min, startedN('imaging')], labThroughput: d.lab.recent_throughput_tasks_per_hour, labCapacity: d.lab.capacity_tasks_per_hour });
    }
    return out;
  });

  // ---- 4. generated demand: seed 7, 12 h -------------------------------------------------------
  const n7 = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const s = await post('/api/v1/replays', { seed: 7, scenario: 'normal' });
    for (let t = 0; t < 720; t += 60) await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: 60 });
    return fetch(`/api/v1/replays/${s.replay_id}/export`).then(r => r.json());
  });
  const inv7 = invariants(n7, null);
  R.checks.normalSeed7 = { problems: inv7.problems, tests: inv7.testCount, max_lab_busy: inv7.max_lab_busy, max_imaging_busy: inv7.max_imaging_busy, patients: n7.patients.length,
    withTests: n7.patients.filter(p => p.tests_required && p.tests_required.length).length, direct: n7.patients.filter(p => p.tests_required && p.tests_required.length === 0).length,
    earlyDecisions: inv7.earlyDecisions.length, routeKinds: [...new Set(Object.values(inv7.routes))].length };
  // determinism across chunk sizes
  R.checks.determinism = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const run = async (chunk) => { const s = await post('/api/v1/replays', { seed: 5, scenario: 'fixture-diagnostics' }); for (let t = 0; t < 180; t += chunk) await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: chunk }); return fetch(`/api/v1/replays/${s.replay_id}/export`).then(r => r.json()); };
    const a = await run(60), b = await run(5);
    return { events: a.events.length, identical: JSON.stringify(a.events) === JSON.stringify(b.events) };
  });
  R.console = consoleMsgs;
  return R;
}
