// Playwright MCP snippet used for the ticket 06 UI evidence. Run with browser_run_code_unsafe (Playwright MCP);
// not a standalone test runner. Expects the production build on :8000.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { base: BASE, at: new Date().toISOString(), checks: {} };
  const consoleMsgs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleMsgs.push(m.text().slice(0, 120)); });
  let replayId = null;
  page.on('response', async (r) => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  const api = (path) => page.evaluate((p) => fetch(p).then((r) => r.json()), path);

  const LOCAL = { normal: 'Normal', building: 'Pressure building', overloaded: 'Overloaded', unknown: 'Cannot assess' };
  const SERVICES = { 1: ['triage'], 2: ['assessment', 'space'], 3: ['lab', 'imaging'], 4: ['discharge', 'allocation', 'transport', 'ward_beds'] };
  // Dot areas restated from the layout (origin x/z on the platform, columns, column step, label).
  const CENTER = { 1: -10.2, 2: -3.4, 3: 3.4, 4: 10.2 };
  const AREAS = {
    in_triage: [1, -2.1, -1.9, 1, 0.7, 'At triage desk', ['in_triage']],
    awaiting_triage: [1, -2.1, 0.4, 8, 0.62, 'Triage queue', ['awaiting_triage']],
    awaiting_space: [2, -2.1, -2.8, 8, 0.62, 'Awaiting space', ['awaiting_space']],
    clinician_queue: [2, -2.1, -0.9, 8, 0.62, 'Awaiting clinician', ['awaiting_clinician', 'awaiting_result_review']],
    care_wait: [2, -2.1, 1.0, 8, 0.62, 'Awaiting care completion', ['awaiting_care_completion']],
    with_clinician: [2, -1.8, 2.9, 4, 1.2, 'With clinician', ['assessment_active', 'result_review_active']],
    lab_queue: [3, -2.1, -2.8, 8, 0.62, 'Lab queue', ['awaiting_lab']],
    in_lab: [3, -1.8, -0.9, 2, 1.2, 'In lab', ['in_lab']],
    imaging_queue: [3, -2.1, 1.0, 8, 0.62, 'Imaging queue', ['awaiting_imaging']],
    in_imaging: [3, -1.8, 2.9, 1, 1.2, 'In imaging', ['in_imaging']],
    discharge: [4, -2.1, -3.0, 8, 0.62, 'Discharge', ['awaiting_discharge', 'disposition_processing']],
    boarding: [4, -2.1, -1.1, 8, 0.62, 'Awaiting ward/ICU bed', ['awaiting_ward_bed']],
    allocation: [4, -2.1, 0.8, 8, 0.62, 'Ward allocation', ['awaiting_ward_allocation', 'ward_allocation_active']],
    transport: [4, -2.1, 2.7, 8, 0.62, 'Transport', ['awaiting_transport', 'in_transport']],
  };
  const areaOf = (phase) => Object.entries(AREAS).find(([, a]) => a[6].includes(phase))?.[0];

  const readUi = () => page.evaluate(() => {
    const t = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;
    const canvas = document.querySelector('canvas');
    const svc = {};
    for (const li of document.querySelectorAll('[data-testid^="svc-"][data-state]')) {
      const id = li.dataset.testid.slice(4);
      svc[id] = { state: t(`svc-${id}-state`), queue: t(`svc-${id}-queue`), lam: t(`svc-${id}-lambda`), mu: t(`svc-${id}-mu`), thr: t(`svc-${id}-throughput`), signal: t(`svc-${id}-signal`), recovery: t(`svc-${id}-recovery`), confirmsIn: t(`svc-${id}-confirms-in`), onset: t(`svc-${id}-onset`) };
    }
    return {
      version: Number(document.querySelector('[data-testid=scene]').dataset.replayVersion),
      drawerVersion: Number(document.querySelector('[data-testid=zone-drawer]')?.dataset.version ?? -1),
      overall: t('overall-status'), localAlert: !!document.querySelector('[data-testid=local-alert]'),
      zoneChips: [1, 2, 3, 4].map((z) => t(`zone-${z}-status`)),
      bubbles: [1, 2, 3, 4].map((z) => t(`alert-${z}`)),
      areaLabels: [...document.querySelectorAll('.area-label')].map((e) => e.textContent.trim()),
      meshes: Number(canvas.dataset.patientMeshes), positions: JSON.parse(canvas.dataset.meshPositions || '[]'),
      drawerZone: t('drawer-zone-state'), note: t('pressure-note'), svc,
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
    };
  });

  // Expected UI text from /state (the ticket's contract), independent of how the UI formats it.
  const expectSvc = (s) => {
    const r = s.rates; const u = r.unit.replace(' per hour', '/h');
    const rate = (v) => (v === null ? 'Unknown' : `${v} ${u}`);
    return {
      state: LOCAL[s.state],
      queue: `${s.queue === null ? 'Unknown' : s.queue}${s.threshold !== null ? ` (threshold ${s.threshold})` : ''}`,
      lam: rate(r.received_per_hour), thr: rate(r.recent_throughput_per_hour),
      mu: r.capacity_per_hour === null ? (r.free_beds ? `${r.free_beds.ward} ward, ${r.free_beds.icu} ICU beds free` : 'Not modelled per hour') : `${r.capacity_per_hour} ${u}`,
    };
  };

  const stepAgreement = async (st, zone, problems, tag) => {
    const ui = await readUi();
    const bad = (m) => { if (problems.length < 30) problems.push(`${tag} T+${st.sim_time_min} ${m}`); };
    if (ui.version !== st.version || ui.drawerVersion !== st.version) bad(`version ui ${ui.version}/${ui.drawerVersion} vs ${st.version}`);
    if (ui.overall !== st.overall_status.label) bad(`overall ${ui.overall} vs ${st.overall_status.label}`);
    const anyOver = st.pressure.zones.some((z) => z.state === 'overloaded');
    if (ui.localAlert !== anyOver || st.overall_status.local_alert !== anyOver) bad(`local alert ui ${ui.localAlert} api ${st.overall_status.local_alert} want ${anyOver}`);
    st.pressure.zones.forEach((z, i) => {
      if (ui.zoneChips[i] !== LOCAL[z.state]) bad(`zone ${z.zone} chip ${ui.zoneChips[i]} vs ${LOCAL[z.state]}`);
      const want = z.state === 'overloaded' ? 'ALERT' : z.state === 'unknown' ? 'Cannot assess' : null;
      if (ui.bubbles[i] !== want) bad(`zone ${z.zone} bubble ${ui.bubbles[i]} vs ${want}`);
    });
    if (ui.meshes !== st.patients.length) bad(`meshes ${ui.meshes} vs ${st.patients.length}`);
    // area labels carry exact counts from the received phases
    const counts = {}; for (const k of Object.keys(AREAS)) counts[k] = 0;
    for (const p of st.patients) counts[areaOf(p.phase)]++;
    for (const [k, a] of Object.entries(AREAS)) if (!ui.areaLabels.includes(`${a[5]} · ${counts[k]}`)) bad(`area label ${a[5]} · ${counts[k]} missing (have ${ui.areaLabels.find((l) => l.startsWith(a[5]))})`);
    if (zone) {
      const zs = st.pressure.zones.find((z) => z.zone === zone);
      if (ui.drawerZone !== LOCAL[zs.state]) bad(`drawer zone state ${ui.drawerZone}`);
      for (const id of SERVICES[zone]) {
        const e = expectSvc(st.pressure.services[id]); const u = ui.svc[id];
        if (!u) { bad(`service card ${id} missing`); continue; }
        for (const k of ['state', 'queue', 'lam', 'thr', 'mu']) if (u[k] !== e[k]) bad(`${id} ${k} ${u[k]} vs ${e[k]}`);
        const s = st.pressure.services[id];
        if (s.rates.pressure_signal === true && !/not a countdown/.test(u.signal)) bad(`${id} pressure signal wording`);
        if (s.state === 'building' && !/min if it persists/.test(u.confirmsIn || '')) bad(`${id} confirms-in missing`);
      }
      if (!/not overall ED congestion/.test(ui.note || '') || !ui.note.includes(st.overall_status.label)) bad('pressure note');
    }
    return ui;
  };

  // ---- A. congestion boundary fixture through the UI, 26 steps of 5 min ----------------------------------
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/?fixture=fixture-congestion-boundary');
  await page.getByTestId('start').click(); await waitV(1);
  await page.getByTestId('zone-2').click();
  const problemsA = []; const seen = [];
  for (let k = 1; k <= 26; k++) {
    await page.getByTestId('step').click(); await waitV(k + 1); await page.waitForTimeout(120);
    const st = await api(`/api/v1/replays/${replayId}/state`);
    await page.waitForFunction((n) => Number(document.querySelector('canvas').dataset.patientMeshes) === n, st.patients.length, { timeout: 3000 }).catch(() => {});
    await stepAgreement(st, 2, problemsA, 'A');
    seen.push(`${st.sim_time_min}:${st.overall_status.label}|${st.pressure.zones.map((z) => z.state[0]).join('')}|${st.overall_status.local_alert ? 'L' : '-'}`);
  }
  R.checks.congestionUi = { steps: 26, problems: problemsA, seen };
  await page.screenshot({ path: 'C:/Users/Vaas/Documents/Prototype/PulseAhead/Real/evidence/shots/06-congestion-t130.png' });

  // ---- B. surge fixture: layered dots stay inside their own area -----------------------------------------
  await page.goto(BASE + '/?fixture=fixture-queue-surge');
  await page.getByTestId('start').click(); await waitV(1);
  await page.getByTestId('zone-1').click();
  const problemsB = []; let maxLayer = 0; let triageCount = 0;
  for (let k = 1; k <= 4; k++) {
    await page.getByTestId('step').click(); await waitV(k + 1);
    await page.waitForTimeout(2200); // the dots ease into place
    const st = await api(`/api/v1/replays/${replayId}/state`);
    const ui = await stepAgreement(st, 1, problemsB, 'B');
    const phaseById = Object.fromEntries(st.patients.map((p) => [p.id, p.phase]));
    const perArea = {};
    for (const m of ui.positions) {
      const key = areaOf(phaseById[m.id]); const [zone, ox, oz, cols, step] = AREAS[key];
      const x = m.x - CENTER[zone], z = m.z;
      const idx = (perArea[key] = (perArea[key] ?? -1) + 1);
      const inBox = x >= ox - 0.02 && x <= ox + (cols - 1) * step + 0.02 && z >= oz - 0.02 && z <= oz + step + 0.02;
      if (!inBox) problemsB.push(`T+${st.sim_time_min} ${m.id} (${key}) at x ${x.toFixed(2)} z ${z.toFixed(2)} outside its area`);
      const layer = Math.round((m.y - 0.5) / 0.6);
      if (Math.abs(m.y - (0.5 + layer * 0.6)) > 0.02) problemsB.push(`${m.id} y ${m.y} not on a layer`);
      maxLayer = Math.max(maxLayer, layer);
    }
    triageCount = Math.max(triageCount, st.patients.filter((p) => p.phase === 'awaiting_triage').length);
    if (ui.positions.some((m) => Math.abs(m.x - CENTER[1]) > 3.2 && m.x < -6)) problemsB.push('dot beyond platform');
  }
  R.checks.surgeLayout = { problems: problemsB.slice(0, 20), maxTriageQueue: triageCount, maxLayerSeen: maxLayer };
  await page.screenshot({ path: 'C:/Users/Vaas/Documents/Prototype/PulseAhead/Real/evidence/shots/06-surge-layers.png' });

  // ---- C. missing imaging feed through the UI ------------------------------------------------------------
  await page.goto(BASE + '/?fixture=fixture-diagnostics-gap');
  await page.getByTestId('start').click(); await waitV(1);
  await page.getByTestId('zone-3').click();
  const problemsC = []; const gapRows = [];
  for (let k = 1; k <= 24; k++) {
    await page.getByTestId('step').click(); await waitV(k + 1); await page.waitForTimeout(100);
    const st = await api(`/api/v1/replays/${replayId}/state`);
    const ui = await stepAgreement(st, 3, problemsC, 'C');
    if (st.sim_time_min >= 90 && st.sim_time_min < 120) gapRows.push({ t: st.sim_time_min, zone3: ui.zoneChips[2], imaging: ui.svc.imaging.state, queue: ui.svc.imaging.queue, lam: ui.svc.imaging.lam, thr: ui.svc.imaging.thr, mu: ui.svc.imaging.mu, recovery: ui.svc.imaging.recovery });
  }
  R.checks.missingInputsUi = { problems: problemsC, gapRows };

  // ---- D. widths ----------------------------------------------------------------------------------------
  await page.goto(BASE + '/?fixture=fixture-congestion-boundary');
  await page.getByTestId('start').click(); await waitV(1);
  for (let k = 1; k <= 12; k++) { await page.getByTestId('step').click(); await waitV(k + 1); }
  await page.getByTestId('zone-2').click();
  R.checks.widths = [];
  for (const w of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
      const canvas = document.querySelector('.scene-canvas').getBoundingClientRect();
      const bubble = document.querySelector('[data-testid=alert-2]');
      const btn = [...document.querySelectorAll('.zone-btn')].map(box);
      const chips = [...document.querySelectorAll('.zone-btn .status')].map(box);
      const bb = bubble ? box(bubble) : null;
      return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, minButtonH: Math.min(...btn.map((b) => b.h)), minButtonW: Math.min(...btn.map((b) => b.w)),
        chipsInsideButtons: chips.every((c, i) => c.l >= btn[i].l - 1 && c.r <= btn[i].r + 1 && c.b <= btn[i].b + 1), bubbleInsideCanvas: bb ? bb.l >= canvas.left - 1 && bb.r <= canvas.right + 1 && bb.t >= canvas.top - 1 && bb.b <= canvas.bottom + 1 : null,
        bubbleText: bubble?.textContent ?? null, drawerCards: document.querySelectorAll('.svc-list li').length };
    });
    R.checks.widths.push({ width: w, ...m, noHorizontalScroll: m.scrollW <= m.innerW });
    await page.screenshot({ path: `C:/Users/Vaas/Documents/Prototype/PulseAhead/Real/evidence/shots/06-width-${w}.png` });
  }
  R.console = consoleMsgs;
  return R;
}
