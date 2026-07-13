/**
 * 周自适应：用上一完整周的完成率/RPE factor，只调整下一未来周的
 * 非 Rest、非 Race 训练距离；不改配速、不改比赛日。
 */
import {
  addDays,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import type { DailyWorkout } from './training-engine';

export type CompletionStatus = 'full' | 'partial' | 'skip';
export type RPELevel = 0 | 1 | 2 | 3 | 4;

export interface CompletionEntry {
  status: CompletionStatus;
  rpe: RPELevel;
}

export interface WeekAdaptationResult {
  completionRate: number;
  avgRpe: number;
  checkedCount: number;
  totalWorkouts: number;
  advice: string;
  factor: number;
}

/**
 * 统一成 YYYY-MM-DD（本地日历日）。
 * 纯日期字符串直接用；含时间的 ISO 必须先 Date 再 format，禁止截前 10 字符。
 */
export function toDateKey(value: Date | string): string {
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return format(d, 'yyyy-MM-dd');
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s.slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) return '';
  return format(value, 'yyyy-MM-dd');
}

function parseLocalDay(value: Date | string): Date {
  if (value instanceof Date) {
    return startOfDay(value);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return startOfDay(parseISO(s));
  }
  const d = new Date(s);
  return startOfDay(Number.isNaN(d.getTime()) ? new Date(NaN) : d);
}

/** 根据某周（以周日结尾的 ISO 周，周一为周起点）打卡数据计算建议系数 */
export function computeWeeklyAdaptation(
  plan: DailyWorkout[],
  completions: Record<string, CompletionEntry>,
  weekEndSunday: Date,
): WeekAdaptationResult {
  const weekStart = startOfWeek(weekEndSunday, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekEndSunday, { weekStartsOn: 1 });
  const startKey = format(weekStart, 'yyyy-MM-dd');
  const endKey = format(weekEnd, 'yyyy-MM-dd');

  const scheduledWorkouts = plan.filter(w => {
    const key = toDateKey(w.date);
    return key >= startKey && key <= endKey && w.workoutType !== 'Rest' && w.workoutType !== 'Race';
  });

  const totalWorkouts = scheduledWorkouts.length;
  if (totalWorkouts === 0) {
    return {
      completionRate: 1,
      avgRpe: 2,
      checkedCount: 0,
      totalWorkouts: 0,
      advice: '本周无训练记录',
      factor: 1.0,
    };
  }

  const checkedIn = scheduledWorkouts
    .map(w => completions[toDateKey(w.date)])
    .filter(Boolean) as CompletionEntry[];

  const checkedCount = checkedIn.length;
  if (checkedCount === 0) {
    return {
      completionRate: 0,
      avgRpe: 2,
      checkedCount: 0,
      totalWorkouts,
      advice: '本周尚未打卡',
      factor: 1.0,
    };
  }

  const skipped = checkedIn.filter(c => c.status === 'skip').length;
  const completed = checkedIn.length - skipped;
  const completionRate = completed / totalWorkouts;
  const avgRpe = checkedIn.reduce((sum, c) => sum + c.rpe, 0) / checkedIn.length;

  let advice = '';
  let factor = 1.0;

  if (completionRate < 0.70 || avgRpe >= 3.0) {
    advice = `完成率 ${Math.round(completionRate * 100)}% · 体感偏累 → 下周训练距离自动 -10%（配速与比赛日不变）`;
    factor = 0.90;
  } else if (completionRate >= 0.90 && avgRpe <= 1.5) {
    advice = `完成率 ${Math.round(completionRate * 100)}% · 状态极佳 → 下周训练距离自动 +5%（配速与比赛日不变）`;
    factor = 1.05;
  } else {
    advice = `完成率 ${Math.round(completionRate * 100)}% · 体感正常 → 保持当前训练距离`;
    factor = 1.0;
  }

  return { completionRate, avgRpe, checkedCount, totalWorkouts, advice, factor };
}

function scaleDistance(km: number | undefined, factor: number): number | undefined {
  if (km == null || km <= 0 || factor === 1) return km;
  return Math.round(km * factor * 10) / 10;
}

function scaleWorkoutDistance(workout: DailyWorkout, factor: number): DailyWorkout {
  if (factor === 1) return workout;
  if (workout.workoutType === 'Rest' || workout.workoutType === 'Race') return workout;

  const next: DailyWorkout = {
    ...workout,
    distanceKm: scaleDistance(workout.distanceKm, factor),
  };

  if (workout.details) {
    next.details = {
      ...workout.details,
      main: workout.details.main.map(seg => ({
        ...seg,
        distanceKm: scaleDistance(seg.distanceKm, factor),
      })),
      warmup: workout.details.warmup
        ? { ...workout.details.warmup, distanceKm: scaleDistance(workout.details.warmup.distanceKm, factor) }
        : undefined,
      cooldown: workout.details.cooldown
        ? { ...workout.details.cooldown, distanceKm: scaleDistance(workout.details.cooldown.distanceKm, factor) }
        : undefined,
    };
  }

  // 不改 targetPace / targetHR / workoutType；描述加短标记便于 UI 识别
  if (factor !== 1 && next.distanceKm != null && next.distanceKm > 0) {
    const pct = Math.round((factor - 1) * 100);
    const tag = pct < 0 ? `自适应${pct}%` : `自适应+${pct}%`;
    if (!workout.description.includes('自适应')) {
      next.description = `${workout.description}【${tag}】`;
    }
  }

  return next;
}

/**
 * 对计划应用自适应：
 * - 只看已经完整结束（周日已过）的上一周
 * - 系数只作用于「紧随其后的下一周」里、且日期仍在今天及以后的非 Rest/非 Race 课
 * - 不叠加修改配速与比赛日
 */
export function applyWeeklyAdaptation(
  plan: DailyWorkout[],
  completions: Record<string, CompletionEntry>,
  asOf: Date = new Date(),
): DailyWorkout[] {
  if (plan.length === 0) return plan;

  const today = startOfDay(asOf);
  const todayKey = format(today, 'yyyy-MM-dd');
  // 上一完整周：本周一之前结束的那一周（周日已过）
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  const prevWeekSunday = addDays(thisMonday, -1);
  const prevWeekMonday = startOfWeek(prevWeekSunday, { weekStartsOn: 1 });

  // 上一周必须已完全过去（周日 < 今天）
  if (!isBefore(prevWeekSunday, today)) return plan;

  const adaptation = computeWeeklyAdaptation(plan, completions, prevWeekSunday);
  if (adaptation.factor === 1 || adaptation.checkedCount === 0) return plan;

  const nextWeekMonday = addDays(prevWeekMonday, 7);
  const nextWeekSunday = addDays(nextWeekMonday, 6);
  const nextStartKey = format(nextWeekMonday, 'yyyy-MM-dd');
  const nextEndKey = format(nextWeekSunday, 'yyyy-MM-dd');

  return plan.map(w => {
    const key = toDateKey(w.date);
    if (key < nextStartKey || key > nextEndKey) return w;
    // 只调今天及未来训练日
    if (key < todayKey) return w;
    return scaleWorkoutDistance(w, adaptation.factor);
  });
}

/** 供 UI：当前 asOf 下是否正在对「本周」应用自适应，以及系数 */
export function getActiveAdaptationMeta(
  plan: DailyWorkout[],
  completions: Record<string, CompletionEntry>,
  asOf: Date = new Date(),
): { active: boolean; factor: number; advice: string; prevWeek: WeekAdaptationResult | null } {
  if (plan.length === 0) {
    return { active: false, factor: 1, advice: '', prevWeek: null };
  }
  const today = startOfDay(asOf);
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  const prevWeekSunday = addDays(thisMonday, -1);
  if (!isBefore(prevWeekSunday, today)) {
    return { active: false, factor: 1, advice: '', prevWeek: null };
  }
  const prevWeek = computeWeeklyAdaptation(plan, completions, prevWeekSunday);
  if (prevWeek.factor === 1 || prevWeek.checkedCount === 0) {
    return { active: false, factor: 1, advice: '', prevWeek };
  }
  // 自适应作用在「上一完整周之后的那一周」——若今天落在该周则 active
  const prevWeekMonday = startOfWeek(prevWeekSunday, { weekStartsOn: 1 });
  const targetMonday = addDays(prevWeekMonday, 7);
  const targetSunday = addDays(targetMonday, 6);
  const inTarget =
    !isBefore(today, targetMonday) && !isAfter(today, targetSunday);
  return {
    active: inTarget,
    factor: prevWeek.factor,
    advice: prevWeek.advice,
    prevWeek,
  };
}

export { parseLocalDay };
