/**
 * Structured comparison: crawler/output/scraped-races.json vs public/races.json
 * Does NOT write public/races.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

type Race = {
  id: string;
  name: string;
  date: string;
  city: string;
  province: string;
  distances: string[];
  terrain: string;
  label: string | null;
  status: string;
  registrationUrl?: string;
  sources?: string[];
  _source?: string;
  _sourceId?: string;
};

const ROOT = join(import.meta.dirname, '..');
const PUB = join(ROOT, 'public/races.json');
const NEW = join(ROOT, 'crawler/output/scraped-races.json');
const OUT_DIR = join(ROOT, 'acceptance-2026-07-13');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED = ['id', 'name', 'date', 'city', 'province', 'distances', 'terrain', 'status'] as const;

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadRaces(path: string): { races: Race[]; generatedAt?: string } {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(raw)) return { races: raw };
  if (raw.races && Array.isArray(raw.races)) {
    return { races: raw.races, generatedAt: raw.generatedAt };
  }
  throw new Error(`Unexpected shape: ${path}`);
}

function isFuture(date: string, today: string) {
  return DATE_RE.test(date) && date >= today;
}

function sourceKey(r: Race): string {
  if (r._source) return r._source;
  const s = r.sources?.[0];
  return s ?? 'unknown';
}

function sourceBucket(key: string): string {
  if (key.includes('zuicool')) return 'zuicool';
  if (key.includes('nowrun')) return 'nowrun';
  if (key.includes('chinarun')) return 'chinarun';
  if (key.includes('marathonbm') || key.includes('marathon')) return 'marathonbm';
  if (key.includes('gusto')) return 'gusto';
  return key;
}

function countBy<T>(items: T[], fn: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = fn(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function fieldErrors(r: Race): string[] {
  const errs: string[] = [];
  for (const k of REQUIRED) {
    const v = (r as Record<string, unknown>)[k];
    if (v === undefined || v === null || v === '') errs.push(`missing:${k}`);
    if (k === 'distances' && (!Array.isArray(v) || v.length === 0)) errs.push('empty:distances');
  }
  if (r.date && !DATE_RE.test(r.date)) errs.push(`bad-date-format:${r.date}`);
  if (r.date && DATE_RE.test(r.date)) {
    const [y, m, d] = r.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      errs.push(`invalid-calendar-date:${r.date}`);
    }
  }
  const okStatus = ['open', 'closed', 'upcoming', 'cancelled', 'postponed'];
  if (r.status && !okStatus.includes(r.status)) errs.push(`bad-status:${r.status}`);
  return errs;
}

function cityDateKey(r: Race) {
  return `${r.city}|${r.date}`;
}

function main() {
  const today = todayLocal();
  const pub = loadRaces(PUB);
  const neu = loadRaces(NEW);

  const pubById = new Map(pub.races.map(r => [r.id, r]));
  const newById = new Map(neu.races.map(r => [r.id, r]));

  const added = neu.races.filter(r => !pubById.has(r.id));
  const removed = pub.races.filter(r => !newById.has(r.id));
  const kept = neu.races.filter(r => pubById.has(r.id));

  const idDupes = Object.entries(countBy(neu.races, r => r.id)).filter(([, c]) => c > 1);

  const multiSource = neu.races.filter(r => (r.sources?.length ?? 0) >= 2);
  const futureNew = neu.races.filter(r => isFuture(r.date, today));
  const futurePub = pub.races.filter(r => isFuture(r.date, today));
  const openNew = neu.races.filter(r => r.status === 'open');
  const openPub = pub.races.filter(r => r.status === 'open');
  const openButPast = openNew.filter(r => DATE_RE.test(r.date) && r.date < today);

  const fieldErrList: { id: string; name: string; errs: string[] }[] = [];
  for (const r of neu.races) {
    const errs = fieldErrors(r);
    if (errs.length) fieldErrList.push({ id: r.id, name: r.name, errs });
  }

  // same city+date different names → suspected dupes
  const byCityDate = new Map<string, Race[]>();
  for (const r of neu.races) {
    if (!isFuture(r.date, today)) continue;
    const k = cityDateKey(r);
    const arr = byCityDate.get(k) ?? [];
    arr.push(r);
    byCityDate.set(k, arr);
  }
  const cityDateSuspected: { key: string; races: { id: string; name: string; sources?: string[] }[] }[] = [];
  for (const [key, races] of byCityDate) {
    if (races.length < 2) continue;
    // skip if same normalized name essentially
    const names = new Set(races.map(r => r.name.replace(/\s+/g, '')));
    if (names.size >= 2) {
      cityDateSuspected.push({
        key,
        races: races.map(r => ({ id: r.id, name: r.name, sources: r.sources })),
      });
    }
  }

  const srcMain = countBy(neu.races, r => sourceBucket(sourceKey(r)));
  const srcPub = countBy(pub.races, r => sourceBucket(sourceKey(r)));
  const confSources = countBy(
    neu.races.flatMap(r => (r.sources ?? []).map(s => sourceBucket(s))),
    s => s,
  );

  const sampleAdded = added
    .filter(r => isFuture(r.date, today))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 15)
    .map(r => ({ id: r.id, date: r.date, name: r.name, city: r.city, status: r.status, _source: r._source, sources: r.sources }));

  const sampleRemoved = removed
    .filter(r => isFuture(r.date, today))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 15)
    .map(r => ({ id: r.id, date: r.date, name: r.name, city: r.city, status: r.status, _source: r._source }));

  // also sample any removed (incl past) if few future
  const sampleRemovedAny = removed
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map(r => ({ id: r.id, date: r.date, name: r.name, city: r.city, status: r.status }));

  const sampleAddedAny = added
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map(r => ({ id: r.id, date: r.date, name: r.name, city: r.city, status: r.status, _source: r._source }));

  // status flips among kept
  let statusFlips = 0;
  const openToClosed: string[] = [];
  const closedToOpen: string[] = [];
  for (const r of kept) {
    const old = pubById.get(r.id)!;
    if (old.status !== r.status) {
      statusFlips++;
      if (old.status === 'open' && r.status !== 'open') openToClosed.push(`${r.id} ${r.name}`);
      if (old.status !== 'open' && r.status === 'open') closedToOpen.push(`${r.id} ${r.name}`);
    }
  }

  const report = {
    asOf: today,
    comparedAt: new Date().toISOString(),
    public: {
      path: PUB,
      generatedAt: pub.generatedAt ?? null,
      total: pub.races.length,
      future: futurePub.length,
      open: openPub.length,
      byMainSource: srcPub,
    },
    newCrawl: {
      path: NEW,
      total: neu.races.length,
      future: futureNew.length,
      open: openNew.length,
      multiSource: multiSource.length,
      byMainSource: srcMain,
      byConfirmedSource: confSources,
    },
    delta: {
      totalDelta: neu.races.length - pub.races.length,
      futureDelta: futureNew.length - futurePub.length,
      openDelta: openNew.length - openPub.length,
      addedCount: added.length,
      removedCount: removed.length,
      statusFlips,
      openToClosedSample: openToClosed.slice(0, 10),
      closedToOpenSample: closedToOpen.slice(0, 10),
    },
    quality: {
      duplicateIds: idDupes.length,
      duplicateIdSample: idDupes.slice(0, 10),
      requiredFieldErrors: fieldErrList.length,
      fieldErrorSample: fieldErrList.slice(0, 15),
      openButPastCount: openButPast.length,
      openButPastSample: openButPast.slice(0, 15).map(r => ({
        id: r.id,
        date: r.date,
        name: r.name,
        status: r.status,
      })),
      cityDateSuspectedFuture: cityDateSuspected.length,
      cityDateSuspectedSample: cityDateSuspected.slice(0, 20),
    },
    sampleAddedFuture: sampleAdded,
    sampleRemovedFuture: sampleRemoved,
    sampleAddedAny,
    sampleRemovedAny,
    publishRecommendation: null as string | null,
  };

  // Recommendation heuristic (facts-based, not auto-publish)
  const blockers: string[] = [];
  if (idDupes.length > 0) blockers.push(`duplicate IDs: ${idDupes.length}`);
  if (fieldErrList.length > 0) blockers.push(`required field errors: ${fieldErrList.length}`);
  if (openButPast.length > 5) blockers.push(`open-but-past: ${openButPast.length}`);
  if (neu.races.length < 1000) blockers.push(`total too low: ${neu.races.length}`);
  if (futureNew.length < 50) blockers.push(`future too low: ${futureNew.length}`);

  if (blockers.length) {
    report.publishRecommendation = `不建议发布：${blockers.join('；')}`;
  } else if (Math.abs(report.delta.totalDelta) > 200 || Math.abs(report.delta.futureDelta) > 80) {
    report.publishRecommendation =
      `建议人工复核后再发布：总量变化 ${report.delta.totalDelta}，未来赛事变化 ${report.delta.futureDelta}，报名中变化 ${report.delta.openDelta}；结构质量门通过但变化偏大`;
  } else {
    report.publishRecommendation =
      `结构质量门通过（0 重复 ID、0 必填错误${openButPast.length ? `、open-but-past ${openButPast.length}` : ''}）；可考虑发布新赛事数据，但本次验收不自动覆盖 public/races.json`;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, 'race-compare.json');
  const mdPath = join(OUT_DIR, 'race-compare.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const md = [
    `# 赛事数据结构化比较 ${today}`,
    '',
    `- comparedAt: ${report.comparedAt}`,
    `- public generatedAt: ${report.public.generatedAt}`,
    '',
    '## 总量',
    `| 指标 | public | new crawl | Δ |`,
    `|---|---:|---:|---:|`,
    `| 总数 | ${report.public.total} | ${report.newCrawl.total} | ${report.delta.totalDelta} |`,
    `| 未来 | ${report.public.future} | ${report.newCrawl.future} | ${report.delta.futureDelta} |`,
    `| 报名中 open | ${report.public.open} | ${report.newCrawl.open} | ${report.delta.openDelta} |`,
    `| 多源确认 | - | ${report.newCrawl.multiSource} | - |`,
    `| 新增 ID | - | ${report.delta.addedCount} | - |`,
    `| 删除 ID | - | ${report.delta.removedCount} | - |`,
    '',
    '## 主来源分布（new）',
    '```',
    JSON.stringify(report.newCrawl.byMainSource, null, 2),
    '```',
    '',
    '## 确认来源分布（new sources[]）',
    '```',
    JSON.stringify(report.newCrawl.byConfirmedSource, null, 2),
    '```',
    '',
    '## 质量检查',
    `- 重复 ID: ${report.quality.duplicateIds}`,
    `- 必填/非法字段错误: ${report.quality.requiredFieldErrors}`,
    `- 明显过期仍 open: ${report.quality.openButPastCount}`,
    `- 同城同日疑似重复（未来）: ${report.quality.cityDateSuspectedFuture}`,
    `- status 变化（kept）: ${report.delta.statusFlips}`,
    '',
    '## 发布建议',
    report.publishRecommendation,
    '',
    '## 抽查新增（未来优先）',
    '```json',
    JSON.stringify(report.sampleAddedFuture.length ? report.sampleAddedFuture : report.sampleAddedAny, null, 2),
    '```',
    '',
    '## 抽查删除（未来优先）',
    '```json',
    JSON.stringify(report.sampleRemovedFuture.length ? report.sampleRemovedFuture : report.sampleRemovedAny, null, 2),
    '```',
    '',
    '## open-but-past sample',
    '```json',
    JSON.stringify(report.quality.openButPastSample, null, 2),
    '```',
    '',
    '## 同城同日疑似重复 sample',
    '```json',
    JSON.stringify(report.quality.cityDateSuspectedSample, null, 2),
    '```',
  ].join('\n');

  writeFileSync(mdPath, md, 'utf8');
  console.log(md);
  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

main();
