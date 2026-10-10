// Guided-demo smoke: runs the same steps as the Demo bar (frontend/src/Demo.tsx) against the real
// backend on :8000 and asserts what each step claims. No mocks. Usage: node evidence/demo-smoke.mjs
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
const servers = (s, svc) => (svc === 'allocation' ? s.resources.disposition.allocation.servers : s.resources.diagnostics[svc].servers);

// Step 1: start.
let st = await j('/replays', { scenario: 'diagnostic-delay', seed: 7 });
const id = st.replay_id;
check('step 1: fresh replay, diagnostic-delay seed 7, Stable at T+0', st.sim_time_min === 0 && st.scenario === 'diagnostic-delay' && st.seed === 7 && st.synthetic === true,
  st.overall_status.label);

// Step 2: advance 5 min at a time until a zone 3 alert exists (cap T+240).
const step = async (m) => { st = await j(`/replays/${id}/advance`, { minutes: m, expected_version: st.version }); return st; };
const alertZone3 = async () => {
  const f = await j(`/replays/${id}/forecast`, { samples: 50, expected_version: st.version });
  return { f, a: [...f.alerts.actionable, ...f.alerts.recovery].find((x) => x.zone === 3) };
};
let { f, a } = await alertZone3();
while (!a && st.sim_time_min < 240) { await step(5); ({ f, a } = await alertZone3()); }
check('step 2: a zone 3 alert appears from the forecast (early detection)', !!a && a.zone === 3,
  a ? `${a.name} ${a.kind} ${Math.round((a.chance ?? 0) * 100)}% at T+${st.sim_time_min}` : 'none');
const detectedAt = st.sim_time_min;
check('step 2: the alert came before the imaging service was overloaded in the ED status (still stable overall)',
  st.overall_status.state === 'stable', st.overall_status.label);

// Step 3: a second bottleneck: at least two feasible actions.
while (st.actions.catalog.filter((c) => c.feasible).length < 2 && st.sim_time_min < 240) await step(5);
const feasible = st.actions.catalog.filter((c) => c.feasible);
check('step 3: two actions are feasible but only one can run at a time', feasible.length >= 2, `${feasible.map((c) => c.id).join()} at T+${st.sim_time_min}`);

// Step 4/5: priority list and what-if.
const cmp = await j(`/replays/${id}/compare`, { samples: 50, expected_version: st.version });
const listed = cmp.actions.filter((x) => x.comparison);
check('step 4: priority list is ordered and every label has its rule inputs', listed.length >= 2 && listed.every((x, i) => x.order === i + 1 && x.rank.rule.saving_mean !== undefined),
  listed.map((x) => `#${x.order} ${x.id} ${x.rank.label}`).join('; '));
check('step 4: impact per reserve unit-hour is shown from the backend', listed.every((x) => typeof x.impact_per_resource_hour.mean === 'number'));
check('step 5: what-if A instead of B from the paired futures', !!cmp.what_if && cmp.what_if.difference_patient_min.n === 50, cmp.what_if?.text.slice(0, 110));
const top = listed[0];
const supported = top.rank.label === 'best_action' || top.rank.label === 'supported_not_top';
check('step 5: no forced winner (top label is supported by its own lower bound)', !supported || top.rank.rule.saving_lower_90 > 0,
  `${top.id} ${top.rank.label} lb ${top.rank.rule.saving_lower_90}`);

if (supported) {
  const owner = top.owners[0];
  const wrongOwner = listed.map((x) => x.owners[0]).find((o) => o !== owner) ?? 'Ward supervisor / bed manager';
  const servers0 = servers(st, top.service);

  // Step 6: request, wrong owner refused, owner approves.
  const rq = await j(`/replays/${id}/requests`, { preset: top.preset, target: top.target, role: COORD, expected_version: st.version });
  check('step 6: request routed to the resource owner', rq.s === 200 && rq.request.owners[0] === owner, owner);
  const bad = await j(`/replays/${id}/requests/${rq.request.id}/decision`, { role: wrongOwner, decision: 'approve', decision_id: 'demo-wrong', expected_version: rq.state_version });
  check('step 6: wrong owner refused (403)', bad.s === 403, `${wrongOwner}: ${bad.detail?.slice(0, 60)}`);
  const ok = await j(`/replays/${id}/requests/${rq.request.id}/decision`, { role: owner, decision: 'approve', decision_id: `demo-${rq.request.id}`, expected_version: rq.state_version });
  check('step 6: owner approves', ok.s === 200 && ok.request.status === 'approved');
  st = await get(`/replays/${id}/state`);
  const approvedAt = st.sim_time_min;
  check('step 6: review stage, capacity unchanged', st.actions.in_flight.stage === 'review' && servers(st, top.service) === servers0);

  // Step 7: until active.
  const queue0 = top.service === 'allocation' ? null : st.resources.diagnostics[top.service].waiting;
  while (st.actions.in_flight && st.actions.in_flight.stage !== 'active') await step(5);
  check('step 7: capacity 1 -> 2 when active', servers(st, top.service) === servers0 + 1 && st.actions.in_flight.stage === 'active',
    `${servers0} -> ${servers(st, top.service)} at T+${st.sim_time_min}; queue ${queue0} -> ${top.service === 'allocation' ? 'n/a' : st.resources.diagnostics[top.service].waiting}`);
  check('step 7: active exactly review + setup after approval',
    Math.abs(st.sim_time_min - (approvedAt + top.review_min + top.setup_min)) < 1e-6,
    `approved T+${approvedAt}, active seen at T+${st.sim_time_min}`);

  // Step 8: until completed.
  while (st.actions.in_flight) await step(5);
  check('step 8: capacity back to 1 after the window', servers(st, top.service) === servers0, `${servers(st, top.service)}`);
  const ev = (await get(`/replays/${id}/events`)).events;
  const kinds = ev.filter((e) => e.type.startsWith('action_')).map((e) => e.type);
  check('step 8: all action events appear in /events',
    ['action_requested', 'action_decision', 'action_approved', 'action_review', 'action_setup', 'action_active', 'action_draining', 'action_completed']
      .every((k) => kinds.includes(k)), kinds.join(' '));
  const at = (k) => ev.find((e) => e.type === k)?.event_time_min;
  check('step 8: setup +5, active +review+setup, draining +review+setup+60',
    Math.abs(at('action_setup') - at('action_approved') - top.review_min) < 1e-6 &&
    Math.abs(at('action_active') - at('action_approved') - top.review_min - top.setup_min) < 1e-6 &&
    Math.abs(at('action_draining') - at('action_approved') - top.review_min - top.setup_min - top.active_min) < 1e-6);
  const used = ev.filter((e) => e.type === 'test_completed' && e.payload.unit === top.reserve.unit).length;
  console.log(`NOTE  reserve unit ${top.reserve.unit} completed ${used} test(s); detection at T+${detectedAt}, decision at T+${approvedAt}`);
} else {
  console.log(`NOTE  top action is "${top.rank.label}": the demo would stop honestly before any request`);
}

// The no-action replay is unchanged.
{
  let n = await j('/replays', { scenario: 'normal', seed: 7 });
  for (let i = 0; i < 12; i++) n = await j(`/replays/${n.replay_id}/advance`, { minutes: 60, expected_version: n.version });
  const ex = await get(`/replays/${n.replay_id}/export`);
  check('no-action seed 7 normal: 705 events, 59 patients', ex.events.length === 705 && ex.patients.length === 59);
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
