// 教练处方引擎：COROS 实测数据 → 主 App 训练引擎可执行的参数建议。
// 契约 schema: marathon-coach-rx v1（任务 2 自动化的机器桥梁种子）。
// 纪律：只产出引擎输入参数（UserProfile 字段），不产出课表内容；
//       设备实测才可 autoPatch，推算值标注置信度，偏好类永不代改。

import type { CorosSnapshot } from './types';
import { efficiencyFactorSeries, seilerDistribution, sleepDebt, trendSlope } from './metrics';
import { formatPace } from './format';

// ─── 引擎档案（主 App UserProfile 的白名单子集，与 backup.ts PROFILE_KEYS 对齐）───

export interface EngineProfile {
  height: number | '';
  weight: number | '';
  pb5k: string;
  pb10k: string;
  pbHalf: string;
  pbFull: string;
  lthr: number | '';
  ltPace: string;
  raceDate: string;
  raceType: 'half' | 'full';
  goalTime: string;
  intensity: 'light' | 'moderate' | 'heavy';
  longRunDay: number;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Recommendation {
  id: 'lt-pace' | 'lthr' | 'adaptation' | 'intensity' | 'pb-reference' | 'goal-feasibility';
  title: string;
  target?: string;
  currentValue?: string;
  recommendedValue?: string;
  confidence: Confidence;
  autoPatch: boolean;
  evidence: string[];
  engineEffect: string;
}

export interface AdaptationSignal {
  name: string;
  direction: 'risk' | 'positive' | 'neutral';
  detail: string;
}

export interface AdaptationVerdict {
  factor: 0.90 | 1.00 | 1.05;
  signals: AdaptationSignal[];
  summary: string;
}

export interface CoachPatch {
  ltPace?: string;
  lthr?: number;
}

export interface CoachReport {
  schema: 'marathon-coach-rx';
  version: 1;
  generatedAt: string;
  snapshotBuiltAt: string;
  device?: string;
  engineProfileLoaded: boolean;
  adaptation: AdaptationVerdict | null;
  recommendations: Recommendation[];
  patch: CoachPatch;
}

// ─── 引擎 LT 解析链（逐行复刻主 App resolveLTPaceSec，保证对照口径一致）───────

/** 档案字段格式（m:ss，与引擎 UserProfile.ltPace 及 store 校验正则一致；区别于展示格式 m'ss"） */
function formatPaceColon(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function engineEffectiveLtPace(p: EngineProfile): { paceSec: number; source: string } | null {
  const fromLt = timeToSeconds(p.ltPace);
  if (fromLt > 0) return { paceSec: fromLt, source: '手动填写的 LT' };
  const half = timeToSeconds(p.pbHalf);
  if (half > 0) return { paceSec: (half / 21.1) * 0.93, source: '半马 PB 推算' };
  const full = timeToSeconds(p.pbFull);
  if (full > 0) return { paceSec: (full / 42.195) * 0.94, source: '全马 PB 推算' };
  const ten = timeToSeconds(p.pb10k);
  if (ten > 0) return { paceSec: (ten / 10) * 1.05, source: '10K PB 推算' };
  const five = timeToSeconds(p.pb5k);
  if (five > 0) return { paceSec: (five / 5) * 1.1, source: '5K PB 推算' };
  return null;
}

// ─── LTHR 估算：LT 配速 ±12s（Z4 带）分圈的平均心率，≥3 圈才成立 ─────────────

export function estimateLthr(snapshot: CorosSnapshot): number | null {
  const lt = snapshot.fitness?.ltPaceSec;
  if (!lt) return null;
  const hrs: number[] = [];
  for (const a of snapshot.activities) {
    if (a.type !== 'run' || !a.laps) continue;
    for (const l of a.laps) {
      if (l.avgPaceSec !== undefined && l.avgHr !== undefined && Math.abs(l.avgPaceSec - lt) <= 12) {
        hrs.push(l.avgHr);
      }
    }
  }
  if (hrs.length < 3) return null;
  return Math.round(hrs.reduce((s, v) => s + v, 0) / hrs.length);
}

// ─── 六信号裁决（总纲 §4-C；信号数据不足的按 neutral 处理，有效信号 <3 不出裁决）─

export function adaptationVerdict(snapshot: CorosSnapshot): AdaptationVerdict | null {
  const signals: AdaptationSignal[] = [];
  const metrics = snapshot.dailyMetrics;
  const runs = snapshot.activities.filter((a) => a.type === 'run');

  // 1. 负荷比（近 7 天均值）
  const ratios = metrics.slice(-7).filter((m) => m.loadRatio !== undefined);
  if (ratios.length >= 3) {
    const avg = ratios.reduce((s, m) => s + (m.loadRatio ?? 0), 0) / ratios.length;
    signals.push({
      name: '负荷比',
      direction: avg > 1.5 ? 'risk' : avg >= 0.8 && avg <= 1.3 ? 'positive' : 'neutral',
      detail: `近 7 天均值 ${avg.toFixed(2)}${avg > 1.5 ? '，超过 1.5 伤病风险线' : avg < 0.8 ? '，低于 0.8 刺激不足' : avg <= 1.3 ? '，处于最佳适应区间' : '，略高于最佳区间'}`,
    });
  }

  // 2. EF 趋势（周斜率 %）
  const lt = snapshot.fitness?.ltPaceSec;
  if (lt) {
    const ef = efficiencyFactorSeries(runs, lt);
    const slope = ef.length >= 4 ? trendSlope(ef.map((p) => p.ef)) : null;
    if (slope !== null) {
      const mean = ef.reduce((s, p) => s + p.ef, 0) / ef.length;
      const weeklyPct = (slope * 7 / mean) * 100;
      signals.push({
        name: 'EF 趋势',
        direction: weeklyPct < -1 ? 'risk' : weeklyPct > 1 ? 'positive' : 'neutral',
        detail: `有氧效率每周 ${weeklyPct >= 0 ? '+' : ''}${weeklyPct.toFixed(1)}%${weeklyPct < -1 ? '，下滑提示疲劳累积' : weeklyPct > 1 ? '，稳步上升' : '，平稳'}`,
      });
    }
  }

  // 3. 睡眠负债（14 天）
  const debt = sleepDebt(metrics, 420, 14);
  if (debt) {
    signals.push({
      name: '睡眠负债',
      direction: debt.debtMin >= 300 ? 'risk' : debt.debtMin < 120 ? 'positive' : 'neutral',
      detail: `近 ${debt.windowDays} 天累计 ${Math.floor(debt.debtMin / 60)}h${Math.round(debt.debtMin % 60)}m${debt.debtMin >= 300 ? '，恢复能力受累' : debt.debtMin < 120 ? '，睡眠充足' : ''}`,
    });
  }

  // 4. HRV（近 7 天 vs 个人基线）
  const hrvDays = metrics.slice(-7).filter((m) => m.hrvMs !== undefined && m.hrvBaseline !== undefined);
  if (hrvDays.length >= 5) {
    const below = hrvDays.filter((m) => (m.hrvMs ?? 0) < (m.hrvBaseline ?? 0)).length;
    const belowPct = below / hrvDays.length;
    signals.push({
      name: 'HRV',
      direction: belowPct >= 0.6 ? 'risk' : belowPct <= 0.4 ? 'positive' : 'neutral',
      detail: `近 7 天 ${below}/${hrvDays.length} 天低于个人基线`,
    });
  }

  // 5. 静息心率（近 7 天均值 vs 此前基线）
  const recentRhr = metrics.slice(-7).filter((m) => m.restingHr !== undefined).map((m) => m.restingHr as number);
  const baseRhr = metrics.slice(0, -7).filter((m) => m.restingHr !== undefined).map((m) => m.restingHr as number);
  if (recentRhr.length >= 5 && baseRhr.length >= 5) {
    const r = recentRhr.reduce((s, v) => s + v, 0) / recentRhr.length;
    const b = baseRhr.reduce((s, v) => s + v, 0) / baseRhr.length;
    signals.push({
      name: '静息心率',
      direction: r > b + 3 ? 'risk' : r <= b ? 'positive' : 'neutral',
      detail: `近 7 天均值 ${r.toFixed(0)} bpm vs 基线 ${b.toFixed(0)} bpm（${r - b >= 0 ? '+' : ''}${(r - b).toFixed(0)}）`,
    });
  }

  // 6. COROS 恢复度
  const rec = snapshot.recovery;
  if (rec) {
    signals.push({
      name: 'COROS 恢复度',
      direction: rec.pct < 40 ? 'risk' : rec.pct >= 70 ? 'positive' : 'neutral',
      detail: `当前 ${rec.pct}%${rec.level ? `（${rec.level}）` : ''}`,
    });
  }

  const effective = signals.filter((s) => s.direction !== 'neutral');
  if (signals.length < 3) return null;

  const risks = signals.filter((s) => s.direction === 'risk').length;
  const positives = signals.filter((s) => s.direction === 'positive').length;
  let factor: 0.90 | 1.00 | 1.05 = 1.0;
  let summary: string;
  if (risks >= 2) {
    factor = 0.90;
    summary = `${risks} 项恢复风险信号 → 建议下周训练距离 -10%（引擎 factor 0.90）`;
  } else if (risks === 0 && positives >= 2) {
    factor = 1.05;
    summary = `无风险且 ${positives} 项积极信号 → 下周可 +5%（引擎 factor 1.05）`;
  } else {
    summary = `信号均衡（${effective.length} 项非中性：风险 ${risks} / 积极 ${positives}）→ 保持当前量（factor 1.00）`;
  }
  return { factor, signals, summary };
}

// ─── 建议生成 ─────────────────────────────────────────────────────────────────

function ltRecommendation(snapshot: CorosSnapshot, profile: EngineProfile | null): Recommendation | null {
  const measured = snapshot.fitness?.ltPaceSec;
  if (!measured) return null;
  const current = profile ? engineEffectiveLtPace(profile) : null;
  const delta = current ? Math.abs(measured - current.paceSec) : Infinity;
  if (current && delta <= 3) {
    return {
      id: 'lt-pace',
      title: 'LT 已校准',
      target: 'profile.ltPace',
      currentValue: formatPace(current.paceSec),
      recommendedValue: formatPaceColon(measured),
      confidence: 'high',
      autoPatch: false,
      evidence: [`引擎当前值与 COROS 实测差 ${Math.round(delta)}s/km，无需调整`],
      engineEffect: '—',
    };
  }
  return {
    id: 'lt-pace',
    title: 'LT 校准（实测阈值）',
    target: 'profile.ltPace',
    currentValue: current ? `${formatPace(current.paceSec)}（${current.source}）` : '未导入引擎档案',
    recommendedValue: formatPaceColon(measured),
    confidence: 'high',
    autoPatch: true,
    evidence: [
      `COROS 实测阈值配速 ${formatPace(measured)} /km`,
      current ? `引擎当前生效值 ${formatPace(current.paceSec)}（${current.source}），相差 ${Math.round(delta)}s/km` : '导入主 App 备份后可看到当前值对比',
    ],
    engineEffect: '6 个配速区间全部重算，计划中每一课的目标配速随之改变',
  };
}

function lthrRecommendation(snapshot: CorosSnapshot, profile: EngineProfile | null): Recommendation | null {
  const est = estimateLthr(snapshot);
  if (est === null) return null;
  const current = profile && profile.lthr !== '' ? Number(profile.lthr) : null;
  if (current !== null && Math.abs(current - est) <= 3) {
    return {
      id: 'lthr',
      title: 'LTHR 已校准',
      target: 'profile.lthr',
      currentValue: String(current),
      recommendedValue: String(est),
      confidence: 'medium',
      autoPatch: false,
      evidence: [`引擎当前 LTHR 与估算差 ${Math.abs(current - est)} bpm，无需调整`],
      engineEffect: '—',
    };
  }
  return {
    id: 'lthr',
    title: 'LTHR 估算（阈值心率）',
    target: 'profile.lthr',
    currentValue: current !== null ? String(current) : profile ? '未填写（用心率 167 默认推算）' : '未导入引擎档案',
    recommendedValue: String(est),
    confidence: 'medium',
    autoPatch: true,
    evidence: [`取 LT 配速 ±12s 分圈的平均心率（估算值，非设备直接测量）`],
    engineEffect: '6 个心率区间从默认推算变为个人化',
  };
}

function intensityRecommendation(snapshot: CorosSnapshot, profile: EngineProfile | null): Recommendation | null {
  const lt = snapshot.fitness?.ltPaceSec;
  if (!lt) return null;
  const runs = snapshot.activities.filter((a) => a.type === 'run');
  const seiler = seilerDistribution(runs, lt, 28);
  if (!seiler || seiler.highPct >= 5) return null;

  if (profile && profile.intensity === 'light') {
    return {
      id: 'intensity',
      title: '强度缺口：建议升档',
      target: 'profile.intensity',
      currentValue: 'light（计划中无强度课）',
      recommendedValue: 'moderate（每周 1 次强度课）',
      confidence: 'medium',
      autoPatch: false,
      evidence: [`近 4 周高强度占比 ${seiler.highPct.toFixed(0)}%（${seiler.highKm.toFixed(0)} km）`, '备赛期每周需要 1-2 次 Z4+ 刺激'],
      engineEffect: '周跑量上限 ×1.25，每周新增 1 次强度课（影响面大，请人工决策）',
    };
  }
  if (profile && profile.intensity !== 'light') {
    return {
      id: 'intensity',
      title: '强度缺口：执行问题',
      target: 'profile.intensity',
      currentValue: `${profile.intensity}（计划含强度课）`,
      recommendedValue: '按计划执行强度课',
      confidence: 'medium',
      autoPatch: false,
      evidence: [`近 4 周高强度占比 ${seiler.highPct.toFixed(0)}%`, `档案强度档为 ${profile.intensity}，计划本有强度课——缺口在执行而非计划`],
      engineEffect: '无需改参数；把计划里的强度课真正跑出来',
    };
  }
  return {
    id: 'intensity',
    title: '强度缺口',
    target: 'profile.intensity',
    currentValue: '未导入引擎档案',
    recommendedValue: '确保每周 1-2 次 Z4+',
    confidence: 'medium',
    autoPatch: false,
    evidence: [`近 4 周高强度占比 ${seiler.highPct.toFixed(0)}%（${seiler.highKm.toFixed(0)} km）`],
    engineEffect: '导入主 App 备份后可对照档案强度档给出具体建议',
  };
}

function pbRecommendations(snapshot: CorosSnapshot, profile: EngineProfile | null): Recommendation[] {
  const preds = snapshot.fitness?.predictions;
  if (!preds || !profile) return [];
  const out: Recommendation[] = [];
  const rows: Array<{ field: string; label: string; pred?: string; pb: string }> = [
    { field: 'profile.pb5k', label: '5K', pred: preds.km5, pb: profile.pb5k },
    { field: 'profile.pb10k', label: '10K', pred: preds.km10, pb: profile.pb10k },
    { field: 'profile.pbHalf', label: '半马', pred: preds.half, pb: profile.pbHalf },
    { field: 'profile.pbFull', label: '全马', pred: preds.full, pb: profile.pbFull },
  ];
  for (const r of rows) {
    if (!r.pred || !r.pb) continue;
    const predSec = timeToSeconds(r.pred);
    const pbSec = timeToSeconds(r.pb);
    if (predSec <= 0 || pbSec <= 0) continue;
    const gap = pbSec - predSec;
    if (gap < 30) continue; // 预测比 PB 快 30s 以上才值得提示
    out.push({
      id: 'pb-reference',
      title: `${r.label} 体能参照`,
      target: r.field,
      currentValue: r.pb,
      recommendedValue: `${r.pred}（COROS 预测）`,
      confidence: 'low',
      autoPatch: false,
      evidence: [`COROS 按当前体能预测 ${r.pred}，比档案 PB 快 ${formatPace(gap)}`, '预测反映当前体能，PB 应来自真实比赛——仅作参照'],
      engineEffect: `若按预测更新 ${r.field}，VDOT 上升 → 跑量基线与全部配速改变`,
    });
  }
  return out;
}

function goalRecommendation(snapshot: CorosSnapshot, profile: EngineProfile | null): Recommendation | null {
  const preds = snapshot.fitness?.predictions;
  if (!profile || !preds || !profile.goalTime) return null;
  const pred = profile.raceType === 'full' ? preds.full : preds.half;
  if (!pred) return null;
  const goalSec = timeToSeconds(profile.goalTime);
  const predSec = timeToSeconds(pred);
  if (goalSec <= 0 || predSec <= 0) return null;
  const gapSec = goalSec - predSec; // 正数 = 目标比预测快
  const gapPct = (gapSec / predSec) * 100;
  if (gapSec > 0 && gapPct > 1) {
    return {
      id: 'goal-feasibility',
      title: '目标偏激进',
      target: 'profile.goalTime',
      currentValue: profile.goalTime,
      recommendedValue: `当前体能预测 ${pred}`,
      confidence: 'medium',
      autoPatch: false,
      evidence: [`目标比 COROS 预测快 ${formatPace(gapSec)}（${gapPct.toFixed(1)}%）`, '需要更长的备赛窗口或阶段性目标'],
      engineEffect: '目标本身不改引擎行为；用于备赛预期管理',
    };
  }
  if (gapSec < 0 && -gapSec > 900) {
    return {
      id: 'goal-feasibility',
      title: '目标偏保守',
      target: 'profile.goalTime',
      currentValue: profile.goalTime,
      recommendedValue: `当前体能预测 ${pred}`,
      confidence: 'medium',
      autoPatch: false,
      evidence: [`COROS 预测 ${pred}，比目标快 ${formatPace(-gapSec)}`, '可考虑上调目标或缩短备赛期'],
      engineEffect: '目标本身不改引擎行为；用于备赛预期管理',
    };
  }
  return null;
}

// ─── 汇总 ─────────────────────────────────────────────────────────────────────

export function buildCoachReport(snapshot: CorosSnapshot, profile: EngineProfile | null): CoachReport {
  const recommendations: Recommendation[] = [];
  const ltRec = ltRecommendation(snapshot, profile);
  if (ltRec) recommendations.push(ltRec);
  const lthrRec = lthrRecommendation(snapshot, profile);
  if (lthrRec) recommendations.push(lthrRec);
  recommendations.push(...pbRecommendations(snapshot, profile));
  const intensityRec = intensityRecommendation(snapshot, profile);
  if (intensityRec) recommendations.push(intensityRec);
  const goalRec = goalRecommendation(snapshot, profile);
  if (goalRec) recommendations.push(goalRec);

  const patch: CoachPatch = {};
  for (const r of recommendations) {
    if (!r.autoPatch || !r.recommendedValue) continue;
    if (r.id === 'lt-pace') patch.ltPace = r.recommendedValue;
    if (r.id === 'lthr') patch.lthr = Number(r.recommendedValue);
  }

  return {
    schema: 'marathon-coach-rx',
    version: 1,
    generatedAt: new Date().toISOString(),
    snapshotBuiltAt: snapshot.builtAt,
    device: snapshot.device,
    engineProfileLoaded: profile !== null,
    adaptation: adaptationVerdict(snapshot),
    recommendations,
    patch,
  };
}

// ─── 备份桥：解析主 App 备份 + 打补丁（只改 profile 白名单字段）──────────────

export type BackupBridgeResult =
  | { ok: true; backup: Record<string, unknown>; profile: EngineProfile }
  | { ok: false; error: string };

const PROFILE_KEY_WHITELIST = new Set([
  'height', 'weight', 'pb5k', 'pb10k', 'pbHalf', 'pbFull',
  'lthr', 'ltPace', 'raceDate', 'raceType', 'goalTime', 'intensity', 'longRunDay',
]);

export function parseEngineBackup(text: string): BackupBridgeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是合法的 JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: '备份根节点必须是对象' };
  }
  const root = parsed as Record<string, unknown>;
  if (root.schema !== 'marathon-backup') return { ok: false, error: '不是 Marathon 主 App 的备份文件' };
  if (root.app !== 'marathon-training') return { ok: false, error: '应用标识不匹配' };
  if (root.version !== 1) return { ok: false, error: `不支持的备份版本：${String(root.version)}` };
  const data = root.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: '备份缺少 data 节点' };
  }
  const profile = (data as Record<string, unknown>).profile;
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
    return { ok: false, error: '备份缺少 profile 节点' };
  }
  const p = profile as Record<string, unknown>;
  for (const k of Object.keys(p)) {
    if (!PROFILE_KEY_WHITELIST.has(k)) return { ok: false, error: `profile 含未知字段：${k}` };
  }
  if (typeof p.ltPace !== 'string' || typeof p.pb5k !== 'string') {
    return { ok: false, error: 'profile 结构不完整' };
  }
  if (p.raceType !== 'half' && p.raceType !== 'full') {
    return { ok: false, error: 'profile.raceType 非法' };
  }
  if (p.intensity !== 'light' && p.intensity !== 'moderate' && p.intensity !== 'heavy') {
    return { ok: false, error: 'profile.intensity 非法' };
  }
  if (typeof p.longRunDay !== 'number' || p.longRunDay < 0 || p.longRunDay > 6) {
    return { ok: false, error: 'profile.longRunDay 非法' };
  }
  return {
    ok: true,
    backup: root,
    profile: {
      height: (p.height === '' || typeof p.height === 'number') ? p.height as number | '' : '',
      weight: (p.weight === '' || typeof p.weight === 'number') ? p.weight as number | '' : '',
      pb5k: p.pb5k as string,
      pb10k: (p.pb10k as string) ?? '',
      pbHalf: (p.pbHalf as string) ?? '',
      pbFull: (p.pbFull as string) ?? '',
      lthr: (p.lthr === '' || typeof p.lthr === 'number') ? p.lthr as number | '' : '',
      ltPace: p.ltPace as string,
      raceDate: typeof p.raceDate === 'string' ? p.raceDate : '',
      raceType: p.raceType as 'half' | 'full',
      goalTime: typeof p.goalTime === 'string' ? p.goalTime : '',
      intensity: p.intensity as 'light' | 'moderate' | 'heavy',
      longRunDay: p.longRunDay as number,
    },
  };
}

/** 深拷贝原备份，只改 data.profile 的补丁字段；其余内容原样保留（含 plan/打卡/赛事/休假） */
export function buildCalibratedBackup(backup: Record<string, unknown>, patch: CoachPatch): string {
  const next = JSON.parse(JSON.stringify(backup)) as Record<string, unknown>;
  const data = next.data as Record<string, unknown>;
  const profile = data.profile as Record<string, unknown>;
  if (patch.ltPace !== undefined) profile.ltPace = patch.ltPace;
  if (patch.lthr !== undefined) profile.lthr = patch.lthr;
  return JSON.stringify(next, null, 2);
}
