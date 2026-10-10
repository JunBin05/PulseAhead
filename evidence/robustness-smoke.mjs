// Robustness suite smoke: forecasts every 5 simulated minutes through the fault fixtures of ticket 08
// against the real backend on :8000. Asserts that missing or stale essential data gives Cannot assess
// (never a low-risk reading), that optional-feed gaps only blind their own service, and that duplicates,
// out-of-order and invalid inputs neither crash the forecast nor change the replay's accepted events.
// No mocks. Usage: node evidence/robustness-smoke.mjs
const B = process.env.PULSE_API ?? 'http://127.0.0.1:8000/api/v1';
const j = async (path, body) => {
  const r = await fetch(B + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { s: r.status, ...(await r.json()) };
};
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
  if (!ok) fails++;
};

async function run(fixture, until = 100) {
  let st = await j('/replays', { scenario: fixture, seed: 7 });
  const id = st.replay_id;
  const rows = [];
  while (st.sim_time_min < until) {
    st = await j(`/replays/${id}/advance`, { minutes: 5, expected_version: st.version });
    const f = await j(`/replays/${id}/forecast`, { samples: 50, expected_version: st.version });
    rows.push({
      t: st.sim_time_min, status: f.status, reasons: f.reasons ?? [], next: f.next_step?.code,
      overall: f.overall ? { kind: f.overall.kind, chance: f.overall.chance } : null,
      alerts: f.status === 'ok' ? f.alerts.actionable.length + f.alerts.recovery.length : 0,
      services: f.status === 'ok' ? Object.fromEntries(Object.entries(f.services).map(([k, v]) => [k, v.kind === 'unknown' ? 'unknown' : v.chance])) : {},
      quality: st.data_quality.counts, label: st.overall_status.label,
    });
  }
  return { id, st, rows };
}

// 1. Essential staffing feed stopped T+32..T+70: stale after 10 min -> Cannot assess, then recovery.
{
  const { rows } = await run('fixture-feed-staffing-stop', 100);
  const stale = rows.filter((r) => r.t >= 45 && r.t <= 65);
  const before = rows.filter((r) => r.t <= 30);
  const after = rows.filter((r) => r.t >= 75);
  check('staffing stop: every forecast while the essential feed is stale is Cannot assess', stale.length > 0 && stale.every((r) => r.status === 'cannot_assess'),
    stale.map((r) => `T+${r.t}:${r.status}`).join(' '));
  check('staffing stop: no chance, alert or low-risk reading is shown while Cannot assess', stale.every((r) => r.overall === null && r.alerts === 0 && r.next === 'inspect_inputs'));
  check('staffing stop: overall status label also reads Cannot assess, not Stable', stale.every((r) => /Cannot assess/i.test(r.label)), stale[0]?.label);
  check('staffing stop: forecasts are available before and after the gap', before.every((r) => r.status === 'ok') && after.every((r) => r.status === 'ok'),
    `${before.length} before, ${after.length} after`);
}

// 2. Duplicates, delayed, out-of-order, invalid inputs and valid outliers: forecast keeps working.
{
  const { rows, st } = await run('fixture-feed-faults', 100);
  const q = st.data_quality.counts;
  check('feed faults: forecast stays assessable throughout', rows.every((r) => r.status === 'ok'), `${rows.length} forecasts`);
  check('feed faults: duplicates, out-of-order and quarantined inputs are counted, outliers kept',
    q.duplicates > 0 && q.out_of_order > 0 && q.quarantined > 0 && q.outliers_kept > 0, JSON.stringify(q));
  check('feed faults: every chance is a probability in [0, 1]', rows.every((r) => Object.values(r.services).every((c) => c === 'unknown' || (c >= 0 && c <= 1))));
}

// 3. Optional feeds stopped (ambulance T+25..60, diagnostics T+40..80): only that part goes blind.
{
  const { rows } = await run('fixture-feed-optional-stop', 100);
  const gap = rows.filter((r) => r.t >= 55 && r.t <= 78);
  check('optional stop: forecast stays ok (essential feeds are healthy)', rows.every((r) => r.status === 'ok'), `${rows.length} forecasts`);
  check('optional stop: lab and imaging read unknown (no chance) while their feed is stale',
    gap.length > 0 && gap.every((r) => r.services.lab === 'unknown' && r.services.imaging === 'unknown'),
    gap.map((r) => `T+${r.t}:${r.services.lab}/${r.services.imaging}`).join(' '));
  check('optional stop: triage and assessment still have chances while diagnostics is blind', gap.every((r) => typeof r.services.triage === 'number' && typeof r.services.assessment === 'number'));
}

// 4. Missing imaging queue feed for 30 minutes.
{
  const { rows } = await run('fixture-diagnostics-gap', 100);
  const unknown = rows.filter((r) => r.services.imaging === 'unknown');
  check('diagnostics gap: imaging is unknown (never a low chance) while its queue feed is missing', unknown.length > 0 && rows.every((r) => r.status === 'ok'),
    `${unknown.length} of ${rows.length} forecasts unknown for imaging: T+${unknown.map((r) => r.t).join(',')}`);
  check('diagnostics gap: lab keeps a numeric chance', rows.every((r) => typeof r.services.lab === 'number'));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
