import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, DailyWorkout } from '../utils/training-engine';
import { generateTrainingPlan } from '../utils/training-engine';
import { computeWeeklyAdaptation } from '../utils/weekly-adaptation';
import type { CompletionEntry as AdaptCompletion } from '../utils/weekly-adaptation';
import {
  migrateExportSyncState,
  recordFitExportSuccess,
  recordFullChannelSuccess,
  type ExportChannel,
  type ExportSyncState,
  type FitExportRange,
} from '../utils/plan-fingerprint';
import {
  toRestorableState,
  type BackupData,
} from '../utils/backup';
import { normalizeWorkoutDate } from '../utils/training-engine';
import { addDays, format } from 'date-fns';

type TabType = 'profile' | 'stats' | 'calendar' | 'races';

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
  icuApiKey: string;
  icuAthleteId: string;
  myRaces: MyRace[];
  vacations: Vacation[];
  /** 分渠道最后成功导出/同步元数据（本地）；从未成功则为空 */
  exportSync: ExportSyncState;

  updateProfile: (updates: Partial<UserProfile>) => void;
  generatePlan: () => void;
  setActiveTab: (tab: TabType) => void;
  logCompletion: (dateStr: string, status: CompletionStatus, rpe: RPELevel) => void;
  getWeeklyAdaptation: (weekEndSunday: Date) => WeeklyAdaptation;
  saveICUCredentials: (apiKey: string, athleteId: string) => void;
  clearICUCredentials: () => void;
  addMyRace: (raceId: string, distance: MyRaceDistance, goal: MyRaceGoal, meta?: Omit<MyRace, 'raceId'|'distance'|'goal'|'addedAt'>) => void;
  removeMyRace: (raceId: string) => void;
  updateMyRaceGoal: (raceId: string, goal: MyRaceGoal) => void;
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
   * 覆盖白名单字段；强制 icuApiKey=''；不改写 icuAthleteId（最小敏感：备份本身不含）。
   */
  restoreFromBackup: (data: BackupData) => void;
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

/** 从 persist 根或嵌套 state 取出可写 state 对象，并剔除 icuApiKey */
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

  if ('icuApiKey' in stateBag) delete stateBag.icuApiKey;
  if (stateBag !== root && 'icuApiKey' in root) delete root.icuApiKey;

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
      icuApiKey: '',
      icuAthleteId: '',
      myRaces: [],
      vacations: [],
      exportSync: {},

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
              channel,
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
          // 不恢复备份中的 activeTab：固定档案页，避免成功反馈因跳转消失
          activeTab: 'profile',
          icuApiKey: '',
          // 保留本地 Athlete ID（备份不含凭证类标识）
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
        set({ plan, isPlanGenerated: true, planNeedsRegen: false, activeTab: 'calendar' });
      },

      setActiveTab: (tab) => set({ activeTab: tab }),

      saveICUCredentials: (apiKey, athleteId) => set({ icuApiKey: apiKey, icuAthleteId: athleteId }),
      clearICUCredentials: () => set({ icuApiKey: '', icuAthleteId: get().icuAthleteId }),

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
        const { plan, completions } = get();
        // plan 可能经 persist 把 Date 变成 ISO 字符串；compute 内部用 toDateKey 兼容。
        // 说明：此处用原始 plan（不含 race/vacation overlay），与日志周摘要一致；
        // 实际距离缩放见 useEffectivePlan → applyWeeklyAdaptation(basePlan)。
        return computeWeeklyAdaptation(
          plan as Parameters<typeof computeWeeklyAdaptation>[0],
          completions as Record<string, AdaptCompletion>,
          weekEndSunday,
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
          icuApiKey: _omitKey,
          profile, plan, activeTab, isPlanGenerated, planNeedsRegen,
          completions, icuAthleteId, myRaces, vacations, exportSync,
        } = state;
        void _omitKey;
        return {
          profile, plan, activeTab, isPlanGenerated, planNeedsRegen,
          completions, icuAthleteId, myRaces, vacations, exportSync,
        };
      },
      migrate: (persisted: unknown, _fromVersion: number) => {
        void _fromVersion;
        return stripApiKeyAndNormalizeExport(persisted) as never;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          icuApiKey: '',
          exportSync: migrateExportSyncState(p.exportSync),
        };
      },
    }
  )
);
