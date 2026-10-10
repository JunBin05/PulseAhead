// Six-beat demo smoke: runs the same calls as the Demo bar (frontend/src/Demo.tsx) against the real
// backend on :8000 and asserts what each beat claims, from API responses at one state version.
// No mocks. Usage: node evidence/demo-smoke.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = process.env.PULSE_API ?? 'http://127.0.0.1:8000/api/v1';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const j = async (path, body) => {
  const r = await fetch(B + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { s: r.status, ...(await r.json()) };
};
const get = async (p) => ({ s: 0, ...(await (await fetch(B + p)).json()) });
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
  if (!ok) fails++;
};
const COORD = 'ED shift coordinator';
const servers = (s, svc) => (svc === 'allocation' ? s.resources.disposition.allocation.servers : s.resources.diagnostics[svc].servers);
const queue = (s, svc) => (svc === 'allocation' ? s.resources.disposition.allocation.waiting : s.resources.diagnostics[svc].waiting);

// ---- The case ----------------------------------------------------------------------------------
const demo = await get('/demo/case');
if (demo.available) {
  check('case: available, a non-test seed, labelled a demo case',
    ['development', 'tuning', 'demo'].includes(demo.partition) && /not held-out/i.test(demo.label),
    `${demo.scenario} seed ${demo.seed} (${demo.partition}), service ${demo.service}, alert T+${demo.alert_time_min}`);
  check('case: the baseline is labelled retrospective and was read from a no-action replay',
    demo.retrospective.kind === 'retrospective_no_action_replay' && /retrospective/i.test(demo.retrospective.label) &&
    demo.retrospective.onset_min === demo.scan.onset_min,
    `onset T+${demo.retrospective.onset_min}, confirmed T+${demo.retrospective.confirmed_min}`);
}

if (!demo.available) {
  // Under the frozen settings no scanned case qualifies: the story must stop honestly, not invent an alert.
  check('case: unavailable is stated with its reason (no invented early warning)', demo.available === false && /No demo case qualified/.test(demo.reason), demo.reason.slice(0, 90));
}
if (demo.available) {
// ---- Beat A: start and current condition -----------------------------------------------------------
let st = await j('/replays', { scenario: demo.scenario, seed: demo.seed });
const id = st.replay_id;
const step = async (m) => { st = await j(`/replays/${id}/advance`, { minutes: m, expected_version: st.version }); return st; };
while (st.sim_time_min < demo.alert_time_min - 1e-6) await step(Math.min(30, demo.alert_time_min - st.sim_time_min));
check('beat A: replay is at the recorded alert time on the recorded seed', st.sim_time_min === demo.alert_time_min && st.seed === demo.seed && st.synthetic === true);
const v = st.version;
const overallLabel = st.overall_status.label;
check('beat A: counts and status come from /state (in ED, staffed spaces, overall label)',
  Number.isInteger(st.counts.in_ed) && typeof st.resources.ed_spaces.staffed_total === 'number' && typeof overallLabel === 'string',
  `${st.counts.in_ed} in ED, ${st.resources.ed_spaces.available_staffed}/${st.resources.ed_spaces.staffed_total} staffed spaces free, status "${overallLabel}"`);

// ---- Beat B: received pressures ---------------------------------------------------------------------
const f = await j(`/replays/${id}/forecast`, { samples: 50, expected_version: v });
const dr = await j(`/replays/${id}/demo/drivers`, { expected_version: v, samples: 50 });
check('beat B: forecast, drivers and state share one version', f.source.version === v && dr.source.version === v, `v${v}`);
check('beat B: the supported drivers match the scan (and two are not relabelled as three)',
  dr.supported_count === dr.drivers.length && JSON.stringify(dr.drivers.map((d) => d.id).sort()) === JSON.stringify([...demo.scan.drivers].sort()),
  dr.drivers.map((d) => d.id).join(', '));
for (const d of dr.drivers) {
  if (d.id === 'boarding') {
    const disp = st.resources.disposition;
    check('beat B: boarding evidence equals /state', d.evidence.boarding_patients === disp.boarding && d.evidence.free_beds.ward === disp.beds.ward.free);
  } else if (d.id === 'diagnostics') {
    check('beat B: diagnostics evidence equals /state and names the real service',
      d.evidence.services.every((x) => x.queue === st.resources.diagnostics[x.service].waiting && ['lab', 'imaging'].includes(x.service)),
      d.evidence.services.map((x) => `${x.name} queue ${x.queue}`).join('; '));
  } else if (d.id === 'arrivals') {
    const due = st.inbound_ambulances.filter((a) => ['en_route', 'delayed'].includes(a.status) && a.eta_min > st.sim_time_min && a.eta_min <= st.sim_time_min + 30);
    check('beat B: announced-arrival evidence equals /state (patients due within 30 min)',
      d.evidence.patients === due.reduce((n, a) => n + a.patient_count, 0), `${d.evidence.patients} patients on ${d.evidence.ambulances} ambulance(s)`);
  }
}

// ---- Beat C: predict, explain, baseline ---------------------------------------------------------------
const alert = f.alerts.actionable.find((a) => a.service === demo.service && a.kind === 'forecast_risk');
check('beat C: a forecast-risk alert (not Building, not Overloaded) exists for the case service at the alert time',
  !!alert && alert.state === 'normal' && alert.chance >= f.model.settings.warning_threshold,
  alert ? `${alert.name} ${Math.round(alert.chance * 100)}% (threshold ${f.model.settings.warning_threshold})` : 'none');
check('beat C: onset range is ordered and expected-in matches', alert.onset.low_in_min <= alert.onset.expected_in_min && alert.onset.expected_in_min <= alert.onset.high_in_min,
  `${alert.onset.expected_in_min} min (${alert.onset.low_in_min} to ${alert.onset.high_in_min})`);
check('beat C: scope is local; overall status is whatever was received', alert.zone === ({ space: 2, lab: 3, imaging: 3, allocation: 4, ward_beds: 4 })[demo.service] && f.overall !== null && overallLabel === st.overall_status.label,
  `overall "${overallLabel}", overall chance ${Math.round((f.overall?.chance ?? 0) * 100)}%`);
const rows = (f.waits?.diagnostic ?? []).filter((r) => r.phase === `awaiting_${demo.service}`);
check('beat C: predicted wait rows are forecasts (forecast minutes, p90 >= median where both exist), not elapsed waits',
  rows.every((r) => r.starts_in_run_chance !== undefined && (r.median_min === null || r.p90_min === null || r.p90_min >= r.median_min)),
  `${rows.length} patient(s) waiting for ${demo.service}: ${rows.map((r) => `${r.urgency} median ${r.median_min} p90 ${r.p90_min} (elapsed ${r.minutes_in_phase})`).join('; ')}`);
// The retrospective onset is cross-checked with an independent no-action replay of the same seed.
let ind = await j('/replays', { scenario: demo.scenario, seed: demo.seed });
while (ind.sim_time_min < demo.retrospective.confirmed_min + 5) ind = await j(`/replays/${ind.replay_id}/advance`, { minutes: 30, expected_version: ind.version });
const ep = (ind.pressure.episodes[demo.service] ?? []).find((e) => e.onset_min === demo.retrospective.onset_min);
check('beat C: the counts-based onset equals an independent no-action replay episode', !!ep && ep.confirmed_min === demo.retrospective.confirmed_min, `onset T+${ep?.onset_min}`);
const lead = demo.retrospective.onset_min - st.sim_time_min;
check('beat C: the forecast-risk alert preceded the counts onset by at least 30 min', lead >= 30, `lead ${lead} min (alert T+${st.sim_time_min}, onset T+${demo.retrospective.onset_min})`);

// ---- Beat D: fix first ---------------------------------------------------------------------------------
const cmp = await j(`/replays/${id}/compare`, { samples: 50, expected_version: v });
const listed = cmp.actions.filter((x) => x.comparison);
check('beat D: comparison is for the same version', cmp.source.version === v);
check('beat D: priority list ordered, every row labelled with its rule inputs and an impact per reserve unit-hour',
  listed.length >= 1 && listed.every((x, i) => x.order === i + 1 && x.rank.rule.saving_mean !== undefined && typeof x.impact_per_resource_hour.mean === 'number'),
  listed.map((x) => `#${x.order} ${x.id} ${x.rank.label}`).join('; '));
const top = listed[0];
const supported = top.rank.label === 'best_action' || top.rank.label === 'supported_not_top';
check('beat D: top action is supported by its own lower bound (no forced winner)',
  supported && top.rank.rule.saving_lower_90 > 0, `${top.id} lb ${top.rank.rule.saving_lower_90} (alert service ${demo.service})`);
check('beat D: a feasible, supported action exists for the alerted zone (the scan rule)', listed.some((x) => x.zone === alert.zone && ['best_action', 'supported_not_top'].includes(x.rank.label)), listed.filter((x) => x.zone === alert.zone).map((x) => x.id + ' ' + x.rank.label).join('; '));
check('beat D: deadline, owner and setup timing are present', !!top.deadline && top.owners.length === 1 && top.review_min > 0 && top.setup_min > 0,
  `${top.deadline.status}, latest start ${top.deadline.latest_start_min}, owner ${top.owners[0]}, review ${top.review_min} + setup ${top.setup_min}`);
if (cmp.what_if) check('beat D: what-if A vs B is paired on the same futures', cmp.what_if.difference_patient_min.n === 50, cmp.what_if.text.slice(0, 100));
else console.log('NOTE  only one action is feasible: no A-vs-B what-if at this moment');
const bedBlocked = st.actions.catalog.find((c) => !c.feasible && c.service === 'allocation');
console.log(`NOTE  ward coordination: ${bedBlocked ? bedBlocked.reasons[0] : 'feasible or not listed'}`);

// ---- Beat E: act and watch ------------------------------------------------------------------------------
const owner = top.owners[0];
const wrongOwner = ['ED attending lead', 'Ward supervisor / bed manager', 'Radiology manager', 'Lab manager'].find((o) => o !== owner);
const servers0 = servers(st, top.service);
const queue0 = queue(st, top.service);
const rq = await j(`/replays/${id}/requests`, { preset: top.preset, target: top.target, role: COORD, expected_version: st.version });
check('beat E: request routed to the resource owner', rq.s === 200 && rq.request.owners[0] === owner, owner);
const bad = await j(`/replays/${id}/requests/${rq.request.id}/decision`, { role: wrongOwner, decision: 'approve', decision_id: 'demo-wrong', expected_version: rq.state_version });
check('beat E: a wrong owner is refused (403)', bad.s === 403, `${wrongOwner}`);
const ok = await j(`/replays/${id}/requests/${rq.request.id}/decision`, { role: owner, decision: 'approve', decision_id: `demo-${rq.request.id}`, expected_version: rq.state_version });
check('beat E: the owner approves', ok.s === 200 && ok.request.status === 'approved');
st = await get(`/replays/${id}/state`);
const approvedAt = st.sim_time_min;
check('beat E: review stage, capacity unchanged', st.actions.in_flight.stage === 'review' && servers(st, top.service) === servers0, `capacity ${servers0}`);
while (st.actions.in_flight && st.actions.in_flight.stage !== 'active') await step(5);
check('beat E: capacity +1 only when active, exactly review + setup after approval',
  servers(st, top.service) === servers0 + 1 && Math.abs(st.sim_time_min - (approvedAt + top.review_min + top.setup_min)) < 1e-6,
  `${servers0} -> ${servers(st, top.service)} at T+${st.sim_time_min}; queue ${queue0} -> ${queue(st, top.service)}`);
while (st.actions.in_flight) await step(5);
check('beat E: capacity back after the window', servers(st, top.service) === servers0, `${servers(st, top.service)}`);
const ev = (await get(`/replays/${id}/events`)).events;
const kinds = ev.filter((e) => e.type.startsWith('action_')).map((e) => e.type);
check('beat E: every action event is in /events',
  ['action_requested', 'action_decision', 'action_approved', 'action_review', 'action_setup', 'action_active', 'action_draining', 'action_completed'].every((k) => kinds.includes(k)),
  kinds.join(' '));
const used = ev.filter((e) => e.type === 'test_completed' && e.payload.unit === top.reserve.unit).length;
console.log(`NOTE  reserve unit ${top.reserve.unit} completed ${used} test(s); observed ${top.service} queue ${queue0} at approval, ${queue(st, top.service)} at the end; model saving ${top.comparison.total_saving_patient_min.mean} (lb ${top.comparison.total_saving_patient_min.lower_90})`);

}
// ---- Beat F: evidence ------------------------------------------------------------------------------------
const lat = await get('/evaluations/latest');
const dir = join(ROOT, 'backend', 'saved_runs', 'evaluations');
const files = readdirSync(dir).filter((x) => x.endsWith('.json')).map((x) => JSON.parse(readFileSync(join(dir, x), 'utf8')));
const newest = files.filter((x) => x.status === 'done' && (x.partition ?? 'test') === 'test').sort((a, b) => (a.created < b.created ? 1 : -1))[0];
check('beat F: /evaluations/latest is the newest saved file, complete', lat.id === newest.id && lat.complete === true && lat.status === 'done', `${lat.id} ${lat.created}`);
const g = lat.results.aggregate;
check('beat F: episodes = early + late + missed; targets stated',
  g.episodes === g.early_warned + g.late_only + g.missed && g.target_false_warnings_per_shift === 1,
  `${g.episodes} = ${g.early_warned}+${g.late_only}+${g.missed}; false warnings ${g.false_warnings_per_shift}/shift`);
check('beat F: the latest evaluation is the frozen-settings held-out run on test seed index 1',
  lat.partition === 'test' && lat.seed_index === 1 && lat.results.settings.threshold_tuned === true && [0.4, 0.6, 0.8].includes(lat.results.settings.warning_threshold),
  `threshold ${lat.results.settings.warning_threshold}, reactive trigger ${lat.results.settings.reactive_trigger}, seeds ${lat.results.shifts.map((x) => x.seed).join(',')}`);
const tuned = JSON.parse(readFileSync(join(ROOT, 'evidence', 'tuning-results.json'), 'utf8')).chosen;
check('beat F: frozen settings equal the recorded tuning choice (no drift)',
  lat.results.settings.warning_threshold === tuned.warning_threshold && lat.results.settings.reactive_trigger === tuned.reactive_trigger,
  `threshold ${tuned.warning_threshold}, trigger ${tuned.reactive_trigger}`);
const rej = await j('/evaluations', { partition: 'test', seed_index: 0 });
check('beat F: a held-out run on the exposed test seed [0] is refused (422)', rej.s === 422, String(rej.detail).slice(0, 70));
check('beat F: three policies reported on the same shifts', ['no_action', 'reactive', 'pulseahead'].every((p) => g.policies[p]?.total_ed_patient_min > 0));
check('beat F: test-seed exposure is disclosed', /exposed|seen/i.test(lat.results.settings.exposure ?? ''), (lat.results.settings.exposure ?? '').slice(0, 70));
const exp = await get(`/evaluations/${lat.id}/export`);
check('beat F: the saved numbers equal the export of that evaluation id (when still in memory)', exp.id === lat.id ? exp.results.aggregate.episodes === g.episodes : true);

// ---- The no-action replay is unchanged ------------------------------------------------------------------
{
  let n = await j('/replays', { scenario: 'normal', seed: 7 });
  for (let i = 0; i < 12; i++) n = await j(`/replays/${n.replay_id}/advance`, { minutes: 60, expected_version: n.version });
  const ex = await get(`/replays/${n.replay_id}/export`);
  check('no-action seed 7 normal: 705 events, 59 patients', ex.events.length === 705 && ex.patients.length === 59);
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
