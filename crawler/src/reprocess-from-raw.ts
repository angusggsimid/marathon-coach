/**
 * Re-run quality + publishNormalize from already-scraped per-source JSON.
 * Does not hit the network.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RaceEvent } from './types.js';
import { evaluateRaceQuality } from './utils.js';
import {
  generateDuplicateReportMarkdown,
  publishNormalize,
} from './race-normalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'output');

const files = [
  'scraped-zuicool.json',
  'scraped-nowrun.json',
  'scraped-chinarun.json',
  'scraped-marathonbm.json',
];

const raw: RaceEvent[] = [];
for (const f of files) {
  const arr = JSON.parse(readFileSync(join(OUTPUT_DIR, f), 'utf8')) as RaceEvent[];
  raw.push(...arr);
  console.log(f, arr.length);
}

const kept: RaceEvent[] = [];
let rejected = 0;
for (const race of raw) {
  const r = evaluateRaceQuality(race);
  // evaluateRaceQuality 返回 { keep, issues }，不是 ok
  if (r.keep) kept.push(race);
  else rejected += 1;
}

const { races, duplicateReport, dateRejected } = publishNormalize(kept);
const ids = races.map(r => r.id);
const uniq = new Set(ids);

console.log({
  raw: raw.length,
  kept: kept.length,
  rejected,
  published: races.length,
  dateRejected: dateRejected.length,
  merges: duplicateReport.length,
  idCollisions: duplicateReport.filter(e => e.type === 'id-collision').length,
  uniqueIds: uniq.size,
  dupIds: ids.length - uniq.size,
});

writeFileSync(join(OUTPUT_DIR, 'scraped-races.json'), JSON.stringify(races, null, 2));
if (duplicateReport.length) {
  writeFileSync(
    join(OUTPUT_DIR, 'duplicate-report.md'),
    generateDuplicateReportMarkdown(duplicateReport),
  );
}
console.log('rewrote scraped-races.json');
console.log(
  '31836 family',
  races
    .filter(r => r.id.includes('31836'))
    .map(r => ({ id: r.id, name: r.name, date: r.date })),
);
