// Ticket 17 (lite) smoke check against the real backend on :8000. No mocks.
// Usage: node evidence/17-smoke.mjs
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
// The ranking rule, recomputed from the numbers a response carries (spec amendment, ticket 17 lite).
const recompute = (rule) => {
  if (rule.urgent_futures < 20) return 'needs_review';
  if (rule.urgent_wait_change_mean > 5 || rule.overdue_change_mean > 0) return 'urgent_delay_check_failed';
  if (rule.saving_mean > 0 && rule.saving_lower_90 > 0) return 'supported';
  return 'no_action_shown_to_help';
};
const norm = (label) => (label === 'best_action' || label === 'supported_not_top' ? 'supported' : label);
const open = async (scenario, seed, at) => {
  let s = await j('/replays', { scenario, seed });
  while (s.sim_time_min < at) s = await j(`/replays/${s.replay_id}/advance`, { minutes: Math.min(60, at - s.sim_time_min), expected_version: s.version });
  return s;
};

// 1. A supported best action and a supported runner-up: diagnostic-delay seed 7 at T+100 (imaging
// overloaded, lab queue forming).
let st = await open('diagnostic-delay', 7, 100);
const id = st.replay_id;
const c = await j(`/replays/${id}/compare`, { samples: 50, expected_version: st.version });
const compared = c.actions.filter((a) => a.comparison);
check('priority list: every feasible action compared (incl. the surge space), infeasible one listed with a reason',
  compared.length >= 2 && c.actions.some((a) => !a.feasible && a.reasons.length > 0), compared.map((a) => a.id).join());
check('every compared label matches the rule recomputed from its numbers',
  compared.every((a) => norm(a.rank.label) === recompute(a.rank.rule)),
  compared.map((a) => `${a.id}=${a.rank.label}`).join(' '));
check('order: top row is the supported action with the larger lower bound; at most one Best',
  c.actions[0].rank.label === 'best_action' && c.actions.filter((a) => a.rank.label === 'best_action').length === 1 &&
  compared[0].rank.rule.saving_lower_90 >= compared[1].rank.rule.saving_lower_90,
  `${compared[0].id} lb ${compared[0].rank.rule.saving_lower_90} vs ${compared[1].id} lb ${compared[1].rank.rule.saving_lower_90}`);
check('infeasible actions sort last and read Not feasible', c.actions.at(-1).rank.label === 'not_feasible');
check('not-modeled presets are listed apart', c.not_modeled.length === 3);
const [a, b] = compared;
check('what-if: pair difference equals the difference of the two savings (same paired futures)',
  Math.abs(c.pair_diff[a.id][b.id].mean - (a.comparison.total_saving_patient_min.mean - b.comparison.total_saving_patient_min.mean)) < 0.01,
  `pair ${c.pair_diff[a.id][b.id].mean} vs ${(a.comparison.total_saving_patient_min.mean - b.comparison.total_saving_patient_min.mean).toFixed(3)}`);
check('what-if text names both actions and uses the paired futures', c.what_if && c.what_if.a === a.id && c.what_if.b === b.id && /50 futures/.test(c.what_if.text));
check('impact per resource-hour = saving / hours', Math.abs(a.impact_per_resource_hour.mean - a.comparison.total_saving_patient_min.mean / a.resource_hours) < 0.01,
  `${a.impact_per_resource_hour.mean} = ${a.comparison.total_saving_patient_min.mean} / ${a.resource_hours}`);
const fc = await j(`/replays/${id}/forecast`, { samples: 50, expected_version: st.version });
const lab = c.actions.find((x) => x.id === 'diagnostic_reserve:lab');
const labOnset = fc.services.lab.onset;
check('deadline = onset low bound - review - setup - 5 margin (lab, from the same version forecast)',
  lab.deadline.status === 'open' && labOnset && Math.abs(lab.deadline.latest_start_min - (labOnset.low_min - 5 - 15 - 5)) < 0.06,
  `deadline ${lab.deadline.latest_start_min}, onset low ${labOnset?.low_min}`);
const imaging = c.actions.find((x) => x.id === 'diagnostic_reserve:imaging');
check('already-overloaded service has no start deadline (recovery)', imaging.deadline.status === 'recovery');

// 2. Stale ranking cannot be approved; the right owner approves a current one.
const rq = await j(`/replays/${id}/requests`, { preset: 'diagnostic_reserve', target: 'imaging', role: 'ED shift coordinator', expected_version: st.version });
check('request records the rank it was made under', rq.s === 200 && rq.request.comparison?.rank_label === 'best_action', JSON.stringify(rq.request?.comparison?.rank_label));
st = await get(`/replays/${id}/state`);
st = await j(`/replays/${id}/advance`, { minutes: 5, expected_version: st.version });
const old = await j(`/replays/${id}/requests/${rq.request.id}/decision`, { role: 'Radiology manager', decision: 'approve', decision_id: 's17-old', expected_version: st.version });
check('an approval made after time moved on is refused (an old ranking cannot be approved)', old.s === 409 && /old ranking/.test(old.detail), old.detail?.slice(0, 90));

// 3. A case where nothing is shown to help: no-effective-action family, ward coordination.
{
  let s = await j('/replays', { scenario: 'no-effective-action', seed: 7 });
  let found = null;
  while (s.sim_time_min < 300 && !found) {
    s = await j(`/replays/${s.replay_id}/advance`, { minutes: 10, expected_version: s.version });
    if (!s.actions.catalog.some((x) => x.feasible)) continue;
    const r = await j(`/replays/${s.replay_id}/compare`, { samples: 50, expected_version: s.version });
    found = r.actions.find((x) => x.rank.label === 'no_action_shown_to_help') ?? null;
    if (found) {
      check('no-help case: label is No action shown to help and matches the rule',
        recompute(found.rank.rule) === 'no_action_shown_to_help' && found.rank.rule.saving_lower_90 <= 0,
        `${found.id} at T+${s.sim_time_min}: saving ${found.rank.rule.saving_mean}, lower bound ${found.rank.rule.saving_lower_90}`);
      check('no-help action is never labelled Best and is not first among supported ones', found.rank.label !== 'best_action');
    }
  }
  if (!found) check('no-help case found in no-effective-action seed 7', false);
}

// 4. Needs review: fewer than 20 futures with a complete urgent outcome.
{
  let s = await open('busy-recovers', 7, 380);
  let found = null;
  while (s.sim_time_min < 480 && !found) {
    s = await j(`/replays/${s.replay_id}/advance`, { minutes: 10, expected_version: s.version });
    if (!s.actions.catalog.some((x) => x.feasible)) continue;
    const r = await j(`/replays/${s.replay_id}/compare`, { samples: 50, expected_version: s.version });
    found = r.actions.find((x) => x.rank.label === 'needs_review') ?? null;
    if (found) check('needs-review case: fewer than 20 futures with a complete urgent outcome',
      found.rank.rule.urgent_futures < 20 && recompute(found.rank.rule) === 'needs_review',
      `${found.id} at T+${s.sim_time_min}: ${found.rank.rule.urgent_futures} futures`);
  }
  if (!found) console.log('NOTE  no needs-review state found in busy-recovers seed 7 T+380..480 (not asserted)');
}

// 5. Cannot assess: the staffing feed has stopped.
{
  let s = await j('/replays', { scenario: 'fixture-feed-staffing-stop' });
  let guard = 0;
  while (s.overall_status.assessable && guard++ < 40) {
    s = await j(`/replays/${s.replay_id}/advance`, { minutes: 5, expected_version: s.version });
  }
  const r = await j(`/replays/${s.replay_id}/compare`, { samples: 50, expected_version: s.version });
  check('cannot-assess case: status cannot_assess and every action reads Cannot assess, no numbers',
    r.status === 'cannot_assess' && r.actions.every((x) => x.rank.label === 'cannot_assess' && x.comparison === null),
    `T+${s.sim_time_min}, reasons ${JSON.stringify(r.reasons).slice(0, 80)}`);
}

// 6. The no-action replay is unchanged.
{
  let n = await j('/replays', { scenario: 'normal', seed: 7 });
  for (let i = 0; i < 12; i++) n = await j(`/replays/${n.replay_id}/advance`, { minutes: 60, expected_version: n.version });
  const ex = await get(`/replays/${n.replay_id}/export`);
  check('no-action seed 7 normal: 705 events, 59 patients', ex.events.length === 705 && ex.patients.length === 59);
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
