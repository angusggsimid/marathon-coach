/**
 * 稳定计划指纹 + 范围感知导出元数据。
 * FIT 按 today/week/all 分作用域记录指纹；窄范围成功不得虚假证明宽范围已更新。
 */
import {
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import type { DailyWorkout } from './training-engine';
import { toDateKey } from './weekly-adaptation';

export type ExportChannel = 'fit' | 'ics';
export type FitExportRange = 'today' | 'week' | 'all';

/** 单次导出/同步成功元数据（ICS 为全计划；FIT 按范围存一份） */
export interface ChannelExportMeta {
  /** 最近一次成功导出/同步的 ISO 时间 */
  exportedAt: string;
  /** 实际导出作用域内计划的指纹（非整份 plan 的误用） */
  planFingerprint: string;
  /** 导出范围；ICS 固定 all */
  range: FitExportRange;
  /** 作用域起止本地日（today/week 必填；all 可省略） */
  scopeStart?: string;
  scopeEnd?: string;
}

/** FIT：分范围保存，避免 today 覆盖 all 的诚实性 */
export type FitExportSyncState = Partial<
  Record<FitExportRange, ChannelExportMeta>
>;

export interface ExportSyncState {
  fit?: FitExportSyncState;
  ics?: ChannelExportMeta;
}

/** 指纹载荷版本：字段集变更时递增 */
const FINGERPRINT_SCHEMA = 'v1';

/**
 * 对会改变手表/日历执行的字段做稳定序列化，再做确定性 hash。
 * Rest 日不参与（导出本身也过滤 Rest）。
 */
export function planFingerprint(plan: DailyWorkout[]): string {
  const rows = plan
    .filter(w => w.workoutType !== 'Rest')
    .map(w => {
      const date = toDateKey(w.date as Date | string);
      const type = String(w.workoutType ?? '');
      const dist =
        w.distanceKm == null || Number.isNaN(w.distanceKm)
          ? ''
          : String(Math.round(w.distanceKm * 10) / 10);
      const desc = String(w.description ?? '').trim();
      const pace = String(w.targetPace ?? '').trim();
      return `${date}|${type}|${dist}|${desc}|${pace}`;
    })
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const payload = `${FINGERPRINT_SCHEMA}\n${rows.join('\n')}`;
  return `fp_${fnv1a32(payload)}`;
}

/** 32-bit FNV-1a，输出 8 位 hex；纯函数、无随机、跨会话稳定 */
export function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 解析 asOf 下某 FIT 范围的本地作用域边界 */
export function resolveFitExportScope(
  range: FitExportRange,
  asOf: Date = new Date(),
): { range: FitExportRange; scopeStart?: string; scopeEnd?: string } {
  if (range === 'all') return { range: 'all' };
  const today = startOfDay(asOf);
  if (range === 'today') {
    const k = format(today, 'yyyy-MM-dd');
    return { range: 'today', scopeStart: k, scopeEnd: k };
  }
  const start = startOfWeek(today, { weekStartsOn: 1 });
  const end = endOfWeek(today, { weekStartsOn: 1 });
  return {
    range: 'week',
    scopeStart: format(start, 'yyyy-MM-dd'),
    scopeEnd: format(end, 'yyyy-MM-dd'),
  };
}

/**
 * 按作用域切 plan（仅非 Rest）。
 * today/week 优先用已记录的 scope 边界；缺省时用 asOf 现算。
 */
export function slicePlanToExportScope(
  plan: DailyWorkout[],
  range: FitExportRange,
  scope?: { scopeStart?: string; scopeEnd?: string },
  asOf: Date = new Date(),
): DailyWorkout[] {
  const resolved =
    range === 'all'
      ? { range: 'all' as const }
      : scope?.scopeStart && scope?.scopeEnd
        ? {
            range,
            scopeStart: scope.scopeStart,
            scopeEnd: scope.scopeEnd,
          }
        : resolveFitExportScope(range, asOf);

  return plan.filter(w => {
    if (w.workoutType === 'Rest') return false;
    const key = toDateKey(w.date as Date | string);
    if (!key) return false;
    if (resolved.range === 'all') return true;
    if (!resolved.scopeStart || !resolved.scopeEnd) return false;
    return key >= resolved.scopeStart && key <= resolved.scopeEnd;
  });
}

export function planFingerprintForScope(
  plan: DailyWorkout[],
  range: FitExportRange,
  asOf: Date = new Date(),
): string {
  const scope = resolveFitExportScope(range, asOf);
  return planFingerprint(slicePlanToExportScope(plan, range, scope, asOf));
}

/**
 * 作用域是否仍“有效、应参与 stale 判断”：
 * - all：始终有效
 * - today：仅当 scope 日 = asOf 当日
 * - week：仅当 scope 周 = asOf 所在周
 * 过期作用域不再提示旧导出过期。
 */
export function isExportScopeActive(
  meta: Pick<ChannelExportMeta, 'range' | 'scopeStart' | 'scopeEnd'>,
  asOf: Date = new Date(),
): boolean {
  if (meta.range === 'all') return true;
  const current = resolveFitExportScope(meta.range, asOf);
  if (!meta.scopeStart || !meta.scopeEnd) return false;
  if (!current.scopeStart || !current.scopeEnd) return false;
  return (
    meta.scopeStart === current.scopeStart &&
    meta.scopeEnd === current.scopeEnd
  );
}

/**
 * 单条 scoped meta 是否 stale：
 * - 从未记录 / 非法 → false
 * - 作用域已过期 → false（不持续提示）
 * - 同作用域内指纹变化 → true
 */
export function isScopedExportStale(
  meta: ChannelExportMeta | undefined | null,
  plan: DailyWorkout[],
  asOf: Date = new Date(),
): boolean {
  if (!meta?.planFingerprint || !meta.exportedAt) return false;
  if (!meta.range) return false;
  if (!isExportScopeActive(meta, asOf)) return false;
  const current = planFingerprint(
    slicePlanToExportScope(
      plan,
      meta.range,
      { scopeStart: meta.scopeStart, scopeEnd: meta.scopeEnd },
      asOf,
    ),
  );
  return current !== meta.planFingerprint;
}

/**
 * FIT 渠道 stale：任一仍有效作用域过期即 true。
 * 窄范围重新导出只清该 range 槽位，不能清掉 all/week 的 stale。
 */
export function isFitChannelStale(
  fit: FitExportSyncState | undefined | null,
  plan: DailyWorkout[],
  asOf: Date = new Date(),
): boolean {
  if (!fit) return false;
  for (const range of ['today', 'week', 'all'] as FitExportRange[]) {
    if (isScopedExportStale(fit[range], plan, asOf)) return true;
  }
  return false;
}

/**
 * ICS / ICU 全计划渠道：
 * - 从未成功 → false
 * - 指纹不同 → true
 */
export function isChannelStale(
  meta: ChannelExportMeta | undefined | null,
  currentFingerprint: string,
): boolean {
  if (!meta || !meta.planFingerprint || !meta.exportedAt) return false;
  if (!currentFingerprint) return false;
  return meta.planFingerprint !== currentFingerprint;
}

/** 记录 ICS/ICU 全量成功（range 固定 all） */
export function recordFullChannelSuccess(
  prev: ExportSyncState,
  fingerprint: string,
  at: Date = new Date(),
): ExportSyncState {
  if (!fingerprint) return prev;
  const meta: ChannelExportMeta = {
    exportedAt: at.toISOString(),
    planFingerprint: fingerprint,
    range: 'all',
  };
  return { ...prev, ics: meta };
}

/**
 * 记录 FIT 某范围成功：只写入该 range 槽位，不碰其他 range。
 * 指纹取该作用域切片，而非整份 plan。
 */
export function recordFitExportSuccess(
  prev: ExportSyncState,
  plan: DailyWorkout[],
  range: FitExportRange,
  asOf: Date = new Date(),
  at: Date = new Date(),
): ExportSyncState {
  const scope = resolveFitExportScope(range, asOf);
  const sliced = slicePlanToExportScope(plan, range, scope, asOf);
  if (sliced.length === 0) return prev;
  const meta: ChannelExportMeta = {
    exportedAt: at.toISOString(),
    planFingerprint: planFingerprint(sliced),
    range,
  };
  if (scope.scopeStart && scope.scopeEnd) {
    meta.scopeStart = scope.scopeStart;
    meta.scopeEnd = scope.scopeEnd;
  }
  return {
    ...prev,
    fit: {
      ...(prev.fit ?? {}),
      [range]: meta,
    },
  };
}

/**
 * @deprecated 兼容旧调用；FIT 请用 recordFitExportSuccess。
 * channel=fit 时若给了 range，走分范围写入；ics/icu 走全量。
 */
export function recordChannelSuccess(
  prev: ExportSyncState,
  channel: ExportChannel,
  fingerprint: string,
  range?: FitExportRange,
  at: Date = new Date(),
): ExportSyncState {
  if (!fingerprint) return prev;
  if (channel === 'fit') {
    const r = range ?? 'all';
    const meta: ChannelExportMeta = {
      exportedAt: at.toISOString(),
      planFingerprint: fingerprint,
      range: r,
    };
    // 无 plan 切片时无法填 scope；today/week 缺 scope 在 stale 时视为过期不提示
    return {
      ...prev,
      fit: {
        ...(prev.fit ?? {}),
        [r]: meta,
      },
    };
  }
  return recordFullChannelSuccess(prev, fingerprint, at);
}

/**
 * 从旧 persist 迁移导出元数据。
 * - 非法/未知形状 → 丢弃（不误报）
 * - v3 单条 fit meta：有 range 则放入对应槽；today/week 无 scope 边界时丢弃（无法诚实判断）
 * - all 无 scope 可保留
 */
export function migrateExportSyncState(raw: unknown): ExportSyncState {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const source =
    obj.exportSync && typeof obj.exportSync === 'object'
      ? (obj.exportSync as Record<string, unknown>)
      : obj;

  const out: ExportSyncState = {};

  // FIT：新形状 { today?, week?, all? } 或旧形状单 ChannelExportMeta
  const fitRaw = source.fit;
  if (fitRaw && typeof fitRaw === 'object') {
    const fitObj = fitRaw as Record<string, unknown>;
    if (
      'planFingerprint' in fitObj ||
      'exportedAt' in fitObj
    ) {
      // v3 单条
      const migrated = migrateLegacyFitMeta(fitObj);
      if (migrated) out.fit = migrated;
    } else {
      const fit: FitExportSyncState = {};
      for (const r of ['today', 'week', 'all'] as FitExportRange[]) {
        const m = normalizeScopedMeta(fitObj[r], r);
        if (m) fit[r] = m;
      }
      if (Object.keys(fit).length > 0) out.fit = fit;
    }
  }

  {
    const m = normalizeScopedMeta(source.ics, 'all');
    if (m) out.ics = m;
  }
  return out;
}

function migrateLegacyFitMeta(
  raw: Record<string, unknown>,
): FitExportSyncState | null {
  const range =
    raw.range === 'today' || raw.range === 'week' || raw.range === 'all'
      ? raw.range
      : 'all';
  // 旧 v3 对 today/week 记的是整份 plan 指纹且无 scope → 无法诚实比较，丢弃防误报
  if (range === 'today' || range === 'week') {
    const hasScope =
      typeof raw.scopeStart === 'string' &&
      typeof raw.scopeEnd === 'string' &&
      !!raw.scopeStart &&
      !!raw.scopeEnd;
    if (!hasScope) return null;
  }
  const m = normalizeScopedMeta(raw, range);
  if (!m) return null;
  return { [range]: m };
}

function normalizeScopedMeta(
  raw: unknown,
  defaultRange: FitExportRange,
): ChannelExportMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const exportedAt = typeof m.exportedAt === 'string' ? m.exportedAt : '';
  const planFingerprint =
    typeof m.planFingerprint === 'string' ? m.planFingerprint : '';
  if (!exportedAt || !planFingerprint) return null;
  if (Number.isNaN(Date.parse(exportedAt))) return null;

  const range: FitExportRange =
    m.range === 'today' || m.range === 'week' || m.range === 'all'
      ? m.range
      : defaultRange;

  const meta: ChannelExportMeta = {
    exportedAt,
    planFingerprint,
    range,
  };

  if (typeof m.scopeStart === 'string' && m.scopeStart) {
    meta.scopeStart = m.scopeStart;
  }
  if (typeof m.scopeEnd === 'string' && m.scopeEnd) {
    meta.scopeEnd = m.scopeEnd;
  }

  // today/week 必须有完整 scope，否则丢弃
  if (range === 'today' || range === 'week') {
    if (!meta.scopeStart || !meta.scopeEnd) return null;
  }

  return meta;
}
