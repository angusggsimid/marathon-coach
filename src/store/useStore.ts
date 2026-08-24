import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, DailyWorkout } from '../utils/training-engine';
import { generateTrainingPlan, timeToSeconds, resolveVDOT } from '../utils/training-engine';
import { computeWeeklyAdaptation } from '../utils/weekly-adaptation';
import type { CompletionEntry as AdaptCompletion } from '../utils/weekly-adaptation';
import type { ObjectiveAdaptation, AdaptationOverride } from '../utils/weekly-adaptation';
import { adaptationVerdict } from '../utils/insights/coach';
import { cycleCaps } from '../utils/insights/cycle';
import {
  migrateExportSyncState,
  recordFitExportSuccess,
  recordFullChannelSuccess,
  type ExportChannel,
  type ExportSyncState,
  type FitExportRange,
} from '../utils/plan-fingerprint';
import {
  buildAutoCheckinSuggestionsFromAppState,
  type AutoCheckinSuggestion,
} from '../utils/auto-checkin';
import {
  toRestorableState,
  type BackupData,
} from '../utils/backup';
import { normalizeWorkoutDate } from '../utils/training-engine';
import { addDays, format } from 'date-fns';
import { parseSnapshot } from '../utils/insights/validate';
import type { CorosSnapshot } from '../utils/insights/types';
import type { CoachPatch } from '../utils/insights/coach';
import { loadCorosAuth, saveCorosAuth, type CorosAuth } from '../utils/coros-mcp';

type TabType = 'profile' | 'stats' | 'calendar' | 'races' | 'insights';

// COROS 快照单独持久化（体积大，不入 zustand persist 主键）
const COROS_SNAPSHOT_KEY = 'marathon-coros-snapshot';

function loadCorosSnapshot(): CorosSnapshot | null {
  try {
    const raw = localStorage.getItem(COROS_SNAPSHOT_KEY);
    if (!raw) return null;
    const result = parseSnapshot(JSON.parse(raw));
    return result.ok ? result.snapshot : null;
  } catch {
    return null;
  }
}

/** 客观裁决在 store 层计算（同步/水合时点），hook 只纯读，避免渲染期不纯 */
function computeObjective(snapshot: CorosSnapshot | null, lastSyncAt: string | null): ObjectiveAdaptation | null {
  if (!snapshot || !lastSyncAt) return null;
  if (Date.now() - new Date(lastSyncAt).getTime() > 7 * 86400000) return null;
  return adaptationVerdict(snapshot);
}

/** 手表近 7 天负荷比均值（store 层计算，供训练页 ACWR 卡纯读） */
function computeLoadRatio(snapshot: CorosSnapshot | null, lastSyncAt: string | null): number | null {
  if (!snapshot || !lastSyncAt) return null;
  if (Date.now() - new Date(lastSyncAt).getTime() > 7 * 86400000) return null;
  const ratios = snapshot.dailyMetrics.slice(-7).filter((m) => m.loadRatio !== undefined);
  if (ratios.length < 3) return null;
  return ratios.reduce((s, m) => s + (m.loadRatio ?? 0), 0) / ratios.length;
}

// 0=没感觉, 1=轻松, 2=正常, 3=累, 4=很累
export type RPELevel = 0 | 1 | 2 | 3 | 4;
export type CompletionStatus = 'full' | 'partial' | 'skip';

export const RPE_LABELS: Record<RPELevel, string> = {
  0: '极轻松',
  1: '轻松',
  2: '正常',
  3: '累',
  4: '很累',
};

export const RPE_COLORS: Record<RPELevel, string> = {
  0: 'text-zinc-400 border-zinc-600 bg-zinc-800/50',
  1: 'text-green-400 border-green-500/40 bg-green-500/10',
  2: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
  3: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
  4: 'text-red-400 border-red-500/40 bg-red-500/10',
};

export interface CompletionEntry {
  status: CompletionStatus;
  rpe: RPELevel;
}

export type MyRaceGoal     = 'pb' | 'finish' | 'fun';
export type MyRaceDistance = 'full' | 'half' | '10k';

export interface MyRace {
  raceId:    string;
  distance:  MyRaceDistance;
  goal:      MyRaceGoal;
  addedAt:   string;         // ISO date string
  // Denormalized display fields — stored so "我的赛事" renders without catalog
  name?:            string;
  date?:            string;
  city?:            string;
  province?:        string;
  registrationUrl?: string;
  status?:          string;
  dateTBD?:         boolean;
  // 完赛记录（R3 预测校准数据源；仅全马/半马参与校准）
  resultStatus?:      'finished' | 'dnf' | 'dns';
  resultTime?:        string;   // 'hh:mm:ss'
  resultPredictedAtRace?: string; // 录入时抓取的手表预测（近似赛时预测）
}

export interface WeeklyAdaptation {
  completionRate: number; // 0–1
  avgRpe: number;         // 0–4
  checkedCount: number;
  totalWorkouts: number;
  advice: string;
  factor: number;         // 0.90 | 1.00 | 1.05
}

export interface Vacation {
  id:     string;
  start:  string; // 'YYYY-MM-DD'
  end:    string; // 'YYYY-MM-DD'
  label?: string;
}

interface AppState {
  profile: UserProfile;
  plan: DailyWorkout[];
  activeTab: TabType;
  isPlanGenerated: boolean;
  planNeedsRegen: boolean;   // true when races changed after last plan generation
  completions: Record<string, CompletionEntry>; // key = 'YYYY-MM-DD'
  myRaces: MyRace[];
  vacations: Vacation[];
  /** 分渠道最后成功导出/同步元数据（本地）；从未成功则为空 */
  exportSync: ExportSyncState;
  /** COROS 实测数据快照（洞察 Tab 数据源；单独键持久化，不入主 persist） */
  corosSnapshot: CorosSnapshot | null;
  /** 自动打卡建议（同步/导入后由活动↔计划匹配产出；用户确认后应用，不入 persist） */
  autoCheckinSuggestions: AutoCheckinSuggestion[];
  /** COROS 授权（token 单独键持久化，不入主 persist） */
  corosAuth: CorosAuth | null;
  /** 上次 COROS 同步时间（ISO） */
  corosLastSyncAt: string | null;
  /** 自动同步频率（天） */
  corosSyncIntervalDays: number;
  /** 2.3 用户对客观裁决的否决（目标周周一 key + factor） */
  adaptationOverride: AdaptationOverride | null;
  /** 2.3 客观裁决（store 层计算，hook 纯读） */
  corosObjective: ObjectiveAdaptation | null;
  /** 手表近 7 天负荷比均值（store 层计算，组件纯读） */
  corosLoadRatio: number | null;
  /** 任务 3：课级就绪门否决（被降级课的日期 key；null = 接受降级） */
  sessionOverride: string | null;

  updateProfile: (updates: Partial<UserProfile>) => void;
  generatePlan: () => void;
  setActiveTab: (tab: TabType) => void;
  logCompletion: (dateStr: string, status: CompletionStatus, rpe: RPELevel) => void;
  getWeeklyAdaptation: (weekEndSunday: Date) => WeeklyAdaptation;
  addMyRace: (raceId: string, distance: MyRaceDistance, goal: MyRaceGoal, meta?: Omit<MyRace, 'raceId'|'distance'|'goal'|'addedAt'>) => void;
  removeMyRace: (raceId: string) => void;
  updateMyRaceGoal: (raceId: string, goal: MyRaceGoal) => void;
  /** 记录完赛成绩（finished 需 time；预测为录入时抓取快照） */
  setRaceResult: (raceId: string, result: { status: 'finished' | 'dnf' | 'dns'; time?: string; predicted?: string }) => void;
  addVacation: (start: string, end: string, label?: string) => void;
  removeVacation: (id: string) => void;
  /**
   * 仅在真实成功回调后写入。
   * - FIT：传 effectivePlan + range，按作用域记指纹（窄范围不覆盖宽范围）
   * - ICS/ICU：传全计划指纹；ICU 须 allSucceeded
   */
  markExportSuccess: (
    channel: ExportChannel,
    planOrFingerprint: DailyWorkout[] | string,
    range?: FitExportRange,
  ) => void;
  /**
   * 从已校验备份恢复产品状态。
   * 覆盖白名单字段。
   */
  restoreFromBackup: (data: BackupData) => void;

  /** 导入 COROS 快照（校验白名单 + 数值范围）；返回错误信息或 null 表示成功 */
  importCorosSnapshot: (data: unknown) => string | null;
  /** 清除 COROS 快照 */
  clearCorosSnapshot: () => void;
  /** 应用全部自动打卡建议（只写缺失日期，不覆盖手动记录），然后清空 */
  applyAutoCheckins: () => void;
  /** 忽略本次建议 */
  dismissAutoCheckins: () => void;
  /**
   * 一键校准：把 COROS 实测写入档案（仅 ltPace/lthr）并用引擎重算计划。
   * 引擎守卫返回空计划时保留旧计划并置 planNeedsRegen。
   */
  applyCorosCalibration: (patch: CoachPatch) => { applied: string[]; planRegenerated: boolean };

  /** 更新 COROS 授权（null = 断开）；token 存单独键 */
  updateCorosAuth: (auth: CorosAuth | null) => void;
  /** 记录一次成功同步的时间 */
  setCorosLastSync: (iso: string) => void;
  /** 设置自动同步频率（天） */
  setCorosSyncIntervalDays: (days: number) => void;

  /** 2.3：COROS 数据新鲜（≤7 天）时返回客观裁决，否则 null */
  getObjectiveAdaptation: () => ObjectiveAdaptation | null;
  /** 2.3：否决/恢复客观裁决 */
  setAdaptationOverride: (override: AdaptationOverride | null) => void;
  /** 任务 3：否决课级降级（dateKey）或恢复（null） */
  setSessionOverride: (dateKey: string | null) => void;
}

/**
 * Derives profile.raceDate / raceType from myRaces.
 * Rules (in priority order):
 *  1. All PB races — pick the FARTHEST one (most demanding, needs longest build)
 *  2. If no PB races — pick the farthest race of any goal
 *  3. If no races with a known date — return {} (don't change profile)
 *
 * This is called whenever myRaces changes so the profile always stays in sync.
 */
function primaryRaceProfile(races: MyRace[]): Partial<UserProfile> {
  const valid = races.filter(r => r.date && !r.dateTBD);
  if (valid.length === 0) return {};
  const pb = valid.filter(r => r.goal === 'pb');
  const candidates = pb.length > 0 ? pb : valid;
  const primary = candidates.reduce((best, r) => (r.date! > best.date! ? r : best));
  return {
    raceDate: primary.date!,
    raceType: primary.distance === 'full' ? 'full' : 'half',
  };
}

const defaultProfile: UserProfile = {
  height: '',
  weight: '',
  pb5k: '',
  pb10k: '',
  pbHalf: '',
  pbFull: '',
  lthr: '',
  ltPace: '',
  raceDate: format(addDays(new Date(), 120), 'yyyy-MM-dd'),
  raceType: 'half',
  goalTime: '',
  intensity: 'moderate',
  longRunDay: 0,
};

/** 从 persist 根或嵌套 state 取出可写 state 对象，迁移 exportSync（并清除遗留的 icuApiKey/icuAthleteId） */
function stripApiKeyAndNormalizeExport(
  persisted: unknown,
): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted;
  const root = persisted as Record<string, unknown>;

  // zustand persist 常见形状：{ state, version } 或直接 state
  const stateBag: Record<string, unknown> =
    root.state && typeof root.state === 'object'
      ? (root.state as Record<string, unknown>)
      : root;

  // 清理已删除的 ICU 通道遗留字段（旧版本持久化数据）
  if ('icuApiKey' in stateBag) delete stateBag.icuApiKey;
  if ('icuAthleteId' in stateBag) delete stateBag.icuAthleteId;
  if (stateBag !== root && 'icuApiKey' in root) delete root.icuApiKey;
  if (stateBag !== root && 'icuAthleteId' in root) delete root.icuAthleteId;

  stateBag.exportSync = migrateExportSyncState(stateBag.exportSync);
  return persisted;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: defaultProfile,
      plan: [],
      activeTab: 'profile',
      isPlanGenerated: false,
      planNeedsRegen: false,
      completions: {},
      myRaces: [],
      vacations: [],
      exportSync: {},
      corosSnapshot: loadCorosSnapshot(),
      autoCheckinSuggestions: [],
      corosAuth: loadCorosAuth(),
      corosLastSyncAt: null,
      corosSyncIntervalDays: 3,
      adaptationOverride: null,
      corosObjective: null,
      corosLoadRatio: null,
      sessionOverride: null,

      updateProfile: (updates) => {
        set({ profile: { ...get().profile, ...updates } });
      },

      markExportSuccess: (channel, planOrFingerprint, range) => {
        set(state => {
          const prev = state.exportSync ?? {};
          if (channel === 'fit') {
            if (!Array.isArray(planOrFingerprint) || !range) return {};
            return {
              exportSync: recordFitExportSuccess(
                prev,
                planOrFingerprint,
                range,
              ),
            };
          }
          if (typeof planOrFingerprint !== 'string' || !planOrFingerprint) {
            return {};
          }
          return {
            exportSync: recordFullChannelSuccess(
              prev,
              planOrFingerprint,
            ),
          };
        });
      },

      restoreFromBackup: (data) => {
        const slice = toRestorableState(data);
        set(state => ({
          ...state,
          profile: slice.profile,
          plan: slice.plan.map(w => ({
            ...w,
            date: normalizeWorkoutDate(w.date as Date | string),
          })),
          completions: slice.completions,
          myRaces: slice.myRaces,
          vacations: slice.vacations,
          isPlanGenerated: slice.isPlanGenerated,
          planNeedsRegen: slice.planNeedsRegen,
          exportSync: slice.exportSync,
          autoCheckinSuggestions: [],
          // 不恢复备份中的 activeTab：固定档案页，避免成功反馈因跳转消失
          activeTab: 'profile',
        }));
      },

      generatePlan: () => {
        const { profile } = get();
        const plan = generateTrainingPlan(profile);
        // 引擎硬守卫失败时返回 []：不要把空计划标记为已生成，避免旧用户误入空日历
        if (plan.length === 0) {
          set({ plan: [], isPlanGenerated: false, planNeedsRegen: false });
          return;
        }
        set({ plan, isPlanGenerated: true, planNeedsRegen: false, activeTab: 'calendar', autoCheckinSuggestions: [] });
      },

      importCorosSnapshot: (data) => {
        const result = parseSnapshot(data);
        if (!result.ok) return result.error;
        const {
          corosLastSyncAt, plan, completions, myRaces, vacations,
          profile, adaptationOverride, sessionOverride,
        } = get();
        // 先基于新快照算客观裁决，再按生效计划口径算自动打卡建议
        const objective = computeObjective(result.snapshot, corosLastSyncAt);
        const autoCheckinSuggestions = buildAutoCheckinSuggestionsFromAppState({
          plan, completions, myRaces, vacations, profile,
          corosSnapshot: result.snapshot,
          objective,
          override: adaptationOverride,
          sessionOverride,
        });
        set({
          corosSnapshot: result.snapshot,
          autoCheckinSuggestions,
          corosObjective: objective,
          corosLoadRatio: computeLoadRatio(result.snapshot, corosLastSyncAt),
        });
        try {
          localStorage.setItem(COROS_SNAPSHOT_KEY, JSON.stringify(result.snapshot));
        } catch { /* 存储满则仅内存态 */ }
        return null;
      },

      clearCorosSnapshot: () => {
        set({ corosSnapshot: null, autoCheckinSuggestions: [] });
        try { localStorage.removeItem(COROS_SNAPSHOT_KEY); } catch { /* 忽略 */ }
      },

      applyAutoCheckins: () => {
        const { autoCheckinSuggestions, completions } = get();
        const next = { ...completions };
        for (const s of autoCheckinSuggestions) {
          // 防御：只写缺失日期，绝不覆盖手动记录
          if (!next[s.dateStr]) next[s.dateStr] = { status: s.status, rpe: s.rpe };
        }
        set({ completions: next, autoCheckinSuggestions: [] });
      },

      dismissAutoCheckins: () => set({ autoCheckinSuggestions: [] }),

      applyCorosCalibration: (patch) => {
        const applied: string[] = [];
        const updates: Partial<UserProfile> = {};
        if (patch.ltPace !== undefined && typeof patch.ltPace === 'string' && /^\d{1,2}:\d{2}$/.test(patch.ltPace)) {
          updates.ltPace = patch.ltPace;
          applied.push(`乳酸阈配速 → ${patch.ltPace} /km`);
        }
        if (patch.lthr !== undefined && Number.isFinite(patch.lthr) && patch.lthr >= 60 && patch.lthr <= 230) {
          updates.lthr = patch.lthr;
          applied.push(`乳酸阈心率 → ${patch.lthr} bpm`);
        }
        // C1 核心：设备实测 VO₂max 覆盖（只升不降 vs 当前生效值）
        if (patch.vdotOverride !== undefined && Number.isFinite(patch.vdotOverride)
            && patch.vdotOverride >= 30 && patch.vdotOverride <= 90) {
          const curEffective = resolveVDOT(get().profile);
          if (patch.vdotOverride > curEffective) {
            updates.vdotOverride = patch.vdotOverride;
            applied.push(`VO₂max 引擎覆盖 → ${patch.vdotOverride}（设备实测优先于换算）`);
          }
        }
        // C1：PB 能力锚自动刷新（只升不降；空值填充）
        for (const [key, label] of [['pbHalf', '半马'], ['pbFull', '全马']] as const) {
          const v = patch[key];
          if (v === undefined || typeof v !== 'string' || !/^\d{1,2}:[0-5]\d:[0-5]\d$/.test(v)) continue;
          const cur = get().profile[key];
          if (cur && timeToSeconds(v) >= timeToSeconds(cur)) continue; // 只升不降
          updates[key] = v;
          applied.push(`${label} 能力锚 → ${v}（COROS 实测刷新）`);
        }
        if (applied.length === 0) return { applied, planRegenerated: false };

        const profile = { ...get().profile, ...updates };
        const plan = generateTrainingPlan(profile);
        if (plan.length > 0) {
          set({ profile, plan, isPlanGenerated: true, planNeedsRegen: false, autoCheckinSuggestions: [] });
          return { applied, planRegenerated: true };
        }
        // 引擎守卫拦截：只补档案，计划交回用户手动重生成
        set({ profile, planNeedsRegen: get().plan.length > 0 });
        return { applied, planRegenerated: false };
      },

      updateCorosAuth: (auth) => {
        set({ corosAuth: auth });
        saveCorosAuth(auth);
      },

      setCorosLastSync: (iso) =>
        set({
          corosLastSyncAt: iso,
          corosObjective: computeObjective(get().corosSnapshot, iso),
          corosLoadRatio: computeLoadRatio(get().corosSnapshot, iso),
        }),

      setCorosSyncIntervalDays: (days) => set({ corosSyncIntervalDays: days }),

      getObjectiveAdaptation: () => get().corosObjective,

      setAdaptationOverride: (override) => set({ adaptationOverride: override }),

      setSessionOverride: (dateKey) => set({ sessionOverride: dateKey }),

      setActiveTab: (tab) => set({ activeTab: tab }),


      addMyRace: (raceId, distance, goal, meta = {}) => {
        const entry: MyRace = { raceId, distance, goal, addedAt: new Date().toISOString(), ...meta };
        set(state => {
          const newRaces = [...state.myRaces.filter(r => r.raceId !== raceId), entry]
            .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
          const profileUpdate = primaryRaceProfile(newRaces);
          const primaryChanged = profileUpdate.raceDate && profileUpdate.raceDate !== state.profile.raceDate;
          return {
            myRaces: newRaces,
            profile: { ...state.profile, ...profileUpdate },
            planNeedsRegen: state.isPlanGenerated && !!primaryChanged ? true : state.planNeedsRegen,
          };
        });
      },
      removeMyRace: (raceId) => set(state => {
        const newRaces = state.myRaces.filter(r => r.raceId !== raceId);
        const profileUpdate = primaryRaceProfile(newRaces);
        const primaryChanged = profileUpdate.raceDate && profileUpdate.raceDate !== state.profile.raceDate;
        return {
          myRaces: newRaces,
          profile: { ...state.profile, ...profileUpdate },
          planNeedsRegen: state.isPlanGenerated && !!primaryChanged ? true : state.planNeedsRegen,
        };
      }),
      updateMyRaceGoal: (raceId, goal) => set(state => {
        const newRaces = state.myRaces.map(r => r.raceId === raceId ? { ...r, goal } : r);
        const profileUpdate = primaryRaceProfile(newRaces);
        const primaryChanged = profileUpdate.raceDate && profileUpdate.raceDate !== state.profile.raceDate;
        return {
          myRaces: newRaces,
          profile: { ...state.profile, ...profileUpdate },
          planNeedsRegen: state.isPlanGenerated && !!primaryChanged ? true : state.planNeedsRegen,
        };
      }),

      setRaceResult: (raceId, result) => set(state => ({
        myRaces: state.myRaces.map(r => r.raceId !== raceId ? r : {
          ...r,
          resultStatus: result.status,
          ...(result.status === 'finished' && result.time ? { resultTime: result.time } : { resultTime: undefined }),
          ...(result.predicted ? { resultPredictedAtRace: result.predicted } : {}),
        }),
      })),

      logCompletion: (dateStr, status, rpe) => {
        set(state => ({
          completions: { ...state.completions, [dateStr]: { status, rpe } }
        }));
      },

      addVacation: (start, end, label) => {
        // Clamp: end must be ≥ start
        const validEnd = end >= start ? end : start;
        const entry: Vacation = { id: `vac-${Date.now()}`, start, end: validEnd, label };
        set(state => ({ vacations: [...state.vacations, entry] }));
      },

      removeVacation: (id) => {
        set(state => ({ vacations: state.vacations.filter(v => v.id !== id) }));
      },

      getWeeklyAdaptation: (weekEndSunday) => {
        const { plan, completions, getObjectiveAdaptation, adaptationOverride, profile, corosSnapshot } = get();
        // plan 可能经 persist 把 Date 变成 ISO 字符串；compute 内部用 toDateKey 兼容。
        // 说明：此处用原始 plan（不含 race/vacation overlay），与日志周摘要一致；
        // 实际距离缩放见 useEffectivePlan → applyWeeklyAdaptation(basePlan)。
        return computeWeeklyAdaptation(
          plan as Parameters<typeof computeWeeklyAdaptation>[0],
          completions as Record<string, AdaptCompletion>,
          weekEndSunday,
          getObjectiveAdaptation(),
          adaptationOverride,
          cycleCaps(corosSnapshot, profile),
        );
      },
    }),
    {
      name: 'marathon-training-storage',
      // v4：FIT 分作用域元数据；旧 v3 单条 fit 安全迁移
      version: 4,
      // 安全：API Key 不得写入 localStorage；仅会话内存保留
      partialize: (state) => {
        const {
          corosAuth: _omitAuth,
          corosSnapshot: _omitSnapshot,
          autoCheckinSuggestions: _omitCheckins,
          profile, plan, activeTab, isPlanGenerated, planNeedsRegen,
          completions, myRaces, vacations, exportSync,
          corosLastSyncAt, corosSyncIntervalDays, adaptationOverride, sessionOverride,
        } = state;
        void _omitAuth; void _omitSnapshot; void _omitCheckins;
        return {
          profile, plan, activeTab, isPlanGenerated, planNeedsRegen,
          completions, myRaces, vacations, exportSync,
          corosLastSyncAt, corosSyncIntervalDays, adaptationOverride, sessionOverride,
        };
      },
      migrate: (persisted: unknown, _fromVersion: number) => {
        void _fromVersion;
        return stripApiKeyAndNormalizeExport(persisted) as never;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const merged = {
          ...current,
          ...p,
          exportSync: migrateExportSyncState(p.exportSync),
        };
        // 水合时点重算客观裁决（渲染期不纯计算）
        return {
          ...merged,
          corosObjective: computeObjective(merged.corosSnapshot ?? null, merged.corosLastSyncAt ?? null),
          corosLoadRatio: computeLoadRatio(merged.corosSnapshot ?? null, merged.corosLastSyncAt ?? null),
        };
      },
    }
  )
);
