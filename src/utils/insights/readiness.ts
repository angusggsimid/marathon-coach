// 任务 3：课级就绪门。用最近 3 天恢复信号评估「下一次强度课」是否应降级。
// 科学依据：HRV 指导训练（Kiviniemi 2007/2014、Vesterinen 2014）——恢复不足时
// 把强度课降为轻松跑，优于固定计划。
import { addDays, format } from 'date-fns';
import type { CorosSnapshot } from './types';
import type { DailyWorkout, UserProfile } from '../training-engine';
import { calculatePaces } from '../training-engine';

export interface SessionReadiness {
  level: 'good' | 'caution' | 'risk';
  reasons: string[];
}

const INTENSITY_TYPES = new Set(['Tempo', 'TempoIntervals', 'Interval', 'Fartlek', 'Cruise', 'MP', 'Progression']);

export function isIntensityType(t: string): boolean {
  return INTENSITY_TYPES.has(t);
}

/** 最近 3 天恢复信号裁决 */
export function sessionReadiness(snapshot: CorosSnapshot | null): SessionReadiness {
  if (!snapshot) return { level: 'good', reasons: [] };
  const metrics = snapshot.dailyMetrics;
  const recent = metrics.slice(-3);
  const reasons: string[] = [];
  let risk = false;
  let caution = false;

  // HRV：近 3 天 ≥2 天低于个人基线 → risk
  const hrvDays = recent.filter((m) => m.hrvMs !== undefined && m.hrvBaseline !== undefined);
  if (hrvDays.length >= 2) {
    const below = hrvDays.filter((m) => (m.hrvMs ?? 0) < (m.hrvBaseline ?? 0)).length;
    if (below >= 2) {
      reasons.push(`HRV 近 ${hrvDays.length} 天中 ${below} 天低于个人基线`);
      risk = true;
    }
  }

  // 静息心率：近 3 天均值 vs 此前基线 +3bpm → risk
  const recentRhr = recent.filter((m) => m.restingHr !== undefined).map((m) => m.restingHr as number);
  const baseRhr = metrics.slice(0, -3).filter((m) => m.restingHr !== undefined).map((m) => m.restingHr as number);
  if (recentRhr.length >= 2 && baseRhr.length >= 5) {
    const r = recentRhr.reduce((s, v) => s + v, 0) / recentRhr.length;
    const b = baseRhr.reduce((s, v) => s + v, 0) / baseRhr.length;
    if (r > b + 3) {
      reasons.push(`静息心率近 3 天均值 ${r.toFixed(0)} bpm，高于基线 ${b.toFixed(0)} bpm 达 ${(r - b).toFixed(0)}`);
      risk = true;
    }
  }

  // 睡眠：近 3 天均值 <5.5h → risk；<6.5h → caution
  const sleep = recent.filter((m) => m.sleepMinutes !== undefined).map((m) => m.sleepMinutes as number);
  if (sleep.length >= 2) {
    const avg = sleep.reduce((s, v) => s + v, 0) / sleep.length;
    if (avg < 330) {
      reasons.push(`近 3 天平均睡眠 ${(avg / 60).toFixed(1)}h，严重不足`);
      risk = true;
    } else if (avg < 390) {
      reasons.push(`近 3 天平均睡眠 ${(avg / 60).toFixed(1)}h，偏少`);
      caution = true;
    }
  }

  // COROS 恢复度：<40 risk；<60 caution
  const rec = snapshot.recovery;
  if (rec) {
    if (rec.pct < 40) {
      reasons.push(`COROS 恢复度 ${rec.pct}%，过低`);
      risk = true;
    } else if (rec.pct < 60) {
      reasons.push(`COROS 恢复度 ${rec.pct}%，偏低`);
      caution = true;
    }
  }

  return { level: risk ? 'risk' : caution ? 'caution' : 'good', reasons };
}

export interface SessionGateResult {
  plan: DailyWorkout[];
  downgraded: { dateKey: string; originalType: string; originalDescription: string } | null;
}

/**
 * 就绪门：readiness=risk 时，把 asOf 起 3 天内第一个强度课降级为轻松跑。
 * overrideDate 命中该课日期时不降级（用户否决）。
 */
export function applySessionReadiness(
  plan: DailyWorkout[],
  profile: UserProfile,
  readiness: SessionReadiness,
  asOf: Date = new Date(),
  overrideDate: string | null = null,
): SessionGateResult {
  if (readiness.level !== 'risk') return { plan, downgraded: null };
  const todayKey = format(asOf, 'yyyy-MM-dd');
  const horizonKey = format(addDays(asOf, 3), 'yyyy-MM-dd');

  let target: DailyWorkout | null = null;
  for (const w of plan) {
    const key = format(new Date(w.date), 'yyyy-MM-dd');
    if (key < todayKey || key > horizonKey) continue;
    if (isIntensityType(w.workoutType)) {
      target = w;
      break;
    }
  }
  if (!target) return { plan, downgraded: null };
  const targetKey = format(new Date(target.date), 'yyyy-MM-dd');
  if (overrideDate === targetKey) return { plan, downgraded: null };

  const paces = calculatePaces(profile);
  const easyPace = paces?.z2;
  const originalType = target.workoutType;
  const originalDescription = target.description;

  const plan2 = plan.map((w) =>
    w === target
      ? {
          ...w,
          workoutType: 'Easy',
          targetPace: easyPace ?? w.targetPace,
          details: undefined,
          description: `${originalDescription}【就绪降级·原${originalType}】`,
        }
      : w,
  );
  return { plan: plan2, downgraded: { dateKey: targetKey, originalType, originalDescription } };
}
