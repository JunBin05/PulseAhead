// Frozen-settings evaluation on the four non-test, non-tuning `demo` seeds of every family (28 shifts).
// These seeds were never used to choose the threshold or the reactive trigger, and they are not the held-out
// test partition, so this is extra out-of-sample evidence with a spread. Descriptive only. No mocks.
// Usage: node evidence/demo-partition-eval.mjs   (about 7 minutes)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = process.env.PULSE_API ?? 'http://127.0.0.1:8000/api/v1';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'demo-partition-eval.md');
const post = async (p, b) => (await fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
const get = async (p) => (await fetch(B + p)).json();

const jobs = [];
for (let idx = 0; idx < 4; idx++) {
  const s = await post('/evaluations', { partition: 'demo', seed_index: idx });
  if (!s.id) throw new Error('start failed: ' + JSON.stringify(s));
  let cur = s;
  while (cur.status === 'running') {
    await new Promise((r) => setTimeout(r, 4000));
    cur = await get(`/evaluations/${s.id}`);
  }
  if (cur.status !== 'done') throw new Error(`job ${idx} ${cur.status}`);
  jobs.push(cur);
  console.log(`seed index ${idx}: ${cur.id} done in ${cur.elapsed_s}s`);
}
const shifts = jobs.flatMap((j) => j.results.shifts);
const eps = shifts.flatMap((s) => s.forecast.episodes);
const leads = eps.map((e) => e.lead_min).filter((x) => x !== null).sort((a, b) => a - b);
const falseRuns = shifts.reduce((a, s) => a + s.forecast.false_warning_runs, 0);
const pol = (n) => shifts.reduce((a, s) => a + s.policies[n].total_ed_patient_min, 0);
const better = (n) => shifts.filter((s) => s.policies.no_action.total_ed_patient_min - s.policies[n].total_ed_patient_min > 0).length;
const beats = shifts.filter((s) => s.policies.pulseahead.total_ed_patient_min < s.policies.reactive.total_ed_patient_min).length;
const lines = [
  '# Frozen-settings evaluation on the non-test `demo` seeds (28 shifts)', '',
  `Threshold ${jobs[0].results.settings.warning_threshold}, reactive trigger ${jobs[0].results.settings.reactive_trigger}; ` +
    'seeds never used for tuning and not the held-out test partition. Descriptive only, one run per seed.', '',
  `- Episodes ${eps.length}: early ${eps.filter((e) => e.result === 'early_warned').length} ` +
    `(30+ min lead ${leads.filter((x) => x >= 30).length}), late only ${eps.filter((e) => e.result === 'late_only').length}, ` +
    `missed ${eps.filter((e) => e.result === 'missed').length}; median lead ${leads[Math.floor(leads.length / 2)] ?? 'n/a'} min.`,
  `- False warnings per shift: ${(falseRuns / shifts.length).toFixed(2)} (target at most 1).`,
  `- Total ED patient-min: no action ${pol('no_action').toFixed(1)}, reactive ${pol('reactive').toFixed(1)}, PulseAhead ${pol('pulseahead').toFixed(1)}.`,
  `- Better than no action: reactive in ${better('reactive')}, PulseAhead in ${better('pulseahead')} of ${shifts.length} shifts; ` +
    `PulseAhead below reactive in ${beats} of ${shifts.length} shifts.`,
  '', '| Seed index | Evaluation id | Early | Late | Missed | False runs | PulseAhead | Reactive | No action |', '|---|---|---|---|---|---|---|---|---|',
];
jobs.forEach((j, i) => {
  const a = j.results.aggregate;
  lines.push(`| ${i} | ${j.id} | ${a.early_warned} | ${a.late_only} | ${a.missed} | ${Math.round(a.false_warnings_per_shift * 7)} | ` +
    `${a.policies.pulseahead.total_ed_patient_min} | ${a.policies.reactive.total_ed_patient_min} | ${a.policies.no_action.total_ed_patient_min} |`);
});
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(lines.join('\n'));
