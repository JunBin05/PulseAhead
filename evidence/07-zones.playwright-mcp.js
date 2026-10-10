// Playwright MCP snippet used for the ticket 07 evidence. Run with browser_run_code_unsafe (Playwright MCP);
// not a standalone test runner. Expects the production build on :8000.
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { base: BASE, at: new Date().toISOString(), checks: {} };
  const consoleMsgs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleMsgs.push(m.text().slice(0, 140)); });
  let replayId = null;
  page.on('response', async (r) => { if (r.url().endsWith('/api/v1/replays') && r.request().method() === 'POST') { try { replayId = (await r.json()).replay_id; } catch {} } });
  const waitV = (v) => page.waitForFunction((v) => Number(document.querySelector('[data-testid=scene]')?.dataset.replayVersion) === v, v, { timeout: 8000 });
  const api = (path) => page.evaluate((p) => fetch(p).then((r) => r.json()), path);
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/');

  // ---- A. the zone response against /state at the same version, five scenarios ----------------------------
  R.checks.api = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then((r) => r.json());
    const problems = []; const bad = (m) => { if (problems.length < 30) problems.push(m); };
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const canon = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
    const runs = [['fixture-staffing', 20261010, 140, 5], ['fixture-diagnostics', 20261010, 200, 5], ['fixture-boarding', 20261010, 200, 5], ['fixture-intake', 20261010, 120, 5], ['normal', 7, 720, 30]];
    let checked = 0; const kinds = new Set(); const states = new Set(); let doctorAssignedSeen = 0; let nurseSeen = 0; let sharedBothZones = 0;
    for (const [scenario, seed, total, step] of runs) {
      const s = await post('/api/v1/replays', { seed, scenario });
      for (let t = step; t <= total; t += step) {
        const st = await post(`/api/v1/replays/${s.replay_id}/advance`, { minutes: step });
        const zs = [];
        for (const z of [1, 2, 3, 4]) zs.push(await fetch(`/api/v1/replays/${s.replay_id}/zones/${z}`).then((r) => r.json()));
        const tag = `${scenario} T+${st.sim_time_min}`;
        const byId = Object.fromEntries(st.patients.map((p) => [p.id, p]));
        let held = 0; const seen = new Set();
        for (const d of zs) {
          const z = d.zone.id; const sz = st.zones.find((x) => x.id === z);
          checked++;
          if (d.version !== st.version || d.sim_time_min !== st.sim_time_min || d.replay_id !== st.replay_id || d.run_number !== st.run_number) bad(`${tag} z${z} source version ${d.version}/${st.version}`);
          if (!eq([...d.roster.map((p) => p.id)].sort(), [...sz.patient_ids].sort()) || d.zone.patient_count !== sz.patient_count || d.roster.length !== sz.patient_count) bad(`${tag} z${z} roster ids`);
          for (const p of d.roster) { if (!eq(p, byId[p.id])) bad(`${tag} z${z} ${p.id} differs from /state`); if (seen.has(p.id)) bad(`${tag} ${p.id} in two zones`); seen.add(p.id); if (p.zone !== z) bad(`${tag} ${p.id} zone ${p.zone} in z${z}`); }
          for (const [k, v] of Object.entries(d.zone.counts)) if (sz[k] !== v) bad(`${tag} z${z} count ${k} ${v} vs ${sz[k]}`);
          for (const q of d.queues) { if (typeof q.count !== 'number' || q.count < 0) bad(`${tag} z${z} queue ${q.id}`); }
          // queues restate the zone's own counts
          const qc = Object.fromEntries(d.queues.map((q) => [q.id, q.count]));
          if (z === 1 && (qc.triage_queue !== sz.queue || qc.triage_active !== sz.active)) bad(`${tag} z1 queues`);
          if (z === 2 && (qc.awaiting_space !== sz.awaiting_space || qc.awaiting_clinician !== sz.awaiting_clinician || qc.with_clinician !== sz.active || qc.awaiting_result_review !== sz.awaiting_result_review || qc.awaiting_care_completion !== sz.awaiting_care_completion)) bad(`${tag} z2 queues`);
          if (z === 3 && (qc.lab_queue !== sz.lab_queue || qc.lab_active !== sz.lab_active || qc.imaging_queue !== sz.imaging_queue || qc.imaging_active !== sz.imaging_active)) bad(`${tag} z3 queues`);
          if (z === 4 && (qc.discharge_queue !== sz.awaiting_discharge || qc.discharge_active !== sz.discharge_active || qc.boarding !== sz.awaiting_ward_bed || qc.allocation_queue !== sz.awaiting_ward_allocation || qc.allocation_active !== sz.allocation_active || qc.transport_queue !== sz.awaiting_transport || qc.transport_active !== sz.in_transport)) bad(`${tag} z4 queues`);
          // assigned staff come only from patients in the zone
          const holders = new Map(d.roster.filter((p) => p.clinician_id).map((p) => [p.clinician_id, p.id]));
          if (z === 2) {
            if (d.staff.doctors.length !== 4) bad(`${tag} z2 doctors ${d.staff.doctors.length}`);
            for (const doc of d.staff.doctors) { if (doc.assigned !== holders.has(doc.id) || doc.patient_id !== (holders.get(doc.id) ?? null)) bad(`${tag} z2 doctor ${doc.id}`); if (!doc.on_duty) bad(`${tag} doctor ${doc.id} listed off duty`); if (doc.assigned) doctorAssignedSeen++; }
          } else if (d.staff.doctors.length) bad(`${tag} z${z} lists doctors`);
          const want = {};
          for (const p of d.roster) if (p.nurse_id) (want[p.nurse_id] ??= []).push(p.id);
          const got = Object.fromEntries(d.staff.nurses.map((n) => [n.id, [...n.patient_ids].sort()]));
          const wantSorted = Object.fromEntries(Object.entries(want).map(([k, v]) => [k, [...v].sort()]));
          if (z === 1 ? d.staff.nurses.length : canon(got) !== canon(wantSorted)) bad(`${tag} z${z} nurses ${JSON.stringify(got)} vs ${JSON.stringify(wantSorted)}`);
          for (const n of d.staff.nurses) { if (!n.on_duty) bad(`${tag} nurse ${n.id} off duty but listed`); nurseSeen++; }
          // capacity: zone 1 has no beds; zones 2/3 are one pool, never added; zone 4 retains spaces
          kinds.add(`${z}:${d.capacity.kind}`);
          const sp = st.resources.ed_spaces;
          if (z === 1 && (d.capacity.kind !== 'none' || !/No treatment beds here/.test(d.capacity.text))) bad(`${tag} z1 capacity`);
          if (z === 2 || z === 3) {
            const c = d.capacity;
            if (c.kind !== 'shared_ed_spaces' || c.shared_with_zone !== (z === 2 ? 3 : 2) || c.total !== sp.total || c.occupied !== sp.occupied || c.available_staffed !== sp.available_staffed || c.staffed_total !== sp.staffed_total) bad(`${tag} z${z} shared pool numbers`);
            if (c.held_by_patients_here !== d.roster.filter((p) => p.space_id).length) bad(`${tag} z${z} held_by_patients_here`);
          }
          if (z === 4) { const c = d.capacity; if (c.kind !== 'spaces_retained' || c.occupied !== sp.occupied || !eq(c.ward_beds, { free: st.resources.disposition.beds.ward.free, reserved: st.resources.disposition.beds.ward.reserved, occupied: st.resources.disposition.beds.ward.occupied, total: st.resources.disposition.beds.ward.total })) bad(`${tag} z4 capacity`); }
          held += d.roster.filter((p) => p.space_id).length;
          // freshness and the summary come from the received state
          if (!eq(d.freshness, st.freshness)) bad(`${tag} z${z} freshness`);
          const pz = st.pressure.zones.find((x) => x.zone === z);
          states.add(pz.state);
          if (d.summary.state !== pz.state || d.pressure.state !== pz.state) bad(`${tag} z${z} summary state`);
          const alerts = st.pressure.alerts.filter((a) => a.zone === z);
          if (!eq(d.pressure.alerts, alerts)) bad(`${tag} z${z} alerts`);
          if (pz.state === 'overloaded' && !(d.summary.headline.startsWith('Overloaded: ') && alerts.some((a) => d.summary.cause.includes(a.evidence)))) bad(`${tag} z${z} overloaded summary`);
          if (pz.state === 'normal' && (d.summary.headline !== 'No local alert' || d.summary.blocked_reason !== null)) bad(`${tag} z${z} normal summary`);
          if (pz.state === 'building' && !d.summary.headline.startsWith('Pressure building: ')) bad(`${tag} z${z} building summary`);
          if (pz.state !== 'overloaded' && pz.state !== 'building' && alerts.length) bad(`${tag} z${z} alerts without state`);
          if (JSON.stringify(d).match(/free_at_min|tests_required|arrival_time|hidden/)) bad(`${tag} z${z} hidden field in response`);
        }
        if (seen.size !== st.patients.length) bad(`${tag} zones hold ${seen.size} of ${st.patients.length} patients`);
        // every occupied ED space is held by exactly one patient in zones 2-4: no capacity counted twice
        if (held !== st.resources.ed_spaces.occupied) bad(`${tag} spaces held ${held} vs occupied ${st.resources.ed_spaces.occupied}`);
        if (zs[1].capacity.occupied === zs[2].capacity.occupied) sharedBothZones++;
      }
    }
    // unknown zones and replays
    const codes = {};
    const s2 = await post('/api/v1/replays', { seed: 1 });
    for (const z of ['0', '5', 'abc', '2']) codes[z] = (await fetch(`/api/v1/replays/${s2.replay_id}/zones/${z}`)).status;
    codes.unknownReplay = (await fetch('/api/v1/replays/nope/zones/1')).status;
    return { problems, zoneResponsesChecked: checked, capacityKinds: [...kinds].sort(), localStatesSeen: [...states].sort(), doctorAssignedSeen, nurseRowsSeen: nurseSeen, sharedPoolIdenticalInZones2And3: sharedBothZones, codes };
  });

  // ---- B. the drawer and the camera through the UI (fixture-staffing: zone 1 overloaded from T+15, zones 1+2 from T+30) ----
  const ui = {}; const problems = []; const bad = (m) => { if (problems.length < 40) problems.push(m); };
  const readCam = () => page.evaluate(() => { const c = document.querySelector('.scene-canvas'); return { camera: c.dataset.camera, zoom: Number(c.dataset.cameraZoom), callout: document.querySelector('[data-testid=camera-callout]')?.innerText.replace(/\s+/g, ' ') ?? null, sceneCamera: document.querySelector('[data-testid=scene]').dataset.camera }; });
  const readDrawer = () => page.evaluate(() => {
    const d = document.querySelector('[data-testid=zone-drawer]');
    const t = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;
    return d ? { zone: Number(d.dataset.zone), version: Number(d.dataset.version), state: d.dataset.state, heading: document.querySelector('#drawer-h')?.textContent?.trim(), count: Number(t('drawer-count')), source: t('drawer-source'), headline: t('drawer-headline'), cause: t('drawer-cause'), blocked: t('drawer-blocked'), capacity: t('drawer-capacity'), capacityKind: document.querySelector('[data-testid=drawer-capacity]')?.dataset.kind,
      rosterIds: [...document.querySelectorAll('[data-testid=roster] li strong')].map((e) => e.textContent), doctors: [...document.querySelectorAll('[data-testid=assigned-doctors] li')].map((e) => `${e.dataset.testid.slice(16)}:${e.dataset.assigned}`), nurses: [...document.querySelectorAll('[data-testid=assigned-nurses] li')].map((e) => e.dataset.testid.slice(15)), loading: false }
      : { loading: !!document.querySelector('[data-testid=zone-drawer-loading]'), heading: document.querySelector('#drawer-h')?.textContent?.trim() };
  });
  const step = async (k) => { const v = Number(await page.getByTestId('scene').getAttribute('data-replay-version')); await page.getByTestId('step').click(); await waitV(v + 1); return v + 1; };
  const state = () => api(`/api/v1/replays/${replayId}/state`);
  const zoneApi = (z) => api(`/api/v1/replays/${replayId}/zones/${z}`);
  const sameAsApi = async (z, tag) => {
    const d = await readDrawer(); const a = await zoneApi(z); const st = await state();
    if (!d.zone) { bad(`${tag} no drawer (${JSON.stringify(d)})`); return d; }
    if (d.zone !== z || d.version !== a.version || a.version !== st.version) bad(`${tag} zone/version ui ${d.zone}/${d.version} api ${a.version} state ${st.version}`);
    if (d.heading !== `Zone ${z} · ${a.zone.name}`) bad(`${tag} heading ${d.heading}`);
    if (JSON.stringify(d.rosterIds) !== JSON.stringify(a.roster.map((p) => p.id))) bad(`${tag} roster ${d.rosterIds} vs ${a.roster.map((p) => p.id)}`);
    if (d.count !== a.zone.patient_count) bad(`${tag} count`);
    if (z === 2 && JSON.stringify(d.doctors) !== JSON.stringify(a.staff.doctors.map((x) => `${x.id}:${x.assigned}`))) bad(`${tag} doctors ${d.doctors}`);
    if (JSON.stringify(d.nurses) !== JSON.stringify(a.staff.nurses.map((n) => n.id))) bad(`${tag} nurses ${d.nurses}`);
    if (d.headline !== a.summary.headline || d.cause !== a.summary.cause) bad(`${tag} summary text`);
    if ((d.blocked ?? null) !== (a.summary.blocked_reason ? `Blocked: ${a.summary.blocked_reason}` : null)) bad(`${tag} blocked reason ${d.blocked}`);
    return { ...d, apiVersion: a.version };
  };

  await page.goto(BASE + '/?fixture=fixture-staffing');
  await page.getByTestId('start').click(); await waitV(1);
  await step(); await step(); // T+10: every zone normal
  const t10 = await state();
  ui.t10States = t10.pressure.zones.map((z) => z.state).join(',');
  // B1. normal zone: opens the drawer, no zoom
  await page.getByTestId('zone-1').click(); await sleep(700);
  const z1 = await sameAsApi(1, 'B1 zone1');
  ui.zone1Normal = { capacity: z1.capacity, kind: z1.capacityKind, camera: await readCam() };
  if (!/No treatment beds here/.test(z1.capacity || '') || z1.capacityKind !== 'none') bad('B1 zone 1 must state it has no treatment beds');
  await page.getByTestId('zone-2').click(); await sleep(700);
  const z2n = await sameAsApi(2, 'B1 zone2');
  ui.zone2Normal = { state: z2n.state, headline: z2n.headline, capacity: z2n.capacity, kind: z2n.capacityKind, camera: await readCam() };
  if (!/one shared pool for zones 2 and 3/.test(z2n.capacity || '')) bad('B1 zone 2 must disclose the shared pool');
  await page.getByTestId('zone-3').click(); await sleep(700);
  const z3n = await sameAsApi(3, 'B1 zone3');
  if (!/one shared pool for zones 2 and 3/.test(z3n.capacity || '') || !/not added together/.test(await page.getByTestId('drawer-shared-note').textContent())) bad('B1 zone 3 must disclose the shared pool');
  for (const c of [ui.zone1Normal.camera, ui.zone2Normal.camera, await readCam()]) if (c.camera !== 'overview' || c.zoom !== 1 || c.callout !== null) bad(`B1 normal selection moved the camera ${JSON.stringify(c)}`);

  // B2. zone 2 stays selected while zones 1 and 2 turn into alerts; the camera does not follow the warnings
  await page.getByTestId('zone-2').click(); await sleep(300);
  const rows = [];
  for (let k = 0; k < 6; k++) {
    const v = await step(); await sleep(150);
    const st = await state(); const d = await sameAsApi(2, `B2 T+${st.sim_time_min}`); const cam = await readCam();
    rows.push(`T+${st.sim_time_min}:${st.pressure.zones.map((z) => z.state[0]).join('')}|drawer z${d.zone} v${d.version}|${cam.camera}@${cam.zoom}`);
    if (cam.camera !== 'overview' || cam.zoom !== 1) bad(`B2 camera moved by itself at T+${st.sim_time_min}`);
    if (d.version !== st.version) bad(`B2 drawer version ${d.version} vs ${st.version}`);
  }
  ui.selectionRetainedAcrossUpdates = rows;

  // B3. alert selection: smooth focus, drawer, callout; simulated time untouched
  const before = await state();
  await page.getByTestId('zone-1').click();
  const early = await readCam();
  await sleep(900);
  const focused = await readCam(); const d1 = await sameAsApi(1, 'B3 zone1 alert'); const after = await state();
  ui.alertFocus = { zoomAt0ms: early.zoom, settled: focused, drawer: { zone: d1.zone, version: d1.version, state: d1.state, headline: d1.headline, cause: d1.cause, blocked: d1.blocked } };
  if (focused.camera !== 'zone-1' || focused.zoom !== 1.9 || !/Focused on zone 1/.test(focused.callout || '')) bad(`B3 focus ${JSON.stringify(focused)}`);
  if (d1.state !== 'overloaded' || !/^Overloaded: /.test(d1.headline || '')) bad('B3 drawer state');
  if (before.version !== after.version || before.sim_time_min !== after.sim_time_min || before.run_number !== after.run_number) bad('B3 the camera changed the replay');
  await page.screenshot({ path: 'C:/Users/Vaas/Documents/Prototype/PulseAhead/Real/evidence/shots/07-alert-focus-zone1.png' });

  // B4. switching alerts: zone, title and source version move together (sampled every ~25 ms)
  await page.getByTestId('zone-2').click();
  const samples = [];
  for (let k = 0; k < 24; k++) { samples.push(await readDrawer()); await sleep(25); }
  const mixed = samples.filter((d) => d.zone && d.heading && !d.heading.startsWith(`Zone ${d.zone} `));
  const loadingSeen = samples.filter((d) => d.loading).length;
  const versions = new Set(samples.filter((d) => d.zone).map((d) => `${d.zone}@${d.version}`));
  await sleep(500);
  const d2 = await sameAsApi(2, 'B4 zone2 alert'); const cam2 = await readCam();
  ui.switchAlert = { samples: samples.length, mixedTitleAndZone: mixed.length, loadingSamples: loadingSeen, zoneVersionPairsSeen: [...versions], settled: cam2, drawerState: d2.state };
  if (mixed.length) bad('B4 title and zone disagreed during the switch');
  if (cam2.camera !== 'zone-2' || cam2.zoom !== 1.9 || d2.zone !== 2 || d2.state !== 'overloaded') bad(`B4 settled ${JSON.stringify(cam2)}`);
  await page.screenshot({ path: 'C:/Users/Vaas/Documents/Prototype/PulseAhead/Real/evidence/shots/07-alert-focus-zone2.png' });

  // B5. a state update while focused keeps the focus and refreshes the drawer to the new version
  const vBefore = await step(); await sleep(150);
  const stF = await state(); const dF = await sameAsApi(2, 'B5 focused update'); const camF = await readCam();
  ui.updateWhileFocused = { version: stF.version, drawerVersion: dF.version, camera: camF.camera, zoom: camF.zoom };
  if (camF.camera !== 'zone-2' || dF.version !== stF.version) bad('B5 focus or drawer version after an update');

  // B6. back to overview: camera returns, selection and replay stay
  const b6 = await state();
  await page.getByTestId('back-to-overview').click(); await sleep(900);
  const camB = await readCam(); const dB = await sameAsApi(2, 'B6 after back'); const a6 = await state();
  ui.backToOverview = { camera: camB, drawerZone: dB.zone, drawerVersion: dB.version, replay: { versionBefore: b6.version, versionAfter: a6.version, timeBefore: b6.sim_time_min, timeAfter: a6.sim_time_min, runBefore: b6.run_number, runAfter: a6.run_number } };
  if (camB.camera !== 'overview' || camB.zoom !== 1 || camB.callout !== null) bad(`B6 camera ${JSON.stringify(camB)}`);
  if (b6.version !== a6.version || b6.sim_time_min !== a6.sim_time_min || b6.run_number !== a6.run_number || a6.patients.length !== b6.patients.length) bad('B6 back to overview changed the replay');

  // B7. keyboard only: zone button, then the Back button
  await page.getByTestId('zone-1').focus(); await page.keyboard.press('Enter'); await sleep(900);
  const k1 = await readCam();
  await page.getByTestId('back-to-overview').focus(); await page.keyboard.press('Enter'); await sleep(900);
  const k2 = await readCam();
  await page.getByTestId('zone-1').focus(); const outline = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return c.outlineStyle + ' ' + c.outlineWidth; });
  ui.keyboard = { afterEnterOnZone: k1.camera, afterEnterOnBack: k2.camera, zoneButtonFocusOutline: outline };
  if (k1.camera !== 'zone-1' || k2.camera !== 'overview') bad(`B7 keyboard ${k1.camera} ${k2.camera}`);

  // B8. a slow zone response never shows another zone's data, and a stale one is discarded
  await page.route('**/zones/3', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); }, { times: 1 });
  await page.getByTestId('zone-3').click(); await sleep(300);
  const slow = await readDrawer();
  await sleep(1500);
  const slowDone = await readDrawer();
  ui.slowResponse = { whileWaiting: slow, afterArrival: { zone: slowDone.zone, version: slowDone.version } };
  if (!slow.loading || !/Zone 3/.test(slow.heading || '') || slow.zone) bad('B8 loading state while the response is slow');
  if (slowDone.zone !== 3) bad('B8 response did not arrive');
  const cur = await state();
  await page.route('**/zones/3', async (route) => {
    const res = await route.fetch(); const body = await res.json(); body.version = body.version - 1;
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });
  await step(); await sleep(300);
  const stale = await readDrawer();
  await page.unroute('**/zones/3');
  ui.staleResponse = { stateVersion: cur.version + 1, drawerWhileStale: stale };
  if (stale.zone || !stale.loading) bad(`B8 a stale zone response was shown ${JSON.stringify(stale)}`);
  await step(); await sleep(300);
  const recovered = await sameAsApi(3, 'B8 recovered');
  ui.afterRecovery = { zone: recovered.zone, version: recovered.version };

  // B9. reset clears the selection and the focus
  await page.getByTestId('zone-1').click(); await sleep(700);
  const preReset = await readCam();
  await page.getByTestId('reset').click(); await sleep(900);
  const post = await readCam(); const dr = await readDrawer();
  ui.reset = { before: preReset.camera, after: post.camera, calloutGone: post.callout === null, drawer: dr, heading: await page.locator('#drawer-h').textContent() };
  if (post.camera !== 'overview' || post.callout !== null || dr.zone || dr.loading || !/Zone details/.test(ui.reset.heading)) bad('B9 reset left a selection or focus');

  // B10. reduced motion: the focus jumps, no easing
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE + '/?fixture=fixture-staffing');
  await page.getByTestId('start').click(); await waitV(1);
  for (let k = 0; k < 6; k++) await step();
  await page.getByTestId('zone-1').click(); await sleep(60);
  const rm = await readCam();
  ui.reducedMotion = { zoomAfter60ms: rm.zoom, camera: rm.camera };
  if (rm.zoom !== 1.9 || rm.camera !== 'zone-1') bad(`B10 reduced motion ${JSON.stringify(rm)}`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // B11. the callout stays on the map and covers no control (375 and 1440)
  R.checks.overlay = [];
  await page.goto(BASE + '/?fixture=fixture-staffing');
  await page.getByTestId('start').click(); await waitV(1);
  for (let k = 0; k < 6; k++) await step();
  for (const w of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: w < 800 ? 812 : 900 }); await sleep(400);
    await page.getByTestId('zone-1').click(); await sleep(900);
    const m = await page.evaluate(() => {
      const c = document.querySelector('[data-testid=camera-callout]').getBoundingClientRect();
      const cv = document.querySelector('.scene-canvas').getBoundingClientRect();
      const own = document.querySelector('[data-testid=back-to-overview]');
      const hits = [...document.querySelectorAll('button, a, input')].filter((e) => e !== own && e.offsetParent !== null).filter((e) => { const r = e.getBoundingClientRect(); return r.left < c.right && c.left < r.right && r.top < c.bottom && c.top < r.bottom; }).map((e) => e.dataset.testid || e.textContent.trim().slice(0, 20));
      const ownRect = own.getBoundingClientRect();
      return { insideMap: c.left >= cv.left - 1 && c.right <= cv.right + 1, coveredControls: hits, backButtonSize: [Math.round(ownRect.width), Math.round(ownRect.height)], scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    R.checks.overlay.push({ width: w, ...m });
    if (!m.insideMap || m.coveredControls.length || m.backButtonSize[1] < 44 || m.scrollX) bad(`B11 overlay at ${w} ${JSON.stringify(m)}`);
    await page.screenshot({ path: `C:/Users/Vaas/Documents/Prototype/PulseAhead/Real/evidence/shots/07-focus-${w}.png` });
    await page.getByTestId('back-to-overview').click(); await sleep(700);
    await page.getByTestId('zone-1').click(); await sleep(100); // deselect
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // B12. focused-zone geometry: the focused label and its bubble stay inside the map, and no two labels overlap
  R.checks.focusGeometry = [];
  const cases = [['fixture-staffing', 6, 1], ['fixture-staffing', 6, 2], ['fixture-diagnostics', 17, 3], ['fixture-boarding', 12, 4]];
  for (const [fixture, steps, zone] of cases) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE + '/?fixture=' + fixture);
    await page.getByTestId('start').click(); await waitV(1);
    for (let k = 0; k < steps; k++) await step();
    const stNow = await state();
    for (const [w, h] of [[375, 812], [768, 900], [1024, 900], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h }); await sleep(500);
      await page.getByTestId('zone-' + zone).click(); await sleep(800);
      const m = await page.evaluate((zone) => {
        const cv = document.querySelector('.scene-canvas').getBoundingClientRect();
        const vis = (r) => ({ left: Math.max(r.left, cv.left), right: Math.min(r.right, cv.right), top: Math.max(r.top, cv.top), bottom: Math.min(r.bottom, cv.bottom) });
        const inside = (r) => r.left >= cv.left - 1 && r.right <= cv.right + 1 && r.top >= cv.top - 1 && r.bottom <= cv.bottom + 1;
        const label = document.querySelectorAll('.zone-label')[zone - 1];
        const bubble = label ? label.querySelector('.alert-bubble') : null;
        const lr = label ? label.getBoundingClientRect() : null;
        const br = bubble ? bubble.getBoundingClientRect() : null;
        const items = [...document.querySelectorAll('.area-label, .zone-label, .alert-bubble')].map((e) => ({ e, r: vis(e.getBoundingClientRect()) })).filter(({ r }) => r.right - r.left > 0.5 && r.bottom - r.top > 0.5);
        const overlaps = [];
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
          const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (ox > 0.5 && oy > 0.5) overlaps.push((a.e.textContent.trim().slice(0, 18) + ' x ' + b.e.textContent.trim().slice(0, 18)));
        }
        return { camera: document.querySelector('.scene-canvas').dataset.camera, labelInside: lr ? inside(lr) : null, bubbleDrawn: !!bubble, bubbleInside: br ? inside(br) : null, bubbleSide: label ? label.dataset.bubbleSide : null, labels: items.length, overlaps };
      }, zone);
      R.checks.focusGeometry.push({ fixture, simTime: stNow.sim_time_min, zone, width: w, ...m });
      if (m.camera !== 'zone-' + zone) bad('B12 ' + fixture + ' z' + zone + ' @' + w + ' camera ' + m.camera);
      if (m.labelInside === false) bad('B12 ' + fixture + ' z' + zone + ' @' + w + ' focused label outside the map');
      if (m.bubbleDrawn && m.bubbleInside === false) bad('B12 ' + fixture + ' z' + zone + ' @' + w + ' bubble outside the map');
      if (m.overlaps.length) bad('B12 ' + fixture + ' z' + zone + ' @' + w + ' overlaps ' + JSON.stringify(m.overlaps.slice(0, 3)));
      await page.getByTestId('back-to-overview').click(); await sleep(700);
      await page.getByTestId('zone-' + zone).click(); await sleep(100); // deselect
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  R.checks.ui = ui;
  R.checks.uiProblems = problems;
  R.console = consoleMsgs;
  return R;
}
