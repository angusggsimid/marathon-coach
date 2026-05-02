import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, DailyWorkout } from '../utils/training-engine';
import { generateTrainingPlan } from '../utils/training-engine';
import { addDays, format, startOfWeek, endOfWeek } from 'date-fns';

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

  updateProfile: (updates: Partial<UserProfile>) => void;
  generatePlan: () => void;
  setActiveTab: (tab: TabType) => void;
  logCompletion: (dateStr: string, status: CompletionStatus, rpe: RPELevel) => void;
  getWeeklyAdaptation: (weekEndSunday: Date) => WeeklyAdaptation;
  saveICUCredentials: (apiKey: string, athleteId: string) => void;
  addMyRace: (raceId: string, distance: MyRaceDistance, goal: MyRaceGoal, meta?: Omit<MyRace, 'raceId'|'distance'|'goal'|'addedAt'>) => void;
  removeMyRace: (raceId: string) => void;
  updateMyRaceGoal: (raceId: string, goal: MyRaceGoal) => void;
  addVacation: (start: string, end: string, label?: string) => void;
  removeVacation: (id: string) => void;
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

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: defaultProfile,
      plan: [],
      activeTab: 'races',
      isPlanGenerated: false,
      planNeedsRegen: false,
      completions: {},
      icuApiKey: '',
      icuAthleteId: '',
      myRaces: [],
      vacations: [],

      updateProfile: (updates) => {
        set({ profile: { ...get().profile, ...updates } });
      },

      generatePlan: () => {
        const { profile } = get();
        const plan = generateTrainingPlan(profile);
        set({ plan, isPlanGenerated: true, planNeedsRegen: false, activeTab: 'stats' });
      },

      setActiveTab: (tab) => set({ activeTab: tab }),

      saveICUCredentials: (apiKey, athleteId) => set({ icuApiKey: apiKey, icuAthleteId: athleteId }),

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
        // Look at Mon–Sat of the week ending on this Sunday
        const weekStart = startOfWeek(weekEndSunday, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(weekEndSunday, { weekStartsOn: 1 });

        // All scheduled non-Rest workouts in this window
        const scheduledWorkouts = plan.filter(w => {
          const d = new Date(w.date);
          return d >= weekStart && d <= weekEnd && w.workoutType !== 'Rest';
        });

        const totalWorkouts = scheduledWorkouts.length;
        if (totalWorkouts === 0) {
          return { completionRate: 1, avgRpe: 2, checkedCount: 0, totalWorkouts: 0, advice: '本周无训练记录', factor: 1.0 };
        }

        const checkedIn = scheduledWorkouts
          .map(w => completions[format(new Date(w.date), 'yyyy-MM-dd')])
          .filter(Boolean) as CompletionEntry[];

        const checkedCount = checkedIn.length;
        if (checkedCount === 0) {
          return { completionRate: 0, avgRpe: 2, checkedCount: 0, totalWorkouts, advice: '本周尚未打卡', factor: 1.0 };
        }

        const skipped = checkedIn.filter(c => c.status === 'skip').length;
        const completed = checkedIn.length - skipped;
        // Completion rate: completed sessions out of all scheduled workouts this week
        const completionRate = completed / totalWorkouts;
        const avgRpe = checkedIn.reduce((sum, c) => sum + c.rpe, 0) / checkedIn.length;

        let advice = '';
        let factor = 1.0;

        if (completionRate < 0.70 || avgRpe >= 3.0) {
          advice = `完成率 ${Math.round(completionRate * 100)}% · 体感偏累 → 建议下周减量 10%`;
          factor = 0.90;
        } else if (completionRate >= 0.90 && avgRpe <= 1.5) {
          advice = `完成率 ${Math.round(completionRate * 100)}% · 状态极佳 → 可尝试增加 5%`;
          factor = 1.05;
        } else {
          advice = `完成率 ${Math.round(completionRate * 100)}% · 体感正常 → 保持当前强度`;
          factor = 1.0;
        }

        return { completionRate, avgRpe, checkedCount, totalWorkouts, advice, factor };
      },
    }),
    {
      name: 'marathon-training-storage',
    }
  )
);
