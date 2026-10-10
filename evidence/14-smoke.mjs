// Ticket 14 (reduced) smoke check against the real backend on :8000. No mocks.
// Usage: node evidence/14-smoke.mjs
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
const RAD = 'Radiology manager';
const LAB = 'Lab manager';

// Case: diagnostic-delay, development seed 7, stop at the first imaging queue.
const open = async () => {
  let s = await j('/replays', { scenario: 'diagnostic-delay', seed: 7 });
  while (s.sim_time_min < 240 && !((s.resources.diagnostics.imaging.waiting ?? 0) >= 1)) {
    s = await j(`/replays/${s.replay_id}/advance`, { minutes: 5, expected_version: s.version });
  }
  return s;
};
let st = await open();
const id = st.replay_id;
const t0 = st.sim_time_min;
console.log(`case: diagnostic-delay seed 7, imaging queue ${st.resources.diagnostics.imaging.waiting} at T+${t0}`);
const img = st.actions.catalog.find((c) => c.id === 'diagnostic_reserve:imaging');
const lab = st.actions.catalog.find((c) => c.id === 'diagnostic_reserve:lab');
check('imaging reserve is feasible and owned by the Radiology manager', img.feasible && img.owners[0] === RAD, img.owners.join());
check('lab reserve is owned by the Lab manager', lab.owners[0] === LAB);
check('setup 15 min, review 5, active 60', img.setup_min === 15 && img.review_min === 5 && img.active_min === 60);
const servers0 = st.resources.diagnostics.imaging.servers;
const labServers0 = st.resources.diagnostics.lab.servers;

const cmp = await j(`/replays/${id}/compare`, { samples: 50, expected_version: st.version });
const row = cmp.actions.find((a) => a.id === 'diagnostic_reserve:imaging');
const c = row.comparison;
check('paired comparison shows diagnostic wait and total ED time',
  c && c.samples === 50 && c.part_saving_patient_min.diagnostic_wait.n === 50 && c.total_saving_patient_min.n === 50,
  `diag wait saving ${JSON.stringify(c.part_saving_patient_min.diagnostic_wait)}; total ${JSON.stringify(c.total_saving_patient_min)}`);
check('diagnostic wait saving is positive for an imaging queue (extra slot serves the queue)',
  c.part_saving_patient_min.diagnostic_wait.mean > 0);

const labReq = await j(`/replays/${id}/requests`, { preset: 'diagnostic_reserve', target: 'lab', expected_version: st.version });
check('lab reserve with no lab queue is not feasible (422)', !lab.feasible && labReq.s === 422, labReq.detail?.slice(0, 80));
const rq = await j(`/replays/${id}/requests`, { preset: 'diagnostic_reserve', target: 'imaging', expected_version: st.version });
check('imaging request routed to the Radiology manager', rq.s === 200 && rq.request.owners[0] === RAD);
const rid = rq.request.id;
const wrong = await j(`/replays/${id}/requests/${rid}/decision`, { role: LAB, decision: 'approve', decision_id: 'l1', expected_version: rq.state_version });
check('Lab manager refused for imaging (403)', wrong.s === 403 && wrong.detail.includes(RAD));
st = await get(`/replays/${id}/state`);
check('refusal reserves nothing', st.resources.diagnostics.imaging.servers === servers0 && st.actions.in_flight === null);
const ok = await j(`/replays/${id}/requests/${rid}/decision`, { role: RAD, decision: 'approve', decision_id: 'r1', expected_version: st.version });
check('Radiology manager approves', ok.s === 200 && ok.request.status === 'approved');

st = await get(`/replays/${id}/state`);
const step = async (m) => { st = await j(`/replays/${id}/advance`, { minutes: m, expected_version: st.version }); return st; };
await step(5);
check('setup at +5, no capacity yet', st.actions.in_flight.stage === 'setup' && st.resources.diagnostics.imaging.servers === servers0);
await step(10);
check('still setup at +15 after approval minus 5 (+15 total = active)', st.actions.in_flight.stage === 'setup' || st.actions.in_flight.stage === 'active');
await step(5);
check('active at +20 with imaging capacity 2', st.actions.in_flight.stage === 'active' && st.resources.diagnostics.imaging.servers === servers0 + 1,
  `servers ${st.resources.diagnostics.imaging.servers}; lab servers ${st.resources.diagnostics.lab.servers}`);
check('lab capacity untouched', st.resources.diagnostics.lab.servers === labServers0);
// Forecast and comparison while the action runs must both answer from received state.
const fc = await j(`/replays/${id}/forecast`, { samples: 50, expected_version: st.version });
check('forecast during the active window answers', fc.s === 200 && fc.status === 'ok', `status ${fc.status}`);
const midCmp = await j(`/replays/${id}/compare`, { samples: 50, expected_version: st.version });
check('comparison while an action is in flight offers no second action',
  midCmp.s === 200 && midCmp.actions.every((a) => !a.feasible) && midCmp.method.blocked_by_in_flight === true);
await step(60);
check('after the 60-minute window the slot closes: capacity back to 1',
  st.resources.diagnostics.imaging.servers === servers0 && ['draining', 'completed'].includes(st.actions.in_flight?.stage ?? 'completed'),
  `servers ${st.resources.diagnostics.imaging.servers}`);
while (st.actions.in_flight) await step(5);
while (st.sim_time_min < 300) await step(Math.min(60, 300 - st.sim_time_min));
const ev = (await get(`/replays/${id}/events`)).events;
const stages = ev.filter((e) => e.type.startsWith('action_')).map((e) => e.type);
check('lifecycle recorded through completed', stages.includes('action_active') && stages.at(-1) === 'action_completed', stages.join(' '));
check('reserve unit I2 did real work', ev.some((e) => e.type === 'test_completed' && e.payload.unit === 'I2'));

// Tests are never shortened and results never manufactured: the same patients' test durations are
// identical to a no-action replay of the same seed to the same time.
const keyed = (events) => new Map(events.filter((e) => e.type === 'test_completed')
  .map((e) => [`${e.patient_id}:${e.payload.test}`, e.payload.elapsed_min]));
const withAction = keyed(ev);
let base = await j('/replays', { scenario: 'diagnostic-delay', seed: 7 });
while (base.sim_time_min < st.sim_time_min - 1e-9) {
  base = await j(`/replays/${base.replay_id}/advance`, { minutes: Math.min(60, st.sim_time_min - base.sim_time_min), expected_version: base.version });
}
const noAction = keyed((await get(`/replays/${base.replay_id}/events`)).events);
let same = 0, diff = 0;
for (const [k, v] of withAction) if (noAction.has(k)) (noAction.get(k) === v ? same++ : diff++);
check('every test common to both runs has the identical duration', diff === 0 && same >= 10, `${same} identical, ${diff} different`);

// No-action regression and save/load of the decision.
const sv = await j(`/replays/${id}/save`, {});
const ld = await j(`/saved/${sv.saved_id}/load`, {});
check('save then load reproduces the run with the decision', ld.s === 200 && ld.saved_run.choices.some((x) => x.decision === 'approve'));
{
  let n = await j('/replays', { scenario: 'normal', seed: 7 });
  for (let i = 0; i < 12; i++) n = await j(`/replays/${n.replay_id}/advance`, { minutes: 60, expected_version: n.version });
  const ex = await get(`/replays/${n.replay_id}/export`);
  check('no-action seed 7 normal: 705 events, 59 patients', ex.events.length === 705 && ex.patients.length === 59);
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
