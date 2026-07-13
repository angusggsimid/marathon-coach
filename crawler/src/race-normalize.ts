/**
 * 赛事名称规范化、状态按日校正、近重复合并、日期质量门禁。
 * 可被 index 与测试共同引用。
 */
import type { RaceDistance, RaceEvent, RaceStatus } from './types.js';

// ─── Canonical name ───────────────────────────────────────────────────────────

/**
 * 规范化赛事名，用于去重键。
 * 处理：年份前缀、赞助冠名（“xx杯”）、中英文括号、常见届次前缀、标点。
 * 不把不同距离硬并到同一名（半程/全程保留在名中）。
 */
export function canonicalRaceName(raw: string): string {
  if (!raw) return '';

  // 已知别名：黄果树半马多源命名
  if (/黄果树.*半程马拉松|镇宁黄果树/.test(raw)) {
    return '贵州镇宁黄果树半程马拉松';
  }

  let s = raw.trim();

  // 剥离全角/半角引号冠名段："xx杯" / “xx”
  s = s.replace(/[“"「『][^”"」』]{1,24}[”"」』]/g, '');

  // 连续剥离中英文括号（含赞助、副标题）
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s
      .replace(/（[^）]{0,40}）/g, '')
      .replace(/\([^)]{0,40}\)/g, '');
  }

  // 赞助/冠名常见模式 + 届次 + 全角数字
  s = s
    .replace(/^[\d]{4}\s*/, '')
    .replace(/第[一二三四五六七八九十百零〇\d]+届/g, '')
    .replace(/[·・•丨|／/]/g, '')
    .replace(/\s+/g, '')
    .replace(/[—－–]/g, '1')
    .replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xFF10))
    .toLowerCase();

  return s;
}

/** 本地日历日 YYYY-MM-DD（避免 toISOString UTC 偏移） */
export function localDateKey(asOf: Date = new Date()): string {
  const y = asOf.getFullYear();
  const m = String(asOf.getMonth() + 1).padStart(2, '0');
  const d = String(asOf.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dedupKey(r: RaceEvent): string {
  const month = (r.date || '').slice(0, 7);
  return `${canonicalRaceName(r.name)}|${month}`;
}

// ─── Date quality ─────────────────────────────────────────────────────────────

export type DateQualityIssue =
  | 'name-year-conflict'
  | 'impossible-year'
  | 'invalid-date-format';

export interface DateQualityResult {
  ok: boolean;
  issues: DateQualityIssue[];
}

/**
 * 日期质量门禁：
 * - 拦截：名称显式年份与 date 年份冲突（如名含 2026、date=2008）
 * - 拦截：明显不可能年份（<1990 或 > 当前年+2）
 * - 允许：真实历史档案（年份一致即可，即使已过期）
 * - 允许：明确 _dateTBD 占位（跳过冲突中的「不可能日」严格度，但仍拦 name/date 冲突）
 */
export function evaluateDateQuality(
  race: RaceEvent,
  asOf: Date = new Date(),
): DateQualityResult {
  const issues: DateQualityIssue[] = [];
  const date = (race.date || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    issues.push('invalid-date-format');
    return { ok: false, issues };
  }

  const dateYear = Number(date.slice(0, 4));
  const currentYear = asOf.getFullYear();

  // 明显不可能年份（历史库下限 1990，上限当前+2）
  if (dateYear < 1990 || dateYear > currentYear + 2) {
    // TBD 占位有时用 01-01，但年份仍应合理；不合理则拦
    issues.push('impossible-year');
  }

  // 名称中显式 20xx 年份与 date 冲突
  const nameYears = [...race.name.matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1]));
  // 中文无边界：再扫一次
  const nameYears2 = [...race.name.matchAll(/(20\d{2})/g)].map(m => Number(m[1]));
  const years = [...new Set([...nameYears, ...nameYears2])];
  if (years.length > 0 && !years.includes(dateYear)) {
    // 名称年份与 date 年无一匹配 → 冲突（mb-6018 类）
    issues.push('name-year-conflict');
  }

  return { ok: issues.length === 0, issues };
}

// ─── Status correction ────────────────────────────────────────────────────────

/**
 * 发布时按比赛日期校正：已过期且仍为 open/upcoming 的 → closed。
 * _dateTBD 不强制关闭（日期未定）。
 */
export function correctRaceStatus(
  race: RaceEvent,
  asOf: Date = new Date(),
): RaceEvent {
  if (race._dateTBD) return race;
  const today = localDateKey(asOf);
  if (race.date < today && (race.status === 'open' || race.status === 'upcoming')) {
    return { ...race, status: 'closed' as RaceStatus };
  }
  return race;
}

export function correctAllStatuses(races: RaceEvent[], asOf?: Date): RaceEvent[] {
  return races.map(r => correctRaceStatus(r, asOf));
}

// ─── Dedup + conservative near-merge ──────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  open: 4, closed: 3, upcoming: 2, postponed: 1, cancelled: 0,
};

export function mergePriority(a: RaceStatus, b: RaceStatus): RaceStatus {
  return (STATUS_PRIORITY[a] ?? 0) >= (STATUS_PRIORITY[b] ?? 0) ? a : b;
}

export function mergeDistances(a: RaceDistance[], b: RaceDistance[]): RaceDistance[] {
  return [...new Set([...a, ...b])];
}

function normalizeSource(source: string): string {
  return source === 'zuicool-events' ? 'zuicool' : source;
}

export function mergeSources(...races: RaceEvent[]): string[] {
  const sources = new Set<string>();
  for (const race of races) {
    for (const source of race.sources ?? []) sources.add(normalizeSource(source));
    if (race._source) sources.add(normalizeSource(race._source));
  }
  return Array.from(sources).sort();
}

function withSources(race: RaceEvent): RaceEvent {
  return { ...race, sources: mergeSources(race) };
}

function mergeRace(existing: RaceEvent, race: RaceEvent): RaceEvent {
  return {
    ...existing,
    status: mergePriority(existing.status, race.status),
    distances: mergeDistances(existing.distances, race.distances),
    registrationUrl: existing.registrationUrl ?? race.registrationUrl,
    sources: mergeSources(existing, race),
    // 偏好更完整城市/省
    city: existing.city || race.city,
    province: existing.province || race.province,
    note: existing.note ?? race.note,
  };
}

/** 字符 Jaccard 相似度 */
export function charOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let common = 0;
  for (const ch of setA) if (setB.has(ch)) common++;
  return common / Math.max(setA.size, setB.size);
}

/**
 * 距离集合是否兼容：相同、或一方为空、或一方是另一方的子集。
 * 全马 vs 半马不同集合 → 不合并。
 */
export function distancesCompatible(a: RaceDistance[], b: RaceDistance[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  const sa = new Set(a);
  const sb = new Set(b);
  const aInB = a.every(d => sb.has(d));
  const bInA = b.every(d => sa.has(d));
  return aInB || bInA;
}

/**
 * 主去重：canonicalName + 年月。
 * 近重复合并（保守）：同城 + 精确同日 + 名称高度相似 + 距离兼容。
 * 避免误合不同距离/不同赛事。
 */
export function dedupRaces(races: RaceEvent[]): {
  races: RaceEvent[];
  duplicateReport: DuplicateReportEntry[];
} {
  const seen = new Map<string, RaceEvent>();
  const duplicateReport: DuplicateReportEntry[] = [];

  for (const race of races) {
    const key = dedupKey(race);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, withSources(race));
      continue;
    }
    duplicateReport.push({
      type: 'key-dedup',
      keptId: existing.id,
      droppedId: race.id,
      reason: `same key ${key}`,
      nameA: existing.name,
      nameB: race.name,
      date: existing.date,
    });
    seen.set(key, mergeRace(existing, race));
  }

  // 近重复合并：city + exact date
  const list = Array.from(seen.values());
  const byCityDate = new Map<string, RaceEvent[]>();
  for (const r of list) {
    const city = (r.city || '').replace(/\s/g, '');
    if (!city || !r.date) continue;
    const k = `${city}|${r.date}`;
    const arr = byCityDate.get(k) ?? [];
    arr.push(r);
    byCityDate.set(k, arr);
  }

  const removeIds = new Set<string>();
  for (const group of byCityDate.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      if (removeIds.has(group[i].id)) continue;
      for (let j = i + 1; j < group.length; j++) {
        if (removeIds.has(group[j].id)) continue;
        const a = group[i];
        const b = group[j];
        if (dedupKey(a) === dedupKey(b)) continue;
        if (!distancesCompatible(a.distances, b.distances)) continue;

        const ca = canonicalRaceName(a.name);
        const cb = canonicalRaceName(b.name);
        const overlap = charOverlap(ca, cb);
        const containment =
          (ca.length >= 4 && cb.includes(ca)) || (cb.length >= 4 && ca.includes(cb));

        // 保守阈值：overlap ≥ 0.85，或强包含且重叠 ≥ 0.70
        if (overlap >= 0.85 || (containment && overlap >= 0.70)) {
          const merged = mergeRace(a, b);
          const keyA = dedupKey(a);
          const keyB = dedupKey(b);
          seen.set(keyA, merged);
          if (keyB !== keyA) seen.delete(keyB);
          group[i] = merged;
          removeIds.add(b.id);
          duplicateReport.push({
            type: 'near-merge',
            keptId: a.id,
            droppedId: b.id,
            reason: `city+date near-merge overlap=${overlap.toFixed(2)}`,
            nameA: a.name,
            nameB: b.name,
            date: a.date,
          });
        }
      }
    }
  }

  // seen 中仅保留未被 near-merge 丢弃的条目
  const finalList = Array.from(seen.values())
    .filter(r => !removeIds.has(r.id))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 源站可能复用同一数字 ID 给不同赛事（如 zuicool reg vs catalog）
  const { races: unique, collisions } = ensureUniqueRaceIds(finalList);
  duplicateReport.push(...collisions);

  return { races: unique, duplicateReport };
}

/**
 * 保证输出集内 id 全局唯一。
 * 碰撞时：保留首次出现的 id；后续条目改为 `${id}-${date}`，若仍冲突再加序号。
 */
export function ensureUniqueRaceIds(races: RaceEvent[]): {
  races: RaceEvent[];
  collisions: DuplicateReportEntry[];
} {
  const used = new Set<string>();
  const collisions: DuplicateReportEntry[] = [];
  const out: RaceEvent[] = [];

  for (const race of races) {
    const id = race.id;
    if (!used.has(id)) {
      used.add(id);
      out.push(race);
      continue;
    }

    const base = `${race.id}-${(race.date || 'na').replace(/-/g, '')}`;
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
    }

    collisions.push({
      type: 'id-collision',
      keptId: id,
      droppedId: candidate,
      reason: `source id reused for different events; reassigned to ${candidate}`,
      nameA: out.find(r => r.id === id)?.name ?? id,
      nameB: race.name,
      date: race.date,
    });

    used.add(candidate);
    out.push({ ...race, id: candidate });
  }

  return { races: out, collisions };
}

/**
 * 发布流水线：日期质量门禁 → 状态按日校正 → 去重/近合并 → ID 唯一化。
 * 供 index 主路径调用，避免工具文件孤立未接线。
 */
export function publishNormalize(races: RaceEvent[], asOf: Date = new Date()): {
  races: RaceEvent[];
  duplicateReport: DuplicateReportEntry[];
  dateRejected: Array<{ race: RaceEvent; issues: DateQualityIssue[] }>;
} {
  const dateRejected: Array<{ race: RaceEvent; issues: DateQualityIssue[] }> = [];
  const dateOk: RaceEvent[] = [];

  for (const race of races) {
    const dq = evaluateDateQuality(race, asOf);
    if (!dq.ok) {
      dateRejected.push({ race, issues: dq.issues });
      continue;
    }
    dateOk.push(correctRaceStatus(race, asOf));
  }

  const { races: deduped, duplicateReport } = dedupRaces(dateOk);
  return { races: deduped, duplicateReport, dateRejected };
}

export interface DuplicateReportEntry {
  type: 'key-dedup' | 'near-merge' | 'id-collision';
  keptId: string;
  droppedId: string;
  reason: string;
  nameA: string;
  nameB: string;
  date: string;
}

export function generateDuplicateReportMarkdown(entries: DuplicateReportEntry[]): string {
  const lines = [
    '# Duplicate / Near-merge Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- Total merge events: ${entries.length}`,
    `- Key dedups: ${entries.filter(e => e.type === 'key-dedup').length}`,
    `- Near merges: ${entries.filter(e => e.type === 'near-merge').length}`,
    `- ID collisions reassigned: ${entries.filter(e => e.type === 'id-collision').length}`,
    '',
    '| Type | Date | Kept | Dropped | Reason | Name A | Name B |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const e of entries.slice(0, 200)) {
    lines.push(
      `| ${e.type} | ${e.date} | ${e.keptId} | ${e.droppedId} | ${e.reason} | ${escapeMd(e.nameA)} | ${escapeMd(e.nameB)} |`,
    );
  }
  return lines.join('\n');
}

function escapeMd(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
