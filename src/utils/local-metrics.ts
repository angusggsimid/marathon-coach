/**
 * 本机隐私安全的聚合指标（M 指标底表）。
 * - 不上传、不接第三方 analytics、不 fingerprint、不生成可追踪用户 ID
 * - 仅 localStorage 聚合计数 / 按日桶；导出诊断由用户主动触发
 * - 诊断 JSON 白名单：禁止计划、PB、赛事、API Key、Athlete ID、URL query、精确设备指纹
 * - 反序列化严格白名单；日粒度 first/last；language 粗粒度
 */

export const METRICS_STORAGE_KEY = 'marathon-local-metrics';
export const METRICS_SCHEMA = 'marathon-local-metrics';
/** v2：firstOpenDay/lastOpenDay（YYYY-MM-DD），不再存精确 ISO 时间 */
export const METRICS_VERSION = 2;
/** 保留活跃日 / 日桶上限 */
export const METRICS_MAX_ACTIVE_DAYS = 120;
export const METRICS_MAX_DAY_BUCKETS = 90;
/** 安全整数上限（防异常大数污染） */
export const METRICS_MAX_COUNT = 1_000_000_000;

export type MetricChannel =
  | 'fit'
  | 'ics'
  | 'icu'
  | 'backup_export'
  | 'backup_import'
  | 'diag_export';

export type MetricOutcome = 'success' | 'fail' | 'partial' | 'cancel';

export interface DayBucket {
  opens: number;
  wechatEntry: number;
  wechatCopy: number;
  wechatDismiss: number;
  fitOk: number;
  fitFail: number;
  icsOk: number;
  icsFail: number;
  icuOk: number;
  icuPartial: number;
  icuFail: number;
  backupExportOk: number;
  backupExportFail: number;
  backupImportOk: number;
  backupImportFail: number;
  backupImportCancel: number;
}

export interface LocalMetricsState {
  schema: typeof METRICS_SCHEMA;
  version: number;
  /** 首次打开本地日 YYYY-MM-DD */
  firstOpenDay: string | null;
  /** 最近打开本地日 YYYY-MM-DD */
  lastOpenDay: string | null;
  /** YYYY-MM-DD 去重活跃日，新→旧裁剪 */
  activeDays: string[];
  totals: {
    opens: number;
    returnDays: number;
    wechatEntry: number;
    wechatCopy: number;
    wechatDismiss: number;
    standaloneSessions: number;
    browserSessions: number;
    beforeinstallpromptSeen: number;
    appinstalled: number;
    fitOk: number;
    fitFail: number;
    icsOk: number;
    icsFail: number;
    icuOk: number;
    icuPartial: number;
    icuFail: number;
    backupExportOk: number;
    backupExportFail: number;
    backupImportOk: number;
    backupImportFail: number;
    backupImportCancel: number;
    diagExport: number;
  };
  byDay: Record<string, DayBucket>;
}

const TOTALS_KEYS = [
  'opens',
  'returnDays',
  'wechatEntry',
  'wechatCopy',
  'wechatDismiss',
  'standaloneSessions',
  'browserSessions',
  'beforeinstallpromptSeen',
  'appinstalled',
  'fitOk',
  'fitFail',
  'icsOk',
  'icsFail',
  'icuOk',
  'icuPartial',
  'icuFail',
  'backupExportOk',
  'backupExportFail',
  'backupImportOk',
  'backupImportFail',
  'backupImportCancel',
  'diagExport',
] as const;

const DAY_BUCKET_KEYS = [
  'opens',
  'wechatEntry',
  'wechatCopy',
  'wechatDismiss',
  'fitOk',
  'fitFail',
  'icsOk',
  'icsFail',
  'icuOk',
  'icuPartial',
  'icuFail',
  'backupExportOk',
  'backupExportFail',
  'backupImportOk',
  'backupImportFail',
  'backupImportCancel',
] as const;

function emptyDay(): DayBucket {
  return {
    opens: 0,
    wechatEntry: 0,
    wechatCopy: 0,
    wechatDismiss: 0,
    fitOk: 0,
    fitFail: 0,
    icsOk: 0,
    icsFail: 0,
    icuOk: 0,
    icuPartial: 0,
    icuFail: 0,
    backupExportOk: 0,
    backupExportFail: 0,
    backupImportOk: 0,
    backupImportFail: 0,
    backupImportCancel: 0,
  };
}

export function emptyMetrics(): LocalMetricsState {
  return {
    schema: METRICS_SCHEMA,
    version: METRICS_VERSION,
    firstOpenDay: null,
    lastOpenDay: null,
    activeDays: [],
    totals: {
      opens: 0,
      returnDays: 0,
      wechatEntry: 0,
      wechatCopy: 0,
      wechatDismiss: 0,
      standaloneSessions: 0,
      browserSessions: 0,
      beforeinstallpromptSeen: 0,
      appinstalled: 0,
      fitOk: 0,
      fitFail: 0,
      icsOk: 0,
      icsFail: 0,
      icuOk: 0,
      icuPartial: 0,
      icuFail: 0,
      backupExportOk: 0,
      backupExportFail: 0,
      backupImportOk: 0,
      backupImportFail: 0,
      backupImportCancel: 0,
      diagExport: 0,
    },
    byDay: {},
  };
}

export function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 真实本地日历日 */
export function isValidMetricsDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 非负有限安全整数；非法回退 0，过大 clamp */
export function sanitizeCount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
  const n = Math.floor(v);
  if (n > METRICS_MAX_COUNT) return METRICS_MAX_COUNT;
  return n;
}

function sanitizeTotals(raw: unknown): LocalMetricsState['totals'] {
  const base = emptyMetrics().totals;
  if (!isPlainObject(raw)) return base;
  const out = { ...base };
  for (const k of TOTALS_KEYS) {
    out[k] = sanitizeCount(raw[k]);
  }
  return out;
}

function sanitizeDayBucket(raw: unknown): DayBucket {
  const base = emptyDay();
  if (!isPlainObject(raw)) return base;
  const out = { ...base };
  for (const k of DAY_BUCKET_KEYS) {
    out[k] = sanitizeCount(raw[k]);
  }
  return out;
}

function sanitizeActiveDays(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of raw) {
    if (!isValidMetricsDay(d)) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
    if (out.length >= METRICS_MAX_ACTIVE_DAYS) break;
  }
  return out;
}

function sanitizeByDay(raw: unknown): Record<string, DayBucket> {
  if (!isPlainObject(raw)) return {};
  const keys = Object.keys(raw)
    .filter(isValidMetricsDay)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, METRICS_MAX_DAY_BUCKETS);
  const out: Record<string, DayBucket> = {};
  for (const k of keys) {
    out[k] = sanitizeDayBucket(raw[k]);
  }
  return out;
}

/** ISO 或任意字符串 → 合法日；失败 null */
function dayFromMaybeIso(v: unknown): string | null {
  if (isValidMetricsDay(v)) return v;
  if (typeof v !== 'string' || !v.trim()) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return localDayKey(new Date(t));
}

/**
 * 从 storage 原始值安全加载。
 * v2 严格白名单；v1 安全迁移 first/last → 日粒度；其它版本回退空表。
 */
export function loadMetricsFromRaw(raw: string | null): LocalMetricsState {
  if (!raw) return emptyMetrics();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return emptyMetrics();
    if (parsed.schema !== METRICS_SCHEMA) return emptyMetrics();
    if (typeof parsed.version !== 'number' || !Number.isInteger(parsed.version)) {
      return emptyMetrics();
    }
    if (parsed.version !== 1 && parsed.version !== METRICS_VERSION) {
      return emptyMetrics();
    }

    const base = emptyMetrics();
    const totals = sanitizeTotals(parsed.totals);
    const byDay = sanitizeByDay(parsed.byDay);
    const activeDays = sanitizeActiveDays(parsed.activeDays);

    let firstOpenDay: string | null = null;
    let lastOpenDay: string | null = null;
    if (parsed.version === 1) {
      firstOpenDay = dayFromMaybeIso(parsed.firstOpenAt);
      lastOpenDay = dayFromMaybeIso(parsed.lastOpenAt);
    } else {
      firstOpenDay = isValidMetricsDay(parsed.firstOpenDay) ? parsed.firstOpenDay : null;
      lastOpenDay = isValidMetricsDay(parsed.lastOpenDay) ? parsed.lastOpenDay : null;
      // 兼容误写旧字段
      if (!firstOpenDay) firstOpenDay = dayFromMaybeIso(parsed.firstOpenAt);
      if (!lastOpenDay) lastOpenDay = dayFromMaybeIso(parsed.lastOpenAt);
    }

    return {
      ...base,
      firstOpenDay,
      lastOpenDay,
      activeDays,
      totals,
      byDay,
    };
  } catch {
    return emptyMetrics();
  }
}

function trimActiveDays(days: string[], max = METRICS_MAX_ACTIVE_DAYS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of days) {
    if (!isValidMetricsDay(d)) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
    if (out.length >= max) break;
  }
  return out;
}

function trimDayBuckets(
  byDay: Record<string, DayBucket>,
  max = METRICS_MAX_DAY_BUCKETS,
): Record<string, DayBucket> {
  const keys = Object.keys(byDay)
    .filter(isValidMetricsDay)
    .sort((a, b) => b.localeCompare(a));
  const keep = keys.slice(0, max);
  const out: Record<string, DayBucket> = {};
  for (const k of keep) {
    out[k] = sanitizeDayBucket(byDay[k]);
  }
  return out;
}

function ensureDay(state: LocalMetricsState, day: string): DayBucket {
  if (!state.byDay[day]) state.byDay[day] = emptyDay();
  return state.byDay[day];
}

export interface SessionContext {
  /** display-mode: standalone | browser | minimal-ui | fullscreen | other */
  displayMode: string;
  isWeChat: boolean;
  now?: Date;
}

/** 记录一次打开：日去重活跃、回访日、微信入口、display-mode */
export function recordOpen(state: LocalMetricsState, ctx: SessionContext): LocalMetricsState {
  const now = ctx.now ?? new Date();
  const day = localDayKey(now);
  const next: LocalMetricsState = {
    ...state,
    activeDays: [...state.activeDays],
    totals: { ...state.totals },
    byDay: { ...state.byDay },
  };

  const isFirstEver = !next.firstOpenDay;
  if (isFirstEver) next.firstOpenDay = day;
  next.lastOpenDay = day;
  next.totals.opens += 1;

  const alreadyActive = next.activeDays.includes(day);
  if (!alreadyActive) {
    next.activeDays = trimActiveDays([day, ...next.activeDays]);
    if (!isFirstEver) next.totals.returnDays += 1;
  }

  const bucket = { ...ensureDay(next, day) };
  bucket.opens += 1;
  next.byDay[day] = bucket;

  if (ctx.displayMode === 'standalone' || ctx.displayMode === 'fullscreen' || ctx.displayMode === 'minimal-ui') {
    next.totals.standaloneSessions += 1;
  } else {
    next.totals.browserSessions += 1;
  }

  if (ctx.isWeChat) {
    next.totals.wechatEntry += 1;
    next.byDay[day] = { ...next.byDay[day], wechatEntry: next.byDay[day].wechatEntry + 1 };
  }

  next.byDay = trimDayBuckets(next.byDay);
  return next;
}

export function recordWechatCopy(state: LocalMetricsState, now = new Date()): LocalMetricsState {
  const day = localDayKey(now);
  const next = clone(state);
  next.totals.wechatCopy += 1;
  const b = { ...ensureDay(next, day) };
  b.wechatCopy += 1;
  next.byDay[day] = b;
  next.byDay = trimDayBuckets(next.byDay);
  return next;
}

export function recordWechatDismiss(state: LocalMetricsState, now = new Date()): LocalMetricsState {
  const day = localDayKey(now);
  const next = clone(state);
  next.totals.wechatDismiss += 1;
  const b = { ...ensureDay(next, day) };
  b.wechatDismiss += 1;
  next.byDay[day] = b;
  next.byDay = trimDayBuckets(next.byDay);
  return next;
}

export function recordAppInstalled(state: LocalMetricsState): LocalMetricsState {
  const next = clone(state);
  next.totals.appinstalled += 1;
  return next;
}

export function recordBeforeInstallPrompt(state: LocalMetricsState): LocalMetricsState {
  const next = clone(state);
  next.totals.beforeinstallpromptSeen += 1;
  return next;
}

export function recordChannelOutcome(
  state: LocalMetricsState,
  channel: MetricChannel,
  outcome: MetricOutcome,
  now = new Date(),
): LocalMetricsState {
  const day = localDayKey(now);
  const next = clone(state);
  const b = { ...ensureDay(next, day) };

  const bump = (totalKey: keyof LocalMetricsState['totals'], dayKey: keyof DayBucket) => {
    next.totals[totalKey] = (next.totals[totalKey] as number) + 1;
    (b[dayKey] as number) += 1;
  };

  if (channel === 'fit') {
    if (outcome === 'success') bump('fitOk', 'fitOk');
    else bump('fitFail', 'fitFail');
  } else if (channel === 'ics') {
    if (outcome === 'success') bump('icsOk', 'icsOk');
    else bump('icsFail', 'icsFail');
  } else if (channel === 'icu') {
    if (outcome === 'success') bump('icuOk', 'icuOk');
    else if (outcome === 'partial') bump('icuPartial', 'icuPartial');
    else bump('icuFail', 'icuFail');
  } else if (channel === 'backup_export') {
    if (outcome === 'success') bump('backupExportOk', 'backupExportOk');
    else bump('backupExportFail', 'backupExportFail');
  } else if (channel === 'backup_import') {
    if (outcome === 'success') bump('backupImportOk', 'backupImportOk');
    else if (outcome === 'cancel') bump('backupImportCancel', 'backupImportCancel');
    else bump('backupImportFail', 'backupImportFail');
  } else if (channel === 'diag_export') {
    next.totals.diagExport += 1;
  }

  next.byDay[day] = b;
  next.byDay = trimDayBuckets(next.byDay);
  return next;
}

function clone(state: LocalMetricsState): LocalMetricsState {
  return {
    ...state,
    activeDays: [...state.activeDays],
    totals: { ...state.totals },
    byDay: { ...state.byDay },
  };
}

/** 诊断导出允许的顶层键（白名单） */
export const DIAG_ALLOWED_KEYS = [
  'schema',
  'version',
  'exportedAt',
  'app',
  'note',
  'metrics',
  'runtime',
] as const;

/** 诊断 metrics 内禁止出现的敏感键名 */
export const DIAG_FORBIDDEN_SUBSTRINGS = [
  'apikey',
  'api_key',
  'icuapikey',
  'athlete',
  'password',
  'secret',
  'authorization',
  'pb5k',
  'pb10k',
  'pbhalf',
  'pbfull',
  'goaltime',
  'plan',
  'completion',
  'myrace',
  'vacation',
  'fingerprint',
  'useragent',
  'query',
  'search',
  'href',
  'token',
] as const;

export type CoarseLanguage = 'zh' | 'en' | 'other';

/** 语言粗粒度，避免完整 locale 指纹 */
export function coarseLanguage(lang: string | undefined | null): CoarseLanguage {
  if (!lang) return 'other';
  const l = lang.toLowerCase();
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('en')) return 'en';
  return 'other';
}

export interface DiagnosticPayload {
  schema: 'marathon-trial-diagnostic';
  version: 1;
  app: 'marathon-training';
  exportedAt: string;
  note: string;
  metrics: {
    firstOpenDay: string | null;
    lastOpenDay: string | null;
    activeDayCount: number;
    returnDays: number;
    totals: LocalMetricsState['totals'];
    /** 仅最近若干日的聚合桶，不含任何 PII */
    recentDays: { day: string; bucket: DayBucket }[];
  };
  runtime: {
    /** 粗粒度，非指纹 */
    displayMode: string;
    language: CoarseLanguage;
    /** 仅偏移分钟，无 IANA / 无 viewport 像素 */
    timezoneOffsetMinutes: number;
    viewportBucket: string;
    standalone: boolean;
    wechatLikely: boolean;
  };
}

export function viewportBucket(w: number, h: number): string {
  const short = Math.min(w, h) || 0;
  const long = Math.max(w, h) || 0;
  if (short < 360) return 'phone-sm';
  if (short < 600) return 'phone';
  if (long < 1200) return 'tablet';
  return 'desktop';
}

export function buildDiagnosticPayload(
  state: LocalMetricsState,
  runtime: {
    displayMode: string;
    language: string;
    timezoneOffsetMinutes: number;
    width: number;
    height: number;
    standalone: boolean;
    wechatLikely: boolean;
  },
  now = new Date(),
): DiagnosticPayload {
  const days = Object.keys(state.byDay)
    .filter(isValidMetricsDay)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 30);
  // totals 只拷贝白名单键
  const totals = sanitizeTotals(state.totals);
  return {
    schema: 'marathon-trial-diagnostic',
    version: 1,
    app: 'marathon-training',
    exportedAt: now.toISOString(),
    note: '仅保存在本机；导出后由你自行提供。不含训练计划、成绩、赛事、API Key、Athlete ID 或 URL query。日粒度打开日，无精确首次/最近时间戳。',
    metrics: {
      firstOpenDay: isValidMetricsDay(state.firstOpenDay) ? state.firstOpenDay : null,
      lastOpenDay: isValidMetricsDay(state.lastOpenDay) ? state.lastOpenDay : null,
      activeDayCount: state.activeDays.filter(isValidMetricsDay).length,
      returnDays: totals.returnDays,
      totals,
      recentDays: days.map(day => ({
        day,
        // 严禁 spread 未知键：仅白名单重建
        bucket: sanitizeDayBucket(state.byDay[day]),
      })),
    },
    runtime: {
      displayMode: runtime.displayMode || 'unknown',
      language: coarseLanguage(runtime.language),
      timezoneOffsetMinutes: Number.isFinite(runtime.timezoneOffsetMinutes)
        ? Math.trunc(runtime.timezoneOffsetMinutes)
        : 0,
      viewportBucket: viewportBucket(runtime.width, runtime.height),
      standalone: !!runtime.standalone,
      wechatLikely: !!runtime.wechatLikely,
    },
  };
}

/** 深度检查诊断对象是否含禁止子串键名（迭代，防栈溢出） */
export function diagnosticHasForbiddenKeys(obj: unknown): string | null {
  type Frame = { v: unknown; path: string };
  const stack: Frame[] = [{ v: obj, path: '' }];
  const allowExact = new Set([
    'schema', 'version', 'exportedat', 'app', 'note', 'metrics', 'runtime',
    'firstopenday', 'lastopenday', 'activedaycount', 'returndays', 'totals',
    'recentdays', 'day', 'bucket', 'displaymode', 'language', 'timezoneoffsetminutes',
    'viewportbucket', 'standalone', 'wechatlikely', 'opens', 'wechatentry',
    'wechatcopy', 'wechatdismiss', 'standalonesessions', 'browsersessions',
    'beforeinstallpromptseen', 'appinstalled', 'fitok', 'fitfail', 'icsok',
    'icsfail', 'icuok', 'icupartial', 'icufail', 'backupexportok', 'backupexportfail',
    'backupimportok', 'backupimportfail', 'backupimportcancel', 'diagexport',
  ]);

  let nodes = 0;
  while (stack.length) {
    const { v, path } = stack.pop()!;
    nodes += 1;
    if (nodes > 20_000) return path || 'too_deep';
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        stack.push({ v: v[i], path: `${path}[${i}]` });
      }
      continue;
    }
    if (typeof v !== 'object') continue;
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (!allowExact.has(lower)) {
        for (const bad of DIAG_FORBIDDEN_SUBSTRINGS) {
          if (lower === bad || lower.includes(bad)) {
            return path ? `${path}.${k}` : k;
          }
        }
      }
      stack.push({ v: child, path: path ? `${path}.${k}` : k });
    }
  }
  return null;
}

// ─── localStorage 读写（浏览器侧；纯逻辑测 load/mutate 即可） ───────────────

export function readMetricsFromStorage(
  getItem: (k: string) => string | null = k => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
): LocalMetricsState {
  return loadMetricsFromRaw(getItem(METRICS_STORAGE_KEY));
}

export function writeMetricsToStorage(
  state: LocalMetricsState,
  setItem: (k: string, v: string) => void = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* quota / private */
    }
  },
): void {
  // 写出时始终 v2 白名单形态
  const clean: LocalMetricsState = {
    schema: METRICS_SCHEMA,
    version: METRICS_VERSION,
    firstOpenDay: isValidMetricsDay(state.firstOpenDay) ? state.firstOpenDay : null,
    lastOpenDay: isValidMetricsDay(state.lastOpenDay) ? state.lastOpenDay : null,
    activeDays: sanitizeActiveDays(state.activeDays),
    totals: sanitizeTotals(state.totals),
    byDay: sanitizeByDay(state.byDay),
  };
  setItem(METRICS_STORAGE_KEY, JSON.stringify(clean));
}

export function mutateMetrics(
  fn: (s: LocalMetricsState) => LocalMetricsState,
): LocalMetricsState {
  const next = fn(readMetricsFromStorage());
  writeMetricsToStorage(next);
  return next;
}

export function detectDisplayMode(
  matchMedia: (q: string) => { matches: boolean } = q => {
    try {
      return window.matchMedia(q);
    } catch {
      return { matches: false };
    }
  },
  search = typeof window !== 'undefined' ? window.location.search : '',
): string {
  if (matchMedia('(display-mode: standalone)').matches) return 'standalone';
  if (matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
  if (matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
  if (/display-mode=standalone/i.test(search)) return 'standalone';
  try {
    if (typeof navigator !== 'undefined' && 'standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone) {
      return 'standalone';
    }
  } catch {
    /* ignore */
  }
  return 'browser';
}

export function diagnosticFileName(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `marathon-diagnostic-${y}-${m}-${day}.json`;
}

export function downloadDiagnosticJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
