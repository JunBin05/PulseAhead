// Playwright MCP snippet used for the ticket 02 evidence. Run with browser_run_code_unsafe (Playwright MCP);
// not a standalone test runner. Expects the production build on :8000.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { base: BASE, fixture: 'fixture-intake', at: new Date().toISOString(), steps: [], checks: {} };
  const consoleMsgs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text().slice(0, 100)); });
  let replayId = null;
  page.on('response', async r => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });
  const ver = () => page.getByTestId('scene').getAttribute('data-replay-version').then(Number);
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  const api = (path) => page.evaluate((p) => fetch(p).then(r => r.json()), path);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/?fixture=fixture-intake');
  await page.getByTestId('start').click();
  await waitV(1);

  const HIDDEN_ARRIVALS = { A02: 27, A04: 30 };
  const ANN_KEYS = ['acuity', 'closed_min', 'eta_min', 'eta_uncertainty_min', 'id', 'minutes_overdue', 'patient_count', 'received_min', 'source_updated_min', 'status'].join(',');
  const problems = [];
  for (let k = 1; k <= 12; k++) {
    await page.getByTestId('step').click(); await waitV(k + 1); await page.waitForTimeout(150);
    const st = await api(`/api/v1/replays/${replayId}/state`);
    const ui = await page.evaluate(() => ({
      time: document.querySelector('[data-testid=sim-time]').textContent,
      ambCount: document.querySelector('[data-testid=amb-count]').textContent,
      ambPatients: document.querySelector('[data-testid=amb-patients]').textContent,
      items: [...document.querySelectorAll('[data-testid=amb-list] li')].map(li => ({ id: li.dataset.testid.slice(4), status: li.dataset.status, text: li.innerText.replace(/\s+/g, ' ') })),
      triageBusy: document.querySelector('[data-testid=triage-busy]').textContent,
      resus: document.querySelector('[data-testid=resus-available]').textContent,
      zoneBtns: [1, 2, 3, 4].map(z => parseInt(document.querySelector(`[data-testid=zone-${z}-count]`).textContent)),
      meshes: Number(document.querySelector('canvas').dataset.patientMeshes),
    }));
    const inboundIds = st.inbound_ambulances.map(a => a.id);
    const row = {
      t: st.sim_time_min, ui,
      api: {
        inbound: st.inbound_ambulances.map(a => `${a.id}:${a.status}:eta${a.eta_min}:${a.patient_count}p${a.minutes_overdue !== null ? ':overdue' + a.minutes_overdue : ''}`),
        summary: st.inbound_summary, inEd: st.counts.in_ed, arrived: st.counts.arrived_total,
        phases: st.patients.map(p => `${p.id}:${p.phase}${p.space_id ? ':' + p.space_id : ''}${p.triage_id ? ':' + p.triage_id : ''}`),
        triage: st.resources.triage_desk, resus: st.resources.resus_spaces,
        knownDemand: st.incoming_demand.known.patients, background: st.incoming_demand.background,
      },
    };
    // Agreement and invariants at every step
    if (Number(ui.ambCount) !== st.inbound_summary.ambulances || Number(ui.ambPatients) !== st.inbound_summary.patients) problems.push(`t${st.sim_time_min} sidebar/API count mismatch`);
    if (JSON.stringify(ui.items.map(i => i.id)) !== JSON.stringify(inboundIds)) problems.push(`t${st.sim_time_min} list ids differ`);
    if (new Set(inboundIds).size !== inboundIds.length) problems.push(`t${st.sim_time_min} duplicate inbound`);
    if (st.inbound_summary.patients !== st.inbound_ambulances.reduce((a, x) => a + x.patient_count, 0)) problems.push('patient total mismatch');
    for (const a of st.ambulance_announcements) {
      if (Object.keys(a).sort().join(',') !== ANN_KEYS) problems.push(`t${st.sim_time_min} ${a.id} unexpected keys ${Object.keys(a).sort()}`);
      if (a.id in HIDDEN_ARRIVALS && a.status !== 'arrived' && Object.values(a).includes(HIDDEN_ARRIVALS[a.id])) problems.push(`t${st.sim_time_min} ${a.id} exposes hidden arrival time`);
    }
    const enRoutePatientsInEd = st.patients.filter(p => p.ambulance_id && inboundIds.includes(p.ambulance_id));
    if (enRoutePatientsInEd.length) problems.push(`t${st.sim_time_min} en-route patients in ED: ${enRoutePatientsInEd.map(p => p.id)}`);
    if (ui.meshes !== st.patients.length) problems.push(`t${st.sim_time_min} meshes ${ui.meshes} != patients ${st.patients.length}`);
    if (JSON.stringify(ui.zoneBtns) !== JSON.stringify(st.zones.map(z => z.patient_count))) problems.push(`t${st.sim_time_min} zone counts differ`);
    R.steps.push(row);
  }
  R.checks.problems = problems;

  // Event history checks
  const ev = await api(`/api/v1/replays/${replayId}/events`);
  const byAmb = {};
  for (const e of ev.events) if (e.ambulance_id && e.type.startsWith('ambulance_')) (byAmb[e.ambulance_id] ??= []).push(`${e.type.replace('ambulance_', '')}@${e.event_time_min}${e.payload.eta_min !== undefined ? ':eta' + e.payload.eta_min : ''}`);
  R.checks.ambulanceEvents = byAmb;
  const seq = {};
  for (const e of ev.events) if (e.patient_id) (seq[e.patient_id] ??= []).push({ t: e.event_time_min, to: e.type === 'arrival' ? 'arrival:' + e.payload.phase : e.payload.to, r: e.resources });
  // Triage desk: never two patients in triage at once; urgent W04 triaged before W02/W03
  const triageIntervals = Object.entries(seq).map(([id, s]) => { const a = s.find(x => x.to === 'in_triage'); const b = s.find(x => x.to === 'awaiting_space' && a); return a ? { id, start: a.t, end: b ? b.t : null } : null; }).filter(Boolean).sort((x, y) => x.start - y.start);
  let overlap = false;
  for (let i = 1; i < triageIntervals.length; i++) if (triageIntervals[i - 1].end === null || triageIntervals[i].start < triageIntervals[i - 1].end) overlap = true;
  R.checks.triage = { order: triageIntervals.map(x => `${x.id}@${x.start}-${x.end}`), overlap };
  // Critical bypass: no triage, zone 2 at arrival, at most 2 resus held, the third waits
  const crit = ['A05-1', 'A05-2', 'A05-3'].map(id => ({ id, events: (seq[id] || []).map(x => `${x.to}@${x.t}${x.r.ed_space ? ':' + x.r.ed_space : ''}`) }));
  let held = 0, maxHeld = 0;
  for (const e of ev.events) {
    if (!e.patient_id?.startsWith('A05')) continue;
    if (e.payload.to === 'awaiting_clinician') held++;
    if (e.payload.to === 'departed') held--;
    maxHeld = Math.max(maxHeld, held);
  }
  R.checks.critical = { crit, maxResusHeld: maxHeld, anyTriage: crit.some(c => c.events.some(x => x.includes('triage'))) };
  // Multiple patients per ambulance
  R.checks.multiPatient = ['A01-1', 'A01-2'].map(id => (seq[id] || [])[0]);

  // Screenshot at a moment with an overdue ambulance: reload fixture to T+20
  await page.goto(BASE + '/?fixture=fixture-intake');
  await page.getByTestId('start').click(); await waitV(1);
  for (let k = 1; k <= 4; k++) { await page.getByTestId('step').click(); await waitV(k + 1); }
  await page.getByTestId('zone-1').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'PulseAhead/Real/evidence/shots/02-fixture-t20.png' });
  R.checks.t20Drawer = await page.evaluate(() => document.querySelector('[data-testid=zone-drawer]').innerText.replace(/\s+/g, ' '));
  R.console = consoleMsgs;
  return R;
}
