// Playwright MCP snippet: ticket 06 review-gate check of the zone 4 waiting/active areas. Run with browser_run_code_unsafe
// (Playwright MCP); not a standalone test runner. Expects the production build on :8000.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { base: BASE, at: new Date().toISOString(), checks: {} };
  let replayId = null;
  page.on('response', async (r) => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  const api = (path) => page.evaluate((p) => fetch(p).then((r) => r.json()), path);
  const CX = 10.2; // zone 4 platform centre x
  // zone 4 areas restated from the layout: [origin x, origin z, cols, step, label, phases]; one row per layer
  const A4 = {
    discharge_queue: [-2.1, -3.45, 8, 0.62, 'Awaiting discharge', ['awaiting_discharge']],
    discharge_active: [-2.1, -2.27, 8, 0.62, 'Discharge processing', ['disposition_processing']],
    boarding: [-2.1, -1.09, 8, 0.62, 'Awaiting ward/ICU bed', ['awaiting_ward_bed']],
    allocation_queue: [-2.1, 0.09, 8, 0.62, 'Awaiting ward allocation', ['awaiting_ward_allocation']],
    allocation_active: [-2.1, 1.27, 8, 0.62, 'Ward allocation', ['ward_allocation_active']],
    transport_queue: [-2.1, 2.45, 8, 0.62, 'Awaiting transport', ['awaiting_transport']],
    transport_active: [-2.1, 3.63, 8, 0.62, 'In transport', ['in_transport']],
  };
  const areaOf = (phase) => Object.entries(A4).find(([, a]) => a[5].includes(phase))?.[0];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/?fixture=fixture-boarding');
  await page.getByTestId('start').click(); await waitV(1);
  await page.getByTestId('zone-4').click();
  const problems = []; const populated = new Set(); let maxInArea = 0; let maxLayer = 0; let overlapsMax = 0; let rows = 0;
  for (let k = 1; k <= 40; k++) {
    await page.getByTestId('step').click(); await waitV(k + 1);
    await page.waitForTimeout(1500);
    const st = await api(`/api/v1/replays/${replayId}/state`);
    const ui = await page.evaluate(() => ({
      positions: JSON.parse(document.querySelector('canvas').dataset.meshPositions || '[]'),
      labels: [...document.querySelectorAll('.area-label')].map((e) => e.textContent.trim()),
      rects: [...document.querySelectorAll('.zone-label, .area-label')].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }),
    }));
    const phaseById = Object.fromEntries(st.patients.map((p) => [p.id, p.phase]));
    const counts = {};
    for (const p of st.patients) { const key = areaOf(p.phase); if (key) { counts[key] = (counts[key] || 0) + 1; populated.add(key); } }
    for (const [key, a] of Object.entries(A4)) {
      const want = `${a[4]} · ${counts[key] || 0}`;
      if (!ui.labels.includes(want)) problems.push(`T+${st.sim_time_min} label "${want}" missing`);
      maxInArea = Math.max(maxInArea, counts[key] || 0);
    }
    for (const m of ui.positions) {
      const key = areaOf(phaseById[m.id]);
      if (!key) continue;
      rows++;
      const [ox, oz, cols, step] = A4[key];
      const x = m.x - CX, z = m.z;
      if (!(x >= ox - 0.02 && x <= ox + (cols - 1) * step + 0.02 && Math.abs(z - oz) <= 0.02)) problems.push(`T+${st.sim_time_min} ${m.id} (${key}) at x ${x.toFixed(2)} z ${z.toFixed(2)} off its row`);
      const layer = Math.round((m.y - 0.5) / 0.6);
      if (Math.abs(m.y - (0.5 + layer * 0.6)) > 0.02) problems.push(`${m.id} y ${m.y} not on a layer`);
      maxLayer = Math.max(maxLayer, layer);
    }
    let ov = 0;
    for (let i = 0; i < ui.rects.length; i++) for (let j = i + 1; j < ui.rects.length; j++) { const a = ui.rects[i], b = ui.rects[j]; if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) ov++; }
    overlapsMax = Math.max(overlapsMax, ov);
  }
  await page.screenshot({ path: 'C:/Users/Vaas/Documents/Prototype/PulseAhead/Real/evidence/shots/06-zone4-areas.png' });
  R.checks.zone4Layout = { steps: 40, dotRowsChecked: rows, problems: problems.slice(0, 20), populatedAreas: [...populated], maxPatientsInOneArea: maxInArea, maxLayer, maxLabelOverlapsAtAStep: overlapsMax };
  return R;
}
