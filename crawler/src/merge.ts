/**
 * merge.ts — Diff scraped races against the existing races.ts seed data.
 *
 * Reads:
 *   output/scraped-races.json   (from `npm run scrape`)
 *   ../src/data/races.ts        (existing hand-curated seed)
 *
 * Outputs:
 *   output/merge-report.md      Human-readable diff (new / updated / unchanged)
 *   output/new-races.ts         TypeScript snippet ready to paste into races.ts
 *
 * Run: npm run merge
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RaceEvent } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR  = join(__dirname, '..', 'output');
const SCRAPED_PATH = join(OUTPUT_DIR, 'scraped-races.json');
const RACES_TS     = join(__dirname, '../../src/data/races.ts');

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // 1. Load scraped data
  let scraped: RaceEvent[];
  try {
    scraped = JSON.parse(readFileSync(SCRAPED_PATH, 'utf8')) as RaceEvent[];
    console.log(`Loaded ${scraped.length} scraped races from ${SCRAPED_PATH}`);
  } catch {
    console.error(`No scraped data found. Run 'npm run scrape' first.`);
    process.exit(1);
  }

  // 2. Extract existing races from races.ts (regex parse — avoids transpiling TS)
  const racesTs = readFileSync(RACES_TS, 'utf8');
  const existing = extractExistingRaces(racesTs);
  console.log(`Found ${existing.size} existing races in races.ts`);

  // 3. Classify each scraped race
  const newRaces:       RaceEvent[] = [];
  const updatedRaces:   Array<{ scraped: RaceEvent; reason: string }> = [];
  const unchangedRaces: RaceEvent[] = [];

  for (const race of scraped) {
    const match = findMatch(race, existing);
    if (!match) {
      newRaces.push(race);
    } else {
      // Check if status changed
      if (match.status !== race.status && race.status === 'open') {
        updatedRaces.push({
          scraped: race,
          reason: `status: ${match.status} → ${race.status}`,
        });
      } else {
        unchangedRaces.push(race);
      }
    }
  }

  console.log(`\nDiff summary:`);
  console.log(`  New races:       ${newRaces.length}`);
  console.log(`  Status updates:  ${updatedRaces.length}`);
  console.log(`  Unchanged:       ${unchangedRaces.length}`);

  // 4. Generate TypeScript snippet for new races
  mkdirSync(OUTPUT_DIR, { recursive: true });

  if (newRaces.length > 0) {
    const ts = generateTsSnippet(newRaces);
    const tsPath = join(OUTPUT_DIR, 'new-races.ts');
    writeFileSync(tsPath, ts, 'utf8');
    console.log(`\nNew races TS snippet → ${tsPath}`);
  }

  // 5. Generate markdown report
  const report = generateReport(newRaces, updatedRaces, unchangedRaces.map(r => r.name));
  const reportPath = join(OUTPUT_DIR, 'merge-report.md');
  writeFileSync(reportPath, report, 'utf8');
  console.log(`Merge report       → ${reportPath}`);

  // 6. Write structured JSON for the validation dashboard
  const mergeData = {
    generatedAt: new Date().toISOString(),
    newRaces,
    updatedRaces,
    unchangedRaces,
  };
  const mergeDataPath = join(OUTPUT_DIR, 'merge-data.json');
  writeFileSync(mergeDataPath, JSON.stringify(mergeData, null, 2), 'utf8');
  console.log(`Merge data JSON    → ${mergeDataPath}`);
}

// ─── Extract existing races from races.ts ─────────────────────────────────────

interface ExistingRace {
  id:     string;
  name:   string;
  date:   string;
  status: string;
}

function extractExistingRaces(ts: string): Map<string, ExistingRace> {
  const map = new Map<string, ExistingRace>();

  // Match each race object block: { id: '...', name: '...', date: '...', ... }
  const blockRe = /\{\s*id:\s*'([^']+)'[\s\S]*?name:\s*'([^']+)'[\s\S]*?date:\s*'([^']+)'[\s\S]*?status:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(ts)) !== null) {
    const [, id, name, date, status] = m;
    map.set(normalKey(name, date), { id, name, date, status });
  }
  return map;
}

function normalKey(name: string, date: string): string {
  return `${name.replace(/\s/g, '')}|${date.slice(0, 7)}`;
}

// ─── Fuzzy match ──────────────────────────────────────────────────────────────

/** Normalise a name for comparison: strip year, punctuation, whitespace. */
function normName(s: string): string {
  return s
    .replace(/^\d{4}\s*/, '')           // strip leading year
    .replace(/（[^）]*）|\([^)]*\)/g, '')  // strip parenthetical notes
    .replace(/[·、，,·\s！!第届届]/g, '')   // strip separators / ordinal noise
    .toLowerCase();
}

function findMatch(race: RaceEvent, existing: Map<string, ExistingRace>): ExistingRace | null {
  const raceNorm = normName(race.name);
  const raceMonth = race.date.slice(0, 7);

  for (const [, ex] of existing) {
    const exNorm  = normName(ex.name);
    const exMonth = ex.date.slice(0, 7);

    // 1. Exact normalised name (any month — catches date corrections between sources)
    if (raceNorm === exNorm) return ex;

    // 2. Same ±1 month required for all other heuristics
    const [ry, rm] = raceMonth.split('-').map(Number);
    const [ey, em] = exMonth.split('-').map(Number);
    const monthDiff = Math.abs((ry * 12 + rm) - (ey * 12 + em));
    if (monthDiff > 1) continue;

    // 3. Containment: shorter name is a substring of longer
    //    e.g. "贵阳马拉松" ⊂ "2026多彩贵州马拉松…贵阳马拉松"
    const shorter = raceNorm.length <= exNorm.length ? raceNorm : exNorm;
    const longer  = raceNorm.length <= exNorm.length ? exNorm   : raceNorm;
    if (shorter.length >= 4 && longer.includes(shorter)) return ex;

    // 4. Character-set overlap ≥ 70% (same month ±1)
    if (charOverlap(raceNorm, exNorm) >= 0.70) return ex;
  }

  return null;
}

/** Fraction of characters shared between two strings (Jaccard on char sets). */
function charOverlap(a: string, b: string): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let common = 0;
  for (const ch of setA) if (setB.has(ch)) common++;
  return common / Math.max(setA.size, setB.size);
}

// ─── Generate TypeScript snippet ──────────────────────────────────────────────

function generateTsSnippet(races: RaceEvent[]): string {
  const lines = [
    `// Auto-generated by crawler/src/merge.ts on ${new Date().toISOString()}`,
    `// Review each entry before adding to src/data/races.ts`,
    ``,
  ];

  // Group by month
  let lastMonth = '';
  for (const r of races.sort((a, b) => a.date.localeCompare(b.date))) {
    const month = r.date.slice(0, 7);
    if (month !== lastMonth) {
      lines.push(`  // ── ${month} (crawled from ${r._source ?? 'unknown'}) ─────`);
      lastMonth = month;
    }

    const d = buildRaceObject(r);
    lines.push('  ' + d + ',');
  }

  return lines.join('\n');
}

function buildRaceObject(r: RaceEvent): string {
  const fields: string[] = [
    `id: '${r.id}'`,
    `name: '${r.name}'`,
    `date: '${r.date}'`,
    `city: '${r.city}', province: '${r.province}'`,
    `distances: [${r.distances.map(d => `'${d}'`).join(', ')}]`,
    `terrain: '${r.terrain}', label: null, status: '${r.status}'`,
  ];
  if (r.registrationUrl) fields.push(`registrationUrl: '${r.registrationUrl}'`);
  return `{\n    ${fields.join(',\n    ')},\n  }`;
}

// ─── Generate markdown report ─────────────────────────────────────────────────

function generateReport(
  newRaces: RaceEvent[],
  updated: Array<{ scraped: RaceEvent; reason: string }>,
  unchanged: string[],
): string {
  const lines = [
    `# Crawler Merge Report`,
    `Generated: ${new Date().toLocaleString('zh-CN')}`,
    ``,
  ];

  if (newRaces.length > 0) {
    lines.push(`## New Races (${newRaces.length})`, ``);
    lines.push(`| Date | Name | City | Distances | Status | Source |`);
    lines.push(`|------|------|------|-----------|--------|--------|`);
    for (const r of newRaces) {
      lines.push(
        `| ${r.date} | ${r.name} | ${r.city}, ${r.province} | ${r.distances.join('/')} | ${r.status} | ${r._source ?? ''} |`
      );
    }
    lines.push(``);
  }

  if (updated.length > 0) {
    lines.push(`## Status Updates (${updated.length})`, ``);
    lines.push(`| Date | Name | Change |`);
    lines.push(`|------|------|--------|`);
    for (const { scraped, reason } of updated) {
      lines.push(`| ${scraped.date} | ${scraped.name} | ${reason} |`);
    }
    lines.push(``);
  }

  lines.push(`## Unchanged: ${unchanged.length} races already in races.ts`);

  return lines.join('\n');
}

main();
