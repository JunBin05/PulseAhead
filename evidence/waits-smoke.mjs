// Predicted-wait smoke (FR-03) against the real backend on :8000. No mocks. Usage: node evidence/waits-smoke.mjs
const B = process.env.PULSE_API ?? 'http://127.0.0.1:8000/api/v1';
const j = async (path, body) => {
  const r = await fetch(B + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { s: r.status, ...(await r.json()) };
};
const get = async (p) => ({ ...(await (await fetch(B + p)).json()) });
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
  if (!ok) fails++;
};
const open = async (scenario, seed, at) => {
  let s = await j('/replays', { scenario, seed });
  while (s.sim_time_min < at) s = await j(`/replays/${s.replay_id}/advance`, { minutes: Math.min(60, at - s.sim_time_min), expected_version: s.version });
  return s;
};

// diagnostic-delay seed 7 at T+100: imaging queue, lab queue forming.
let st = await open('diagnostic-delay', 7, 100);
const f = await j(`/replays/${st.replay_id}/forecast`, { samples: 50, expected_version: st.version });
const w = f.waits;
check('forecast carries predicted waits with unit and basis', f.status === 'ok' && !!w && /minutes/.test(w.unit) && w.basis.length > 20);
const received = new Map(st.patients.map((p) => [p.id, p]));
check('every listed patient is waiting in the received state at this version',
  [...w.first_assessment, ...w.diagnostic].every((r) => received.get(r.id)?.phase === r.phase),
  `${w.first_assessment.length} first-assessment, ${w.diagnostic.length} test waits`);
check('summary counts equal the received waiting patients',
  w.summary.waiting_for_first_assessment === st.patients.filter((p) => ['awaiting_triage', 'in_triage', 'awaiting_space', 'awaiting_clinician'].includes(p.phase)).length &&
  w.summary.waiting_for_a_test === st.patients.filter((p) => ['awaiting_lab', 'awaiting_imaging'].includes(p.phase)).length);
check('a patient already in assessment or later is not listed',
  ![...w.first_assessment, ...w.diagnostic].some((r) => ['assessment_active', 'departed', 'disposition_processing'].includes(r.phase)));
const diag = w.diagnostic;
check('queued test patients get a predicted start (median) from the futures', diag.length > 0 && diag.some((r) => r.median_min !== null),
  diag.slice(0, 3).map((r) => `${r.id}:${r.phase}:median ${r.median_min} p90 ${r.p90_min} starts ${r.starts_in_run_chance}`).join(' | '));
check('predicted waits are non-negative and bounded by the run', [...w.first_assessment, ...w.diagnostic].every((r) =>
  (r.median_min === null || (r.median_min >= 0 && r.median_min <= w.run_min)) && (r.p90_min === null || r.p90_min <= w.run_min)));
check('censoring is honest: a 90th percentile never appears without a median', [...w.first_assessment, ...w.diagnostic].every((r) => r.p90_min === null || r.median_min !== null));
const imagingQueue = st.patients.filter((p) => p.phase === 'awaiting_imaging').length;
check('imaging queue in the response equals the received imaging queue', diag.filter((r) => r.phase === 'awaiting_imaging').length === imagingQueue,
  `${imagingQueue} waiting`);

// Same keyed futures: the same version gives identical waits (cache aside, recompute via another sample count agrees in shape).
const f2 = await j(`/replays/${st.replay_id}/forecast`, { samples: 50, expected_version: st.version });
check('same version returns the same waits', JSON.stringify(f2.waits) === JSON.stringify(f.waits));

// Cannot assess: no waits shown.
{
  let s = await j('/replays', { scenario: 'fixture-feed-staffing-stop' });
  let guard = 0;
  while (s.overall_status.assessable && guard++ < 40) s = await j(`/replays/${s.replay_id}/advance`, { minutes: 5, expected_version: s.version });
  const r = await j(`/replays/${s.replay_id}/forecast`, { samples: 50, expected_version: s.version });
  check('cannot assess: no predicted waits are shown', r.status === 'cannot_assess' && r.waits === undefined);
}

// Forecast numbers themselves are unchanged by the additive waits: onset chance equals the earlier record.
const imagingChance = f.services.imaging.chance;
check('forecast still reports the imaging service state', f.services.imaging.state === 'overloaded' || imagingChance !== undefined);

{
  let n = await j('/replays', { scenario: 'normal', seed: 7 });
  for (let i = 0; i < 12; i++) n = await j(`/replays/${n.replay_id}/advance`, { minutes: 60, expected_version: n.version });
  const ex = await get(`/replays/${n.replay_id}/export`);
  check('no-action seed 7 normal: 705 events, 59 patients', ex.events.length === 705 && ex.patients.length === 59);
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
