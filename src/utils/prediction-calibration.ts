/**
 * 预测偏差自学习：完赛成绩 vs 当时预测的比值 → 个性化校准。
 * 科学依据：通用预测（手表/VDOT）对个体存在系统性偏差；
 * 记录真实偏差后，预测才从"对大多数人的估计"变成"对你的预期"。
 * 只校准全马/半马；DNS/DNF 不计入。
 */

export interface RaceResultEntry {
  distance: 'full' | 'half';
  resultTime: string;      // hh:mm:ss
  predictedTime?: string;  // 录入时抓取的预测（hh:mm:ss）
}

export interface CalibratedPrediction {
  /** 实际/预测 比值中位数（>1 = 你比预测慢，预测偏乐观） */
  ratio: number;
  adjustedSec: number;
  samples: number;
}

const MAX_RACES = 3;

/** hh:mm:ss → 秒；非法 null */
export function raceTimeToSec(hhmmss: string): number | null {
  return toSec(hhmmss);
}

function toSec(hhmmss: string): number | null {
  const m = hhmmss.trim().match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  if (!m) return null;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
}

export function calibratePrediction(
  rawPredictionSec: number,
  distance: 'full' | 'half',
  history: RaceResultEntry[],
): CalibratedPrediction | null {
  const ratios = history
    .filter(e => e.distance === distance && e.predictedTime && e.resultTime)
    .map(e => ({ ratio: (toSec(e.resultTime) ?? 0) / (toSec(e.predictedTime!) ?? 1), date: e.resultTime }))
    .filter(r => Number.isFinite(r.ratio) && r.ratio > 0)
    .slice(-MAX_RACES)
    .map(r => r.ratio)
    .sort((a, b) => a - b);

  if (ratios.length === 0) return null;
  const median = ratios[Math.floor((ratios.length - 1) / 2)];
  return {
    ratio: median,
    adjustedSec: Math.round(rawPredictionSec * median),
    samples: ratios.length,
  };
}

/** 偏差百分比文案：ratio>1 → '+6%'（预测偏乐观）；<1 → '-4%' */
export function formatPredictionDelta(ratio: number): string {
  const pct = Math.round((ratio - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}