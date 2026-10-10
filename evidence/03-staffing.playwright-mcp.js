// Playwright MCP snippet used for the ticket 03 evidence. Run with browser_run_code_unsafe (Playwright MCP);
// not a standalone test runner. Expects the production build on :8000.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { base: BASE, fixture: 'fixture-staffing', at: new Date().toISOString(), checks: {} };
  const consoleMsgs = [];
  page.on('console', m => { if (m.type() === 'error') consoleMsgs.push(m.text().slice(0, 100)); });
  let replayId = null;
  page.on('response', async r => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });
  const ver = () => page.getByTestId('scene').getAttribute('data-replay-version').then(Number);
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  const api = (path) => page.evaluate((p) => fetch(p).then(r => r.json()), path);

  // ---- pure checks over an exported run (events + profile) --------------------------------
  const invariants = (ex) => {
    const out = { problems: [] };
    const bad = (m) => { if (out.problems.length < 25) out.problems.push(m); };
    const ev = ex.events;
    const cover = {};
    for (const n of ex.profile.nurses) for (const s of n.covers) cover[s] = n.id;
    const rankOf = {}; const crit = {};
    for (const e of ev) if (e.type === 'arrival') { rankOf[e.patient_id] = e.payload.critical_bypass ? -1 : { urgent: 0, medium: 1, lower: 2 }[e.payload.urgency]; crit[e.patient_id] = e.payload.critical_bypass; }
    // nurse duty timeline
    const duty = {}; for (const n of ex.profile.nurses) duty[n.id] = [{ t: -1, on: true }];
    for (const e of ev) if (e.type === 'staff_off_duty' || e.type === 'staff_on_duty') duty[e.payload.staff_id].push({ t: e.event_time_min, on: e.type === 'staff_on_duty', id: e.id });
    const onDutyAt = (n, t, evId) => { let on = true; for (const d of duty[n]) { if (d.t < t || (d.t === t && (d.id === undefined || d.id < evId))) on = d.on; } return on; };
    // waiting intervals and grants
    const spaceWait = {}; const clinWait = {};
    const grants = []; const clinGrants = [];
    const spaceHold = {}; const docHold = {}; const openDoc = {};
    for (const e of ev) {
      if (e.type !== 'phase_change') continue;
      const to = e.payload.to; const pid = e.patient_id; const t = e.event_time_min;
      if (openDoc[pid]) { openDoc[pid].to = t; delete openDoc[pid]; }
      if (to === 'awaiting_space') spaceWait[pid] = { start: t, id: e.id };
      if (to === 'awaiting_clinician') { // space granted
        grants.push({ pid, t, id: e.id, space: e.resources.ed_space, start: spaceWait[pid]?.start ?? t });
        clinWait[pid] = { start: t };
        (spaceHold[e.resources.ed_space] ??= []).push({ pid, from: t, to: null });
        const nurse = cover[e.resources.ed_space];
        if (e.resources.nurse !== nurse) bad(`${e.id} nurse ${e.resources.nurse} != covering ${nurse}`);
        if (!onDutyAt(nurse, t, e.id)) bad(`${e.id} ${pid} granted ${e.resources.ed_space} while ${nurse} off duty at ${t}`);
        if (crit[pid] !== e.resources.ed_space.startsWith('R')) bad(`${e.id} ${pid} critical=${crit[pid]} got ${e.resources.ed_space}`);
      }
      if (to === 'assessment_active') {
        clinGrants.push({ pid, t, doc: e.resources.clinician_slot, start: clinWait[pid]?.start ?? t });
        const hold = { pid, from: t, to: null };
        (docHold[e.resources.clinician_slot] ??= []).push(hold);
        openDoc[pid] = hold;
      }
      if (to === 'departed') { const h = spaceHold[e.resources.ed_space]?.find(x => x.pid === pid && x.to === null); if (h) h.to = t; else bad(`${e.id} departure without hold`); }
    }
    // serve order: nobody with better (rank, arrival-to-queue) is still waiting at a grant
    for (const g of grants) {
      for (const w of grants) {
        if (w.pid === g.pid || w.start > g.t || w.t <= g.t) continue; // w not waiting at g.t
        if (crit[w.pid] !== crit[g.pid]) continue; // different pools
        if (rankOf[w.pid] < rankOf[g.pid]) bad(`space order: ${g.pid} (rank ${rankOf[g.pid]}) granted at ${g.t} before ${w.pid} (rank ${rankOf[w.pid]}) waiting since ${w.start}`);
        else if (rankOf[w.pid] === rankOf[g.pid] && w.start < g.start) bad(`space FIFO: ${g.pid} before ${w.pid}`);
      }
    }
    for (const g of clinGrants) {
      for (const w of clinGrants) {
        if (w.pid === g.pid || w.start > g.t || w.t <= g.t) continue;
        if (rankOf[w.pid] < rankOf[g.pid]) bad(`doctor order: ${g.pid} before ${w.pid}`);
        else if (rankOf[w.pid] === rankOf[g.pid] && w.start < g.start) bad(`doctor FIFO: ${g.pid} before ${w.pid}`);
      }
    }
    // doctors: close holds at decision_received; no overlap; one doctor throughout
    const decision = {}; const careDone = {}; const careStart = {}; const dispo = {};
    for (const e of ev) {
      if (e.type === 'decision_received') decision[e.patient_id] = e;
      if (e.type === 'care_completed') careDone[e.patient_id] = e;
      if (e.type === 'care_started') careStart[e.patient_id] = e;
      if (e.type === 'phase_change' && e.payload.zone === 4 && !dispo[e.patient_id]) dispo[e.patient_id] = e;
    }
    for (const [doc, hs] of Object.entries(docHold)) {
      hs.sort((a, b) => a.from - b.from);
      for (let i = 1; i < hs.length; i++) if (hs[i - 1].to === null || hs[i].from < hs[i - 1].to) bad(`doctor ${doc} overlap ${hs[i - 1].pid}/${hs[i].pid}`);
    }
    out.doctorsUsed = Object.keys(docHold).sort();
    // space holds: no overlap
    for (const [sp, hs] of Object.entries(spaceHold)) {
      hs.sort((a, b) => a.from - b.from);
      for (let i = 1; i < hs.length; i++) if (hs[i - 1].to === null || hs[i].from < hs[i - 1].to) bad(`space ${sp} double allocated ${hs[i - 1].pid}/${hs[i].pid}`);
    }
    // patient: same space throughout, no clinician slot while waiting for care/disposition
    const spaceOf = {};
    for (const e of ev) {
      if (e.type !== 'phase_change' || !e.patient_id) continue;
      const sp = e.resources.ed_space;
      if (sp && ['awaiting_clinician', 'assessment_active', 'awaiting_care_completion', 'disposition_processing', 'departed'].includes(e.payload.to)) {
        if (spaceOf[e.patient_id] && spaceOf[e.patient_id] !== sp) bad(`${e.patient_id} changed space ${spaceOf[e.patient_id]} -> ${sp}`);
        spaceOf[e.patient_id] = sp;
      }
      if (['awaiting_care_completion', 'awaiting_discharge', 'disposition_processing'].includes(e.payload.to) && e.resources.clinician_slot) bad(`${e.id} holds a doctor in ${e.payload.to}`);
    }
    // timestamps from the export vs events
    const ts = {}; for (const p of ex.patients) ts[p.patient_id] = p;
    const prem = [];
    for (const [pid, p] of Object.entries(ts)) {
      const fa = ev.find(e => e.patient_id === pid && e.type === 'phase_change' && e.payload.to === 'assessment_active');
      if (fa && fa.event_time_min !== p.first_assessment_min) bad(`${pid} first_assessment ${p.first_assessment_min} vs event ${fa.event_time_min}`);
      if (decision[pid] && decision[pid].event_time_min !== p.decision_min) bad(`${pid} decision ${p.decision_min} vs event`);
      if (p.effective_disposition_min !== null) {
        const care = careDone[pid] ? careDone[pid].event_time_min : p.first_assessment_min;
        const want = Math.max(p.decision_min, care);
        if (Math.abs(p.effective_disposition_min - want) > 1e-6) bad(`${pid} effective ${p.effective_disposition_min} != max(decision, care) ${want}`);
        if (p.care_complete_min !== care) bad(`${pid} care_complete ${p.care_complete_min} vs ${care}`);
        if (dispo[pid] && dispo[pid].event_time_min !== p.effective_disposition_min) bad(`${pid} disposition phase time != effective`);
        if (decision[pid].event_time_min < care) prem.push({ pid, decision: p.decision_min, careDone: care, effective: p.effective_disposition_min });
      }
      if (p.departure_min !== null && p.effective_disposition_min !== null && p.departure_min < p.effective_disposition_min) bad(`${pid} departed before effective disposition`);
    }
    out.premature = prem;
    out.counts = { events: ev.length, patients: ex.patients.length, grants: grants.length, staffEvents: Object.values(duty).reduce((a, d) => a + d.length - 1, 0) };
    return out;
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/?fixture=fixture-staffing');
  await page.getByTestId('start').click();
  await waitV(1);
  await page.getByTestId('zone-2').click();

  // ---- 1. 28 steps of 5 min: drawer and sidebar vs /state at the same version ---------------
  const rows = []; const agreeProblems = [];
  for (let k = 1; k <= 28; k++) {
    await page.getByTestId('step').click(); await waitV(k + 1); await page.waitForTimeout(120);
    const st = await api(`/api/v1/replays/${replayId}/state`);
    // data-patient-meshes is sampled every 15 frames; wait for it to catch up (as 02, 04 and 05 do).
    await page.waitForFunction((n) => Number(document.querySelector('canvas').dataset.patientMeshes) === n, st.patients.length, { timeout: 3000 }).catch(() => {});
    const ui = await page.evaluate(() => {
      const t = (id) => document.querySelector(`[data-testid=${id}]`)?.textContent ?? null;
      return {
        version: Number(document.querySelector('[data-testid=scene]').dataset.replayVersion),
        drawerVersion: Number(document.querySelector('[data-testid=zone-drawer]').dataset.version),
        staffed: t('staffed-spaces'), occupied: Number(t('occupied-spaces')), available: t('available-spaces'),
        awaiting: Number(t('awaiting-space')), careWait: Number(t('drawer-care-wait')),
        unstaffedNote: t('unstaffed-note'),
        doctors: [...document.querySelectorAll('[data-testid=doctor-list] li[data-testid^=doctor-D]')].map(li => li.innerText.replace(/\s+/g, ' ')),
        nurses: [...document.querySelectorAll('li[data-testid^=nurse-N]')].map(d => d.innerText.replace(/\s+/g, ' ')),
        meshes: Number(document.querySelector('canvas').dataset.patientMeshes),
        zoneBtns: [1, 2, 3, 4].map(z => parseInt(t(`zone-${z}-count`))),
        z2drawer: Number(t('drawer-count')),
      };
    });
    const sp = st.resources.ed_spaces; const sf = st.resources.staff;
    const z = st.zones.map(x => x.patient_count);
    const row = { t: st.sim_time_min, v: st.version, staffed: `${sp.staffed_total}/${sp.total}`, occupied: sp.occupied, availableStaffed: sp.available_staffed, awaiting: sp.awaiting_space, unstaffedEmpty: sp.unstaffed_empty, offDuty: sf.off_duty_nurses.join(','), zones: z, careWait: st.zones[1].awaiting_care_completion, doctorsBusy: sf.doctors.filter(d => d.patient_id).length };
    rows.push(row);
    const want = [
      [ui.version === st.version, 'version'], [ui.drawerVersion === st.version, 'drawerVersion'],
      [ui.staffed === `${sp.staffed_total} of ${sp.total}`, 'staffed text'],
      [ui.occupied === sp.occupied, 'occupied'], [ui.awaiting === sp.awaiting_space, 'awaiting'],
      [ui.available === `${sp.available_staffed} of ${sp.total}`, 'available'],
      [ui.careWait === st.zones[1].awaiting_care_completion, 'careWait'],
      [ui.meshes === st.patients.length, 'meshes'],
      [JSON.stringify(ui.zoneBtns) === JSON.stringify(z), 'zoneBtns'], [ui.z2drawer === z[1], 'drawer count'],
      [ui.doctors.length === 4, 'doctor rows'],
      [ui.nurses.length === 6, 'nurse rows'],
      [ui.doctors.every((d, i) => d.includes(sf.doctors[i].patient_id ? `with ${sf.doctors[i].patient_id}` : 'free')), 'doctor patients'],
      [ui.nurses.every((n, i) => n.includes(sf.nurses[i].on_duty ? 'On duty' : 'Off duty') && n.includes(`${sf.nurses[i].occupied} occupied, ${sf.nurses[i].empty} empty`)), 'nurse rows text'],
      [sp.unstaffed_empty === 0 ? ui.unstaffedNote.startsWith('Every empty space') : ui.unstaffedNote.startsWith(`${sp.unstaffed_empty} empty space`), 'unstaffed note'],
      [z.reduce((a, b) => a + b, 0) === st.patients.length, 'zone sum'],
    ];
    for (const [ok, name] of want) if (!ok) agreeProblems.push(`T+${st.sim_time_min} ${name}`);
    // independent recompute of unstaffed-empty from nurses + patient spaces
    const held = new Set(st.patients.map(p => p.space_id).filter(Boolean));
    const offCovered = sf.nurses.filter(n => !n.on_duty).flatMap(n => n.covers);
    const recompute = offCovered.filter(s => !held.has(s)).length;
    if (recompute !== sp.unstaffed_empty) agreeProblems.push(`T+${st.sim_time_min} unstaffed recompute ${recompute} vs ${sp.unstaffed_empty}`);
    const staffedRecompute = 24 - offCovered.length;
    if (staffedRecompute !== sp.staffed_total) agreeProblems.push(`T+${st.sim_time_min} staffed recompute`);
    // a patient never sits in a space whose nurse record disagrees
    const nurseOfSpace = {}; for (const n of sf.nurses) for (const s of n.covers) nurseOfSpace[s] = n.id;
    for (const p of st.patients) if (p.space_id && p.nurse_id !== nurseOfSpace[p.space_id]) agreeProblems.push(`T+${st.sim_time_min} ${p.id} nurse mismatch`);
  }
  R.checks.stepRows = rows;
  R.checks.uiVsApiProblems = agreeProblems;

  // ---- 2. staff structure from /state (no duplication, ownership) ----------------------------
  const st = await api(`/api/v1/replays/${replayId}/state`);
  const sf = st.resources.staff;
  const allCovered = sf.nurses.flatMap(n => n.covers);
  R.checks.staffStructure = {
    doctors: sf.doctors.map(d => `${d.id}:${d.name}:${d.owner}`),
    reserve: sf.reserve_physician,
    nurses: sf.nurses.map(n => `${n.id}:${n.covers.length}:${n.owner}`),
    coveredSpaces: allCovered.length, uniqueCovered: new Set(allCovered).size,
    clinicianSlotsTotal: st.resources.clinician_slots.total, doctorsListed: sf.doctors.length,
    spaceIdsAreRealPool: allCovered.every(s => /^S(0[1-9]|1\d|2[0-2])$|^R[12]$/.test(s)),
    resusCoveredBy: sf.nurses.find(n => n.covers.includes('R1')).id,
    hiddenCareTaskInState: JSON.stringify(st).includes('care_task'),
  };

  // ---- 3. invariants over the exported fixture run -----------------------------------------
  const ex = await api(`/api/v1/replays/${replayId}/export`);
  const ev = await api(`/api/v1/replays/${replayId}/events`);
  const inv = invariants(ex);
  R.checks.fixtureInvariants = inv;
  R.checks.exportEventsEqualEvents = ex.events.length === ev.total;
  R.checks.careStartedHasNoDuration = ex.events.filter(e => e.type === 'care_started').every(e => JSON.stringify(e.payload) === '{"task":"stabilization"}');
  R.checks.staffEvents = ex.events.filter(e => e.type.startsWith('staff_')).map(e => `${e.id} ${e.type} ${e.payload.staff_id} @${e.event_time_min}`);

  // grants on / after 60 for the nurses that came back, and none for N3-N5 spaces
  const grantsBy = {};
  for (const e of ex.events) if (e.type === 'phase_change' && e.payload.to === 'awaiting_clinician') (grantsBy[e.resources.ed_space] ??= []).push(e.event_time_min);
  const early = []; const forbidden = [];
  for (const [sp, ts] of Object.entries(grantsBy)) {
    const num = sp.startsWith('S') ? Number(sp.slice(1)) : 99;
    if (num >= 1 && num <= 8 && ts.some(t => t < 60)) early.push(sp);
    if (num >= 9 && num <= 20) forbidden.push(sp);
  }
  R.checks.coverageGrants = { spacesGrantedBeforeNursesReturned: early, grantsToN3N4N5Spaces: forbidden, grantedSpaces: Object.keys(grantsBy).sort() };

  // critical patients: A01 x3 at 20, A02-1 at 60
  const crit = {};
  for (const e of ex.events) if (e.patient_id?.startsWith('A0') && e.type !== 'arrival') (crit[e.patient_id] ??= []).push(`${e.event_time_min} ${e.type === 'phase_change' ? e.payload.to : e.type} ${e.resources.ed_space ?? ''}`);
  R.checks.critical = crit;
  const maxResus = (() => { let cur = 0, max = 0; const L = []; for (const e of ex.events) if (e.type === 'phase_change' && e.resources.ed_space?.startsWith('R')) { if (e.payload.to === 'awaiting_clinician') cur++; if (e.payload.to === 'departed') cur--; max = Math.max(max, cur); } return max; })();
  R.checks.maxResusHeld = maxResus;

  // urgent W15 (arrived 40) vs lower-urgency patients already queued
  const t15 = ex.patients.find(p => p.patient_id === 'W15');
  const waitingLowerAt60 = ex.events.filter(e => e.type === 'phase_change' && e.payload.to === 'awaiting_clinician' && e.event_time_min === 60).map(e => e.patient_id);
  R.checks.urgentLateArrival = { W15: t15, grantsAt60: waitingLowerAt60 };

  // ---- 4. same invariants on a long normal run (seed 7, 12 h) -------------------------------
  R.checks.normalSeed7 = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const s = await post('/api/v1/replays', { seed: 7, scenario: 'normal' });
    for (let t = 0; t < 720; t += 60) await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: 60 });
    const st = await fetch(`/api/v1/replays/${s.replay_id}/state`).then(r => r.json());
    const ex = await fetch(`/api/v1/replays/${s.replay_id}/export`).then(r => r.json());
    return { id: s.replay_id, ex, staffed: st.resources.ed_spaces.staffed_total, unstaffed: st.resources.ed_spaces.unstaffed_empty, offDuty: st.resources.staff.off_duty_nurses };
  });
  const n7 = R.checks.normalSeed7;
  R.checks.normalSeed7 = { invariants: invariants(n7.ex), staffed: n7.staffed, unstaffed: n7.unstaffed, offDuty: n7.offDuty,
    premature: n7.ex.patients.filter(p => p.effective_disposition_min !== null && p.decision_min < p.care_complete_min).length,
    withCareTask: n7.ex.patients.filter(p => p.care_task_required).length,
    staffEvents: n7.ex.events.filter(e => e.type.startsWith('staff_')).length };
  // determinism: chunk sizes
  R.checks.determinism = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(r => r.json());
    const run = async (chunk) => { const s = await post('/api/v1/replays', { seed: 11, scenario: 'fixture-staffing' }); for (let t = 0; t < 120; t += chunk) await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: chunk }); return fetch(`/api/v1/replays/${s.replay_id}/export`).then(r => r.json()); };
    const a = await run(60), b = await run(5);
    return { events: a.events.length, identical: JSON.stringify(a.events) === JSON.stringify(b.events) };
  });
  R.console = consoleMsgs;
  return R;
}
