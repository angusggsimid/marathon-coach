/**
 * 共享周快照：三行证明与轻量周报的唯一数据口径。
 * 系数/完成率/RPE 一律复用 weekly-adaptation，禁止在此重写规则。
 */
import {
  addDays,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import type { DailyWorkout } from './training-engine';
import {
  computeWeeklyAdaptation,
  getActiveAdaptationMeta,
  toDateKey,
  type CompletionEntry,
  type RPELevel,
  type ObjectiveAdaptation,
  type AdaptationOverride,
} from './weekly-adaptation';
import type { CycleCaps } from './insights/cycle';

export const RPE_TEXT: Record<RPELevel, string> = {
  0: '极轻松',
  1: '轻松',
  2: '正常',
  3: '累',
  4: '很累',
};

export interface KeyWorkout {
  date: string;
  workoutType: string;
  description: string;
  distanceKm?: number;
}

export interface AdaptationProofLines {
  /** 改了什么 */
  change: string;
  /** 依据什么 */
  evidence: string;
  /** 什么没变 */
  unchanged: string;
}

export interface WeekSnapshot {
  asOfKey: string;
  /** 上一完整周 Mon–Sun */
  prevWeekStart: string;
  prevWeekEnd: string;
  /** 自适应作用目标周（上一完整周的下一周） */
  targetWeekStart: string;
  targetWeekEnd: string;
  planWorkoutCount: number;
  checkedCount: number;
  completionRate: number;
  avgRpe: number;
  avgRpeLabel: string;
  planDistanceKm: number;
  /** 按打卡状态估算完成距离；无打卡为 null */
  estimatedCompletedKm: number | null;
  factor: number;
  advice: string;
  /** 2.3 双源合并元数据 */
  subjectiveFactor?: number;
  objectiveFactor?: number;
  adoptedSource?: 'subjective' | 'merged' | 'override';
  objectiveSummary?: string;
  cycleReasons?: string[];
  /** 有至少一次打卡才算“有评估数据” */
  hasCheckins: boolean;
  /** 当前 asOf 是否落在目标周且 factor≠1 且有打卡（与 getActiveAdaptationMeta.active 一致） */
  adaptationActive: boolean;
  /** 是否应展示三行证明强调卡：active 且 factor≠1 */
  showProofCard: boolean;
  keyWorkout: KeyWorkout | null;
  proof: AdaptationProofLines | null;
  /** 周报五行（空态时 items 为空，用 emptyMessage） */
  reportLines: string[];
  emptyMessage: string | null;
  /** 周日/周一提高视觉权重 */
  highlightReport: boolean;
}

/**
 * 统一周快照。
 * @param basePlan race+vacation 后的底表（与 getActiveAdaptationMeta / computeWeeklyAdaptation 一致，禁止在此重写系数）
 * @param effectivePlan 已应用自适应的执行上下文；关键课日期/课型/距离取自目标周切片。缺省回退 basePlan。
 */
export function buildWeekSnapshot(
  basePlan: DailyWorkout[],
  completions: Record<string, CompletionEntry>,
  asOf: Date = new Date(),
  effectivePlan?: DailyWorkout[],
  objective?: ObjectiveAdaptation | null,
  override?: AdaptationOverride | null,
  cycle?: CycleCaps | null,
): WeekSnapshot {
  const today = startOfDay(asOf);
  const asOfKey = format(today, 'yyyy-MM-dd');
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  const prevWeekSunday = addDays(thisMonday, -1);
  const prevWeekMonday = startOfWeek(prevWeekSunday, { weekStartsOn: 1 });
  const prevWeekStart = format(prevWeekMonday, 'yyyy-MM-dd');
  const prevWeekEnd = format(prevWeekSunday, 'yyyy-MM-dd');
  const targetMonday = addDays(prevWeekMonday, 7);
  const targetSunday = addDays(targetMonday, 6);
  const targetWeekStart = format(targetMonday, 'yyyy-MM-dd');
  const targetWeekEnd = format(targetSunday, 'yyyy-MM-dd');

  // 系数/完成率：始终复用 weekly-adaptation，底表 = basePlan
  const prev = computeWeeklyAdaptation(basePlan, completions, prevWeekSunday, objective ?? null, override ?? null, cycle ?? null);
  const meta = getActiveAdaptationMeta(basePlan, completions, today, objective ?? null, override ?? null, cycle ?? null);

  const prevWorkouts = filterRunnableInWeek(
    basePlan,
    prevWeekStart,
    prevWeekEnd,
  );

  const planDistanceKm =
    Math.round(
      prevWorkouts.reduce((s, w) => s + (w.distanceKm ?? 0), 0) * 10,
    ) / 10;

  let estimatedCompletedKm: number | null = null;
  if (prev.checkedCount > 0) {
    let sum = 0;
    for (const w of prevWorkouts) {
      const c = completions[toDateKey(w.date)];
      if (!c) continue;
      const km = w.distanceKm ?? 0;
      if (c.status === 'full') sum += km;
      else if (c.status === 'partial') sum += km * 0.5;
      // skip → 0
    }
    estimatedCompletedKm = Math.round(sum * 10) / 10;
  }

  const avgRpeRounded = Math.round(prev.avgRpe) as RPELevel;
  const avgRpeLabel =
    prev.checkedCount > 0
      ? RPE_TEXT[clampRpe(avgRpeRounded)] ?? '正常'
      : '—';

  // 关键课：目标周（适应作用周）的 effective 执行上下文，不是上周评估周
  const execPlan = effectivePlan ?? basePlan;
  const keyWorkout = pickKeyWorkoutInWeek(
    execPlan,
    targetWeekStart,
    targetWeekEnd,
  );
  const hasCheckins = prev.checkedCount > 0;
  // 2.3：客观裁决/否决生效时，即使无打卡也展示证明卡（透明展示双源合并）
  const showProofCard =
    meta.active &&
    meta.factor !== 1 &&
    (hasCheckins || prev.adoptedSource === 'merged' || prev.adoptedSource === 'override');

  const proof = showProofCard
    ? buildProofLines(meta.factor, prev, avgRpeLabel)
    : null;

  const day = today.getDay(); // 0 Sun … 1 Mon
  const highlightReport = day === 0 || day === 1;

  let emptyMessage: string | null = null;
  const reportLines: string[] = [];

  if (!hasCheckins) {
    emptyMessage =
      prev.totalWorkouts === 0
        ? '上周计划中没有可评估的跑步课，暂无周报。'
        : '上周还没有打卡记录，补记后才能生成诚实的周报与调整说明。';
  } else {
    const ratePct = Math.round(prev.completionRate * 100);
    reportLines.push(
      `打卡 ${prev.checkedCount}/${prev.totalWorkouts} 节 · 完成率 ${ratePct}%`,
    );
    if (estimatedCompletedKm != null) {
      reportLines.push(
        `计划约 ${planDistanceKm} km · 按打卡估算完成 ${estimatedCompletedKm} km`,
      );
    } else {
      reportLines.push(`计划约 ${planDistanceKm} km`);
    }
    reportLines.push(`平均体感「${avgRpeLabel}」`);
    reportLines.push(impactLine(meta, prev));
    if (keyWorkout) {
      const title =
        keyWorkout.description.split(' - ')[0] || keyWorkout.workoutType;
      const km =
        keyWorkout.distanceKm && keyWorkout.distanceKm > 0
          ? ` · ${keyWorkout.distanceKm}km`
          : '';
      reportLines.push(
        `本周关键课：${keyWorkout.date.slice(5)} ${title}${km}`,
      );
    }
  }

  return {
    asOfKey,
    prevWeekStart,
    prevWeekEnd,
    targetWeekStart,
    targetWeekEnd,
    planWorkoutCount: prev.totalWorkouts,
    checkedCount: prev.checkedCount,
    completionRate: prev.completionRate,
    avgRpe: prev.avgRpe,
    avgRpeLabel,
    planDistanceKm,
    estimatedCompletedKm,
    factor: meta.active ? meta.factor : hasCheckins ? prev.factor : 1,
    advice: prev.advice,
    subjectiveFactor: prev.subjectiveFactor,
    objectiveFactor: prev.objectiveFactor,
    adoptedSource: prev.adoptedSource,
    objectiveSummary: prev.objectiveSummary,
    cycleReasons: prev.cycleReasons,
    hasCheckins,
    adaptationActive: meta.active,
    showProofCard,
    keyWorkout,
    proof,
    reportLines,
    emptyMessage,
    highlightReport,
  };
}

/** 周内非 Rest/Race 课次（共享过滤，避免 UI 自写） */
export function filterRunnableInWeek(
  plan: DailyWorkout[],
  weekStart: string,
  weekEnd: string,
): DailyWorkout[] {
  return plan.filter(w => {
    const k = toDateKey(w.date);
    return (
      k >= weekStart &&
      k <= weekEnd &&
      w.workoutType !== 'Rest' &&
      w.workoutType !== 'Race'
    );
  });
}

/** 从指定周切片选关键课（优先 LSD/MP，否则最远） */
export function pickKeyWorkoutInWeek(
  plan: DailyWorkout[],
  weekStart: string,
  weekEnd: string,
): KeyWorkout | null {
  return pickKeyWorkout(filterRunnableInWeek(plan, weekStart, weekEnd));
}

function clampRpe(n: number): RPELevel {
  if (n <= 0) return 0;
  if (n >= 4) return 4;
  return Math.round(n) as RPELevel;
}

function buildProofLines(
  factor: number,
  prev: ReturnType<typeof computeWeeklyAdaptation>,
  avgRpeLabel: string,
): AdaptationProofLines {
  const pct = Math.round(Math.abs(factor - 1) * 100);
  const change =
    factor < 1
      ? `本周训练距离已自动减少 ${pct}%`
      : factor > 1
        ? `本周训练距离已自动增加 ${pct}%`
        : '本周训练距离保持不变';

  const ratePct = Math.round(prev.completionRate * 100);
  const subjectiveLine = `上周打卡 ${prev.checkedCount}/${prev.totalWorkouts}，完成率 ${ratePct}%，平均体感「${avgRpeLabel}」`;
  // 2.3：双源合并时展示客观裁决证据与合并规则
  const evidence =
    prev.adoptedSource === 'merged'
      ? `${prev.objectiveSummary ?? '客观裁决'}；打卡侧：${subjectiveLine}；冲突取保守`
      : prev.adoptedSource === 'override'
        ? `用户已否决客观裁决（${prev.objectiveFactor?.toFixed(2) ?? '—'}），采用 ${factor.toFixed(2)}；打卡侧：${subjectiveLine}`
        : subjectiveLine;

  return {
    change,
    evidence,
    unchanged: '配速、课型、比赛日和休息日不变',
  };
}

function impactLine(
  meta: ReturnType<typeof getActiveAdaptationMeta>,
  prev: ReturnType<typeof computeWeeklyAdaptation>,
): string {
  if (!prev.checkedCount) return '对本周计划：尚无足够打卡，未调整';
  if (meta.active && meta.factor < 1) {
    return `对本周计划：距离已自动 −${Math.round((1 - meta.factor) * 100)}%`;
  }
  if (meta.active && meta.factor > 1) {
    return `对本周计划：距离已自动 +${Math.round((meta.factor - 1) * 100)}%`;
  }
  if (prev.factor === 1) {
    return '对本周计划：保持当前训练距离（无强调调整）';
  }
  // 有系数但今天不在目标周（例如已过目标周）
  return `对目标周计划：系数 ${prev.factor}（当前不在作用周）`;
}

/** 关键课：优先 LSD/长距离，否则最远非 Rest */
function pickKeyWorkout(workouts: DailyWorkout[]): KeyWorkout | null {
  if (workouts.length === 0) return null;
  const scored = [...workouts].sort((a, b) => {
    const score = (w: DailyWorkout) => {
      let s = w.distanceKm ?? 0;
      if (w.workoutType === 'LSD' || w.workoutType === 'MP') s += 100;
      if (w.workoutType === 'Tempo' || w.workoutType === 'Interval') s += 50;
      return s;
    };
    return score(b) - score(a);
  });
  const w = scored[0];
  return {
    date: toDateKey(w.date),
    workoutType: w.workoutType,
    description: w.description,
    distanceKm: w.distanceKm,
  };
}

/** 可复制的纯文本周报 */
export function formatWeeklyReportText(snap: WeekSnapshot): string {
  if (snap.emptyMessage) {
    return [
      `上周小结（${snap.prevWeekStart} ~ ${snap.prevWeekEnd}）`,
      snap.emptyMessage,
    ].join('\n');
  }
  return [
    `上周小结（${snap.prevWeekStart} ~ ${snap.prevWeekEnd}）`,
    ...snap.reportLines,
  ].join('\n');
}

/**
 * 当前日历周是否为“评估周后的目标周”——与 getActiveAdaptationMeta 的 target 对齐。
 * UI 可用 target 日期范围展示“本周作用范围”。
 */
export function getPrevWeekBounds(asOf: Date = new Date()): {
  start: string;
  end: string;
} {
  const today = startOfDay(asOf);
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  const prevSunday = addDays(thisMonday, -1);
  const prevMonday = startOfWeek(prevSunday, { weekStartsOn: 1 });
  return {
    start: format(prevMonday, 'yyyy-MM-dd'),
    end: format(endOfWeek(prevSunday, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  };
}
