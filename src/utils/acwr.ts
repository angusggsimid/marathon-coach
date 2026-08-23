import { format } from 'date-fns';
import type { DailyWorkout } from './training-engine';

/**
 * 急慢性负荷比（ACWR）：急性 7 天负荷 / 慢性 28 天周均负荷。
 * 口径：计划距离 × 完成系数（full=1.0 / partial=0.5 / skip=0 / 未打卡=0）。
 * 未打卡日一律按 0 计（不再假设按计划完成）——自动打卡让"没记录=没跑"成立；
 * 诚实标注由调用方展示 assumedDays / checkedDays。
 */

export interface ACWRResult {
  acwr: number;
  acuteKm: number;
  chronicAvgKm: number;
  /** 有真实打卡记录的天数（≤28；<7 时不显示） */
  daysOfData: number;
  /** 过去未打卡按 0 计的天数 */
  assumedDays: number;
  /** 有打卡记录的天数 */
  checkedDays: number;
}

const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;
const MIN_CHRONIC_AVG_KM = 0.5;

export function computeACWR(
  plan: DailyWorkout[],
  completions: Record<string, { status: string }>,
  asOf: Date = new Date(),
): ACWRResult | null {
  const today = new Date(asOf);
  today.setHours(0, 0, 0, 0);

  if (plan.length === 0) return null;
  const planStart = new Date(plan[0].date);
  planStart.setHours(0, 0, 0, 0);
  if (Math.floor((today.getTime() - planStart.getTime()) / 86400000) < 0) return null;

  // 近 28 天每天的计划距离 × 完成系数
  const dailyLoad: Record<string, number> = {};
  let assumedDays = 0;
  let checkedDays = 0;
  for (const w of plan) {
    const d = new Date(w.date);
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
    if (diff < 0 || diff >= CHRONIC_DAYS) continue;

    const dateStr = format(d, 'yyyy-MM-dd');
    const planned = w.distanceKm ?? 0;
    const comp = completions[dateStr];

    let factor = 0;
    if (comp) {
      if (comp.status === 'full') factor = 1.0;
      else if (comp.status === 'partial') factor = 0.5;
      else factor = 0; // skip
      checkedDays++;
    } else if (diff !== 0) {
      // 过去未打卡日：按 0 计（没记录 = 没跑）；今天未打卡也不预支
      assumedDays++;
    }

    dailyLoad[dateStr] = planned * factor;
  }

  // 真实打卡记录 ≥ 7 天才显示（没记录的天数再多的"计划"也不构成数据）
  if (checkedDays < ACUTE_DAYS) return null;

  // 急性：近 7 天
  let acuteKm = 0;
  for (let i = 0; i < ACUTE_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    acuteKm += dailyLoad[format(d, 'yyyy-MM-dd')] ?? 0;
  }

  // 慢性：近 28 天分 4 周
  let chronicTotal = 0;
  for (let week = 0; week < 4; week++) {
    let weekKm = 0;
    for (let day = 0; day < 7; day++) {
      const d = new Date(today);
      d.setDate(d.getDate() - (week * 7 + day));
      weekKm += dailyLoad[format(d, 'yyyy-MM-dd')] ?? 0;
    }
    chronicTotal += weekKm;
  }
  const chronicAvgKm = chronicTotal / 4;

  if (chronicAvgKm < MIN_CHRONIC_AVG_KM) return null;

  const acwr = Math.round((acuteKm / chronicAvgKm) * 100) / 100;
  return {
    acwr,
    acuteKm: Math.round(acuteKm * 10) / 10,
    chronicAvgKm: Math.round(chronicAvgKm * 10) / 10,
    daysOfData: checkedDays,
    assumedDays,
    checkedDays,
  };
}