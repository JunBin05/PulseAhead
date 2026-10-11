// Ticket 23 smoke check against the real backend. No mocks of the engine.
// Usage (from the repo root; start the server with the matching environment first):
//   MODE=stub  PULSE_API=http://127.0.0.1:8010/api/v1 node evidence/23-smoke.mjs
//        server: PULSEAHEAD_ANALYST_STUB=../evidence/23-stub-analyst.json (validator boundary check, no network)
//   MODE=nokey ... server: no GROQ_API_KEY and no stub (graceful degradation)
//   MODE=live  ... server: a real GROQ_API_KEY (real model output; checks structure, not wording)
const B = process.env.PULSE_API ?? 'http://127.0.0.1:8000/api/v1';
const MODE = process.env.MODE ?? 'stub';
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
const clinical = /diagnos|prescrib|antibiotic|patient G3/i;

// 1. Declared reserves and presets exist; cleared discharge is no longer "not modeled".
let st = await j('/replays', { scenario: 'busy-recovers', seed: 7 });
const id = st.replay_id;
const ids = st.actions.catalog.map((c) => c.id);
check('catalog lists transport and discharge presets',
  ids.includes('transport_coordination:transport') && ids.includes('discharge_support:discharge'), ids.join());
check('transport/discharge owned by Ward supervisor / bed manager',
  st.actions.catalog.filter((c) => ['transport', 'discharge'].includes(c.service))
    .every((c) => c.owners.join() === 'Ward supervisor / bed manager'));
check('cleared_discharge removed from not-modeled', !st.actions.not_modeled.some((n) => n.id === 'cleared_discharge'));

// 2. Advance to a state where decided patients are waiting for transport.
let guard = 0;
const tcOf = (s) => s.actions.catalog.find((c) => c.id === 'transport_coordination:transport');
while (!tcOf(st).feasible && st.sim_time_min < 470 && guard++ < 200) {
  st = await j(`/replays/${id}/advance`, { minutes: 5, expected_version: st.version });
}
check('transport preset becomes feasible when decided patients wait for transport', tcOf(st).feasible,
  `T+${st.sim_time_min}`);

// 3. The simulator prices the new preset like any other.
const c = await j(`/replays/${id}/compare`, { samples: 50, expected_version: st.version });
const row = c.actions.find((a) => a.id === 'transport_coordination:transport');
check('comparison row carries paired numbers and a rank label for transport',
  !!(row && row.comparison && row.rank && row.rank.label), row?.rank?.label);

// 4. Analysis.
const a = await j(`/replays/${id}/analysis`, { samples: 50, expected_version: st.version });
check('analysis returns kind=analysis for this version', a.s === 200 && a.kind === 'analysis' && a.source.version === st.version);
check('disclaimer present, synthetic', typeof a.disclaimer === 'string' && a.synthetic === true);
const stale = await j(`/replays/${id}/analysis`, { samples: 50, expected_version: st.version - 1 });
check('stale expected_version -> 409', stale.s === 409);

if (MODE === 'nokey') {
  check('no key -> status unavailable (or labeled recorded), not an error', a.status === 'unavailable' || a.status === 'recorded', a.status);
  check('comparison is still available when the analyst is not', !!(row && row.comparison));
  if (a.status === 'unavailable') {
    check('no causes or proposals invented', a.causes.length === 0 && a.structured_proposals.length === 0 && a.untested_ideas.length === 0);
  }
} else {
  check('status ok', a.status === 'ok', a.status + (a.reason ? ' ' + a.reason : ''));
  check('every cause has a valid citation, or is unknown',
    a.causes.length > 0 && a.causes.every((x) => x.confidence === 'unknown' || x.cited.length > 0));
  check('invalid citations are removed from `cited`', a.causes.every((x) => !x.cited.includes('service.nonexistent.queue')));
  check('every structured proposal carries the simulator rank and comparison',
    a.structured_proposals.every((p) => p.rank && p.rank.label && p.comparison));
  check('untested ideas carry no comparison, rank or effect numbers',
    a.untested_ideas.every((p) => p.comparison === undefined && p.rank === undefined &&
      !/\d+\s*(%|min)/.test(p.title + p.rationale)));
  check('no clinical-decision wording survives',
    ![...a.causes.map((x) => x.statement), ...a.untested_ideas.map((x) => x.title + x.rationale),
      ...a.structured_proposals.map((x) => x.title + x.rationale)].some((t) => clinical.test(t)));
  if (MODE === 'stub') {
    check('uncited "supported" cause is downgraded to unknown',
      a.causes.some((x) => /second pressure/.test(x.statement) && x.confidence === 'unknown'));
    check('clinical cause rejected and listed', a.rejected.some((r) => /Clinical/.test(r.reason)));
    check('effect-size idea rejected', a.rejected.some((r) => /effect size/.test(r.reason)));
    check('transport proposal priced; infeasible allocation proposal demoted to untested',
      a.structured_proposals.some((p) => p.catalog_id === 'transport_coordination:transport') &&
      !a.structured_proposals.some((p) => p.catalog_id === 'ward_coordination:allocation') &&
      a.untested_ideas.some((p) => /allocation coordinator/.test(p.title)));
    check('operational idea mentioning day surgery is kept, not mistaken for a clinical decision',
      a.untested_ideas.some((p) => /day surgery/.test(p.title)));
    check('combination is an untested idea', a.untested_ideas.some((p) => /together/.test(p.title)));
    const p = a.structured_proposals.find((x) => x.catalog_id === 'transport_coordination:transport');
    check('proposal rank equals the comparison row rank (the model cannot set it)',
      !!p && p.rank.label === row.rank.label, `${p?.rank.label} vs ${row.rank.label}`);
    // 5. Approval routes from resource ownership, not the model.
    const req = await j(`/replays/${id}/requests`, { preset: p.preset, target: p.target, expected_version: st.version });
    check('request for the proposal routes to the resource owner',
      req.s === 200 && req.request.owners.join() === 'Ward supervisor / bed manager', `${req.s} ${req.detail ?? ''}`);
  }
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
