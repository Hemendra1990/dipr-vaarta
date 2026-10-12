// Prints, for every seed dataset, which divisions / districts / taluks have no rows.
// Usage: node tools/seed-coverage.mjs [seed-dir] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const dir = args.find(a => !a.startsWith('--')) || path.join(here, '..', 'backend', 'src', 'main', 'resources', 'seed');
const load = n => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));

const ref = load('reference.json');
const DIVS = ref.divisions, TALUKS = ref.taluks;
const DIV_OF = {};
for (const [v, ds] of Object.entries(DIVS)) ds.forEach(d => (DIV_OF[d] = v));
const ALL_D = Object.values(DIVS).flat();
const STATE = new Set(['Statewide', 'State', '', null, undefined]);

// [name, rows, districtKey, talukKey]
const sets = [];
const regs = load('registers.json'), recs = load('records.json');
for (const r of regs) {
  if (r.geoAll) continue;
  sets.push([`register:${r.id}`, recs[r.id] || [], 'district', 'taluk']);
}
sets.push(['spend', load('spend.json'), 'district', 'taluk']);
sets.push(['claims', load('claims.json'), 'dist', 'taluk']);
sets.push(['feed', load('feed.json'), 'dist', 'taluk']);
sets.push(['ad-flags', load('ad-flags.json'), 'dist', 'taluk']);
sets.push(['releases', load('releases.json'), 'dist', 'taluk']);
sets.push(['outreach-base', load('outreach-base.json'), 'district', 'taluk']);

const report = { datasets: {}, budget: {} };
let lines = [];
const short = (arr, n = 12) => (arr.length <= n ? arr.join(', ') : arr.slice(0, n).join(', ') + ` … (+${arr.length - n})`);
const totalTaluks = Object.values(TALUKS).flat().length;

for (const [name, rows, dk, tk] of sets) {
  const byD = {}, byT = {};
  let statewide = 0, badTaluk = 0, supp = 0;
  for (const row of rows) {
    if (row.supplementary) supp++;
    const d = row[dk];
    if (STATE.has(d)) { statewide++; continue; }
    byD[d] = (byD[d] || 0) + 1;
    const t = row[tk];
    if (t) {
      if (!(TALUKS[d] || []).includes(t)) badTaluk++;
      else byT[d + '|' + t] = (byT[d + '|' + t] || 0) + 1;
    }
  }
  const divs = Object.keys(DIVS).filter(v => !DIVS[v].some(d => byD[d]));
  const dists = ALL_D.filter(d => !byD[d]);
  const tlks = [];
  for (const d of ALL_D) for (const t of TALUKS[d]) if (!byT[d + '|' + t]) tlks.push(`${t} (${d})`);
  report.datasets[name] = { rows: rows.length, supplementary: supp, statewide, divisions: divs, districts: dists, taluks: tlks, invalidTaluks: badTaluk };
  lines.push(`${name}: ${rows.length} rows (${statewide} statewide, ${supp} supplementary)` + (badTaluk ? `, ${badTaluk} INVALID taluks` : ''));
  lines.push(`  divisions with no rows: ${divs.length ? divs.join(', ') : 'none'}`);
  lines.push(`  districts with no rows: ${dists.length}/${ALL_D.length}${dists.length ? ' — ' + short(dists) : ''}`);
  lines.push(`  taluks with no rows:    ${tlks.length}/${totalTaluks}${tlks.length && tlks.length < totalTaluks ? ' — ' + short(tlks) : ''}`);
}

// Budget is set by department and channel (no geography): show the department × year pairs with no lines.
const budget = load('budget.json');
const fys = ref.fys, depts = ref.departments;
const have = new Set(budget.map(b => b.fy + '|' + b.department));
const missing = [];
for (const fy of fys) for (const d of depts) if (!have.has(fy + '|' + d)) missing.push(`${d} ${fy}`);
report.budget = { rows: budget.length, missingDepartmentYears: missing };
lines.push(`budget: ${budget.length} lines; department-years with no budget: ${missing.length ? missing.join(', ') : 'none'}`);

if (asJson) console.log(JSON.stringify(report, null, 1));
else console.log(lines.join('\n'));
