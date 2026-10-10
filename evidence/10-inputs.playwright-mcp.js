// Playwright MCP snippet used for the ticket 10 evidence (what the forecast resumes from). Run with
// browser_run_code_unsafe (Playwright MCP); not a standalone test runner. Expects the production build on :8000.
// Checks the forecast's reported inputs against the received state and events at the same version: work under
// way is resumed with its received elapsed time, ward and ICU beds are as received, and an ambulance is counted
// once (announced until it arrives, then as present patients).
async (page) => {
  const BASE = 'http://127.0.0.1:8000';
  const R = { at: new Date().toISOString(), checks: {}, problems: [], data: {} };
  const chk = (n, ok, d) => { R.checks[n] = ok ? 'pass' : 'FAIL ' + JSON.stringify(d).slice(0, 500); if (!ok) R.problems.push(n); };
  await page.goto(BASE + '/');
  const o = await page.evaluate(async () => {
    const H = { 'content-type': 'application/json' };
    const post = async (u, b) => (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).json();
    const get = async (u) => (await fetch(u)).json();
    const ACTIVE = ['in_triage', 'assessment_active', 'in_lab', 'in_imaging', 'result_review_active', 'disposition_processing', 'ward_allocation_active', 'in_transport'];
    const res = { work: [], beds: [], amb: [] };
    async function snap(fx, seed, times, sink) {
      const id = (await post('/api/v1/replays', { scenario: fx, seed })).replay_id;
      let cur = 0;
      for (const t of times) {
        while (cur < t) { const m = Math.min(60, t - cur); await post(`/api/v1/replays/${id}/advance`, { minutes: m }); cur += m; }
        const s = await get(`/api/v1/replays/${id}/state`);
        const f = await post(`/api/v1/replays/${id}/forecast`, { samples: 50, expected_version: s.version });
        const ev = (await get(`/api/v1/replays/${id}/events`)).events;
        sink.push({ fx, t, s, f, ev });
      }
    }
    const work = [], amb = [];
    for (const fx of ['fixture-diagnostics', 'fixture-boarding', 'fixture-staffing']) await snap(fx, 7, [20, 45, 75, 110], work);
    await snap('normal', 7, [150, 300, 480], work);
    for (const fx of ['fixture-eta-private-a', 'fixture-eta-private-b']) await snap(fx, 7, [30, 38, 50], amb);
    const slim = (r) => ({ fx: r.fx, t: r.t, version: r.s.version, fver: r.f.source.version, status: r.f.status,
      active: r.s.patients.filter(p => ACTIVE.includes(p.phase)).map(p => ({ id: p.id, phase: p.phase, elapsed: p.minutes_in_phase })),
      inProg: r.f.inputs && r.f.inputs.in_progress, beds: r.s.resources.disposition.beds.list.map(b => ({ id: b.id, state: b.state })),
      wardBeds: r.f.inputs && r.f.inputs.ward_beds,
      edBeds: r.ev.filter(e => e.type === 'phase_change' && e.payload.to === 'departed' && e.payload.exit === 'ward' && e.resources && e.resources.ward_bed).length,
      present: r.f.inputs && r.f.inputs.present_patients, statePatients: r.s.patients.length,
      announced: r.f.inputs && [r.f.inputs.announced_ambulances, r.f.inputs.announced_patients],
      inbound: r.s.inbound_ambulances.map(a => ({ id: a.id, n: a.patient_count })) });
    res.work = work.map(slim); res.amb = amb.map(slim);
    return res;
  });
  const W = o.work.filter(r => r.status === 'ok');
  const key = (a) => a.map(x => `${x.id}|${x.phase}|${x.elapsed ?? x.elapsed_min}`).sort().join(',');
  chk('N1 ' + W.length + ' forecasts: every patient in an active task is resumed with its received phase and elapsed minutes (same ids, phases and elapsed as /state)', W.every(r => key(r.active) === key(r.inProg)), W.filter(r => key(r.active) !== key(r.inProg)).slice(0, 1).map(r => [r.fx, r.t, r.active, r.inProg]));
  chk('N1 the check is not vacuous: at least ' + W.filter(r => r.active.length > 0).length + ' of the forecasts had work under way (max ' + Math.max(...W.map(r => r.active.length)) + ' tasks) and some elapsed time was above 0', W.filter(r => r.active.length > 0).length >= 8 && W.some(r => r.active.some(a => a.elapsed > 0)), W.map(r => r.active.length));
  const count = (r, st) => r.beds.filter(b => b.state === st).length;
  chk('N2 ward and ICU beds in the forecast input equal the received state: free and reserved counts, total 8, and ED-held beds = beds departed with a ward patient in the received events', W.every(r => r.wardBeds.free === count(r, 'free') && r.wardBeds.reserved === count(r, 'reserved') && r.wardBeds.free + r.wardBeds.reserved + r.wardBeds.ed_patient + r.wardBeds.inpatient_release_sampled === 8 && r.wardBeds.ed_patient === r.edBeds), W.filter(r => !(r.wardBeds.free === count(r, 'free') && r.wardBeds.reserved === count(r, 'reserved') && r.wardBeds.ed_patient === r.edBeds)).slice(0, 1));
  chk('N2 the beds check saw reserved beds and ED-held beds at least once', W.some(r => r.wardBeds.reserved > 0) && W.some(r => r.wardBeds.ed_patient > 0), W.map(r => [r.fx, r.t, r.wardBeds.reserved, r.wardBeds.ed_patient]));
  chk('N3 present patients in the input equal the received patients', W.every(r => r.present === r.statePatients), W.filter(r => r.present !== r.statePatients).slice(0, 1));
  const A = o.amb, at = (fx, t) => A.find(r => r.fx === fx && r.t === t);
  const a30 = at('fixture-eta-private-a', 30), b30 = at('fixture-eta-private-b', 30), a38 = at('fixture-eta-private-a', 38), b38 = at('fixture-eta-private-b', 38);
  chk('N4 announced ambulance counted once: T+30 both announce 1 ambulance / 2 patients and neither has them as present patients', [a30, b30].every(r => r.announced[0] === 1 && r.announced[1] === 2 && r.inbound.length === 1 && r.inbound[0].n === 2) && a30.present === b30.present, [a30.announced, b30.announced, a30.present, b30.present]);
  chk('N4 at T+38 the early run (private arrival 36) is no longer announced and its two patients are present; the late run (44) is still announced and not present; totals agree', a38.announced[0] === 0 && a38.announced[1] === 0 && b38.announced[0] === 1 && b38.announced[1] === 2 && a38.present - b38.present === 2 && a38.present === a38.statePatients && b38.present === b38.statePatients, [a38.announced, b38.announced, a38.present, b38.present]);
  R.data = { forecasts: W.length, maxTasks: Math.max(...W.map(r => r.active.length)), maxElapsed: Math.max(...W.flatMap(r => r.active.map(a => a.elapsed))), reservedSeen: Math.max(...W.map(r => r.wardBeds.reserved)), edBedsSeen: Math.max(...W.map(r => r.wardBeds.ed_patient)),
    sample: W.filter(r => r.active.length > 0).slice(0, 2).map(r => ({ fx: r.fx, t: r.t, inProgress: r.inProg.slice(0, 3) })) };
  return R;
}
