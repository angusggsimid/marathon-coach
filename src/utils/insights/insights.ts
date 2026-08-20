import type { ActualActivity, CorosSnapshot, DailyMetric } from './types';
import { baseline, splitHalves, trendSlope, zoneDistribution } from './metrics';
import type { DecouplingPoint, EFPoint } from './metrics';

// 规则生成的解读句。纪律：数据不足返回 null，UI 显示诚实空态，绝不编造。

export function loadInsight(metrics: DailyMetric[]): string | null {
  const withRatio = metrics.filter((m) => m.loadRatio !== undefined);
  if (withRatio.length < 3) return null;
  const recent = withRatio.slice(-7);
  const avg = recent.reduce((s, m) => s + (m.loadRatio ?? 0), 0) / recent.length;
  const excessiveDays = recent.filter((m) => m.loadComment === 'Excessive').length;
  // ACWR 风险区：0.8-1.3 甜蜜区，1.3-1.5 偏高，>1.5 伤病风险显著上升
  const zone = avg > 1.5 ? '已超过 1.5 伤病风险线' : avg > 1.3 ? '处于 1.3-1.5 偏高区间' : avg >= 0.8 ? '处于 0.8-1.3 最佳适应区间' : '低于 0.8，刺激不足';
  if (excessiveDays >= 3) {
    return `近 7 天有 ${excessiveDays} 天负荷评语为 Excessive，平均负荷比 ${avg.toFixed(2)}——${zone}。建议安排一次完整恢复日，把比值拉回 1.3 以下。`;
  }
  if (avg > 1.3) {
    return `近 7 天平均负荷比 ${avg.toFixed(2)}，${zone}，注意强度课之间的恢复。`;
  }
  if (avg < 0.8) {
    return `近 7 天平均负荷比 ${avg.toFixed(2)}，${zone}，可以按计划适度加量。`;
  }
  return `近 7 天平均负荷比 ${avg.toFixed(2)}，${zone}，保持当前节奏。`;
}

export function recoveryInsight(metrics: DailyMetric[]): string | null {
  const recent = metrics.slice(-7);
  const warnings: string[] = [];

  const rhr = recent.filter((m) => m.restingHr !== undefined);
  if (rhr.length >= 5) {
    const base = baseline(metrics.slice(0, -7).map((m) => m.restingHr).filter((v): v is number => v !== undefined));
    const recentAvg = rhr.reduce((s, m) => s + (m.restingHr ?? 0), 0) / rhr.length;
    if (base !== null && recentAvg > base + 3) {
      warnings.push(`静息心率近 7 天均值 ${Math.round(recentAvg)} bpm，比基线（${Math.round(base)}）高 ${Math.round(recentAvg - base)} bpm，可能有疲劳或压力累积`);
    }
  }

  const sleep = recent.filter((m) => m.sleepMinutes !== undefined);
  if (sleep.length >= 5) {
    const avgMin = sleep.reduce((s, m) => s + (m.sleepMinutes ?? 0), 0) / sleep.length;
    if (avgMin < 390) {
      warnings.push(`近 7 天平均睡眠 ${Math.floor(avgMin / 60)} 小时 ${Math.round(avgMin % 60)} 分，低于 6.5 小时，恢复质量受限`);
    }
  }

  const hrv = recent.filter((m) => m.hrvMs !== undefined && m.hrvBaseline !== undefined);
  if (hrv.length >= 5) {
    const below = hrv.filter((m) => (m.hrvMs ?? 0) < (m.hrvBaseline ?? 0));
    if (below.length >= Math.ceil(hrv.length * 0.6)) {
      warnings.push(`HRV 有 ${below.length}/${hrv.length} 天低于个人基线，自主神经恢复偏慢`);
    }
  }

  if (warnings.length === 0) {
    return rhr.length >= 5 ? '近 7 天静息心率、睡眠与 HRV 均在正常范围，恢复状态支持正常训练。' : null;
  }
  return warnings.join('；') + '。明天如有强度课，建议降低预期或改为轻松跑。';
}

export function zoneInsight(snapshot: CorosSnapshot): string | null {
  const lt = snapshot.fitness?.ltPaceSec;
  if (!lt) return null;
  const runs = snapshot.activities.filter((a) => a.type === 'run');
  if (runs.length === 0) return null;
  const { shares, estimatedPct } = zoneDistribution(runs, lt);
  const totalKm = shares.reduce((s, x) => s + x.km, 0);
  if (totalKm < 10) return null;
  const z2 = shares.find((s) => s.zone === 2)?.pct ?? 0;
  const easy = z2 + (shares.find((s) => s.zone === 1)?.pct ?? 0);
  const hard = (shares.find((s) => s.zone === 4)?.pct ?? 0) + (shares.find((s) => s.zone === 5)?.pct ?? 0) + (shares.find((s) => s.zone === 6)?.pct ?? 0);
  const est = estimatedPct > 50 ? '（部分活动无分圈，按均速估算）' : '';
  if (hard < 5) {
    return `近期 ${totalKm.toFixed(0)} km 几乎全在 Z1-Z3 有氧区（Z4+ 仅 ${hard.toFixed(0)}%），有氧基础扎实，但缺少高强度刺激${est}。`;
  }
  if (easy >= 75) {
    return `近期 ${totalKm.toFixed(0)} km 中 ${easy.toFixed(0)}% 在 Z1-Z2 有氧区、${hard.toFixed(0)}% 在 Z4+，符合 80/20 极化训练原则${est}。`;
  }
  if (hard > 30) {
    return `近期 ${totalKm.toFixed(0)} km 中 ${hard.toFixed(0)}% 在 Z4 以上，强度占比偏高，轻松日请真正跑轻松${est}。`;
  }
  return `近期 ${totalKm.toFixed(0)} km：Z1-Z2 占 ${easy.toFixed(0)}%，Z4+ 占 ${hard.toFixed(0)}%${est}。`;
}

export function paceStabilityInsight(runs: ActualActivity[]): string | null {
  const withLaps = runs.filter((a) => a.type === 'run' && a.laps?.length);
  if (withLaps.length < 3) return null;
  const splits = withLaps.map(splitHalves).filter((s): s is NonNullable<ReturnType<typeof splitHalves>> => s !== null);
  if (splits.length < 3) return null;
  const avgDiff = splits.reduce((s, x) => s + x.diffSec, 0) / splits.length;
  const positive = splits.filter((s) => s.diffSec > 5).length;
  if (avgDiff > 8) {
    return `${splits.length} 次有分圈的跑步中 ${positive} 次后半程明显掉速（平均后半比前半慢 ${Math.round(avgDiff)} s/km），建议前段更克制。`;
  }
  if (avgDiff < -3) {
    return `整体呈负分割（后半平均快 ${Math.round(-avgDiff)} s/km），配速执行有纪律。`;
  }
  return `前后半程配速基本均衡（平均差异 ${Math.round(Math.abs(avgDiff))} s/km），配速控制稳定。`;
}

export function hrvTrendInsight(metrics: DailyMetric[]): string | null {
  const series = metrics.filter((m) => m.hrvMs !== undefined).map((m) => m.hrvMs as number);
  if (series.length < 7) return null;
  const slope = trendSlope(series.slice(-14));
  if (slope === null) return null;
  const last = series[series.length - 1];
  if (slope > 0.5) return `HRV 两周趋势向上（约 +${slope.toFixed(1)} ms/天），最新 ${last} ms，恢复能力在积累。`;
  if (slope < -0.5) return `HRV 两周趋势向下（约 ${slope.toFixed(1)} ms/天），最新 ${last} ms，留意恢复。`;
  return null;
}

// ─── 科学训练指标解读 ────────────────────────────────────────────────────────

/** EF 趋势：线性拟合斜率换算成每周变化百分比 */
export function efTrendInsight(series: EFPoint[]): string | null {
  if (series.length < 4) return null;
  const efs = series.map((p) => p.ef);
  const slope = trendSlope(efs);
  if (slope === null) return null;
  const mean = efs.reduce((s, v) => s + v, 0) / efs.length;
  const weeklyPct = (slope * 7 / mean) * 100;
  if (weeklyPct > 1) return `有氧效率持续上升（约每周 +${weeklyPct.toFixed(1)}%）：同样心率下配速越来越快，有氧能力在真实进步。`;
  if (weeklyPct < -1) return `有氧效率下滑（约每周 ${weeklyPct.toFixed(1)}%）：同样心率下配速变慢，可能是疲劳累积，建议先恢复。`;
  return `有氧效率近期平稳（周变化 ${weeklyPct.toFixed(1)}%），处于适应平台期。`;
}

export function decouplingInsight(points: DecouplingPoint[]): string | null {
  if (points.length === 0) return null;
  const latest = points[points.length - 1];
  const base = `最近一次长跑（${latest.date}，${latest.distanceKm.toFixed(1)} km）心率漂移 ${latest.driftPct.toFixed(1)}%`;
  if (latest.driftPct < 5) return `${base}，低于 5% 优秀线——有氧耐力底子扎实，长距离配速可以稳住。`;
  if (latest.driftPct < 10) return `${base}，处于 5-10% 中等区间——有氧耐力在建设中，长跑后段注意补给与配速克制。`;
  return `${base}，超过 10%——后半程心血管代价偏高，建议长跑配速再放慢 10-15 秒/公里打底。`;
}

export function seilerInsight(dist: { lowPct: number; midPct: number; highPct: number; windowDays?: number } | null): string | null {
  if (!dist) return null;
  const scope = dist.windowDays ? `近 ${dist.windowDays} 天` : '近期';
  if (dist.highPct < 5) {
    return `${scope} Seiler 三区：低强度 ${dist.lowPct.toFixed(0)}% / 灰区 ${dist.midPct.toFixed(0)}% / 高强度 ${dist.highPct.toFixed(0)}%。80/20 的"低强度"一侧达标，但高强度刺激几乎为零——备赛期每周需要 1-2 次 Z4+ 课。`;
  }
  if (dist.lowPct >= 75 && dist.highPct >= 8 && dist.highPct <= 25) {
    return `${scope} Seiler 三区：低强度 ${dist.lowPct.toFixed(0)}% / 高强度 ${dist.highPct.toFixed(0)}%，符合 80/20 极化模型——这是精英耐力运动员的分布。`;
  }
  if (dist.midPct > 40) {
    return `${scope} Seiler 三区中灰区占 ${dist.midPct.toFixed(0)}%——"中等强度陷阱"：不够轻松也不够狠，建议轻松日真正放慢、强度日敢于更快。`;
  }
  return `${scope} Seiler 三区：低强度 ${dist.lowPct.toFixed(0)}% / 灰区 ${dist.midPct.toFixed(0)}% / 高强度 ${dist.highPct.toFixed(0)}%。`;
}

export function sleepDebtInsight(debt: { debtMin: number; windowDays: number; avgSleepMin: number } | null): string | null {
  if (!debt) return null;
  const h = Math.floor(debt.debtMin / 60);
  const m = Math.round(debt.debtMin % 60);
  if (debt.debtMin >= 300) {
    return `近 ${debt.windowDays} 天累计睡眠负债 ${h} 小时 ${m} 分（均值 ${(debt.avgSleepMin / 60).toFixed(1)}h/晚）——睡眠债会累积进恢复能力，建议未来一周每晚提前 30 分钟。`;
  }
  if (debt.debtMin >= 120) {
    return `近 ${debt.windowDays} 天睡眠负债 ${h} 小时 ${m} 分，轻度亏空，注意今晚补回来。`;
  }
  return null;
}
