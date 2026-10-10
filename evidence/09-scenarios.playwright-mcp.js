// Playwright MCP snippet used for the ticket 09 evidence (API half). Run with browser_run_code_unsafe (Playwright
// MCP); not a standalone test runner. Expects the production build on :8000. Run once per PART:
//   'A' catalog, seven families recomputed from /events, hidden-field scan, run record
//   'B' hidden-future pair, save/load/resume through the API, completed run
async (page) => {
  const PART = 'A';
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), part: PART, checks: {}, problems: [], data: {} };
  const chk = (name, ok, detail) => { R.checks[name] = ok ? 'pass' : 'FAIL ' + JSON.stringify(detail).slice(0, 400); if (!ok) R.problems.push(name); };
  const get = (p) => page.evaluate((p) => fetch(p).then(r => r.json()), p);
  const post = (p, b) => page.evaluate(async ([p, b]) => { const r = await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; }, [p, b]);
  const J = (x) => JSON.stringify(x);
  const eq = (a, b) => J(a) === J(b);
  const mk = async (scn, seed) => {
    const c = await post('/api/v1/replays', { scenario: scn, seed });
    const o = { id: c.j.replay_id, v: c.j.version, t: 0 };
    o.adv = async (m) => {
      let left = m;
      while (left > 1e-9) {
        const step = Math.min(60, left);
        const a = await post(`/api/v1/replays/${o.id}/advance`, { minutes: step, expected_version: o.v });
        if (a.s !== 200) throw new Error('advance ' + a.s);
        o.v = a.j.version; o.t = a.j.sim_time_min; left -= step;
      }
    };
    o.state = () => get(`/api/v1/replays/${o.id}/state`);
    o.events = () => get(`/api/v1/replays/${o.id}/events`);
    o.ingest = () => get(`/api/v1/replays/${o.id}/ingest`);
    o.exp = () => get(`/api/v1/replays/${o.id}/export`);
    o.zone = (z) => get(`/api/v1/replays/${o.id}/zones/${z}`);
    return o;
  };
  // Workload parameters, fault schedules and private future values: never in an observation response.
  const FORBID = ['"surges"', '"test_boosts"', '"turnaround_scales"', '"disposition_boost"', '"free_at_min"', '"rate_ceiling"',
    '"feed_faults"', '"injections"', '"missing_inputs"', '"arrive_min"', '"cancel_min"', '"care_task_min"', '"rng"', '"extra_prob"'];
  const hits = (o, list = FORBID) => { const s = J(o); return list.filter(f => s.includes(f)); };
  const queueAt = (ev, phases, t) => {
    const last = {};
    for (const e of ev) if (e.type === 'phase_change' && e.received_time_min <= t + 1e-9) last[e.patient_id] = e.payload.to;
    return Object.values(last).filter(p => phases.includes(p)).length;
  };
  const rate = (ev, a, b) => ev.filter(e => e.type === 'arrival' && e.event_time_min >= a && e.event_time_min < b).length / ((b - a) / 60);
  const iv = (arr) => arr.map(e => [e.onset_min, e.cleared_min ?? 1e9]);
  const overlap = (A, B) => iv(A).some(([a1, a2]) => iv(B).some(([b1, b2]) => a1 < b2 && b1 < a2));
  const strip = (s) => { const c = JSON.parse(J(s)); for (const k of ['replay_id', 'scenario', 'scenario_name']) delete c[k]; return c; };
  const WANT = ['normal', 'busy-recovers', 'arrival-surge', 'diagnostic-delay', 'boarding-blockage', 'mixed-cascade', 'no-effective-action'];
  const TEST_PHASES = ['awaiting_lab', 'in_lab', 'awaiting_imaging', 'in_imaging'];

  await page.goto(BASE + '/');
  const cat = await get('/api/v1/scenarios');

  if (PART === 'A') {
    // ---- A1 catalog
    const prof = await get('/api/v1/profile');
    chk('A1 seven families', eq(cat.scenarios.map(s => s.id), WANT), cat.scenarios.map(s => s.id));
    chk('A1 warm-up 120 and scored 480', cat.warmup_min === 120 && cat.scored_min === 480 && cat.scenarios.every(s => s.warmup_min === 120 && s.scored_min === 480), [cat.warmup_min, cat.scored_min]);
    const all = []; let partOk = true;
    for (const s of cat.scenarios) { const p = s.seed_partitions; if (!(eq(p.development, [7]) && p.tuning.length === 2 && p.test.length === 4)) partOk = false; all.push(...p.tuning, ...p.test); }
    chk('A1 partitions: 1 development, 2 tuning, 4 test per family', partOk, cat.scenarios.map(s => s.seed_partitions));
    chk('A1 tuning and test seeds disjoint across families', new Set(all).size === all.length && !all.includes(7), all.length);
    chk('A1 versions present', ['api', 'engine', 'profile', 'scenario_catalog'].every(k => cat.versions[k]), cat.versions);
    chk('A1 catalog hides time windows and schedules', hits(cat).length === 0 && !/"start"|"end"|"scale"/.test(J(cat)), hits(cat));
    chk('A1 /profile: 7 families with public fields only, no bed release schedule', prof.scenarios.length === 7 && prof.scenarios.every(s => eq(Object.keys(s).sort(), ['description', 'family', 'id', 'name'])) && hits(prof).length === 0, hits(prof));
    R.data.versions = cat.versions;
    R.data.demoRoles = cat.scenarios.filter(s => s.demo).map(s => [s.id, s.demo]);

    // ---- A2 each family on test seed index 2, 600 min (120 warm-up + 480 scored); scans at 5 times
    R.data.fam = {};
    let announcedTotal = 0, critTotal = 0, loopTotal = 0;
    for (let i = 0; i < WANT.length; i++) {
      const id = WANT[i], seed = cat.scenarios[i].seed_partitions.test[2];
      const r = await mk(id, seed);
      const D = { seed }; R.data.fam[id] = D;
      const pending = new Set(); let leaked = [], dispBad = 0, timeBad = 0, hitList = [];
      for (const target of [60, 150, 300, 450, 600]) {
        await r.adv(target - r.t);
        const st = await r.state();
        const zs = await Promise.all([1, 2, 3, 4].map(z => r.zone(z)));
        hitList.push(...hits(st), ...zs.flatMap(z => hits(z)));
        for (const p of st.patients) {
          if (p.disposition !== null && !p.decision_received) dispBad++;
          if (target === 150 && !p.decision_received) pending.add(p.id);
        }
      }
      const [ev, ing, st, ex] = [(await r.events()).events, await r.ingest(), await r.state(), await r.exp()];
      hitList.push(...hits(ev), ...hits(ing));
      timeBad = ev.filter(e => e.received_time_min > st.sim_time_min + 1e-9 || e.event_time_min > e.received_time_min + 1e-9).length;
      const exBad = hits(ex, FORBID.filter(f => !['"surges"', '"test_boosts"', '"turnaround_scales"', '"disposition_boost"', '"free_at_min"', '"extra_prob"'].includes(f)));
      chk(`A2 ${id}: no hidden field in /state, /zones, /events, /ingest (5 times)`, hitList.length === 0, [...new Set(hitList)]);
      chk(`A2 ${id}: disposition null until decision_received, events not from the future`, dispBad === 0 && timeBad === 0, { dispBad, timeBad });
      chk(`A2 ${id}: export carries no private future values`, exBad.length === 0, exBad);
      const later = ex.patients.filter(p => pending.has(p.patient_id) && p.disposition !== null).length;
      D.hiddenThenDecided = later;

      // received announcements
      const ann = ev.filter(e => e.type === 'ambulance_announced'), arr = ev.filter(e => e.type === 'ambulance_arrived');
      const annIds = new Set(ann.map(e => e.ambulance_id));
      const annOk = ann.length > 0 && arr.every(a => ann.some(n => n.ambulance_id === a.ambulance_id && n.received_time_min <= a.received_time_min)) && st.ambulance_announcements.every(a => annIds.has(a.id));
      chk(`A2 ${id}: inbound announcements received before arrival`, annOk, { ann: ann.length, arr: arr.length });
      announcedTotal += ann.length;
      // critical bypass
      const crit = ev.filter(e => e.type === 'arrival' && e.payload.critical_bypass);
      const critOk = crit.every(e => e.payload.zone === 2);
      chk(`A2 ${id}: critical-bypass arrivals enter zone 2 directly`, critOk, crit.map(e => e.payload.zone));
      critTotal += crit.length;
      // diagnostic loop: 2 -> 3 -> 2, review after the last test completed
      let loops = 0, loopBad = 0;
      for (const p of ex.patients) {
        if (!p.tests_required?.length || p.review_start_min == null) continue;
        const done = ev.filter(e => e.type === 'test_completed' && e.patient_id === p.patient_id).map(e => e.received_time_min);
        const zonePath = ev.filter(e => e.type === 'phase_change' && e.patient_id === p.patient_id).map(e => TEST_PHASES.includes(e.payload.to) ? 3 : (e.payload.zone ?? null)).filter(z => z !== null);
        const i3 = zonePath.indexOf(3), after = zonePath.slice(i3 + 1).some(z => z === 2);
        if (done.length === p.tests_required.length && p.review_start_min >= Math.max(...done) - 1e-9 && i3 > 0 && after) loops++; else loopBad++;
      }
      chk(`A2 ${id}: diagnostic loops 2->3->2 with review after the last test`, loops > 0 && loopBad === 0, { loops, loopBad });
      loopTotal += loops;
      D.counts = { events: ev.length, arrivals: ev.filter(e => e.type === 'arrival').length, ann: ann.length, crit: crit.length, loops, episodes: ex.local_episodes, overall: ex.congestion_episodes };

      // family bottleneck recomputed from received events and the run record's workload variant
      const par = ex.run_record.scenario.parameters, le = ex.local_episodes, svc = st.pressure.services;
      const conf = (arr) => arr.filter(e => e.confirmed_min != null);
      if (id === 'normal') {
        chk('A2 normal: no scenario workload variant', eq(Object.keys(par), ['rate_multiplier']) && par.rate_multiplier === 1, par);
        D.rate = rate(ev, 0, 600);
      } else if (id === 'busy-recovers' || id === 'arrival-surge') {
        const w = par.surges[0], inside = rate(ev, w.start, w.end);
        const outside = (ev.filter(e => e.type === 'arrival' && (e.event_time_min < w.start || e.event_time_min >= w.end)).length) / ((600 - (w.end - w.start)) / 60);
        D.rate = { inside: +inside.toFixed(2), outside: +outside.toFixed(2), ratio: +(inside / outside).toFixed(2), window: [w.start, w.end] };
        chk(`A2 ${id}: arrival rate inside the surge window exceeds outside`, inside / outside >= (id === 'busy-recovers' ? 1.8 : 2.5), D.rate);
        const cleared = Object.entries(le).flatMap(([s, a]) => a.filter(e => e.cleared_min != null && e.onset_min >= w.start).map(e => [s, e.onset_min, e.cleared_min]));
        D.clearedAfterSurge = cleared;
        chk(`A2 ${id}: an episode starting in or after the surge window clears before T+600`, cleared.length > 0, le);
        if (id === 'arrival-surge') chk('A2 arrival-surge: it is a triage episode that clears', le.triage.some(e => e.cleared_min != null && e.onset_min >= w.start), le.triage);
      } else if (id === 'diagnostic-delay') {
        const c = ['lab', 'imaging'].flatMap(s => conf(le[s]).map(e => ({ s, ...e }))).sort((a, b) => a.onset_min - b.onset_min)[0];
        const q = c ? queueAt(ev, c.s === 'lab' ? ['awaiting_lab'] : ['awaiting_imaging'], c.onset_min) : null;
        D.firstOverload = c && { service: c.s, onset: c.onset_min, confirmed: c.confirmed_min, queueAtOnset: q, threshold: svc[c.s].threshold };
        chk('A2 diagnostic-delay: first zone-3 overload confirmed, queue at onset recomputed from events reaches the threshold', !!c && q >= svc[c.s].threshold && c.confirmed_min - c.onset_min === 10, D.firstOverload);
        const imgShare = ex.patients.filter(p => p.tests_required?.includes('imaging')).length / ex.patients.length;
        D.imagingShare = +imgShare.toFixed(2);
      } else if (id === 'boarding-blockage') {
        const c = conf(le.ward_beds)[0];
        const beds = par.ward_beds, waiters = {}; let bad = [];
        if (c) {
          const last = {};
          for (const e of ev) if (e.type === 'phase_change' && e.received_time_min <= c.onset_min + 1e-9) last[e.patient_id] = e.payload.to;
          const by = Object.fromEntries(ex.patients.map(p => [p.patient_id, p]));
          for (const [pid, ph] of Object.entries(last)) if (ph === 'awaiting_ward_bed') {
            const kind = by[pid].disposition === 'icu' ? 'icu' : 'ward';
            waiters[kind] = (waiters[kind] || 0) + 1;
            const sched = beds.filter(b => b.type === kind && b.free_at_min <= c.onset_min).length;
            const taken = ex.patients.filter(p => p.ward_bed_id && p.bed_reserved_min != null && p.bed_reserved_min <= c.onset_min + 1e-9 && beds.find(b => b.id === p.ward_bed_id)?.type === kind).length;
            if (sched - taken > 0) bad.push([pid, kind, sched, taken]);
          }
        }
        D.blockage = c && { onset: c.onset_min, confirmed: c.confirmed_min, waiters, bad };
        chk('A2 boarding-blockage: ward-bed episode confirmed; at onset every waiter has no suitable free bed (schedule and reservations recomputed)', !!c && Object.values(waiters).reduce((a, b) => a + b, 0) >= 1 && bad.length === 0 && c.confirmed_min - c.onset_min === 10, D.blockage);
      } else if (id === 'mixed-cascade') {
        const ov = overlap(le.imaging, le.ward_beds) || overlap(le.lab, le.ward_beds);
        const staff = ev.filter(e => e.type.startsWith('staff_')).map(e => [e.type, e.event_time_min, e.payload.staff_id]);
        D.mixed = { overlap: ov, staff };
        chk('A2 mixed-cascade: diagnostic and ward-bed episodes overlap, and the nurse roster change was received', ov && staff.some(s => s[0] === 'staff_off_duty' && s[2] === 'N3') && staff.some(s => s[0] === 'staff_on_duty' && s[2] === 'N3'), D.mixed);
      } else if (id === 'no-effective-action') {
        const w = par.surges[0], inside = rate(ev, w.start, w.end), outside = rate(ev, w.end, 600);
        D.rate = { inside: +inside.toFixed(2), outside: +outside.toFixed(2), ratio: +(inside / outside).toFixed(2) };
        chk('A2 no-effective-action: early surge then quiet (rate ratio), and the triage episode clears', inside / outside >= 4 && le.triage.some(e => e.cleared_min != null), { rate: D.rate, triage: le.triage });
      }
    }
    chk('A2 across families: announcements, critical-bypass arrivals and diagnostic loops all present', announcedTotal > 0 && critTotal > 0 && loopTotal > 0, { announcedTotal, critTotal, loopTotal });

    // ---- A3 run record of the last family run against /scenarios and /profile
    const rm = await mk('mixed-cascade', cat.scenarios[5].seed_partitions.test[0]);
    await rm.adv(150);
    const ex = await rm.exp(), rr = ex.run_record;
    chk('A3 run record: profile, resources, ward schedule, assumptions equal the export and /profile', eq(rr.profile, ex.profile) && eq(rr.profile.assumptions, prof.profile.assumptions) && rr.profile.ward_beds.length === 8 && rr.profile.ward_beds.every(b => typeof b.free_at_min === 'number') && rr.profile.doctors.length === 4 && rr.profile.nurses.length === 6, Object.keys(rr.profile));
    chk('A3 run record: scenario parameters, warm-up/scored, seed partition, versions', rr.scenario.id === 'mixed-cascade' && rr.scenario.name === cat.scenarios[5].name && rr.warmup_min === 120 && rr.scored_min === 480 && rr.seed_partition === 'test' && eq(rr.versions, cat.versions) && ['surges', 'test_boosts', 'turnaround_scales', 'disposition_boost', 'ward_beds', 'staffing'].every(k => k in rr.scenario.parameters), { part: rr.seed_partition, keys: Object.keys(rr.scenario.parameters), versions: rr.versions });
    const fx = await mk('fixture-intake', 7); await fx.adv(10);
    const fr = (await fx.exp()).run_record;
    chk('A3 fixture run record marks the scenario as a fixture with its own partition label', fr.scenario.fixture === true && fr.seed_partition === 'fixture', { f: fr.scenario.fixture, p: fr.seed_partition });
    R.data.runRecordKeys = Object.keys(rr);
  }

  if (PART === 'B') {
    // ---- B1 hidden-future pair: same seed, same history until T+75
    const a = await mk('fixture-hidden-future-a', 7), b = await mk('fixture-hidden-future-b', 7);
    const snap = async (r) => ({ st: strip(await r.state()), z: (await Promise.all([1, 2, 3, 4].map(z => r.zone(z)))).map(strip), ev: (await r.events()).events, ing: strip(await r.ingest()) });
    for (const t of [60, 70]) {
      await a.adv(t - a.t); await b.adv(t - b.t);
      const [x, y] = [await snap(a), await snap(b)];
      chk(`B1 T+${t}: state, zones 1-4, events and ingest identical between A and B`, eq(x, y), ['st', 'z', 'ev', 'ing'].filter(k => !eq(x[k], y[k])));
      R.data[`pairEvents${t}`] = x.ev.length;
    }
    await a.adv(120 - a.t); await b.adv(120 - b.t);
    const [x, y] = [await snap(a), await snap(b)];
    chk('B1 T+120: the two histories now differ (the hidden surge arrived)', !eq(x.ev, y.ev) && y.ev.length > x.ev.length, [x.ev.length, y.ev.length]);

    // ---- B2 save, load, resume (diagnostic-delay, test seed)
    const seed = cat.scenarios[3].seed_partitions.test[2];
    const s = await mk('diagnostic-delay', seed); await s.adv(90);
    const sv = await post(`/api/v1/replays/${s.id}/save`, { ui: { selected_zone: 3, camera: 'zone-3', view_mode: '3d' }, settings: { speed: 5, step_min: 5 } });
    const sid = sv.j.saved_id;
    chk('B2 save returns an in-progress label and identity', sv.s === 200 && sv.j.completed === false && sv.j.label === 'Saved in-progress synthetic run' && sv.j.sim_time_min === 90 && sv.j.seed === seed, sv.j);
    const rec = await get(`/api/v1/saved/${sid}`), evS = (await s.events()).events, stS = await s.state(), exS = await s.exp();
    chk('B2 record: events, announcements, settings, zone/camera, versions equal the live run', eq(rec.events, evS) && rec.event_count === evS.length && /^[0-9a-f]{64}$/.test(rec.event_digest) && eq(rec.announcements, stS.ambulance_announcements) && eq(rec.ui, { selected_zone: 3, camera: 'zone-3', view_mode: '3d' }) && eq(rec.settings.simulation, { speed: 5, step_min: 5 }) && eq(rec.run_record, exS.run_record) && rec.identity.state_version === stS.version && rec.identity.replay_id === s.id, { n: rec.event_count, ev: evS.length });
    chk('B2 record keeps the choices list empty (no actions exist yet) and in-progress results', eq(rec.choices, []) && rec.completed === false && rec.results.completed === false && rec.results.label.startsWith('In-progress'), rec.results.label);
    const lst = await get('/api/v1/saved');
    chk('B2 saved list contains the run with its label', lst.saved.some(x => x.saved_id === sid && x.label === sv.j.label), lst.saved.length);
    const ld = await post(`/api/v1/saved/${sid}/load`, {});
    const L = ld.j, Lr = { id: L.replay_id, v: L.version, t: L.sim_time_min };
    const evL = (await get(`/api/v1/replays/${L.replay_id}/events`)).events;
    chk('B2 load: new replay at the saved time with the same events, counts, patients and announcements', ld.s === 200 && L.replay_id !== s.id && L.sim_time_min === 90 && eq(evL, evS) && eq(L.counts, stS.counts) && eq(L.patients, stS.patients) && eq(L.ambulance_announcements, stS.ambulance_announcements) && L.saved_run.id === sid, { s: ld.s, t: L.sim_time_min, same: eq(evL, evS) });
    chk('B2 load: saved zone, camera, settings and versions come back; label says in-progress', L.saved_run.ui.selected_zone === 3 && L.saved_run.ui.camera === 'zone-3' && L.saved_run.settings.simulation.speed === 5 && eq(L.saved_run.versions, cat.versions) && L.saved_run.completed === false, L.saved_run);
    // resume: loaded run, original run and a fresh run advance 30 more minutes identically
    const f = await mk('diagnostic-delay', seed); await f.adv(120);
    const ar = await post(`/api/v1/replays/${L.replay_id}/advance`, { minutes: 30, expected_version: L.version });
    await s.adv(30);
    const [e1, e2, e3] = [(await get(`/api/v1/replays/${L.replay_id}/events`)).events, (await s.events()).events, (await f.events()).events];
    chk('B2 resume: loaded run +30 min equals the original +30 and a fresh replay at T+120', ar.s === 200 && ar.j.sim_time_min === 120 && eq(e1, e2) && eq(e1, e3) && e1.length > evS.length, [e1.length, e2.length, e3.length]);
    const rs = await post(`/api/v1/replays/${L.replay_id}/reset`, {});
    chk('B2 reset after load clears the saved-run label and rebuilds from T+0', rs.s === 200 && rs.j.saved_run === null && rs.j.sim_time_min === 0 && rs.j.patients.length === 0 && rs.j.event_count === 0, { s: rs.s, saved: rs.j.saved_run, t: rs.j.sim_time_min });

    // ---- B3 completed run
    const c = await mk('arrival-surge', cat.scenarios[2].seed_partitions.test[0]); await c.adv(600);
    const cs = await post(`/api/v1/replays/${c.id}/save`, { ui: { selected_zone: null, camera: 'overview', view_mode: '3d' }, settings: { speed: 10, step_min: 5 } });
    const crec = await get(`/api/v1/saved/${cs.j.saved_id}`), cex = await c.exp();
    chk('B3 completed run is labelled and carries the results', cs.j.completed === true && cs.j.label === 'Completed synthetic run' && crec.results.completed === true && eq(crec.results.time_summary, cex.time_summary) && eq(crec.results.unfinished, cex.unfinished) && eq(crec.results.congestion_episodes, cex.congestion_episodes) && eq(crec.results.local_episodes, cex.local_episodes) && eq(crec.results.scored_window_min, [120, 600]), { l: cs.j.label, keys: Object.keys(crec.results) });
    const cl = await post(`/api/v1/saved/${cs.j.saved_id}/load`, {});
    const cev = (await get(`/api/v1/replays/${cl.j.replay_id}/events`)).events;
    chk('B3 completed run loads: same events, T+600, label from the record', cl.s === 200 && cl.j.sim_time_min === 600 && eq(cev, (await c.events()).events) && cl.j.saved_run.label === 'Completed synthetic run' && cl.j.saved_run.completed === true && eq(cl.j.saved_run.results.time_summary, cex.time_summary), { s: cl.s, t: cl.j.sim_time_min });
    const un = await post('/api/v1/saved/000000000000/load', {});
    chk('B3 unknown saved run returns 404', un.s === 404, un.s);
    R.data.saved = { in_progress: sid, completed: cs.j.saved_id, seed };
  }
  return R;
}
