// 任务 4：周期层信号调制引擎。不重写周期化，而是给周自适应系数加「信号上限」：
// ① 有氧解耦 >10% → 上限 1.0（不增量，建议延长基础期）
// ② EF 下滑 <-1%/周 → 上限 1.0
// ③ VO2max（手表）× VDOT（引擎）差异 >4 → 参照提示（不自动改）
import type { CorosSnapshot } from './types';
import type { UserProfile } from '../training-engine';
import { resolveVDOT } from '../training-engine';
import { decouplingSeries, efficiencyFactorSeries, trendSlope } from './metrics';

export interface CycleCaps {
  /** 周自适应系数上限（1.0 或 1.05） */
  cap: number;
  reasons: string[];
  decouplingAvg: number | null;
  efWeeklyPct: number | null;
  vo2maxDivergence: { coros: number; engine: number; diff: number } | null;
}

export function cycleCaps(snapshot: CorosSnapshot | null, profile: UserProfile): CycleCaps {
  const empty: CycleCaps = { cap: 1.05, reasons: [], decouplingAvg: null, efWeeklyPct: null, vo2maxDivergence: null };
  if (!snapshot) return empty;
  let cap = 1.05;
  const reasons: string[] = [];
  const runs = snapshot.activities.filter((a) => a.type === 'run');

  // ① 有氧解耦：近 4 次长跑（≥10km）平均漂移
  const longDec = decouplingSeries(runs).filter((p) => p.distanceKm >= 10).slice(-4);
  let decouplingAvg: number | null = null;
  if (longDec.length >= 2) {
    decouplingAvg = longDec.reduce((s, p) => s + p.driftPct, 0) / longDec.length;
    if (decouplingAvg > 10) {
      cap = Math.min(cap, 1.0);
      reasons.push(`有氧解耦均值 ${decouplingAvg.toFixed(1)}%（>10%）：有氧底子不足，建议延长基础期、控制强度，本周不增量`);
    }
  }

  // ② EF 趋势
  const lt = snapshot.fitness?.ltPaceSec;
  let efWeeklyPct: number | null = null;
  if (lt) {
    const ef = efficiencyFactorSeries(runs, lt);
    const slope = ef.length >= 4 ? trendSlope(ef.map((p) => p.ef)) : null;
    if (slope !== null) {
      const mean = ef.reduce((s, p) => s + p.ef, 0) / ef.length;
      efWeeklyPct = (slope * 7 / mean) * 100;
      if (efWeeklyPct < -1) {
        cap = Math.min(cap, 1.0);
        reasons.push(`EF 每周 ${efWeeklyPct.toFixed(1)}%（下滑）：训练响应偏弱，本周不增量`);
      }
    }
  }

  // ③ VO2max × VDOT 交叉校验（仅参照）
  let vo2maxDivergence: CycleCaps['vo2maxDivergence'] = null;
  const coros = snapshot.fitness?.vo2max;
  const engine = resolveVDOT(profile);
  if (coros && engine > 0 && Math.abs(coros - engine) > 4) {
    vo2maxDivergence = { coros, engine, diff: coros - engine };
  }

  return { cap, reasons, decouplingAvg, efWeeklyPct, vo2maxDivergence };
}
