// Ticket 18 (merged with 19, reduced) smoke against the real backend on :8000. No mocks.
// Starts one evaluation (7 shifts, background job), waits for it, and recomputes one shift's numbers from
// the exported records. Usage: node evidence/18-smoke.mjs   (takes a few minutes)
const B = process.env.PULSE_API ?? 'http://127.0.0.1:8000/api/v1';
const j = async (path, body) => {
  const r = await fetch(B + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
  });
  return { s: r.status, ...(await r.json()) };
};
const get = async (p) => ({ ...(await (await fetch(B + p)).json()) });
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
  if (!ok) fails++;
};
const WARMUP = 120, END = 600, STEP = 15, HORIZON = 90;

const started = await j('/evaluations', {});
check('evaluation started as a background job', started.s === 200 && started.status === 'running' && started.families_total === 7, started.id);
const dup = await j('/evaluations', {});
check('a second evaluation while one runs -> 409', dup.s === 409);
let sawPartial = false;
let cur = started;
const t0 = Date.now();
while (cur.status === 'running' && Date.now() - t0 < 25 * 60 * 1000) {
  await new Promise((r) => setTimeout(r, 4000));
  cur = await get(`/evaluations/${started.id}`);
  if (cur.status === 'running' && cur.families_done > 0 && cur.families_done < 7) {
    sawPartial = sawPartial || (cur.complete === false && /Unfinished/.test(cur.label));
  }
  process.stdout.write(`  ${cur.families_done}/${cur.families_total} ${cur.current ? cur.current.family + ':' + cur.current.stage + '@' + cur.current.sim_time_min : ''}\r`);
}
console.log('');
check('job finished', cur.status === 'done', `${cur.status} in ${cur.elapsed_s}s ${cur.error ?? ''}`);
check('unfinished work never looked complete while running', sawPartial || cur.families_total === 7);
check('7 shifts, one held-out test seed each', cur.results.shifts.length === 7 && cur.results.shifts.every((s) => s.seed >= 2000),
  cur.results.shifts.map((s) => `${s.family}:${s.seed}`).join(' '));
check('labelled synthetic, descriptive only, threshold untuned', /descriptive only/.test(cur.label) && cur.results.settings.threshold_tuned === false && cur.results.settings.warning_threshold === 0.4);

const ex = await get(`/evaluations/${started.id}/export`);
check('export carries format, settings and every shift', ex.format === 'pulseahead-evaluation' && ex.results.shifts.length === 7);

// Recompute one shift from its exported records.
const shift = ex.results.shifts.find((s) => s.family === 'diagnostic-delay') ?? ex.results.shifts[0];
const totals = {};
for (const pol of ['no_action', 'reactive', 'pulseahead']) {
  const rows = shift.records[pol];
  const total = rows.reduce((a, r) => a + ((r.departure ?? END) - r.arrival), 0);
  const unfinished = rows.filter((r) => r.departure === null).length;
  const urgent = rows.filter((r) => r.urgency === 'urgent');
  const wait = urgent.length ? urgent.reduce((a, r) => a + ((r.first_assessment ?? END) - r.arrival), 0) / urgent.length : null;
  const m = shift.policies[pol];
  totals[pol] = total;
  check(`${shift.family}: ${pol} total ED patient-min, unfinished stays and urgent wait recompute from records`,
    Math.abs(total - m.total_ed_patient_min) < 0.5 && unfinished === m.unfinished_stays &&
    (wait === null ? m.urgent_initial_wait_mean_min === null : Math.abs(wait - m.urgent_initial_wait_mean_min) < 0.01),
    `${total.toFixed(1)} vs ${m.total_ed_patient_min}; unfinished ${unfinished}`);
}
check('every record is in the scored window', Object.values(shift.records).flat().every((r) => r.arrival >= WARMUP && r.arrival < END));
// Forecast matching, recomputed with the stated rule.
const eps = shift.forecast.episodes_all.filter((e) => e.onset >= WARMUP && e.onset < END);
const w = shift.forecast.warnings;
let early = 0, late = 0, missed = 0;
for (const e of eps) {
  const earlyW = w.filter((x) => x.key === e.key && x.kind === 'forecast_risk' && x.t < e.onset && e.onset <= x.t + HORIZON);
  const bld = w.filter((x) => x.key === e.key && x.kind === 'building' && e.onset <= x.t && (e.confirmed === null || x.t < e.confirmed));
  if (earlyW.length) early++; else if (bld.length) late++; else missed++;
}
const f = shift.forecast.episodes;
check(`${shift.family}: early / late-only / missed episode counts recompute from warnings and episodes`,
  f.length === eps.length && f.filter((e) => e.result === 'early_warned').length === early &&
  f.filter((e) => e.result === 'late_only').length === late && f.filter((e) => e.result === 'missed').length === missed,
  `${eps.length} episodes: ${early} early, ${late} late-only, ${missed} missed`);
// False-warning runs recomputed.
let runs = 0, falseRuns = 0;
for (const k of new Set(w.filter((x) => x.kind === 'forecast_risk').map((x) => x.key))) {
  const ts = w.filter((x) => x.key === k && x.kind === 'forecast_risk' && x.t >= WARMUP && x.t <= END).map((x) => x.t).sort((a, b) => a - b);
  let run = [];
  for (const t of [...ts, null]) {
    if (run.length && (t === null || t - run.at(-1) > STEP + 1e-9)) {
      runs++;
      if (!shift.forecast.episodes_all.some((e) => e.key === k && run[0] < e.onset && e.onset <= run.at(-1) + HORIZON)) falseRuns++;
      run = [];
    }
    if (t !== null) run.push(t);
  }
}
check(`${shift.family}: warning runs and false-warning runs recompute`, runs === shift.forecast.warning_runs && falseRuns === shift.forecast.false_warning_runs,
  `${runs} runs, ${falseRuns} false`);
// Aggregate agrees with the per-shift numbers.
const agg = ex.results.aggregate;
const sumFalse = ex.results.shifts.reduce((a, s) => a + s.forecast.false_warning_runs, 0);
check('aggregate false warnings per shift = total / 7', Math.abs(agg.false_warnings_per_shift - sumFalse / 7) < 0.01, `${agg.false_warnings_per_shift} (target <= ${agg.target_false_warnings_per_shift})`);
check('aggregate policy totals equal the sum of shifts', ['no_action', 'reactive', 'pulseahead'].every((p) =>
  Math.abs(agg.policies[p].total_ed_patient_min - ex.results.shifts.reduce((a, s) => a + s.policies[p].total_ed_patient_min, 0)) < 0.6));
// Unfavourable results are kept: print them.
for (const pol of ['reactive', 'pulseahead']) {
  const d = agg.saving_vs_no_action_by_shift[pol];
  console.log(`NOTE  ${pol} vs no action: better ${d.better}, worse ${d.worse}, same ${d.same}; per shift ${d.per_shift_patient_min.join(', ')}`);
}
console.log(`NOTE  episodes ${agg.episodes}: early ${agg.early_warned}, late-only ${agg.late_only}, missed ${agg.missed}; lead ${JSON.stringify(agg.lead_min)}; false warnings/shift ${agg.false_warnings_per_shift}`);

// Cancel works: start another job and cancel it quickly.
const j2 = await j('/evaluations', {});
await new Promise((r) => setTimeout(r, 1500));
await j(`/evaluations/${j2.id}/cancel`, {});
let c2 = await get(`/evaluations/${j2.id}`);
const tc = Date.now();
while (c2.status === 'running' && Date.now() - tc < 60000) { await new Promise((r) => setTimeout(r, 1000)); c2 = await get(`/evaluations/${j2.id}`); }
check('cancel stops the job and it is not presented as complete', c2.status === 'cancelled' && c2.complete === false && /Unfinished/.test(c2.label), c2.status);

{
  let n = await j('/replays', { scenario: 'normal', seed: 7 });
  for (let i = 0; i < 12; i++) n = await j(`/replays/${n.replay_id}/advance`, { minutes: 60, expected_version: n.version });
  const e = await get(`/replays/${n.replay_id}/export`);
  check('no-action seed 7 normal: 705 events, 59 patients', e.events.length === 705 && e.patients.length === 59);
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
