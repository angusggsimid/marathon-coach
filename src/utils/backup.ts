/**
 * 计划与本地状态 JSON 备份 / 恢复。
 * - 白名单字段，拒绝任意 merge
 * - 永不导出/恢复任何凭据；按最小敏感原则不含 icuApiKey/icuAthleteId（历史字段）
 * - 严格解析 WorkoutDetails / 日期 / URL；状态不变量
 * - 恢复不改 UI activeTab（保持档案页以便成功反馈可见）
 * - 兼容 plan.date 经 persist 变成字符串的现状
 */
import type { UserProfile, DailyWorkout, WorkoutDetails, WorkoutSegment } from './training-engine';
import { normalizeWorkoutDate } from './training-engine';
import type { CompletionEntry, MyRace, Vacation } from '../store/useStore';
import {
  migrateExportSyncState,
  type ExportSyncState,
} from './plan-fingerprint';

export const BACKUP_APP_ID = 'marathon-training';
export const BACKUP_SCHEMA = 'marathon-backup';
/** 当前支持的备份 schema 版本；更高版本拒绝导入 */
export const BACKUP_VERSION = 1;
/** 导入文件大小上限（字节） */
export const BACKUP_MAX_BYTES = 5 * 1024 * 1024;

/** 条目上限：防 5MB 内极端条目冻结 */
export const BACKUP_MAX_PLAN_DAYS = 400;
export const BACKUP_MAX_COMPLETIONS = 800;
export const BACKUP_MAX_MY_RACES = 80;
export const BACKUP_MAX_VACATIONS = 60;
export const BACKUP_MAX_MAIN_SEGMENTS = 40;
export const BACKUP_MAX_STR = 500;
export const BACKUP_MAX_DESC = 2000;
export const BACKUP_MAX_SECRET_NODES = 50_000;

/** 可恢复的产品状态字段（白名单）。activeTab 不在恢复集。 */
export const BACKUP_DATA_KEYS = [
  'profile',
  'plan',
  'completions',
  'myRaces',
  'vacations',
  'isPlanGenerated',
  'planNeedsRegen',
  'exportSync',
] as const;

export type BackupDataKey = (typeof BACKUP_DATA_KEYS)[number];

export type BackupTab = 'profile' | 'stats' | 'calendar' | 'races';

export interface BackupData {
  profile: UserProfile;
  plan: DailyWorkout[];
  completions: Record<string, CompletionEntry>;
  myRaces: MyRace[];
  vacations: Vacation[];
  isPlanGenerated: boolean;
  planNeedsRegen: boolean;
  exportSync: ExportSyncState;
  /** 旧备份可能带此字段；解析可校验但不恢复 */
  activeTab?: BackupTab;
}

export interface BackupPayload {
  schema: typeof BACKUP_SCHEMA;
  version: number;
  app: typeof BACKUP_APP_ID;
  exportedAt: string;
  data: BackupData;
}

/** 从 store 切片导出时的输入（不含凭证） */
export interface BackupSourceState {
  profile: UserProfile;
  plan: DailyWorkout[];
  completions: Record<string, CompletionEntry>;
  myRaces: MyRace[];
  vacations: Vacation[];
  isPlanGenerated: boolean;
  planNeedsRegen: boolean;
  exportSync: ExportSyncState;
  activeTab?: BackupTab;
}

export type BackupParseErrorCode =
  | 'too_large'
  | 'not_json'
  | 'not_object'
  | 'bad_schema'
  | 'bad_app'
  | 'unsupported_version'
  | 'bad_exported_at'
  | 'missing_data'
  | 'bad_structure'
  | 'contains_secrets';

export type BackupParseResult =
  | { ok: true; payload: BackupPayload }
  | { ok: false; code: BackupParseErrorCode; message: string };

export const BACKUP_ERROR_MESSAGES: Record<BackupParseErrorCode, string> = {
  too_large: '文件过大（上限 5MB）',
  not_json: '不是合法的 JSON',
  not_object: '备份根节点必须是对象',
  bad_schema: '不是本应用的备份格式',
  bad_app: '应用标识不匹配',
  unsupported_version: '备份版本过高，当前应用不支持',
  bad_exported_at: '导出时间无效',
  missing_data: '缺少 data 字段',
  bad_structure: '备份数据结构不合法',
  contains_secrets: '备份含有不允许的敏感字段',
};

const TABS = new Set(['profile', 'stats', 'calendar', 'races']);
const COMPLETION_STATUS = new Set(['full', 'partial', 'skip']);
const RPE = new Set([0, 1, 2, 3, 4]);
const RACE_DIST = new Set(['full', 'half', '10k']);
const RACE_GOAL = new Set(['pb', 'finish', 'fun']);
const INTENSITY = new Set(['light', 'moderate', 'heavy']);
const RACE_TYPE = new Set(['half', 'full']);

const ROOT_KEYS = new Set(['schema', 'version', 'app', 'exportedAt', 'data']);
/** data 允许字段：恢复集 + 可选旧 activeTab（忽略恢复） */
const DATA_KEYS = new Set([...BACKUP_DATA_KEYS, 'activeTab']);

const PROFILE_KEYS = new Set([
  'height', 'weight', 'pb5k', 'pb10k', 'pbHalf', 'pbFull',
  'lthr', 'ltPace', 'raceDate', 'raceType', 'goalTime', 'intensity', 'longRunDay',
]);
const WORKOUT_KEYS = new Set([
  'date', 'workoutType', 'description', 'targetPace', 'targetHR',
  'distanceKm', 'details', 'weeklySummary',
]);
const DETAILS_KEYS = new Set(['warmup', 'main', 'cooldown']);
const SEGMENT_KEYS = new Set([
  'name', 'distanceKm', 'durationMins', 'pace', 'hrZone', 'reps', 'rest', 'description',
]);
const WEEKLY_SUMMARY_KEYS = new Set(['weekNum', 'phase', 'volume', 'tips']);
const COMPLETION_ENTRY_KEYS = new Set(['status', 'rpe']);
const MY_RACE_KEYS = new Set([
  'raceId', 'distance', 'goal', 'addedAt', 'name', 'date', 'city',
  'province', 'registrationUrl', 'status', 'dateTBD',
]);
const VACATION_KEYS = new Set(['id', 'start', 'end', 'label']);

const SECRET_KEY_RE = /^(icuapikey|api_key|apikey|authorization|password|secret)$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function onlyKeys(obj: Record<string, unknown>, allowed: Set<string>): boolean {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) return false;
  }
  return true;
}

/** 真实本地日历日 YYYY-MM-DD（非仅正则） */
export function isValidLocalYmd(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function isIsoDateTime(s: unknown): s is string {
  if (typeof s !== 'string' || !s.trim()) return false;
  const t = Date.parse(s);
  return !Number.isNaN(t);
}

function finiteNum(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

function boundedStr(v: unknown, max = BACKUP_MAX_STR): v is string {
  return typeof v === 'string' && v.length <= max;
}

/** 空串或 http(s) URL；拒绝 javascript: 等 */
export function isSafeHttpUrl(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (s === '') return true;
  if (s.length > BACKUP_MAX_DESC) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function fail(code: BackupParseErrorCode): BackupParseResult {
  return { ok: false, code, message: BACKUP_ERROR_MESSAGES[code] };
}

function parseSegment(raw: unknown): WorkoutSegment | null {
  if (!isPlainObject(raw)) return null;
  if (!onlyKeys(raw, SEGMENT_KEYS)) return null;
  if (!boundedStr(raw.name, BACKUP_MAX_STR)) return null;
  const seg: WorkoutSegment = { name: raw.name };
  if (raw.distanceKm !== undefined) {
    if (!finiteNum(raw.distanceKm, 0, 500)) return null;
    seg.distanceKm = raw.distanceKm;
  }
  if (raw.durationMins !== undefined) {
    if (!finiteNum(raw.durationMins, 0, 24 * 60)) return null;
    seg.durationMins = raw.durationMins;
  }
  if (raw.pace !== undefined) {
    if (!boundedStr(raw.pace, 40)) return null;
    seg.pace = raw.pace;
  }
  if (raw.hrZone !== undefined) {
    if (!boundedStr(raw.hrZone, 80)) return null;
    seg.hrZone = raw.hrZone;
  }
  if (raw.reps !== undefined) {
    if (!finiteNum(raw.reps, 0, 200) || !Number.isInteger(raw.reps)) return null;
    seg.reps = raw.reps;
  }
  if (raw.rest !== undefined) {
    if (!boundedStr(raw.rest, 80)) return null;
    seg.rest = raw.rest;
  }
  if (raw.description !== undefined) {
    if (!boundedStr(raw.description, BACKUP_MAX_DESC)) return null;
    seg.description = raw.description;
  }
  return seg;
}

function parseWorkoutDetails(raw: unknown): WorkoutDetails | null {
  if (!isPlainObject(raw)) return null;
  if (!onlyKeys(raw, DETAILS_KEYS)) return null;
  if (!Array.isArray(raw.main)) return null;
  if (raw.main.length === 0 || raw.main.length > BACKUP_MAX_MAIN_SEGMENTS) return null;
  const main: WorkoutSegment[] = [];
  for (const item of raw.main) {
    const s = parseSegment(item);
    if (!s) return null;
    main.push(s);
  }
  const details: WorkoutDetails = { main };
  if (raw.warmup !== undefined) {
    const w = parseSegment(raw.warmup);
    if (!w) return null;
    details.warmup = w;
  }
  if (raw.cooldown !== undefined) {
    const c = parseSegment(raw.cooldown);
    if (!c) return null;
    details.cooldown = c;
  }
  return details;
}

function parseProfile(raw: unknown): UserProfile | null {
  if (!isPlainObject(raw)) return null;
  if (!onlyKeys(raw, PROFILE_KEYS)) return null;
  const height = raw.height;
  const weight = raw.weight;
  const lthr = raw.lthr;
  const longRunDay = raw.longRunDay;
  if (
    !(height === '' || finiteNum(height, 0, 300)) ||
    !(weight === '' || finiteNum(weight, 0, 500)) ||
    !(lthr === '' || finiteNum(lthr, 0, 250)) ||
    typeof longRunDay !== 'number' ||
    !Number.isInteger(longRunDay) ||
    longRunDay < 0 ||
    longRunDay > 6
  ) {
    return null;
  }
  for (const k of ['pb5k', 'pb10k', 'pbHalf', 'pbFull', 'ltPace', 'goalTime'] as const) {
    if (!boundedStr(raw[k], 40)) return null;
  }
  // raceDate：空或真实本地日
  if (typeof raw.raceDate !== 'string' || raw.raceDate.length > 40) return null;
  if (raw.raceDate !== '' && !isValidLocalYmd(raw.raceDate)) return null;
  if (!RACE_TYPE.has(raw.raceType as string)) return null;
  if (!INTENSITY.has(raw.intensity as string)) return null;
  return {
    height: height as number | '',
    weight: weight as number | '',
    pb5k: raw.pb5k as string,
    pb10k: raw.pb10k as string,
    pbHalf: raw.pbHalf as string,
    pbFull: raw.pbFull as string,
    lthr: lthr as number | '',
    ltPace: raw.ltPace as string,
    raceDate: raw.raceDate as string,
    raceType: raw.raceType as 'half' | 'full',
    goalTime: raw.goalTime as string,
    intensity: raw.intensity as 'light' | 'moderate' | 'heavy',
    longRunDay,
  };
}

function parseWorkout(raw: unknown): DailyWorkout | null {
  if (!isPlainObject(raw)) return null;
  if (!onlyKeys(raw, WORKOUT_KEYS)) return null;
  if (raw.date == null) return null;
  const date = normalizeWorkoutDate(raw.date as Date | string);
  if (Number.isNaN(date.getTime())) return null;
  // 归一后本地日须真实有效
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!isValidLocalYmd(ymd)) return null;
  if (!boundedStr(raw.workoutType, 40) || !boundedStr(raw.description, BACKUP_MAX_DESC)) return null;
  const w: DailyWorkout = {
    date,
    workoutType: raw.workoutType,
    description: raw.description,
  };
  if (raw.targetPace !== undefined) {
    if (!boundedStr(raw.targetPace, 40)) return null;
    w.targetPace = raw.targetPace;
  }
  if (raw.targetHR !== undefined) {
    if (!boundedStr(raw.targetHR, 80)) return null;
    w.targetHR = raw.targetHR;
  }
  if (raw.distanceKm !== undefined) {
    if (!finiteNum(raw.distanceKm, 0, 500)) return null;
    w.distanceKm = raw.distanceKm;
  }
  if (raw.details !== undefined) {
    const details = parseWorkoutDetails(raw.details);
    if (!details) return null;
    w.details = details;
  }
  if (raw.weeklySummary !== undefined) {
    if (!isPlainObject(raw.weeklySummary)) return null;
    if (!onlyKeys(raw.weeklySummary, WEEKLY_SUMMARY_KEYS)) return null;
    const ws = raw.weeklySummary;
    if (
      !finiteNum(ws.weekNum, 0, 100) ||
      !boundedStr(ws.phase, 80) ||
      !finiteNum(ws.volume, 0, 500) ||
      !boundedStr(ws.tips, BACKUP_MAX_DESC)
    ) {
      return null;
    }
    w.weeklySummary = {
      weekNum: ws.weekNum,
      phase: ws.phase,
      volume: ws.volume,
      tips: ws.tips,
    };
  }
  return w;
}

function parseCompletions(raw: unknown): Record<string, CompletionEntry> | null {
  if (!isPlainObject(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length > BACKUP_MAX_COMPLETIONS) return null;
  const out: Record<string, CompletionEntry> = {};
  for (const [k, v] of Object.entries(raw)) {
    // 打卡 key 必须是真实本地日
    if (!isValidLocalYmd(k)) return null;
    if (!isPlainObject(v)) return null;
    if (!onlyKeys(v, COMPLETION_ENTRY_KEYS)) return null;
    if (!COMPLETION_STATUS.has(v.status as string)) return null;
    if (!RPE.has(v.rpe as number)) return null;
    out[k] = { status: v.status as CompletionEntry['status'], rpe: v.rpe as CompletionEntry['rpe'] };
  }
  return out;
}

function parseMyRaces(raw: unknown): MyRace[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > BACKUP_MAX_MY_RACES) return null;
  const out: MyRace[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    if (!onlyKeys(item, MY_RACE_KEYS)) return null;
    if (!boundedStr(item.raceId, 120) || !item.raceId) return null;
    if (!RACE_DIST.has(item.distance as string)) return null;
    if (!RACE_GOAL.has(item.goal as string)) return null;
    if (!isIsoDateTime(item.addedAt)) return null;
    const race: MyRace = {
      raceId: item.raceId,
      distance: item.distance as MyRace['distance'],
      goal: item.goal as MyRace['goal'],
      addedAt: item.addedAt,
    };
    for (const opt of ['name', 'city', 'province', 'status'] as const) {
      if (item[opt] !== undefined) {
        if (!boundedStr(item[opt], BACKUP_MAX_STR)) return null;
        race[opt] = item[opt] as string;
      }
    }
    if (item.date !== undefined) {
      if (typeof item.date !== 'string') return null;
      if (item.date !== '' && !isValidLocalYmd(item.date)) return null;
      race.date = item.date;
    }
    if (item.registrationUrl !== undefined) {
      if (!isSafeHttpUrl(item.registrationUrl)) return null;
      race.registrationUrl = item.registrationUrl;
    }
    if (item.dateTBD !== undefined) {
      if (typeof item.dateTBD !== 'boolean') return null;
      race.dateTBD = item.dateTBD;
    }
    out.push(race);
  }
  return out;
}

function parseVacations(raw: unknown): Vacation[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > BACKUP_MAX_VACATIONS) return null;
  const out: Vacation[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    if (!onlyKeys(item, VACATION_KEYS)) return null;
    if (!boundedStr(item.id, 80) || !item.id) return null;
    if (!isValidLocalYmd(item.start) || !isValidLocalYmd(item.end)) return null;
    if (item.start > item.end) return null;
    const v: Vacation = { id: item.id, start: item.start, end: item.end };
    if (item.label !== undefined) {
      if (!boundedStr(item.label, BACKUP_MAX_STR)) return null;
      v.label = item.label;
    }
    out.push(v);
  }
  return out;
}

/**
 * 迭代扫描对象树是否含凭证类键。
 * 有界节点数；depth 超限视为含危险结构（拒绝），不静默放过。
 */
export function containsForbiddenSecrets(value: unknown, maxDepth = 32): boolean {
  type Frame = { v: unknown; depth: number };
  const stack: Frame[] = [{ v: value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { v, depth } = stack.pop()!;
    nodes += 1;
    if (nodes > BACKUP_MAX_SECRET_NODES) return true;
    if (v == null) continue;
    if (depth > maxDepth) return true;
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) {
        stack.push({ v: v[i], depth: depth + 1 });
      }
      continue;
    }
    if (!isPlainObject(v)) continue;
    for (const [k, child] of Object.entries(v)) {
      const lower = k.toLowerCase().replace(/[\s_-]/g, '');
      // 归一后仍匹配常见密钥名
      if (
        SECRET_KEY_RE.test(k.toLowerCase()) ||
        lower === 'icuapikey' ||
        lower === 'apikey' ||
        lower === 'authorization' ||
        lower === 'password' ||
        lower === 'secret'
      ) {
        return true;
      }
      stack.push({ v: child, depth: depth + 1 });
    }
  }
  return false;
}

function parseData(raw: unknown): BackupData | null {
  if (!isPlainObject(raw)) return null;
  if (!onlyKeys(raw, DATA_KEYS)) return null;
  if (containsForbiddenSecrets(raw)) return null;

  const profile = parseProfile(raw.profile);
  if (!profile) return null;
  if (!Array.isArray(raw.plan)) return null;
  if (raw.plan.length > BACKUP_MAX_PLAN_DAYS) return null;
  const plan: DailyWorkout[] = [];
  for (const w of raw.plan) {
    const parsed = parseWorkout(w);
    if (!parsed) return null;
    plan.push(parsed);
  }
  const completions = parseCompletions(raw.completions);
  if (!completions) return null;
  const myRaces = parseMyRaces(raw.myRaces);
  if (!myRaces) return null;
  const vacations = parseVacations(raw.vacations);
  if (!vacations) return null;
  if (typeof raw.isPlanGenerated !== 'boolean') return null;
  if (typeof raw.planNeedsRegen !== 'boolean') return null;

  // 状态不变量
  if (raw.isPlanGenerated === true && plan.length === 0) return null;

  let exportSync: ExportSyncState = {};
  if (raw.exportSync !== undefined) {
    if (!isPlainObject(raw.exportSync)) return null;
    exportSync = migrateExportSyncState(raw.exportSync);
  }

  // activeTab：旧备份可能带；calendar/stats 必须有 plan；但不写入恢复结果
  if (raw.activeTab !== undefined) {
    if (typeof raw.activeTab !== 'string' || !TABS.has(raw.activeTab)) return null;
    if (
      (raw.activeTab === 'calendar' || raw.activeTab === 'stats') &&
      plan.length === 0
    ) {
      return null;
    }
  }

  return {
    profile,
    plan,
    completions,
    myRaces,
    vacations,
    isPlanGenerated: raw.isPlanGenerated,
    planNeedsRegen: raw.planNeedsRegen,
    exportSync,
  };
}

/** 序列化 plan：Date → ISO 字符串，便于 JSON 稳定 */
function serializePlan(plan: DailyWorkout[]): unknown[] {
  return plan.map(w => ({
    ...w,
    date: w.date instanceof Date ? w.date.toISOString() : w.date,
  }));
}

/** 从当前状态构建备份对象（永不带凭证；不含 activeTab） */
export function buildBackupPayload(state: BackupSourceState, now = new Date()): BackupPayload {
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    app: BACKUP_APP_ID,
    exportedAt: now.toISOString(),
    data: {
      profile: { ...state.profile },
      plan: serializePlan(state.plan) as unknown as DailyWorkout[],
      completions: { ...state.completions },
      myRaces: state.myRaces.map(r => ({ ...r })),
      vacations: state.vacations.map(v => ({ ...v })),
      isPlanGenerated: state.isPlanGenerated,
      planNeedsRegen: state.planNeedsRegen,
      exportSync: migrateExportSyncState(state.exportSync),
    },
  };
}

export function backupFileName(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `marathon-backup-${y}-${m}-${day}.json`;
}

export function backupToJson(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * 解析并校验备份文本。
 * 注意：通过后 payload.data.plan 中 date 已规范为 Date。
 */
export function parseBackupJson(text: string, byteLength?: number): BackupParseResult {
  if (byteLength != null && byteLength > BACKUP_MAX_BYTES) return fail('too_large');
  if (byteLength == null && text.length * 2 > BACKUP_MAX_BYTES) return fail('too_large');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('not_json');
  }
  if (!isPlainObject(parsed)) return fail('not_object');
  if (!onlyKeys(parsed, ROOT_KEYS)) return fail('bad_structure');

  if (containsForbiddenSecrets(parsed)) return fail('contains_secrets');

  if (parsed.schema !== BACKUP_SCHEMA) return fail('bad_schema');
  if (parsed.app !== BACKUP_APP_ID) return fail('bad_app');
  if (typeof parsed.version !== 'number' || !Number.isInteger(parsed.version) || parsed.version < 1) {
    return fail('unsupported_version');
  }
  if (parsed.version > BACKUP_VERSION) return fail('unsupported_version');
  if (!isIsoDateTime(parsed.exportedAt)) return fail('bad_exported_at');
  if (parsed.data == null) return fail('missing_data');

  const data = parseData(parsed.data);
  if (!data) return fail('bad_structure');

  if (containsForbiddenSecrets(data)) return fail('contains_secrets');

  return {
    ok: true,
    payload: {
      schema: BACKUP_SCHEMA,
      version: parsed.version,
      app: BACKUP_APP_ID,
      exportedAt: parsed.exportedAt as string,
      data,
    },
  };
}

/**
 * 恢复时会覆盖的本地字段说明（中文，供确认 UI）。
 * 与 toRestorableState / restoreFromBackup 真实写入一致；不含 activeTab / Athlete ID / API Key。
 */
export function describeOverwriteFields(data: BackupData): string[] {
  return [
    '档案与成绩',
    `训练计划（${data.plan.length} 天）`,
    `打卡记录（${Object.keys(data.completions).length} 条）`,
    `我的赛事（${data.myRaces.length} 场）`,
    `休假（${data.vacations.length} 段）`,
    '计划生成状态',
    '导出/同步元数据',
  ];
}

/**
 * 将已校验 data 转为 store 可 set 的切片。
 * 不写 activeTab（恢复后固定档案页）；历史凭据字段由 containsForbiddenSecrets 拦截。
 */
export function toRestorableState(data: BackupData): {
  profile: UserProfile;
  plan: DailyWorkout[];
  completions: Record<string, CompletionEntry>;
  myRaces: MyRace[];
  vacations: Vacation[];
  isPlanGenerated: boolean;
  planNeedsRegen: boolean;
  exportSync: ExportSyncState;
} {
  return {
    profile: data.profile,
    plan: data.plan.map(w => ({
      ...w,
      date: normalizeWorkoutDate(w.date as Date | string),
    })),
    completions: data.completions,
    myRaces: data.myRaces,
    vacations: data.vacations,
    isPlanGenerated: data.isPlanGenerated,
    planNeedsRegen: data.planNeedsRegen,
    exportSync: migrateExportSyncState(data.exportSync),
  };
}

/** 触发浏览器下载备份文件（表示「浏览器下载已触发」，非保证用户已保存） */
export function downloadBackupJson(json: string, filename: string): void {
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
