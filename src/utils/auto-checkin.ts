import { format } from 'date-fns';
import type { DailyWorkout, UserProfile } from './training-engine';
import { normalizeWorkoutDate } from './training-engine';
import type { ActualActivity, CorosSnapshot } from './insights/types';
import { cycleCaps } from './insights/cycle';
import { applySessionReadiness, sessionReadiness } from './insights/readiness';
import { applyWeeklyAdaptation, type ObjectiveAdaptation, type AdaptationOverride } from './weekly-adaptation';
import type { CompletionEntry } from './weekly-adaptation';
import { applyRaceOverlays, applyVacationOverlay } from './race-plan-overlay';
import { QUALITY_TE_TYPES, teStats, judgeTeQuality } from './te-quality';
import type { MyRace, Vacation } from '../store/useStore';

/**
 * 自动打卡：把快照里的实际活动与计划课匹配，生成可确认的打卡建议。
 * 纯函数；应用与否由用户确认（applyAutoCheckins），不静默写数据。
 */

export const AUTO_RUN_TYPES = new Set([
  'Easy', 'LSD', 'Tempo', 'TempoIntervals', 'Interval',
  'Hills', 'Fartlek', 'MP', 'Cruise', 'Progression', 'Race', 'Recovery',
]);

/** 质量课：有目标配速的课，匹配时需配速门验证（Easy/LSD/Recovery/Race 只看距离） */
const PACE_GATED_TYPES = QUALITY_TE_TYPES;

/** 活动平均配速比目标区间慢端慢超过 25% → 视为未按课执行 */
const PACE_TOLERANCE = 1.25;

export type AutoCheckinStatus = 'full' | 'partial';

export interface AutoCheckinSuggestion {
  /** 计划课所在日 YYYY-MM-DD（本地时区） */
  dateStr: string;
  workoutType: string;
  plannedKm: number;
  actualKm: number;
  status: AutoCheckinStatus;
  /** 按配速相对目标区间映射（partial=1；质量课快/区间内/偏慢=3/2/1；轻松课=2）；用户可改 */
  rpe: 1 | 2 | 3;
  /** TE 相对基线的判定说明（强度不足已降 partial；偏硬保持 full 仅提示） */
  teNote?: string;
  activityName?: string;
}

/** 距离比在 [0.75, 1.3] → full；[0.4, 0.75) → partial；其余不匹配 */
export const FULL_RATIO_MIN = 0.75;
export const FULL_RATIO_MAX = 1.3;
export const PARTIAL_RATIO_MIN = 0.4;

/** 目标配速字符串 → 慢端秒数/km；无法解析返回 null */
export function targetPaceSlowEndSec(targetPace?: string): number | null {
  if (!targetPace) return null;
  const clean = targetPace.replace(/^[<>]\s*/, '');
  const parts = clean.split('-');
  const part = parts.length >= 2 ? parts[parts.length - 1] : parts[0];
  const m = part.trim().match(/(\d+)[^\d](\d+)/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

/** 目标配速字符串 → 快端秒数/km；无法解析返回 null */
export function targetPaceFastEndSec(targetPace?: string): number | null {
  if (!targetPace) return null;
  const clean = targetPace.replace(/^[<>]\s*/, '');
  const parts = clean.split('-');
  const part = parts[0];
  const m = part.trim().match(/(\d+)[^\d](\d+)/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

/** RPE 按配速相对目标区间的相对位置映射（有数据依据，非猜测） */
function rpeFromPace(
  status: AutoCheckinStatus,
  workout: DailyWorkout,
  avgPaceSec?: number,
): 1 | 2 | 3 {
  if (status === 'partial') return 1;
  // 无配速数据或非质量课（Easy/LSD/Recovery/Race）：保持中性
  if (avgPaceSec == null || !PACE_GATED_TYPES.has(workout.workoutType)) return 2;
  const fastEnd = targetPaceFastEndSec(workout.targetPace);
  const slowEnd = targetPaceSlowEndSec(workout.targetPace);
  if (fastEnd != null && avgPaceSec <= fastEnd) return 3; // 比目标快端还快 → 累
  if (slowEnd != null && avgPaceSec <= slowEnd) return 2;  // 区间内 → 正常
  return 1; // 慢于慢端（≤25% 容差内仍算完成）→ 轻松
}

export function matchActivitiesToPlan(
  plan: DailyWorkout[],
  activities: ActualActivity[],
  asOf: Date = new Date(),
): AutoCheckinSuggestion[] {
  const suggestions: AutoCheckinSuggestion[] = [];
  const stats = teStats(activities, asOf);

  for (const workout of plan) {
    if (!AUTO_RUN_TYPES.has(workout.workoutType)) continue;
    if (!workout.distanceKm || workout.distanceKm <= 0) continue;
    const dateStr = format(workout.date, 'yyyy-MM-dd');

    const candidates = activities.filter(
      a => a.type === 'run' && a.date === dateStr && a.distanceKm && a.distanceKm > 0,
    );
    if (candidates.length === 0) continue;

    // 同日多次跑：取距离比最接近 1 的；平局取跑量大的
    let best: ActualActivity | null = null;
    let bestRatio = Infinity;
    for (const a of candidates) {
      const ratio = Math.abs(a.distanceKm! / workout.distanceKm - 1);
      if (ratio < bestRatio || (ratio === bestRatio && (best?.distanceKm ?? 0) < a.distanceKm!)) {
        best = a;
        bestRatio = ratio;
      }
    }
    if (!best) continue;

    const actualKm = best.distanceKm!;
    const ratio = actualKm / workout.distanceKm;
    let status: AutoCheckinStatus | null = null;
    if (ratio >= FULL_RATIO_MIN && ratio <= FULL_RATIO_MAX) status = 'full';
    else if (ratio >= PARTIAL_RATIO_MIN && ratio < FULL_RATIO_MIN) status = 'partial';
    if (!status) continue;

    // 配速门：质量课明显慢于目标区间 → 跑了但没按课执行，full 降 partial
    if (
      status === 'full' &&
      PACE_GATED_TYPES.has(workout.workoutType) &&
      best.avgPaceSec != null
    ) {
      const slowEnd = targetPaceSlowEndSec(workout.targetPace);
      if (slowEnd != null && best.avgPaceSec > slowEnd * PACE_TOLERANCE) {
        status = 'partial';
      }
    }

    // TE 门：生理刺激相对个人基线验证（配速是输出，TE 是刺激）
    let teNote: string | undefined;
    if (status === 'full') {
      const j = judgeTeQuality(workout.workoutType, 'full', best.aerobicTe ?? null, stats);
      if (j.judgment === 'under-stimulus') { status = 'partial'; teNote = j.note; }
      else if (j.judgment === 'over-cooked') { teNote = j.note; }
    }

    suggestions.push({
      dateStr,
      workoutType: workout.workoutType,
      plannedKm: workout.distanceKm,
      actualKm,
      status,
      rpe: rpeFromPace(status, workout, best.avgPaceSec),
      teNote,
      activityName: best.name,
    });
  }

  return suggestions;
}

/** 过滤已有打卡的日期（不覆盖手动记录） */
export function buildAutoCheckinSuggestions(
  plan: DailyWorkout[],
  activities: ActualActivity[],
  existingCompletions: Record<string, CompletionEntry> = {},
  asOf: Date = new Date(),
): AutoCheckinSuggestion[] {
  return matchActivitiesToPlan(plan, activities, asOf).filter(
    s => !existingCompletions[s.dateStr],
  );
}

/**
 * 用「生效计划」口径计算建议：与 useEffectivePlan 同一条纯函数管线
 * （赛事/休假覆盖 → 周自适应 → 就绪门降级），避免用户按降级课执行却被
 * 原始计划误判。输入全部来自 store，可在 store 外（测试）复用。
 */
export interface AutoCheckinStateInput {
  plan: DailyWorkout[];
  completions: Record<string, CompletionEntry>;
  myRaces: MyRace[];
  vacations: Vacation[];
  profile: UserProfile;
  corosSnapshot: CorosSnapshot | null;
  objective: ObjectiveAdaptation | null;
  override: AdaptationOverride | null;
  sessionOverride: string | null;
  asOf?: Date;
}

export function buildAutoCheckinSuggestionsFromAppState(
  input: AutoCheckinStateInput,
): AutoCheckinSuggestion[] {
  const { plan, myRaces, vacations, profile, completions } = input;
  const asOf = input.asOf ?? new Date();
  const normalized = plan.map(w => ({
    ...w,
    date: normalizeWorkoutDate(w.date as Date | string),
  }));
  const withRaces = applyRaceOverlays(normalized, myRaces, profile.raceType);
  const withVacation = applyVacationOverlay(withRaces, vacations);
  const adapted = applyWeeklyAdaptation(
    withVacation,
    completions,
    undefined,
    input.objective,
    input.override,
    cycleCaps(input.corosSnapshot, profile),
  );
  const gated = applySessionReadiness(
    adapted,
    profile,
    sessionReadiness(input.corosSnapshot),
    asOf,
    input.sessionOverride,
  );
  const activities = input.corosSnapshot?.activities ?? [];
  return buildAutoCheckinSuggestions(gated.plan, activities, completions, asOf);
}