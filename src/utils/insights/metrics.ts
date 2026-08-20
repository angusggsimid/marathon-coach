import { format, startOfWeek } from 'date-fns';
import type { ActualActivity, DailyMetric } from './types';
import { paceToZone } from './zones';

export interface WeekVolume {
  weekStart: string; // 周一 YYYY-MM-DD
  km: number;
  runCount: number;
  durationSec: number;
}

/** 按 ISO 周（周一开始）聚合跑步量 */
export function weeklyVolume(runs: ActualActivity[]): WeekVolume[] {
  const map = new Map<string, WeekVolume>();
  for (const a of runs) {
    if (a.type !== 'run' || !a.distanceKm) continue;
    const ws = format(startOfWeek(new Date(a.date + 'T00:00:00'), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const cur = map.get(ws) ?? { weekStart: ws, km: 0, runCount: 0, durationSec: 0 };
    cur.km += a.distanceKm;
    cur.runCount += 1;
    cur.durationSec += a.durationSec ?? 0;
    map.set(ws, cur);
  }
  return [...map.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export interface ZoneShare {
  zone: number;
  km: number;
  pct: number;
}

/**
 * 配速落区距离分布。
 * 有分圈：按每圈距离×配速逐圈归区（精确）；
 * 无分圈：整段距离按均速归区（粗略，标注 estimated）。
 */
export function zoneDistribution(runs: ActualActivity[], ltPaceSec: number): { shares: ZoneShare[]; estimatedPct: number } {
  const kmByZone = new Map<number, number>();
  let total = 0;
  let estimatedKm = 0;
  for (const a of runs) {
    if (a.type !== 'run') continue;
    if (a.laps?.length) {
      for (const l of a.laps) {
        const z = paceToZone(l.avgPaceSec, ltPaceSec);
        if (!z) continue;
        const km = l.distanceM / 1000;
        kmByZone.set(z, (kmByZone.get(z) ?? 0) + km);
        total += km;
      }
    } else if (a.distanceKm && a.avgPaceSec) {
      const z = paceToZone(a.avgPaceSec, ltPaceSec);
      if (!z) continue;
      kmByZone.set(z, (kmByZone.get(z) ?? 0) + a.distanceKm);
      total += a.distanceKm;
      estimatedKm += a.distanceKm;
    }
  }
  const shares: ZoneShare[] = [1, 2, 3, 4, 5, 6]
    .map((zone) => ({ zone, km: kmByZone.get(zone) ?? 0, pct: total > 0 ? ((kmByZone.get(zone) ?? 0) / total) * 100 : 0 }))
    .filter((s) => s.km > 0);
  return { shares, estimatedPct: total > 0 ? (estimatedKm / total) * 100 : 0 };
}

export interface SplitResult {
  firstHalfSec: number; // sec/km
  secondHalfSec: number;
  diffSec: number; // 后半 - 前半，正数 = 后半掉速
}

/**
 * 前后半程配速差（基于分圈）。
 * 先过滤热身/冷身步行圈（配速 > 中位数×1.5，如走路段），否则冷身走会把"掉速"夸大成假信号。
 * 有效圈数 <4 不足以判断，返回 null。
 */
export function splitHalves(a: ActualActivity): SplitResult | null {
  const raw = a.laps?.filter((l) => l.avgPaceSec !== undefined);
  if (!raw || raw.length < 4) return null;
  const sortedPaces = raw.map((l) => l.avgPaceSec as number).sort((x, y) => x - y);
  const median = sortedPaces[Math.floor(sortedPaces.length / 2)];
  const laps = raw.filter((l) => (l.avgPaceSec as number) <= median * 1.5);
  if (laps.length < 4) return null;
  const half = Math.floor(laps.length / 2);
  const avg = (ls: typeof laps) => ls.reduce((s, l) => s + (l.avgPaceSec ?? 0), 0) / ls.length;
  const firstHalfSec = avg(laps.slice(0, half));
  const secondHalfSec = avg(laps.slice(half));
  return { firstHalfSec, secondHalfSec, diffSec: secondHalfSec - firstHalfSec };
}

/** 序列均值基线 */
export function baseline(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** 最小二乘斜率（每天的变化量）；样本 <4 返回 null */
export function trendSlope(values: number[]): number | null {
  const n = values.length;
  if (n < 4) return null;
  const xm = (n - 1) / 2;
  const ym = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (values[i] - ym);
    den += (i - xm) * (i - xm);
  }
  return den > 0 ? num / den : null;
}

export function runsOn(metrics: DailyMetric[], key: keyof DailyMetric): Array<{ date: string; v: number }> {
  return metrics
    .map((m) => ({ date: m.date, v: m[key] as number | undefined }))
    .filter((x): x is { date: string; v: number } => typeof x.v === 'number');
}

export interface SessionPoint {
  id?: string;
  date: string;
  name?: string;
  distanceKm: number;
  avgPaceSec?: number;
  zoneKm: Record<number, number>;
  avgCadence?: number;
  avgStrideCm?: number;
  avgGroundTimeMs?: number;
  trainingLoad?: number;
  aerobicTe?: number;
}

/** 每次跑步一课次：分区距离、平均步频/步幅/触地、负荷。按日期升序。 */
export function sessionSeries(runs: ActualActivity[], ltPaceSec: number): SessionPoint[] {
  const out: SessionPoint[] = [];
  for (const a of runs) {
    if (a.type !== 'run' || !a.distanceKm) continue;
    const zoneKm: Record<number, number> = {};
    if (a.laps?.length) {
      for (const l of a.laps) {
        const z = paceToZone(l.avgPaceSec, ltPaceSec);
        if (!z) continue;
        zoneKm[z] = (zoneKm[z] ?? 0) + l.distanceM / 1000;
      }
    } else if (a.avgPaceSec) {
      const z = paceToZone(a.avgPaceSec, ltPaceSec);
      if (z) zoneKm[z] = a.distanceKm;
    }
    const laps = a.laps ?? [];
    const avgOf = (f: (l: (typeof laps)[number]) => number | undefined) => {
      const vs = laps.map(f).filter((v): v is number => v !== undefined);
      return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : undefined;
    };
    out.push({
      id: a.id,
      date: a.date,
      name: a.name,
      distanceKm: a.distanceKm,
      avgPaceSec: a.avgPaceSec,
      zoneKm,
      avgCadence: avgOf((l) => l.cadence),
      avgStrideCm: avgOf((l) => l.strideLengthCm),
      avgGroundTimeMs: avgOf((l) => l.groundTimeMs),
      trainingLoad: a.trainingLoad,
      aerobicTe: a.aerobicTe,
    });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

export interface DailyCalories {
  date: string;
  training: number;
  resting: number;
}
/** 每日卡路里：训练消耗（活动求和）+ 静息消耗（daily-health） */
export function dailyCalories(activities: ActualActivity[], metrics: DailyMetric[]): DailyCalories[] {
  const map = new Map<string, DailyCalories>();
  const day = (date: string) => {
    if (!map.has(date)) map.set(date, { date, training: 0, resting: 0 });
    return map.get(date)!;
  };
  for (const a of activities) {
    if (a.calories) day(a.date).training += a.calories;
  }
  for (const m of metrics) {
    if (m.restingCalories) day(m.date).resting = m.restingCalories;
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ─── 科学训练指标（TrainingPeaks / Seiler 体系）─────────────────────────────

export interface EFPoint {
  date: string;
  ef: number; // 米/分钟 每 bpm
  distanceKm: number;
}

/**
 * 效率因子 EF = 速度(m/min) ÷ 平均心率（TrainingPeaks 定义）。
 * 只统计稳定有氧跑：≥5km、均速落在 Z2 或更慢、有心率。
 * 同样强度下 EF 随时间上升 = 有氧能力真实进步。
 */
export function efficiencyFactorSeries(runs: ActualActivity[], ltPaceSec: number): EFPoint[] {
  const out: EFPoint[] = [];
  for (const a of runs) {
    if (a.type !== 'run' || !a.distanceKm || a.distanceKm < 5) continue;
    if (!a.avgPaceSec || !a.avgHr) continue;
    if (a.avgPaceSec < ltPaceSec + 52) continue; // 快于 Z2 下限的不算稳定有氧
    const speedMPerMin = (1000 / a.avgPaceSec) * 60;
    out.push({ date: a.date, ef: speedMPerMin / a.avgHr, distanceKm: a.distanceKm });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

export interface DecouplingPoint {
  date: string;
  driftPct: number; // 正数 = 后半程心率漂移（有氧解耦）
  distanceKm: number;
}

/**
 * 有氧解耦（Pa:HR 漂移）：前后两半程的「速度÷心率」之比变化。
 * 配速不变而心率上升 → 比值下降 → 漂移为正。持续有氧跑 <5% 为底子扎实。
 * 样本要求：≥8 个带心率分圈（覆盖所有足够长的活动，按时间轴逐次呈现）。
 */
export function decouplingSeries(runs: ActualActivity[]): DecouplingPoint[] {
  const out: DecouplingPoint[] = [];
  for (const a of runs) {
    if (a.type !== 'run' || !a.distanceKm) continue;
    const laps = a.laps?.filter((l) => l.avgHr !== undefined && l.timeSec > 0) ?? [];
    if (laps.length < 8) continue;
    const half = Math.floor(laps.length / 2);
    const ratio = (ls: typeof laps) => {
      const dist = ls.reduce((s, l) => s + l.distanceM, 0);
      const time = ls.reduce((s, l) => s + l.timeSec, 0);
      const hr = ls.reduce((s, l) => s + (l.avgHr ?? 0), 0) / ls.length;
      return time > 0 && hr > 0 ? dist / time / hr : null;
    };
    const r1 = ratio(laps.slice(0, half));
    const r2 = ratio(laps.slice(half));
    if (r1 === null || r2 === null) continue;
    out.push({ date: a.date, driftPct: ((r1 - r2) / r1) * 100, distanceKm: a.distanceKm });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

export interface SeilerDist {
  lowKm: number;
  midKm: number;
  highKm: number;
  totalKm: number;
  lowPct: number;
  midPct: number;
  highPct: number;
  windowDays: number;
}

/**
 * Seiler 三区极化模型：低强度（Z1-Z2）/ 灰区（Z3）/ 高强度（Z4+）。
 * 精英耐力运动员约 80% 低强度 + 少量高强度、灰区最小化（Seiler & Kjerland 2006）。
 * 科学上按训练周/小周期评估，默认窗口 28 天（4 周）；asOf 缺省为今天。
 */
export function seilerDistribution(runs: ActualActivity[], ltPaceSec: number, windowDays = 28, asOf?: string): SeilerDist | null {
  const cutoffDate = asOf ?? new Date().toISOString().slice(0, 10);
  const cutoff = new Date(cutoffDate + 'T00:00:00');
  cutoff.setDate(cutoff.getDate() - windowDays + 1);
  const cutoffKey = format(cutoff, 'yyyy-MM-dd');
  const windowRuns = runs.filter((a) => a.date >= cutoffKey);
  const { shares } = zoneDistribution(windowRuns, ltPaceSec);
  const km = (z: number) => shares.find((s) => s.zone === z)?.km ?? 0;
  const lowKm = km(1) + km(2);
  const midKm = km(3);
  const highKm = km(4) + km(5) + km(6);
  const totalKm = lowKm + midKm + highKm;
  if (totalKm < 10) return null;
  return {
    lowKm, midKm, highKm, totalKm,
    lowPct: (lowKm / totalKm) * 100,
    midPct: (midKm / totalKm) * 100,
    highPct: (highKm / totalKm) * 100,
    windowDays,
  };
}

export interface SleepDebt {
  debtMin: number;
  windowDays: number;
  avgSleepMin: number;
}

/** 睡眠负债：窗口内每日相对目标时长的亏空累加（只计亏空，不计盈余） */
export function sleepDebt(metrics: DailyMetric[], targetMin = 420, windowDays = 14): SleepDebt | null {
  const withSleep = metrics.filter((m) => m.sleepMinutes !== undefined).slice(-windowDays);
  if (withSleep.length < 5) return null;
  const debtMin = withSleep.reduce((s, m) => s + Math.max(0, targetMin - (m.sleepMinutes ?? 0)), 0);
  const avgSleepMin = withSleep.reduce((s, m) => s + (m.sleepMinutes ?? 0), 0) / withSleep.length;
  return { debtMin, windowDays: withSleep.length, avgSleepMin };
}
