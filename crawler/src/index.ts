/**
 * index.ts — Main crawler runner
 *
 * Usage:
 *   npm run scrape                    # all sources → output/scraped-races.json
 *   npm run scrape:zuicool            # zuicool only
 *   npm run scrape:nowrun             # nowrun only
 *   npm run scrape:chinarun           # chinarun only
 *   npm run scrape:marathonbm         # marathonbm only
 *   npm run scrape:dry                # dry run (print, no file write)
 *   npm run scrape -- --limit 10      # limit to 10 races per source
 *   npm run scrape -- --details       # fetch zuicool detail pages for precise distances
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RaceEvent, ScrapeResult } from './types.js';
import { scrapeZuicool } from './scrapers/zuicool.js';
import { scrapeNowrun  } from './scrapers/nowrun.js';
import { scrapeChinarun } from './scrapers/chinarun.js';
import { scrapeMarathonbm } from './scrapers/marathonbm.js';
import { SOURCE_POLICIES, getSourcePolicy } from './sourcePolicies.js';
import { evaluateRaceQuality } from './utils.js';
import type { RaceQualityIssue } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'output');
const SUPPORTED_SOURCES = SOURCE_POLICIES.map(policy => policy.source);

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const sourceArg  = args.find(a => a.startsWith('--source='))?.split('=')[1]
                ?? (args.includes('--source') ? args[args.indexOf('--source') + 1] : null);
const limitArg   = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]
                ?? (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : 'Infinity'));
const dryRun     = args.includes('--dry-run');
const withDetails= args.includes('--details');
const verbose    = args.includes('--verbose') || args.includes('-v');

const limit = isNaN(limitArg) ? Infinity : limitArg;

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  if (sourceArg && !SUPPORTED_SOURCES.includes(sourceArg)) {
    throw new Error(`Unknown source "${sourceArg}". Supported sources: ${SUPPORTED_SOURCES.join(', ')}`);
  }

  console.log('═══ Marathon Race Crawler ═══');
  console.log(`Sources: ${sourceArg ?? 'all'} | Limit: ${limit} | Dry-run: ${dryRun}`);
  console.log();

  const results: ScrapeResult[] = [];

  if (!sourceArg || sourceArg === 'zuicool') {
    const r = await scrapeZuicool({ fetchDetails: withDetails, limit, verbose });
    results.push(r);
  }

  if (!sourceArg || sourceArg === 'nowrun') {
    const r = await scrapeNowrun({ limit, verbose });
    results.push(r);
  }

  if (!sourceArg || sourceArg === 'chinarun') {
    const r = await scrapeChinarun({ limit, verbose });
    results.push(r);
  }

  if (!sourceArg || sourceArg === 'marathonbm') {
    const r = await scrapeMarathonbm({ limit, verbose });
    results.push(r);
  }

  // ── Merge + deduplicate + quality gate ────────────────────────────────────
  const rawRaces = results.flatMap(r => r.races);
  const uniqueBeforeQuality = dedup(rawRaces).length;
  const quality = applyQualityGate(rawRaces);
  const allRaces = dedup(quality.kept);
  const totalErrors = results.flatMap(r => r.errors);
  const audit = buildCrawlerAudit(results, quality, allRaces, totalErrors);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log();
  console.log('─── Results ───────────────────────────────────────────');
  for (const r of results) {
    console.log(`  ${r.source.padEnd(10)} ${r.count} races, ${r.errors.length} errors`);
  }
  console.log(`  ${'RAW'.padEnd(10)} ${rawRaces.length} scraped races`);
  console.log(`  ${'UNIQUE'.padEnd(10)} ${uniqueBeforeQuality} before quality gate`);
  console.log(`  ${'TOTAL'.padEnd(10)} ${allRaces.length} publishable races`);
  if (quality.rejected.length > 0) {
    console.log(`  ${'DROPPED'.padEnd(10)} ${quality.rejected.length} quality rejects`);
    for (const [issue, count] of Object.entries(quality.byIssue)) {
      console.log(`    - ${issue}: ${count}`);
    }
  }
  if (totalErrors.length) {
    console.log(`\nErrors:`);
    totalErrors.forEach(e => console.log(`  ✗ ${e}`));
  }

  // ── Sample output ─────────────────────────────────────────────────────────
  console.log(`\nSample (first 5 races):`);
  allRaces.slice(0, 5).forEach(r => {
    console.log(`  ${r.date}  ${r.name}  [${r.distances.join('/')}]  ${r.city}, ${r.province}  ${r.status}`);
  });

  if (dryRun) {
    if (quality.rejected.length > 0) {
      console.log(`\nQuality sample (first 5 rejected):`);
      quality.rejected.slice(0, 5).forEach(({ race, issues }) => {
        console.log(`  ${race.date}  ${race.name}  [${issues.join(', ')}]`);
      });
    }
    console.log('\n[dry-run] No files written.');
    return;
  }

  // ── Write output ──────────────────────────────────────────────────────────
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const outPath = join(OUTPUT_DIR, 'scraped-races.json');
  writeFileSync(outPath, JSON.stringify(allRaces, null, 2), 'utf8');
  console.log(`\nWrote ${allRaces.length} races → ${outPath}`);

  const qualityReportPath = join(OUTPUT_DIR, 'quality-report.md');
  writeFileSync(qualityReportPath, generateQualityReport(quality, rawRaces.length, allRaces.length), 'utf8');
  console.log(`       quality report → ${qualityReportPath}`);

  const auditReportPath = join(OUTPUT_DIR, 'crawler-audit.md');
  writeFileSync(auditReportPath, generateCrawlerAuditReport(audit), 'utf8');
  console.log(`       crawler audit → ${auditReportPath}`);

  // Also write per-source files
  for (const r of results) {
    if (r.count === 0) continue;
    const p = join(OUTPUT_DIR, `scraped-${r.source}.json`);
    writeFileSync(p, JSON.stringify(r.races, null, 2), 'utf8');
    console.log(`       ${r.count} races → ${p}`);
  }

  // Write error log
  if (totalErrors.length) {
    const errPath = join(OUTPUT_DIR, 'errors.log');
    writeFileSync(errPath, totalErrors.join('\n'), 'utf8');
    console.log(`       ${totalErrors.length} errors → ${errPath}`);
  }
}

interface QualityRejected {
  race: RaceEvent;
  issues: RaceQualityIssue[];
}

interface QualityGateResult {
  kept: RaceEvent[];
  rejected: QualityRejected[];
  byIssue: Record<RaceQualityIssue, number>;
}

interface SourceAuditRow {
  source: string;
  raw: number;
  errors: number;
  keptBeforeDedup: number;
  publishedAfterDedup: number;
}

interface CrawlerAudit {
  generatedAt: string;
  sources: SourceAuditRow[];
  totalRaw: number;
  totalErrors: number;
  totalKeptBeforeDedup: number;
  totalPublished: number;
  totalRejected: number;
  issueCounts: Record<RaceQualityIssue, number>;
  errors: string[];
}

function applyQualityGate(races: RaceEvent[]): QualityGateResult {
  const kept: RaceEvent[] = [];
  const rejected: QualityRejected[] = [];
  const byIssue = {} as Record<RaceQualityIssue, number>;

  for (const race of races) {
    const result = evaluateRaceQuality(race);
    if (result.keep) {
      kept.push(race);
      continue;
    }

    rejected.push({ race, issues: result.issues });
    for (const issue of result.issues) {
      byIssue[issue] = (byIssue[issue] ?? 0) + 1;
    }
  }

  return { kept, rejected, byIssue };
}

function generateQualityReport(quality: QualityGateResult, totalBeforeQuality: number, totalPublishable: number): string {
  const lines = [
    '# Race Data Quality Report',
    `Generated: ${new Date().toLocaleString('zh-CN')}`,
    '',
    `- Before quality gate: ${totalBeforeQuality}`,
    `- Publishable races after dedup: ${totalPublishable}`,
    `- Rejected races: ${quality.rejected.length}`,
    '',
    '## Rejection Reasons',
    '',
    '| Reason | Count |',
    '|---|---:|',
  ];

  for (const [issue, count] of Object.entries(quality.byIssue).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${issue} | ${count} |`);
  }

  lines.push('', '## Rejected Samples', '');
  lines.push('| Date | Name | City | Province | Issues | Source |');
  lines.push('|---|---|---|---|---|---|');
  for (const { race, issues } of quality.rejected.slice(0, 120)) {
    lines.push(`| ${race.date} | ${race.name} | ${race.city} | ${race.province} | ${issues.join(', ')} | ${race._source ?? ''} |`);
  }

  return lines.join('\n');
}

function buildCrawlerAudit(
  results: ScrapeResult[],
  quality: QualityGateResult,
  published: RaceEvent[],
  errors: string[],
): CrawlerAudit {
  const keptBySource = countBySource(quality.kept);
  const publishedBySource = countBySource(published);
  const sources = results.map(result => ({
    source: result.source,
    raw: result.count,
    errors: result.errors.length,
    keptBeforeDedup: keptBySource[result.source] ?? 0,
    publishedAfterDedup: publishedBySource[result.source] ?? 0,
  }));

  return {
    generatedAt: new Date().toLocaleString('zh-CN'),
    sources,
    totalRaw: results.reduce((sum, result) => sum + result.count, 0),
    totalErrors: errors.length,
    totalKeptBeforeDedup: quality.kept.length,
    totalPublished: published.length,
    totalRejected: quality.rejected.length,
    issueCounts: quality.byIssue,
    errors,
  };
}

function countBySource(races: RaceEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const race of races) {
    const source = normalizePolicySource(race._source ?? 'unknown');
    counts[source] = (counts[source] ?? 0) + 1;
  }
  return counts;
}

function normalizePolicySource(source: string): string {
  if (source === 'zuicool-events') return 'zuicool';
  return source;
}

function generateCrawlerAuditReport(audit: CrawlerAudit): string {
  const lines = [
    '# Crawler Audit Report',
    `Generated: ${audit.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Raw scraped races: ${audit.totalRaw}`,
    `- Kept before dedup: ${audit.totalKeptBeforeDedup}`,
    `- Published after dedup: ${audit.totalPublished}`,
    `- Quality rejects: ${audit.totalRejected}`,
    `- Fetch errors: ${audit.totalErrors}`,
    '',
    '## Source Results',
    '',
    '| Source | Raw | Kept Before Dedup | Published | Errors |',
    '|---|---:|---:|---:|---:|',
  ];

  for (const row of audit.sources) {
    lines.push(`| ${escapeMd(row.source)} | ${row.raw} | ${row.keptBeforeDedup} | ${row.publishedAfterDedup} | ${row.errors} |`);
  }

  lines.push(
    '',
    '## Source Policies',
    '',
    '| Source | Public Pages | Allowed Data | Blocked Data | Request Policy | Default Scope |',
    '|---|---|---|---|---|---|',
  );

  for (const row of audit.sources) {
    const policy = getSourcePolicy(row.source);
    if (!policy) continue;
    lines.push([
      escapeMd(policy.source),
      escapeMd(policy.publicPages),
      escapeMd(policy.allowedData),
      escapeMd(policy.blockedData),
      escapeMd(policy.requestPolicy),
      escapeMd(policy.defaultScope),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push(
    '',
    '## Quality Rejects',
    '',
    '| Reason | Count |',
    '|---|---:|',
  );

  for (const [issue, count] of Object.entries(audit.issueCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${escapeMd(issue)} | ${count} |`);
  }

  lines.push(
    '',
    '## Guardrails',
    '',
    '- Only public pages and public SSR/page data are used.',
    '- No login, account data, payment data, or private user data is fetched.',
    '- Requests are bounded by default source scopes and per-source delays.',
    '- Raw scraped data must pass the quality gate before it can be published.',
    '- Fetch failures are written to `errors.log` instead of being hidden.',
  );

  if (audit.errors.length > 0) {
    lines.push('', '## Fetch Errors', '');
    for (const error of audit.errors.slice(0, 80)) {
      lines.push(`- ${escapeMd(error)}`);
    }
  }

  return lines.join('\n');
}

function escapeMd(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function dedup(races: RaceEvent[]): RaceEvent[] {
  const seen = new Map<string, RaceEvent>();

  for (const race of races) {
    // Dedup key: normalised name + date month
    const key = dedupKey(race);
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, withSources(race));
      continue;
    }

    // Merge: prefer 'open' status, keep more complete distances, retain source confirmations.
    const merged: RaceEvent = {
      ...existing,
      status: mergePriority(existing.status, race.status),
      distances: mergeDistances(existing.distances, race.distances),
      registrationUrl: existing.registrationUrl ?? race.registrationUrl,
      sources: mergeSources(existing, race),
    };
    seen.set(key, merged);
  }

  return Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function dedupKey(r: RaceEvent): string {
  // Normalise name for fuzzy matching:
  //   1. strip leading year "2026 "
  //   2. strip trailing sponsor/notes in brackets
  //   3. collapse whitespace
  //   4. normalise punctuation variants so e.g.
  //        "太湖—号公路" vs "太湖1号公路"  →  same key
  //        "第一届" vs "第1届"             →  same key
  const name = r.name
    .replace(/^\d{4}\s*/, '')
    .replace(/（[^）]{1,20}）$/, '')
    .replace(/\([^)]{1,20}\)$/, '')
    .replace(/\s/g, '')
    // full-width dash / em-dash / en-dash used as 'number one' → '1'
    .replace(/[—－–—–]/g, '1')
    // full-width digits → ASCII
    .replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xFF10))
    // Chinese number characters (一二三…) left as-is — too risky to normalise broadly
    .toLowerCase();
  const month = r.date.slice(0, 7);
  return `${name}|${month}`;
}

function withSources(race: RaceEvent): RaceEvent {
  return {
    ...race,
    sources: mergeSources(race),
  };
}

function mergeSources(...races: RaceEvent[]): string[] {
  const sources = new Set<string>();

  for (const race of races) {
    for (const source of race.sources ?? []) {
      sources.add(normalizeSource(source));
    }
    if (race._source) {
      sources.add(normalizeSource(race._source));
    }
  }

  return Array.from(sources).sort();
}

function normalizeSource(source: string): string {
  return source === 'zuicool-events' ? 'zuicool' : source;
}

const STATUS_PRIORITY: Record<string, number> = {
  open: 4, closed: 3, upcoming: 2, postponed: 1, cancelled: 0,
};

function mergePriority(
  a: RaceEvent['status'],
  b: RaceEvent['status'],
): RaceEvent['status'] {
  return (STATUS_PRIORITY[a] ?? 0) >= (STATUS_PRIORITY[b] ?? 0) ? a : b;
}

function mergeDistances(a: RaceEvent['distances'], b: RaceEvent['distances']): RaceEvent['distances'] {
  return [...new Set([...a, ...b])];
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
