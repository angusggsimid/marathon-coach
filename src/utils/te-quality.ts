import type { ActualActivity } from './insights/types';

/**
 * TE（训练效果）执行质量判定。
 * 口径原则：先做相对判断（对比个人近 4 周跑步 TE 分布），不做绝对断言
 * （COROS 的 TE 语义与 Firstbeat 有差异，绝对阈值只作经验参考）。
 * 样本 <5 不判定——没有足够个人数据时不编造结论。
 */

export const QUALITY_TE_TYPES = new Set([
  'Tempo', 'TempoIntervals', 'Interval', 'Hills', 'Fartlek', 'MP', 'Cruise', 'Progression',
]);

/** 以「轻松完成」为目的的课型：TE 显著偏高说明跑得比课的目的更累（Race 除外——比赛就该拼） */
const EASY_INTENT_TE_TYPES = new Set(['Easy', 'LSD', 'Recovery']);

export interface TeStats {
  median: number;
  p25: number;
  p75: number;
  samples: number;
}

const WINDOW_DAYS = 28;
const MIN_SAMPLES = 5;

export function teStats(
  activities: ActualActivity[],
  asOf: Date = new Date(),
): TeStats | null {
  const end = new Date(asOf);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (WINDOW_DAYS - 1));

  const tes = activities
    .filter(a => {
      if (a.type !== 'run' || a.aerobicTe == null) return false;
      const d = new Date(a.date + 'T12:00:00');
      return d >= start && d <= new Date(end.getTime() + 86399999);
    })
    .map(a => a.aerobicTe!)
    .sort((x, y) => x - y);

  if (tes.length < MIN_SAMPLES) return null;
  const n = tes.length;
  return {
    median: tes[Math.floor((n - 1) * 0.5)],
    p25: tes[Math.floor((n - 1) * 0.25)],
    p75: tes[Math.floor((n - 1) * 0.75)],
    samples: n,
  };
}

export type TeJudgment = 'on-target' | 'under-stimulus' | 'over-cooked';

/**
 * 判定一节已匹配课的刺激质量：
 * - 质量课 full 且 TE 低于 p25 → 强度不足（没跑到这节课的目的）
 * - 轻松意图课 full 且 TE 高于 p75 → 偏硬（完成了，但比课的目的更累）
 * - partial / 无基线 / 无 TE → on-target（不判定）
 */
export function judgeTeQuality(
  workoutType: string,
  status: 'full' | 'partial',
  te: number | null | undefined,
  stats: TeStats | null,
): { judgment: TeJudgment; note?: string } {
  if (status !== 'full' || stats == null || te == null) return { judgment: 'on-target' };

  if (QUALITY_TE_TYPES.has(workoutType)) {
    if (te < stats.p25) {
      return {
        judgment: 'under-stimulus',
        note: `强度不足：TE ${te} 低于你近4周跑步25分位（${stats.p25}），没跑到本课的目标刺激`,
      };
    }
    return { judgment: 'on-target' };
  }

  if (EASY_INTENT_TE_TYPES.has(workoutType)) {
    if (te > stats.p75) {
      return {
        judgment: 'over-cooked',
        note: `跑得偏硬：TE ${te} 高于你近4周跑步75分位（${stats.p75}），超出轻松课的恢复目的`,
      };
    }
    return { judgment: 'on-target' };
  }

  return { judgment: 'on-target' };
}