// Staffed surge space action smoke against the real backend on :8000. No mocks.
// Usage: node evidence/surge-smoke.mjs
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
const COORD = 'ED shift coordinator';
const OWNER = 'ED nurse in charge';
const ID = 'staffed_surge_space:space';

// 1. A general-space shortage on a non-test seed (mixed-cascade demo seed 3054): advance until at least
// two non-critical patients wait for a general space (critical patients wait for resus spaces instead).
let st = await j('/replays', { scenario: 'mixed-cascade', seed: 3054 });
const id = st.replay_id;
const step = async (m) => { st = await j(`/replays/${id}/advance`, { minutes: m, expected_version: st.version }); return st; };
const generalWaiting = (x) => (x.resources.ed_spaces.awaiting_space ?? 0) - (x.resources.resus_spaces.awaiting ?? 0);
while (generalWaiting(st) < 2 && st.sim_time_min < 600) await step(5);
console.log(`NOTE  ${generalWaiting(st)} patients wait for a general space at T+${st.sim_time_min}`);
const item = st.actions.catalog.find((c) => c.id === ID);
check('catalog lists the staffed surge space, feasible, owner ED nurse in charge', !!item && item.feasible && item.owners[0] === OWNER,
  item ? `${item.name}; setup ${item.setup_min} min; zone ${item.zone}` : 'missing');
check('it is no longer listed as not modeled', !st.actions.not_modeled.some((x) => x.id === 'staffed_surge_spaces'));
const gen0 = st.resources.ed_spaces.general_total;
const tot0 = st.resources.ed_spaces.total;
const cmp = await j(`/replays/${id}/compare`, { samples: 50, expected_version: st.version });
const row = cmp.actions.find((x) => x.id === ID);
check('compare ranks it from paired futures (a label from its own rule, no forced winner)', !!row && !!row.rank && row.comparison?.total_saving_patient_min.n === 50,
  `${row?.rank?.label}, saving ${row?.comparison?.total_saving_patient_min.mean} (lb ${row?.comparison?.total_saving_patient_min.lower_90})`);

const rq = await j(`/replays/${id}/requests`, { preset: 'staffed_surge_space', target: 'space', role: COORD, expected_version: st.version });
check('request routed to the ED nurse in charge', rq.s === 200 && rq.request.owners[0] === OWNER);
const bad = await j(`/replays/${id}/requests/${rq.request.id}/decision`, { role: 'Lab manager', decision: 'approve', decision_id: 'surge-wrong', expected_version: rq.state_version });
check('a different owner is refused (403)', bad.s === 403);
const ok = await j(`/replays/${id}/requests/${rq.request.id}/decision`, { role: OWNER, decision: 'approve', decision_id: `surge-${rq.request.id}`, expected_version: rq.state_version });
check('the owner approves', ok.s === 200 && ok.request.status === 'approved');
st = await get(`/replays/${id}/state`);
const approvedAt = st.sim_time_min;
check('review: no space added yet', st.actions.in_flight.stage === 'review' && st.resources.ed_spaces.general_total === gen0);
while (st.actions.in_flight && st.actions.in_flight.stage !== 'active') await step(5);
check('active exactly review + setup after approval, one more staffed general space (X1)',
  st.resources.ed_spaces.general_total === gen0 + 1 && st.resources.ed_spaces.total === tot0 + 1 &&
  Math.abs(st.sim_time_min - (approvedAt + 5 + 20)) < 1e-6,
  `general ${gen0} -> ${st.resources.ed_spaces.general_total}, total ${tot0} -> ${st.resources.ed_spaces.total} at T+${st.sim_time_min}`);
let used = false;
while (st.actions.in_flight) {
  await step(5);
  used = used || st.patients.some((p) => p.space_id === 'X1');
}
check('a patient was placed in the reserve space while it was open', used);
check('the space closes after its window (and its patient leaves first)', st.resources.ed_spaces.general_total === gen0 && !st.patients.some((p) => p.space_id === 'X1'),
  `general ${st.resources.ed_spaces.general_total}`);
const ev = (await get(`/replays/${id}/events`)).events;
const kinds = ev.filter((e) => e.type.startsWith('action_')).map((e) => e.type);
check('every lifecycle event is in /events', ['action_approved', 'action_review', 'action_setup', 'action_active', 'action_draining', 'action_completed'].every((k) => kinds.includes(k)), kinds.join(' '));
check('no bed, doctor or clearance is created: ward beds and doctors unchanged',
  st.resources.disposition.beds.ward.total === 6 && st.resources.clinician_slots.total === 4);
const sv = await j(`/replays/${id}/save`, {});
const ld = await j(`/saved/${sv.saved_id}/load`, {});
check('save then load reproduces the run with the decision', ld.s === 200 && ld.saved_run.choices.some((x) => x.decision === 'approve'));

// 2. Reserve gone at activation: blocked, nothing added.
{
  let b = await j('/replays', { scenario: 'fixture-reserve-outage', seed: 7 });
  const bid = b.replay_id;
  const g0 = b.resources.ed_spaces.general_total;
  const r2 = await j(`/replays/${bid}/requests`, { preset: 'staffed_surge_space', target: 'space', role: COORD, expected_version: b.version });
  await j(`/replays/${bid}/requests/${r2.request.id}/decision`, { role: OWNER, decision: 'approve', decision_id: `surge-b-${r2.request.id}`, expected_version: r2.state_version });
  b = await get(`/replays/${bid}/state`);
  for (let i = 0; i < 8; i++) b = await j(`/replays/${bid}/advance`, { minutes: 5, expected_version: b.version });
  const last = b.actions.history.at(-1);
  check('reserve gone at activation: blocked, no space added', last?.stage === 'blocked' && b.resources.ed_spaces.general_total === g0, last?.reason ?? '');
}

// 3. No-action regression.
{
  let n = await j('/replays', { scenario: 'normal', seed: 7 });
  for (let i = 0; i < 12; i++) n = await j(`/replays/${n.replay_id}/advance`, { minutes: 60, expected_version: n.version });
  const ex = await get(`/replays/${n.replay_id}/export`);
  check('no-action seed 7 normal: 705 events, 59 patients', ex.events.length === 705 && ex.patients.length === 59);
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
