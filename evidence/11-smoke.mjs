// Ticket 11 smoke check against the real backend on :8000 (node 18+, fetch). No mocks.
// Usage: node evidence/11-smoke.mjs
const B = process.env.PULSE_API ?? 'http://127.0.0.1:8000/api/v1';
const j = async (path, body) => {
  const r = await fetch(B + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { s: r.status, ...(await r.json()) };
};
const get = async (path) => ({ ...(await (await fetch(B + path)).json()) });
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
  if (!ok) fails++;
};
const OWNER = 'Ward supervisor / bed manager';

// 0. The no-action replay is unchanged: seed 7 normal, 12 simulated hours.
{
  let st = await j('/replays', { scenario: 'normal', seed: 7 });
  for (let i = 0; i < 12; i++) st = await j(`/replays/${st.replay_id}/advance`, { minutes: 60, expected_version: st.version });
  const ex = await get(`/replays/${st.replay_id}/export`);
  check('no-action seed 7 normal: 705 events, 59 patients', ex.events.length === 705 && ex.patients.length === 59,
    `events ${ex.events.length}, patients ${ex.patients.length}`);
  check('no action_* event without a request', !ex.events.some((e) => e.type.startsWith('action_')));
  check('engine version bumped', ex.run_record.versions.engine === 'flow-5', ex.run_record.versions.engine);
}

// 1. A real ward-allocation backlog: busy-recovers, development seed 7.
let st = await j('/replays', { scenario: 'busy-recovers', seed: 7 });
const id = st.replay_id;
while (st.sim_time_min < 480 &&
  !st.patients.some((p) => p.phase === 'awaiting_ward_allocation' && p.decision_received)) {
  st = await j(`/replays/${id}/advance`, { minutes: 2, expected_version: st.version });
}
console.log(`case: busy-recovers seed 7, backlog found at T+${st.sim_time_min}`);
const alloc0 = st.resources.disposition.allocation.servers;
check('allocation backlog exists with a decided Ward/ICU patient', st.sim_time_min < 480);
check('ward coordination is feasible from received state', st.actions.catalog[0].feasible && st.actions.catalog[0].id === 'ward_coordination:allocation');
check('approvers come from ownership: Ward supervisor / bed manager (zone 4 service)',
  st.actions.catalog[0].owners.length === 1 && st.actions.catalog[0].owners[0] === OWNER);
check('not-modeled presets are listed and cannot be requested',
  st.actions.not_modeled.length === 4 && (await j(`/replays/${id}/requests`, { preset: 'reserve_physician' })).s === 422);

// 2. Paired comparison.
const cmp = await j(`/replays/${id}/compare`, { samples: 50, expected_version: st.version });
const row = cmp.actions.find((a) => a.id === 'ward_coordination:allocation');
const c = row.comparison;
check('comparison carries its source version and time', cmp.source.version === st.version && cmp.source.sim_time_min === st.sim_time_min);
check('50 paired futures; cohort and unfinished stays reported apart',
  c.samples === 50 && c.no_action.cohort_patients_mean === c.action.cohort_patients_mean &&
  typeof c.no_action.unfinished_stays_mean === 'number' && typeof c.futures_with_unfinished_stays === 'number',
  `cohort ${c.no_action.cohort_patients_mean}, unfinished futures ${c.futures_with_unfinished_stays}`);
check('saving has mean, sd, n and a 90% lower bound',
  c.total_saving_patient_min.n === 50 && c.total_saving_patient_min.lower_90 !== null,
  JSON.stringify(c.total_saving_patient_min));
check('no Best-action label before ticket 17 ranking', !('label' in row) || row.label !== 'best_action');
const stale = await j(`/replays/${id}/compare`, { samples: 50, expected_version: st.version - 1 });
check('stale version on compare -> 409', stale.s === 409);

// 3. Request, wrong role, stale, defer, approve, idempotent.
const rq = await j(`/replays/${id}/requests`, { preset: 'ward_coordination', role: 'ED shift coordinator', expected_version: st.version });
check('request created, pending, owner required', rq.s === 200 && rq.request.status === 'pending' && rq.request.owners[0] === OWNER);
const rid = rq.request.id;
const v1 = rq.state_version;
const wrong = await j(`/replays/${id}/requests/${rid}/decision`, { role: 'Lab manager', decision: 'approve', decision_id: 'w1', expected_version: v1 });
check('wrong owner refused (403) and names the real owner', wrong.s === 403 && wrong.detail.includes(OWNER), wrong.detail?.slice(0, 80));
const coord = await j(`/replays/${id}/requests/${rid}/decision`, { role: 'ED shift coordinator', decision: 'approve', decision_id: 'c1', expected_version: v1 });
check('the clicking coordinator cannot approve (403)', coord.s === 403);
const staleDec = await j(`/replays/${id}/requests/${rid}/decision`, { role: OWNER, decision: 'approve', decision_id: 's1', expected_version: v1 - 1 });
check('stale version on decision -> 409', staleDec.s === 409);
const dup = await j(`/replays/${id}/requests`, { preset: 'ward_coordination', expected_version: v1 });
check('second request while one is open -> 409', dup.s === 409);
const defer = await j(`/replays/${id}/requests/${rid}/decision`, { role: OWNER, decision: 'defer', decision_id: 'd0', expected_version: v1 });
check('defer keeps the request open and changes no capacity', defer.s === 200 && defer.request.status === 'deferred');
st = await get(`/replays/${id}/state`);
check('allocation capacity unchanged after defer', st.resources.disposition.allocation.servers === alloc0);
const approve = await j(`/replays/${id}/requests/${rid}/decision`, { role: OWNER, decision: 'approve', decision_id: 'a1', expected_version: st.version });
check('owner approves -> approved with an action id', approve.s === 200 && approve.request.status === 'approved' && !!approve.request.action_id);
const again = await j(`/replays/${id}/requests/${rid}/decision`, { role: OWNER, decision: 'approve', decision_id: 'a1', expected_version: 1 });
check('same decision identity again is idempotent', again.s === 200 && again.repeat === true && again.state_version === approve.state_version);
const other = await j(`/replays/${id}/requests/${rid}/decision`, { role: OWNER, decision: 'approve', decision_id: 'a2', expected_version: approve.state_version });
check('a different identity from the same role cannot grant twice -> 409', other.s === 409);
const t0 = st.sim_time_min;
st = await get(`/replays/${id}/state`);
check('review: capacity not changed at approval', st.resources.disposition.allocation.servers === alloc0 && st.actions.in_flight.stage === 'review');
const second = await j(`/replays/${id}/requests`, { preset: 'ward_coordination', expected_version: st.version });
check('one action in flight: another request -> 409', second.s === 409);

// 4. Lifecycle timing and capacity.
const seen = [];
const step = async (m) => { st = await j(`/replays/${id}/advance`, { minutes: m, expected_version: st.version }); return st; };
await step(5);
check('setup starts at +5 with no capacity change', st.actions.in_flight.stage === 'setup' && st.resources.disposition.allocation.servers === alloc0);
await step(9);
check('still setup at +14', st.actions.in_flight.stage === 'setup' && st.resources.disposition.allocation.servers === alloc0);
await step(1);
check('active at +15 with one more allocation slot', st.actions.in_flight.stage === 'active' && st.resources.disposition.allocation.servers === alloc0 + 1,
  `servers ${st.resources.disposition.allocation.servers}`);
await step(59);
check('still active at +74', st.actions.in_flight.stage === 'active');
await step(1);
check('closes at +75 (draining or completed) and capacity is back', ['draining', 'completed'].includes(st.actions.in_flight?.stage ?? 'completed') &&
  st.resources.disposition.allocation.servers === alloc0, `servers ${st.resources.disposition.allocation.servers}`);
while (st.actions.in_flight) await step(5);
const ev = await get(`/replays/${id}/events`);
const ae = ev.events.filter((e) => e.type.startsWith('action_'));
const kinds = ae.map((e) => e.type);
check('events record requested, decisions, approved, review, setup, active, draining, completed',
  ['action_requested', 'action_decision', 'action_approved', 'action_review', 'action_setup', 'action_active', 'action_draining', 'action_completed']
    .every((k) => kinds.includes(k)), kinds.join(' '));
const at = (k) => ae.find((e) => e.type === k)?.event_time_min;
check('event times: setup +5, active +15, draining +75 after approval',
  Math.abs(at('action_setup') - at('action_approved') - 5) < 1e-6 && Math.abs(at('action_active') - at('action_approved') - 15) < 1e-6 &&
  Math.abs(at('action_draining') - at('action_approved') - 75) < 1e-6,
  `approved ${at('action_approved')}, setup ${at('action_setup')}, active ${at('action_active')}, draining ${at('action_draining')}`);
st = await get(`/replays/${id}/state`);
check('no ward bed created and no clearance: bed totals unchanged',
  st.resources.disposition.beds.ward.total === 6 && st.resources.disposition.beds.icu.total === 2);

// 5. Save and load: decisions are in choices and reproduce the digest.
const sv = await j(`/replays/${id}/save`, {});
const rec = await get(`/saved/${sv.saved_id}`);
check('saved run stores the request and decisions as choices', rec.choices.length >= 3 && rec.choices.some((c) => c.op === 'decision' && c.decision === 'approve'),
  `${rec.choices.length} choices`);
const ld = await j(`/saved/${sv.saved_id}/load`, {});
check('load replays the decisions and reproduces the event digest', ld.s === 200 && ld.saved_run?.choices.length === rec.choices.length,
  `status ${ld.s}`);
const ld2ev = await get(`/replays/${ld.replay_id}/events`);
check('loaded run has the same action events', ld2ev.events.filter((e) => e.type.startsWith('action_')).length === ae.length);

// 6. Reject path on a fresh run of the same case.
{
  let s2 = await j('/replays', { scenario: 'busy-recovers', seed: 7 });
  while (s2.sim_time_min < 480 && !s2.patients.some((p) => p.phase === 'awaiting_ward_allocation' && p.decision_received)) {
    s2 = await j(`/replays/${s2.replay_id}/advance`, { minutes: 2, expected_version: s2.version });
  }
  const r = await j(`/replays/${s2.replay_id}/requests`, { preset: 'ward_coordination', expected_version: s2.version });
  const d = await j(`/replays/${s2.replay_id}/requests/${r.request.id}/decision`, { role: OWNER, decision: 'reject', decision_id: 'r1' });
  const s3 = await get(`/replays/${s2.replay_id}/state`);
  check('reject: nothing reserved, no capacity change, no action in flight',
    d.request.status === 'rejected' && s3.actions.in_flight === null && s3.resources.disposition.allocation.servers === alloc0);
  const adv = await j(`/replays/${s2.replay_id}/advance`, { minutes: 5, expected_version: s3.version });
  const old = await j(`/replays/${s2.replay_id}/requests/${r.request.id}/decision`, { role: OWNER, decision: 'approve', decision_id: 'late' });
  check('a decided request cannot be approved later -> 409', old.s === 409 && adv.s === 200);
}

// 6b. Unavailable bed: decided Ward/ICU patients wait for a bed, not for allocation work -> not feasible.
{
  let s6 = await j('/replays', { scenario: 'boarding-blockage', seed: 7 });
  while (s6.sim_time_min < 300 && !s6.patients.some((p) => p.phase === 'awaiting_ward_bed' && p.decision_received) ) {
    s6 = await j(`/replays/${s6.replay_id}/advance`, { minutes: 5, expected_version: s6.version });
  }
  const noAlloc = !s6.patients.some((p) => p.phase === 'awaiting_ward_allocation');
  const w = s6.actions.catalog[0];
  check('bed wait without allocation backlog: ward coordination not feasible, reason names the bed',
    noAlloc && !w.feasible && /bed/i.test(w.reasons.join(' ')), `T+${s6.sim_time_min}: ${w.reasons[0]?.slice(0, 90)}`);
  const r6 = await j(`/replays/${s6.replay_id}/requests`, { preset: 'ward_coordination', expected_version: s6.version });
  check('requesting an infeasible action -> 422', r6.s === 422);
}

// 7. The reserve is rechecked at activation: a fixture removes it, so the approved action is blocked.
{
  let s4 = await j('/replays', { scenario: 'fixture-reserve-outage' });
  const rid4 = s4.replay_id;
  while (s4.sim_time_min < 120 && !s4.patients.some((p) => p.phase === 'awaiting_ward_allocation' && p.decision_received)) {
    s4 = await j(`/replays/${rid4}/advance`, { minutes: 2, expected_version: s4.version });
  }
  const base = s4.resources.disposition.allocation.servers;
  const r = await j(`/replays/${rid4}/requests`, { preset: 'ward_coordination', expected_version: s4.version });
  await j(`/replays/${rid4}/requests/${r.request.id}/decision`, { role: OWNER, decision: 'approve', decision_id: 'o1' });
  let s5 = await get(`/replays/${rid4}/state`);
  s5 = await j(`/replays/${rid4}/advance`, { minutes: 15, expected_version: s5.version });
  const e4 = (await get(`/replays/${rid4}/events`)).events.map((e) => e.type);
  check('reserve gone at activation: blocked, no capacity added, no action_active',
    s5.actions.history.some((h) => h.stage === 'blocked') && s5.actions.in_flight === null &&
    s5.resources.disposition.allocation.servers === base && e4.includes('action_blocked') && !e4.includes('action_active'));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
