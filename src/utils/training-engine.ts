import { addDays, differenceInDays, format, startOfDay } from 'date-fns';

export type CalculationMethod = 'coros';

/**
 * 解析本地日历日。
 * - 纯 `YYYY-MM-DD`：按本地 00:00，避免 `new Date('YYYY-MM-DD')` 的 UTC 午夜偏移。
 * - 含时间的 ISO（如 persist 后的 `...T16:00:00.000Z`）：先按瞬时解析再取本地日历日，
 *   切勿只截前 10 字符（会把北京时间午夜误判成前一天）。
 */
export function parseLocalDate(isoDate: string): Date {
  const s = (isoDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date(NaN) : startOfDay(d);
}

/** 将 plan 中可能被 persist 成字符串的 date 规范回本地 Date */
export function normalizeWorkoutDate(date: Date | string): Date {
  if (date instanceof Date) {
    return Number.isNaN(date.getTime()) ? date : startOfDay(date);
  }
  return parseLocalDate(String(date));
}

/** 本地日历日 00:00，用于 asOf / 计划起点 */
export function localDay(d: Date = new Date()): Date {
  return startOfDay(d);
}

export interface UserProfile {
  height: number | '';
  weight: number | '';
  pb5k: string; // 'mm:ss'
  pb10k: string; // 'mm:ss'
  pbHalf: string; // 'hh:mm:ss'
  pbFull: string; // 'hh:mm:ss'
  lthr: number | ''; // bpm
  ltPace: string; // 'mm:ss'
  raceDate: string; // 'YYYY-MM-DD'
  raceType: 'half' | 'full';
  goalTime: string; // 'hh:mm:ss'
  intensity: 'light' | 'moderate' | 'heavy';
  longRunDay: number; // 0=Sunday, 1=Monday, ..., 6=Saturday (default 0)
  /** 设备实测 VO₂max 覆盖（COROS EvoLab；P0 校准写入，只升不降）。
   *  与 Daniels 换算存在系统性口径差（同成绩 COROS 高 ~4 点），设备实测优先。 */
  vdotOverride?: number;
}

export interface WorkoutSegment {
  name: string;
  distanceKm?: number;
  durationMins?: number;
  pace?: string;
  hrZone?: string;
  reps?: number;
  rest?: string;
  description?: string;
}

export interface WorkoutDetails {
  warmup?: WorkoutSegment;
  main: WorkoutSegment[];
  cooldown?: WorkoutSegment;
}

export interface DailyWorkout {
  date: Date;
  workoutType: string;
  description: string;
  targetPace?: string;
  targetHR?: string;
  distanceKm?: number;
  details?: WorkoutDetails;
  weeklySummary?: {
    weekNum: number;
    phase: string;
    volume: number;
    tips: string;
  };
}

// Convert time string (mm:ss or hh:mm:ss) to seconds
export function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

// Format seconds to mm:ss
export function formatPace(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

// Format seconds to hh:mm:ss
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ============================================================
// VDOT Engine — Jack Daniels & Gilbert (1979) nonlinear formula
// VDOT is calculated directly from race distance and time.
// No approximations, no lookup table — exact source formula.
// ============================================================
export function calculateVDOTFromRace(distanceM: number, timeSec: number): number {
  if (timeSec <= 0 || distanceM <= 0) return 0;
  const t = timeSec / 60; // minutes
  const v = distanceM / t; // meters/min
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  if (pct <= 0) return 0;
  return Math.max(30, Math.min(85, vo2 / pct));
}

export function calculateVDOTFromHalf(pbHalf: string): number {
  const t = timeToSeconds(pbHalf);
  return t > 0 ? calculateVDOTFromRace(21097.5, t) : 0;
}

export function calculateVDOTFromFull(pbFull: string): number {
  const t = timeToSeconds(pbFull);
  return t > 0 ? calculateVDOTFromRace(42195, t) : 0;
}

export function calculateVDOTFrom5K10K(pb5k: string, pb10k: string): number {
  const t5k = timeToSeconds(pb5k);
  const t10k = timeToSeconds(pb10k);
  const v5k = t5k > 0 ? calculateVDOTFromRace(5000, t5k) : 0;
  const v10k = t10k > 0 ? calculateVDOTFromRace(10000, t10k) : 0;

  if (v5k > 0 && v10k > 0) return (v5k + v10k) / 2;
  if (v10k > 0) return v10k;
  if (v5k > 0) return v5k;
  return 0; // 空成绩不再 fallback 到 VDOT 40
}

/** 半马常规计划最短备赛天数（不含比赛日当天） */
export const MIN_PLAN_DAYS_HALF = 21;
/** 全马常规计划最短备赛天数（不含比赛日当天） */
export const MIN_PLAN_DAYS_FULL = 35;

export type PlanBlockReason =
  | 'past_race'
  | 'no_performance'
  | 'too_short_half'
  | 'too_short_full';

/**
 * 判断是否具备生成真实计划所需的成绩锚点。
 * 至少一项有效 PB（5K/10K/半马/全马）或 LT 配速；空成绩不得用默认 4:33 生成计划。
 */
export function hasUsablePerformance(profile: UserProfile): boolean {
  return (
    timeToSeconds(profile.pbFull) > 0 ||
    timeToSeconds(profile.pbHalf) > 0 ||
    timeToSeconds(profile.pb5k) > 0 ||
    timeToSeconds(profile.pb10k) > 0 ||
    timeToSeconds(profile.ltPace) > 0
  );
}

/**
 * 计算 VDOT：Full > Half > 5K/10K。无有效成绩返回 0（不 fallback）。
 */
export function resolveVDOT(profile: UserProfile): number {
  // 设备实测覆盖优先（只升不降）：COROS EvoLab 与 Daniels 换算存在 ~4 点口径差，
  // 实测值代表当前生理现实，高于换算值时以实测为准
  const ov = profile.vdotOverride;
  const derived =
    timeToSeconds(profile.pbFull) > 0 ? calculateVDOTFromFull(profile.pbFull)
    : timeToSeconds(profile.pbHalf) > 0 ? calculateVDOTFromHalf(profile.pbHalf)
    : calculateVDOTFrom5K10K(profile.pb5k, profile.pb10k);
  if (ov != null && Number.isFinite(ov) && ov >= 30 && ov <= 90 && ov > derived) return ov;
  return derived;
}

/** 计划生成前置检查；返回 null 表示可通过。 */
export function getPlanBlockReason(
  profile: UserProfile,
  asOf: Date = new Date(),
): PlanBlockReason | null {
  const raceDate = parseLocalDate(profile.raceDate);
  if (Number.isNaN(raceDate.getTime())) return 'past_race';
  const totalDays = differenceInDays(raceDate, localDay(asOf));
  if (totalDays <= 0) return 'past_race';
  if (!hasUsablePerformance(profile)) return 'no_performance';
  const minDays = profile.raceType === 'full' ? MIN_PLAN_DAYS_FULL : MIN_PLAN_DAYS_HALF;
  if (totalDays < minDays) {
    return profile.raceType === 'full' ? 'too_short_full' : 'too_short_half';
  }
  return null;
}

export const PLAN_BLOCK_MESSAGES: Record<PlanBlockReason, string> = {
  past_race: '比赛日期已过，无法生成备赛计划。请选择未来的比赛日期。',
  no_performance:
    '请至少填写一项有效成绩（5km / 10km / 半马 / 全马）或 LT 配速。系统不会用默认能力值替你生成计划。',
  too_short_half:
    `距半马比赛不足 ${MIN_PLAN_DAYS_HALF} 天，不适合生成常规备赛计划。小白建议：改为轻松有氧维持、保证睡眠，赛前 2 周以减量为主，不要临时加量冲刺。`,
  too_short_full:
    `距全马比赛不足 ${MIN_PLAN_DAYS_FULL} 天，不适合生成常规备赛计划。小白建议：改为轻松有氧维持、保证睡眠，赛前 3 周以减量为主，不要临时加量冲刺。`,
};

// Base peak weekly mileage from VDOT (Jack Daniels + RRCA reference)
export function getBaseCapacityFromVDOT(vdot: number, raceType: 'half' | 'full'): number {
  // 中段锚点经 COROS 同跑者 16 周方案外部交叉校准（+10%）：VDOT48 → 全马峰值 ~73km
  const fullMap: Record<number, number> = { 30: 40, 40: 60, 50: 82, 60: 100, 70: 130 };
  const halfMap: Record<number, number> = { 30: 30, 40: 49, 50: 66, 60: 85, 70: 110 };
  const map = raceType === 'half' ? halfMap : fullMap;
  const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
  if (vdot <= keys[0]) return map[keys[0]];
  if (vdot >= keys[keys.length - 1]) return map[keys[keys.length - 1]];
  const lower = keys.slice().reverse().find(k => k <= vdot) ?? keys[0];
  const upper = keys.find(k => k >= vdot) ?? keys[keys.length - 1];
  if (lower === upper) return map[lower];
  const ratio = (vdot - lower) / (upper - lower);
  return map[lower] + ratio * (map[upper] - map[lower]);
}

// Predict race time from VDOT using the inverse Daniels formula (binary search)
export function predictTime(vdot: number, type: 'half' | 'full'): string {
  if (vdot <= 0) return '';
  const distanceM = type === 'half' ? 21097.5 : 42195;
  // Binary search for the time that produces the given VDOT
  let lo = 1200, hi = 50000; // 20min to ~14hrs
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (calculateVDOTFromRace(distanceM, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return formatTime(Math.round((lo + hi) / 2));
}

// ============================================================
// COROS EvoLab 6-Zone Pace Model (sole model — most runner-friendly)
// Anchor: LT Pace (lactate threshold pace, per km)
// Z4 widened to ±12s around LT to match official COROS EvoLab spec
// ============================================================
/**
 * 从档案推导 LT 配速（秒/km）。
 * 优先级：用户 LT → 半马 → 全马 → 10K → 5K。
 * 无任何锚点返回 0（禁止静默 4:33）。
 *
 * 换算说明（与 COROS/常见阈值近似一致，非实验室精确值）：
 * - 半马配速 × 0.93 ≈ LT
 * - 全马配速 × 0.94 ≈ LT（全马略慢于半马，系数略放宽）
 * - 10K 配速 × 1.05 ≈ LT
 * - 5K 配速 × 1.10 ≈ LT
 */
export function resolveLTPaceSec(profile: UserProfile): number {
  const fromLt = timeToSeconds(profile.ltPace);
  if (fromLt > 0) return fromLt;

  const halfSec = timeToSeconds(profile.pbHalf);
  if (halfSec > 0) return (halfSec / 21.1) * 0.93;

  const fullSec = timeToSeconds(profile.pbFull);
  if (fullSec > 0) return (fullSec / 42.195) * 0.94;

  const tenKSec = timeToSeconds(profile.pb10k);
  if (tenKSec > 0) return (tenKSec / 10) * 1.05;

  const fiveKSec = timeToSeconds(profile.pb5k);
  if (fiveKSec > 0) return (fiveKSec / 5) * 1.1;

  return 0;
}

/**
 * COROS EvoLab 区间配速。无成绩时返回 null，调用方不得用 4:33 假装有能力数据。
 * 指标页预览可对 null 做空态展示；计划生成必须在 hasUsablePerformance 之后调用。
 */
export function calculatePaces(profile: UserProfile): {
  z1: string; z2: string; z3: string; z4: string; z5: string; z6: string; isCustom: boolean;
} | null {
  const tPaceSec = resolveLTPaceSec(profile);
  if (tPaceSec <= 0) return null;

  return {
    z1: `> ${formatPace(tPaceSec + 97)}`,
    z2: `${formatPace(tPaceSec + 52)}-${formatPace(tPaceSec + 97)}`,
    z3: `${formatPace(tPaceSec + 13)}-${formatPace(tPaceSec + 51)}`,
    z4: `${formatPace(tPaceSec - 12)}-${formatPace(tPaceSec + 12)}`,  // ±12s — matches COROS EvoLab official spec
    z5: `${formatPace(tPaceSec - 30)}-${formatPace(tPaceSec - 13)}`,
    z6: `< ${formatPace(tPaceSec - 30)}`,
    isCustom: false
  };
}

/**
 * 配速落区数值判定（单一事实源；COROS EvoLab 6 区间）。
 * 区间边界与 calculatePaces 显示字符串严格一致；insights 复用此函数，禁止另写常量。
 */
export function paceToZoneSec(paceSec: number, ltSec: number): number {
  if (paceSec > ltSec + 97) return 1;
  if (paceSec > ltSec + 51) return 2;
  if (paceSec > ltSec + 12) return 3;
  if (paceSec >= ltSec - 12) return 4;
  if (paceSec >= ltSec - 30) return 5;
  return 6;
}

// COROS EvoLab 6-Zone HR Model
export function calculateHRZones(profile: UserProfile) {
  const hr = Number(profile.lthr) || 167;
  return {
    z1: `< ${Math.round(hr * 0.80)} bpm`,
    z2: `${Math.round(hr * 0.80)}-${Math.round(hr * 0.89)} bpm`,
    z3: `${Math.round(hr * 0.90)}-${Math.round(hr * 0.94)} bpm`,
    z4: `${Math.round(hr * 0.95)}-${Math.round(hr * 1.02)} bpm`,
    z5: `${Math.round(hr * 1.03)}-${Math.round(hr * 1.06)} bpm`,
    z6: `> ${Math.round(hr * 1.06)} bpm`,
  };
}

/**
 * 档案 ↔ 计划一致性守卫：检测档案漂移（比赛日已过、计划止期漂移、项目不符）。
 * 纯函数；UI 层据此提示重新生成。空计划不报（无计划无漂移可言）。
 */
export function getProfilePlanMismatch(
  profile: UserProfile,
  plan: DailyWorkout[],
): 'raceDate-past' | 'plan-stale' | 'race-type-drift' | null {
  if (!plan.length) return null;
  const today = localDay();
  if (parseLocalDate(profile.raceDate) < today) return 'raceDate-past';
  const planEnd = plan[plan.length - 1].date;
  if (Math.abs(differenceInDays(parseLocalDate(profile.raceDate), planEnd)) > 1) return 'plan-stale';
  const raceW = plan.find(w => w.workoutType === 'Race');
  if (raceW) {
    const km = raceW.distanceKm ?? 0;
    if (profile.raceType === 'full' && km > 0 && km < 40) return 'race-type-drift';
    if (profile.raceType === 'half' && km > 25) return 'race-type-drift';
  }
  return null;
}

/**
 * 校准类再生成的周期锚点解析。
 * 原则：能力参数刷新（LT/PB/VO₂max 覆盖）不应重置周期相位——
 * 以原计划首日为 asOf 重建完整弧线（过去=历史，未来=延续原相位、只更新剂量）。
 * 比赛日变更 = 真新目标 → 锚点回到今天（新周期）。
 * 回退链：无计划或异常 → 今天。
 */
export function resolveRegenerationAnchor(
  profileRaceDate: string,
  plan: DailyWorkout[],
  today: Date = new Date(),
): Date {
  if (!plan.length) return localDay(today);
  // 主赛标识 = 计划末日（引擎恒以 profile.raceDate 收尾）。
  // 不用 find(Race)：多赛事场景下更早的 B 赛条目会劫持判定。
  const planPrimaryDate = format(plan[plan.length - 1].date, 'yyyy-MM-dd');
  if (planPrimaryDate !== profileRaceDate) return localDay(today);
  // 原周期起点 = 计划首日
  return normalizeWorkoutDate(plan[0].date);
}

export function generateTrainingPlan(profile: UserProfile, asOf: Date = new Date()): DailyWorkout[] {
  const plan: DailyWorkout[] = [];
  const today = localDay(asOf);
  const raceDate = parseLocalDate(profile.raceDate);

  // 引擎硬守卫：短周期 / 无成绩 一律不生成常规计划（不依赖 UI）
  if (getPlanBlockReason(profile, today) !== null) return [];

  const totalDays = differenceInDays(raceDate, today);
  if (totalDays <= 0) return [];

  // 含比赛日在内的总天数（totalDays 是比赛当天）——否则整周余数恰为 0 时赛日会被截断
  const totalWeeks = Math.max(1, Math.ceil((totalDays + 1) / 7));
  const paces = calculatePaces(profile);
  if (!paces) return []; // 空成绩不得用 4:33 生成真实计划
  const hrZones = calculateHRZones(profile);
  const lsdDay = profile.longRunDay ?? 0; // preferred long run day of week

  // Warmup & cooldown segments
  const getWarmup = (): WorkoutSegment => ({
    name: '极简动态热身 (5分钟)',
    durationMins: 5,
    hrZone: `Zone 1 (${hrZones.z1})`,
    description: '1. 踝关节环绕与提踵(1分); 2. 腿部前后左右摆动(1分); 3. 动态弓步压腿(1分); 4. 徒手深蹲15次(1分); 5. 原地高抬腿激活心率(1分)。'
  });

  const getCooldown = (): WorkoutSegment => ({
    name: '跑后静态拉伸 (5分钟)',
    durationMins: 5,
    hrZone: `Zone 1 (${hrZones.z1})`,
    description: '1. 推墙小腿拉伸(1分); 2. 站姿大腿前侧拉伸(1分); 3. 双脚交叉体前屈拉大腿后侧(1分); 4. 站姿四字臀部拉伸(1分); 5. 侧腰伸展与深呼吸平复心率(1分)。'
  });

  // 1. VDOT — priority: Full > Half > 5K/10K（无成绩已在守卫拦截，此处不再 fallback 40）
  const vdot = resolveVDOT(profile);
  if (vdot <= 0 && timeToSeconds(profile.ltPace) <= 0) return [];

  // 2. Base capacity from VDOT（仅 LT 无 PB 时用温和默认 45 作为容量锚，仍要求 hasUsablePerformance）
  const capacityVdot = vdot > 0 ? vdot : 45;
  const baseCapacity = getBaseCapacityFromVDOT(capacityVdot, profile.raceType);

  // 3. Intensity multiplier
  const intensityMultiplier = profile.intensity === 'light' ? 0.80 : profile.intensity === 'moderate' ? 1.00 : 1.25;

  // 4. Goal gap factor — if goal is faster than predicted, increase volume proportionally
  let goalGapFactor = 1.0;
  if (profile.goalTime) {
    const predictedSec = timeToSeconds(predictTime(vdot, profile.raceType));
    const goalSec = timeToSeconds(profile.goalTime);
    if (predictedSec > 0 && goalSec > 0) {
      const diffMinutes = (predictedSec - goalSec) / 60;
      if (diffMinutes > 0) {
        goalGapFactor = Math.min(1.25, 1 + diffMinutes * 0.06);
      }
    }
  }

  // 5. BMI safety factor
  let bmiSafety = 1.0;
  if (profile.height && profile.weight) {
    const bmi = Number(profile.weight) / Math.pow(Number(profile.height) / 100, 2);
    bmiSafety = Math.max(0.88, 1 - Math.max(0, bmi - 22) * 0.018);
  }

  // 6. Weeks factor — longer plan allows higher peak; shorter plan is more conservative
  //    (opposite of old logic which gave short plans a higher multiplier)
  const weeksFactor = totalWeeks >= 24 ? 1.00 : totalWeeks >= 16 ? 0.95 : 0.88;

  // 7. Peak weekly mileage with safety caps
  let peakMPW = Math.round(baseCapacity * intensityMultiplier * bmiSafety);
  if (goalGapFactor > 1.0) peakMPW += Math.round(peakMPW * (goalGapFactor - 1.0) * 0.7);
  peakMPW = Math.round(peakMPW * weeksFactor);

  const vdotBasedMaxPeak = baseCapacity * 1.4;
  const userLevelMaxPeak = profile.raceType === 'full'
    ? { light: 65, moderate: 85, heavy: 110 }[profile.intensity]
    : { light: 45, moderate: 65, heavy: 85 }[profile.intensity];
  peakMPW = Math.min(peakMPW, vdotBasedMaxPeak, userLevelMaxPeak);

  // 8. Start mileage — no user input; derived from VDOT base capacity
  //    Start low enough to leave room for a visible ramp, especially in long plans
  const startRatio = totalWeeks >= 20 ? 0.38 : totalWeeks >= 16 ? 0.45 : 0.55;
  const startMPW = Math.round(peakMPW * startRatio);

  // 9. Three-segment periodization volume curve
  //    Segment 1 (Base ramp):  start → 75% peak
  //    Segment 2 (Build ramp): 75% → 100% peak
  //    Segment 3 (Peak hold):  plateau at peak ±2%
  //    Taper: 3 weeks exponential decay (Bosquet meta-analysis)
  const targetVolumes: number[] = [];
  const cycleLength = 4; // universal 3:1 (3 build + 1 recovery)
  // COROS 风格 planned-overreaching：深砍（-38%）排空疲劳 → 恢复周后直接跳回段目标
  // （Pfitzinger/Gabbett 块式震荡；10% 规则只约束连续建设，不约束计划性震荡）
  const recoveryDepth = profile.raceType === 'full'
    ? (profile.intensity === 'light' ? 0.66 : 0.58)
    : 0.65;

  // Half marathon taper = 2 weeks (Pfitzinger/Daniels); full = 3 weeks
  const taperWeeksForRace = profile.raceType === 'half' ? 2 : 3;
  const preTaperWeeks = totalWeeks - taperWeeksForRace;
  // Segment proportions: long plans get more base + plateau, short plans get more build
  let baseEndWeek: number, buildEndWeek: number;
  if (preTaperWeeks >= 24) {
    baseEndWeek  = Math.floor(preTaperWeeks * 0.40);
    buildEndWeek = Math.floor(preTaperWeeks * 0.70);
  } else if (preTaperWeeks >= 16) {
    baseEndWeek  = Math.floor(preTaperWeeks * 0.35);
    buildEndWeek = Math.floor(preTaperWeeks * 0.80);
  } else {
    baseEndWeek  = Math.floor(preTaperWeeks * 0.30);
    buildEndWeek = Math.floor(preTaperWeeks * 0.90);
  }

  const midTarget = peakMPW * 0.75; // base→build transition target

  for (let w = 0; w < totalWeeks; w++) {
    const isTaperWeek = w >= preTaperWeeks;
    const taperIdx = w - preTaperWeeks; // 0, 1, 2 for taper weeks
    const isRecovery = (w > 0 && w % cycleLength === (cycleLength - 1) && !isTaperWeek);

    let targetVolume = 0;
    if (isTaperWeek) {
      // Exponential decay taper — Bosquet 2007 meta-analysis: step-down profile
      // Target: ~70% / ~50% / ~35% for full; ~70% / ~50% for half
      // Formula exp(-0.35*(idx+1)) ≈ 70%, 50%, 35% — matches Pfitzinger exactly
      targetVolume = peakMPW * Math.exp(-0.35 * (taperIdx + 1.0));
    } else if (isRecovery) {
      targetVolume = targetVolumes[w - 1] * recoveryDepth;
    } else {
      // Count non-recovery build weeks for smooth progress calculation
      let buildIdx = 0;
      for (let i = 0; i <= w; i++) {
        if (!(i > 0 && i % cycleLength === (cycleLength - 1) && i < preTaperWeeks)) buildIdx++;
      }

      if (w < baseEndWeek) {
        // Segment 1: Base ramp — start → 75% peak
        const p = buildIdx / Math.max(1, baseEndWeek);
        targetVolume = startMPW + (midTarget - startMPW) * p;
      } else if (w < buildEndWeek) {
        // Segment 2: Build ramp — 75% → 100% peak (slightly concave for acceleration)
        const segLen = buildEndWeek - baseEndWeek;
        const segIdx = w - baseEndWeek;
        const p = segIdx / Math.max(1, segLen);
        targetVolume = midTarget + (peakMPW - midTarget) * Math.pow(p, 0.7);
      } else {
        // Segment 3: Peak plateau — hold at peak (±2% natural variation)
        targetVolume = peakMPW;
      }

      // 增幅上限：仅约束连续建设周（+9%）；
      // 恢复周后的冲击周不受帽约束——段目标本身定义反弹幅度（COROS 式猛高原）
      if (w > 0) {
        const prevWasRecovery = w >= 2 && targetVolumes[w - 1] < targetVolumes[w - 2] * 0.90;
        if (!prevWasRecovery) {
          targetVolume = Math.min(targetVolume, targetVolumes[w - 1] * 1.09);
        }
      }
    }
    targetVolumes.push(Math.round(targetVolume));
  }

  // Phase tip messages by training period
  const phaseTips: Record<string, string> = {
    '基础/建构期': '基础期重点：以 Zone 2 配速为主，不要追求速度，专注心率控制和有氧基础建设。',
    '强度/专项期': '专项期重点：强度课后充分恢复，LSD 后段加入马拉松配速模拟，提升比赛感觉。',
    '峰值/减量期': '减量期重点：保持强度、削减跑量。不要在减量期增加新内容，信任你的训练积累。',
  };

  // LT 秒：与 calculatePaces 同一推导（含仅全马 PB）；禁止静默 4:33
  const ltSec = resolveLTPaceSec(profile);
  if (ltSec <= 0) return [];
  const easyPaceSec = ltSec + 80;

  for (let w = 0; w < totalWeeks; w++) {
    const isTaperWeek = w >= preTaperWeeks;
    const isRecovery = (w > 0 && w % cycleLength === (cycleLength - 1) && !isTaperWeek);
    const phase = w < baseEndWeek ? '基础/建构期' : (isTaperWeek ? '峰值/减量期' : '强度/专项期');
    const baseWeekVolume = targetVolumes[w];

    // Progress 0→1 over all pre-taper non-recovery weeks
    let buildIdx = 0;
    for (let i = 0; i <= w; i++) {
      if (!(i > 0 && i % cycleLength === (cycleLength - 1) && i < preTaperWeeks)) buildIdx++;
    }
    const totalBuildWeeks = preTaperWeeks - Math.floor((preTaperWeeks - 1) / cycleLength);
    const progress = Math.min(1, buildIdx / Math.max(1, totalBuildWeeks));

    // --- Progressive minimum distances (ramp with progress) ---
    const minEasyKm = Math.max(5, Math.ceil((35 * 60) / easyPaceSec));
    const minIntensityKm = Math.max(6, Math.ceil((45 * 60) / easyPaceSec));

    // LSD floor: starts just above easy run, ramps to full minimum by build phase
    const minLSD_early = minEasyKm + 3;  // ~8-9km in base phase
    const minLSD_peak = profile.raceType === 'full' ? 14 : 10;
    const minLSDKm = Math.round(minLSD_early + (minLSD_peak - minLSD_early) * Math.min(1, progress * 1.5));

    const PEAK_LSD = profile.raceType === 'full'
      ? { light: 30, moderate: 30, heavy: 34 }[profile.intensity]
      : { light: 18, moderate: 20, heavy: 22 }[profile.intensity];

    const startLSD = Math.max(minLSDKm, minLSD_early);
    let lsdDistance = startLSD + (PEAK_LSD - startLSD) * Math.pow(progress, 0.8);
    lsdDistance = Math.min(lsdDistance, PEAK_LSD);

    // 减量区起始：距赛 taperWeeksForRace×7 天（全马 21 / 半马 14）
    const taperZoneDTR = taperWeeksForRace * 7;
    if (isTaperWeek) {
      // Pfitzinger taper 长跑序列——此为周级【预估值】，仅供体积下限估算；
      // 实际课表距离由日循环按 dTR 精确映射（免疫周边界错位）
      const taperIdx = w - preTaperWeeks;
      if (profile.raceType === 'full') {
        if (taperIdx === 0) lsdDistance = Math.max(minLSDKm, 22);
        else if (taperIdx === 1) lsdDistance = Math.max(minLSDKm, 14);
        else lsdDistance = Math.max(minLSDKm, 8);
      } else {
        if (taperIdx === 0) lsdDistance = Math.max(minLSDKm, 16);
        else lsdDistance = Math.max(minLSDKm, 10);
      }
    } else if (isRecovery) {
      lsdDistance = Math.max(minLSDKm, lsdDistance * 0.82);
    }

    // 时长封顶：单次长跑 ≤3.5h（Z2 慢端配速估算——慢跑者自动收紧）
    const timeCapKm = Math.floor(12600 / (ltSec + 97));
    lsdDistance = Math.round(Math.min(lsdDistance, timeCapKm));

    let weekVolume: number;
    if (isTaperWeek) {
      // 减量周：LSD 合理占据削减周量的更大份额（Pfitzinger 减量设计 60-70%），
      // 普通占比帽会使周量被顶到减量目标之上——保留抬举机制
      const minWeekVolumeForLSD = Math.ceil(lsdDistance / 0.65);
      weekVolume = Math.max(baseWeekVolume, minWeekVolumeForLSD);
    } else {
      // 恢复周与普通周同样执行严格 35% 钳制——cutback 必须真实落账
      weekVolume = baseWeekVolume;
      lsdDistance = Math.min(lsdDistance, Math.round(baseWeekVolume * 0.35));
    }
    lsdDistance = Math.max(minLSDKm, Math.min(lsdDistance, timeCapKm));

    // --- Intensity session count: varies by phase (Daniels/Pfitzinger best practice) ---
    // Base phase: fewer quality sessions; Specific phase: full quality load
    let intensitySessions: number;
    if (isTaperWeek || isRecovery) {
      intensitySessions = profile.intensity === 'light' ? 0 : 1;
    } else if (phase === '基础/建构期') {
      intensitySessions = { light: 0, moderate: 1, heavy: 1 }[profile.intensity];
    } else {
      // 强度/专项期: full load
      intensitySessions = { light: 1, moderate: 2, heavy: 2 }[profile.intensity];
    }
    const longRunDominantWeek = lsdDistance >= (profile.raceType === 'full' ? 28 : 18);
    if (longRunDominantWeek && intensitySessions > 1) intensitySessions = 1;

    // --- Session A (primary, longer) and Session B (secondary, shorter) ---
    // Daniels caps (Running Formula 3rd ed.):
    //   T-pace (tempo/cruise): ≤ 10% of weekly mileage per session, hard portion ≤ 10 km
    //   I-pace (intervals):    ≤ 8% of weekly mileage per session, hard portion ≤ 10 km
    // We cap the TOTAL session distance (incl. warmup/cooldown) which is ~total×0.75 hard,
    // so effective Daniels compliance: weekVolume×0.18 total ≈ weekVolume×0.135 hard < 10%.
    // For high-volume runners, additional absolute cap on total prevents overshoot.
    const maxIntensityDayKm = profile.raceType === 'full' ? 16 : 13;
    // Hard-portion Daniels caps: T≤10%, I≤8% of weekly volume
    const danielsTCap = Math.min(10 / 0.72, weekVolume * 0.10 / 0.72); // total dist for T at 72% hard
    const danielsICap = Math.min(10 / 0.60, weekVolume * 0.08 / 0.60); // total dist for I at 60% hard
    const intensityA_km = intensitySessions >= 1
      ? Math.max(minIntensityKm, Math.min(maxIntensityDayKm, danielsTCap, weekVolume * 0.18))
      : 0;
    const intensityB_km = intensitySessions >= 2
      ? Math.max(minIntensityKm, Math.min(maxIntensityDayKm * 0.85, danielsICap, weekVolume * 0.13))
      : 0;
    const intensityTotal = intensityA_km + intensityB_km;

    // --- Minimum distances ---
    const minEasyFloor = profile.raceType === 'full' ? 6 : 5;  // 轻松跑最低 6km/5km
    const minRecoveryKm = 4;  // 恢复跑最低 4km

    let remainingDist = Math.max(0, weekVolume - lsdDistance - intensityTotal);

    // moderate 2-quality now has 3 easy days (rel 2/4/6); single-quality has 3 too (rel 2/4/6)
    let easyDaysCount = 2;
    if (profile.intensity === 'moderate') easyDaysCount = 3;
    if (profile.intensity === 'heavy') easyDaysCount = 2;

    const requiredRemainingDist = easyDaysCount * minEasyFloor + (profile.intensity === 'heavy' ? minRecoveryKm : 0);
    // 恢复周不抬举：下限抬举会把 cutback 顶回去（诚实减量）
    if (!isRecovery && remainingDist < requiredRemainingDist && weekVolume < peakMPW) {
      weekVolume += requiredRemainingDist - remainingDist;
      remainingDist = requiredRemainingDist;
    }

    for (let d = 0; d < 7; d++) {
      const dayIndex = w * 7 + d;
      if (dayIndex > totalDays) break;

      const currentDate = addDays(today, dayIndex);
      currentDate.setHours(12, 0, 0, 0);
      const isRaceDay = dayIndex === totalDays;
      const dTR = totalDays - dayIndex; // 距比赛日天数（0 = 比赛当天）
      // 赛前红线：最后 7 天零质量课（含赛日）
      const effSessions = dTR <= 7 ? 0 : intensitySessions;
      const dow = currentDate.getDay(); // 0=Sunday

      // Relative day offsets from lsdDay, with configurable long run day
      const rel = (offset: number) => (lsdDay + offset) % 7;

      let wType = 'Rest';
      let dist = 0;

      // Enforce minimum easy distance（恢复周例外：允许低于单次下限，让 -28% 真实落账）
      const getEasyDist = (ratio: number, days: number) => {
        let d = remainingDist * ratio;
        if (isRecovery) return Math.max(minRecoveryKm - 1, Math.round(d));
        if (d > 0 && d < minEasyFloor) d = Math.max(d, Math.min(remainingDist / days, minEasyFloor));
        return Math.max(minEasyFloor, d);
      };

      if (profile.intensity === 'light') {
        // 4 days: LSD(+0), Intensity(+2), Easy(+4), Easy(+6)
        if (dow === rel(0)) { wType = 'LSD'; dist = lsdDistance; }
        else if (dow === rel(2) && effSessions > 0) { wType = 'Intensity'; dist = intensityA_km; }
        else if (dow === rel(2) && effSessions === 0) { wType = 'Easy'; dist = getEasyDist(0.4, 3); }
        else if (dow === rel(4)) { wType = 'Easy'; dist = getEasyDist(0.3, 3); }
        else if (dow === rel(6)) { wType = 'Easy'; dist = getEasyDist(0.3, 3); }
      } else if (profile.intensity === 'moderate') {
        // 1-quality: LSD(+0), Easy(+2), IntensityA(+3), Easy(+4), Easy(+6)           [5 days]
        // 2-quality: LSD(+0), Easy(+2), IntensityA(+3), Easy(+4), IntensityB(+5), Easy(+6) [6 days]
        //   IntensityB at rel(5) — never rel(6) — ensures 2 easy days before next LSD
        //   Pfitzinger principle: long run legs must be fresh (≥2 days from last hard session)
        if (dow === rel(0)) { wType = 'LSD'; dist = lsdDistance; }
        else if (dow === rel(3) && effSessions > 0) { wType = 'Intensity';  dist = intensityA_km; }
        else if (dow === rel(5) && effSessions > 1) { wType = 'Intensity2'; dist = intensityB_km; }
        else if (dow === rel(2)) { wType = 'Easy'; dist = getEasyDist(0.40, effSessions > 1 ? 3 : 3); }
        else if (dow === rel(4)) { wType = 'Easy'; dist = getEasyDist(0.35, effSessions > 1 ? 3 : 3); }
        else if (dow === rel(6)) { wType = 'Easy'; dist = getEasyDist(0.25, 3); }
      } else {
        // Heavy: 6 days: LSD(+0), Easy(+2), IntensityA(+3), Recovery(+4), IntensityB(+5), Easy(+6)
        const recDist = Math.max(minRecoveryKm, Math.min(8, remainingDist * 0.18));
        const easyDist = Math.max(0, remainingDist - recDist);
        if (dow === rel(0)) { wType = 'LSD'; dist = lsdDistance; }
        else if (dow === rel(2)) { wType = 'Easy'; dist = Math.max(minEasyFloor, easyDist * 0.45); }
        else if (dow === rel(3) && effSessions > 0) { wType = 'Intensity'; dist = intensityA_km; }
        else if (dow === rel(4)) { wType = 'Recovery'; dist = recDist; }
        else if (dow === rel(5) && effSessions > 1) { wType = 'Intensity2'; dist = intensityB_km; }
        else if (dow === rel(5) && effSessions <= 1) { wType = 'Easy'; dist = Math.max(minEasyFloor, easyDist * 0.3); }
        else if (dow === rel(6)) { wType = 'Easy'; dist = Math.max(minEasyFloor, easyDist * 0.55); }
        else if (dow === rel(3) && effSessions === 0) { wType = 'Easy'; dist = Math.max(minEasyFloor, easyDist * 0.3); }
      }

      const easyCap = profile.raceType === 'full' ? 16 : 14;
      if (wType === 'Easy') dist = Math.min(dist, easyCap);
      if (wType === 'Recovery') dist = Math.max(minRecoveryKm, dist);
      dist = Math.max(0, Math.round(dist * 10) / 10);

      // --- Phase-aware intensity type pairing (A/B must differ) ---
      // Each phase has curated [Session A options, Session B options] pools
      // A = primary (longer), B = secondary (shorter, different system)
      let poolA: string[];
      let poolB: string[];
      if (isTaperWeek || dTR < taperZoneDTR) {
        // 减量期质量课仅保留 MP 专项（比赛配速），禁 Z4 以上刺激
        poolA = ['MP'];
        poolB = ['MP'];
      } else if (phase === '基础/建构期') {
        poolA = ['Fartlek', 'TempoIntervals', 'Cruise'];
        poolB = ['Fartlek', 'TempoIntervals'];
      } else {
        // 强度/专项期: different systems pairing
        poolA = ['Tempo', 'Cruise', 'MP', 'Progression'];
        poolB = ['Interval', 'Fartlek', 'TempoIntervals'];
      }

      let finalType = wType;
      // 减量区后段（赛前 ≤14 天）：MP 专项课缩至 60%，保刺激清疲劳
      if (finalType !== 'Race' && dTR >= 8 && dTR <= 14 && wType !== 'LSD') {
        dist = Math.round(dist * 0.6 * 10) / 10;
      }
      // 减量区长跑按距赛天数精确映射（覆盖周级预估，免疫周边界错位）：
      //   Full: dTR 15-21→22 · 8-14→14 · ≤7 shakeout化(≤8km Easy)
      //   Half: dTR 10-16→16 · ≤9→10
      if (!isRaceDay && finalType === 'LSD' && isTaperWeek) {
        if (profile.raceType === 'full') {
          dist = dTR >= 15 ? 22 : dTR >= 8 ? 14 : Math.min(dist, 8);
        } else {
          dist = dTR >= 10 ? 16 : Math.min(dist, 10);
        }
      }
      // 赛周（最后 6 天）：残余 LSD 降级为轻松跑并封顶 8km（shakeout 化）
      if (!isRaceDay && dTR <= 6 && finalType === 'LSD') {
        finalType = 'Easy';
        dist = Math.min(dist, 8);
      }
      const typeA = poolA[(w * 3 + 1) % poolA.length];
      const typeB = poolB[(w * 5 + 2) % poolB.length];
      // Guarantee A ≠ B
      const safeBType = typeB === typeA ? poolB[(poolB.indexOf(typeB) + 1) % poolB.length] : typeB;

      if (wType === 'Intensity') finalType = typeA;
      if (wType === 'Intensity2') finalType = safeBType;

      let details: WorkoutDetails | undefined = undefined;
      let targetPace = undefined;
      let targetHR = undefined;
      let desc = '';

      if (isRaceDay) {
        finalType = 'Race';
        const raceGoalSec = timeToSeconds(profile.goalTime);
        const raceDistKm  = profile.raceType === 'half' ? 21.1 : 42.2;
        const racePaceSec = raceGoalSec > 0 ? raceGoalSec / raceDistKm : 0;
        const racePaceStr = racePaceSec > 0 ? formatPace(racePaceSec) : paces.z3;
        desc = raceGoalSec > 0
          ? `比赛日：目标配速 ${racePaceStr}/km — 祝你好运！`
          : '比赛日：祝你好运！';
        targetPace = racePaceStr;
        targetHR = `Zone 3 (${hrZones.z3})`;
        details = {
          warmup: { name: '赛前热身', durationMins: 10, hrZone: `Zone 1 (${hrZones.z1})`, description: '关节活动与动态拉伸，几组短距离加速跑唤醒神经。' },
          main: [{ name: '正式比赛', distanceKm: raceDistKm, pace: racePaceStr, hrZone: `Zone 3 (${hrZones.z3})` }],
          cooldown: { name: '赛后恢复', durationMins: 15, description: '持续慢走15分钟，避免立刻坐下。充分补充水分与电解质，轻柔拉伸。' }
        };
      } else if (finalType === 'LSD') {
        const isMixedLSD = phase === '强度/专项期';
        targetPace = paces.z2;
        targetHR = `Zone 2 (${hrZones.z2})`;
        desc = `LSD 长跑 - Zone 2 (${hrZones.z2})`;
        // C7：MP 长距离递进——专项期隔周，MP 块占比随周期 15%→35%（Pfitzinger 专项性）
        const mpRatio = Math.min(0.35, 0.15 + 0.20 * progress);
        const altWeek = w % 2 === 1;
        if (isMixedLSD && dist > 18 && altWeek) {
          const mpKm = Math.max(3, Math.round(dist * mpRatio));
          details = {
            warmup: getWarmup(),
            main: [
              { name: '有氧耐力积累', distanceKm: Math.max(1, dist - mpKm), pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})`, description: '保持 Zone 2 有氧耐力心率' },
              { name: 'M配速专项块', distanceKm: mpKm, pace: paces.z3, hrZone: `Zone 3 (${hrZones.z3})`, description: '疲劳状态下按马拉松配速推进——比赛后半程的专项演练' }
            ],
            cooldown: getCooldown()
          };
        } else {
          details = {
            warmup: getWarmup(),
            main: [{ name: '纯有氧长距离', distanceKm: Math.max(1, dist), pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})`, description: '全程保持均匀的 Zone 2 低强度有氧状态，提升脂肪代谢。' }],
            cooldown: getCooldown()
          };
        }
      } else if (finalType === 'Recovery') {
        targetPace = paces.z1;
        targetHR = `Zone 1 (${hrZones.z1})`;
        dist = Math.min(dist, 6);
        desc = `恢复跑 - Zone 1 (${hrZones.z1})`;
        details = {
          warmup: getWarmup(),
          main: [{ name: '极慢恢复跑', distanceKm: Math.max(1, dist), pace: paces.z1, hrZone: `Zone 1 (${hrZones.z1})`, description: '全程极慢，心率严格控制在 Zone 1，主动排酸，促进肌肉修复。' }],
          cooldown: getCooldown()
        };
      } else if (finalType === 'MP') {
        // Use actual goal pace when available; fall back to Zone 3
        // (For VDOT < 48, MP ≈ Zone 2–3 border, not solidly Zone 3)
        const goalTimeSec = timeToSeconds(profile.goalTime);
        const raceDist = profile.raceType === 'full' ? 42.195 : 21.1;
        const goalPaceSec = goalTimeSec > 0 ? goalTimeSec / raceDist : 0;
        const mpPaceStr  = goalPaceSec > 0 ? formatPace(goalPaceSec) : paces.z3;
        const mpHRLabel  = goalPaceSec > 0 ? `目标配速参考` : `Zone 3 (${hrZones.z3})`;
        targetPace = mpPaceStr;
        targetHR   = mpHRLabel;
        desc = goalPaceSec > 0
          ? `马拉松配速跑 - 目标配速 ${mpPaceStr}/km`
          : `马拉松配速跑 - Zone 3 (${hrZones.z3})`;
        details = {
          warmup: getWarmup(),
          main: [
            { name: '有氧过渡跑', distanceKm: 2.0, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` },
            { name: '马拉松配速连续跑', distanceKm: Math.max(1, dist - 3), pace: mpPaceStr, hrZone: mpHRLabel, description: '核心专项训练，建立马拉松比赛配速的肌肉记忆。以目标完赛配速匀速推进。' },
            { name: '冷身慢跑', distanceKm: 1.0, pace: paces.z1, hrZone: `Zone 1 (${hrZones.z1})` }
          ],
          cooldown: getCooldown()
        };
      } else if (finalType === 'Easy') {
        targetPace = paces.z2;
        targetHR = `Zone 2 (${hrZones.z2})`;
        desc = `轻松跑 - Zone 2 (${hrZones.z2})`;
        details = {
          warmup: getWarmup(),
          main: [{ name: '轻松有氧跑', distanceKm: Math.max(1, dist), pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})`, description: '非恢复日的有氧积累，保持对话配速，心率控制在 Zone 2。' }],
          cooldown: getCooldown()
        };
      } else if (finalType === 'Tempo') {
        targetPace = paces.z4;
        targetHR = `Zone 4 (${hrZones.z4})`;
        desc = `乳酸阈值节奏跑 - Zone 4 (${hrZones.z4})`;
        details = {
          warmup: getWarmup(),
          main: [
            { name: '有氧过渡跑', distanceKm: 2.0, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` },
            { name: '乳酸阈值连续跑', distanceKm: Math.max(1, dist - 3), pace: paces.z4, hrZone: `Zone 4 (${hrZones.z4})`, description: '在 Zone 4 乳酸阈值临界点奔跑，感觉"有点辛苦但能坚持" (Comfortably Hard)。' },
            { name: '冷身慢跑', distanceKm: 1.0, pace: paces.z1, hrZone: `Zone 1 (${hrZones.z1})` }
          ],
          cooldown: getCooldown()
        };
      } else if (finalType === 'TempoIntervals') {
        targetPace = paces.z4;
        targetHR = `Zone 4 (${hrZones.z4})`;
        desc = `节奏间歇跑 - Zone 4 (${hrZones.z4})`;
        const reps = Math.max(1, Math.floor((dist - 3) / 2.4));
        const remainder = Math.max(0, dist - 3 - reps * 2.4);
        const main = [
          { name: '有氧过渡跑', distanceKm: 2.0, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` },
          { name: '节奏跑段落', reps, distanceKm: 2.0, pace: paces.z4, hrZone: `Zone 4 (${hrZones.z4})`, description: '连续 Tempo 的低风险替代，控制在乳酸阈值配速。' },
          { name: '400m 慢跑恢复', reps, distanceKm: 0.4, pace: paces.z1, hrZone: `Zone 1 (${hrZones.z1})` }
        ];
        if (remainder > 0) main.push({ name: '有氧补齐', distanceKm: Math.round(remainder * 10) / 10, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` });
        main.push({ name: '冷身慢跑', distanceKm: 1.0, pace: paces.z1, hrZone: `Zone 1 (${hrZones.z1})` });
        details = { warmup: getWarmup(), main, cooldown: getCooldown() };
      } else if (finalType === 'Interval') {
        targetPace = paces.z5;
        targetHR = `Zone 5 (${hrZones.z5})`;
        desc = `VO2max 间歇跑 - Zone 5 (${hrZones.z5})`;
        const reps = Math.max(2, Math.floor((dist - 3) / 1.2));
        const remainder = Math.max(0, dist - 3 - reps * 1.2);
        const main = [
          { name: '有氧过渡跑', distanceKm: 2.0, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` },
          { name: '800m 间歇跑 (速度耐力)', reps, distanceKm: 0.8, pace: paces.z5, hrZone: `Zone 5 (${hrZones.z5})`, description: '在 Zone 5 高强度刺激最大摄氧量，保持每组配速稳定。' },
          { name: '400m 慢跑恢复', reps, distanceKm: 0.4, pace: paces.z1, hrZone: `Zone 1 (${hrZones.z1})`, description: '极慢跑或走恢复心率。' }
        ];
        if (remainder > 0) main.push({ name: '有氧补齐', distanceKm: Math.round(remainder * 10) / 10, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` });
        main.push({ name: '冷身慢跑', distanceKm: 1.0, pace: paces.z1, hrZone: `Zone 1 (${hrZones.z1})` });
        details = { warmup: getWarmup(), main, cooldown: getCooldown() };
      } else if (finalType === 'Fartlek') {
        targetHR = `Zone 4 / Zone 2`;
        desc = `法特莱克变速跑 - Z4/Z2 交替`;
        const reps = Math.max(2, Math.floor((dist - 3) / 2));
        const remainder = Math.max(0, dist - 3 - reps * 2.0);
        const main = [
          { name: '有氧过渡跑', distanceKm: 2.0, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` },
          { name: '快跑变速 (约1公里)', reps, distanceKm: 1.0, pace: paces.z4, hrZone: `Zone 4 (${hrZones.z4})`, description: '固定节奏快跑刺激无氧系统。' },
          { name: '慢跑恢复 (约1公里)', reps, distanceKm: 1.0, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})`, description: '退回有氧区间恢复。' }
        ];
        if (remainder > 0) main.push({ name: '有氧补齐', distanceKm: Math.round(remainder * 10) / 10, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` });
        main.push({ name: '冷身慢跑', distanceKm: 1.0, pace: paces.z1, hrZone: `Zone 1 (${hrZones.z1})` });
        details = { warmup: getWarmup(), main, cooldown: getCooldown() };
      } else if (finalType === 'Progression') {
        targetPace = paces.z3;
        targetHR = `Zone 3/4`;
        desc = `渐进加速跑 - 最终至 Zone 4`;
        details = {
          warmup: getWarmup(),
          main: [
            { name: '渐进加速跑 - 前段 (有氧耐力)', distanceKm: Math.max(1, Math.floor(dist * 0.5)), pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` },
            { name: '渐进加速跑 - 中段 (有氧功率)', distanceKm: Math.max(1, Math.floor(dist * 0.3)), pace: paces.z3, hrZone: `Zone 3 (${hrZones.z3})` },
            { name: '渐进加速跑 - 后段 (乳酸阈值)', distanceKm: Math.max(1, Math.ceil(dist * 0.2)), pace: paces.z4, hrZone: `Zone 4 (${hrZones.z4})`, description: '不断提速进入 Zone 4，以强力节奏结束主训练。' }
          ],
          cooldown: getCooldown()
        };
      } else if (finalType === 'Cruise') {
        targetPace = paces.z4;
        targetHR = `Zone 4 (${hrZones.z4})`;
        desc = `巡航间歇跑 - Zone 4 (${hrZones.z4})`;
        const reps = Math.max(1, Math.floor((dist - 3) / 3.6));
        const remainder = Math.max(0, dist - 3 - reps * 3.6);
        const main = [
          { name: '有氧过渡跑', distanceKm: 2.0, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` },
          { name: '巡航段 (乳酸阈值)', reps, distanceKm: 3.2, pace: paces.z4, hrZone: `Zone 4 (${hrZones.z4})`, description: '长段落阈值跑，累积无氧耐力。' },
          { name: '极慢走恢复 (约2分钟)', reps, distanceKm: 0.4, pace: paces.z1, hrZone: `Zone 1 (${hrZones.z1})` }
        ];
        if (remainder > 0) main.push({ name: '有氧补齐', distanceKm: Math.round(remainder * 10) / 10, pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})` });
        main.push({ name: '冷身慢跑', distanceKm: 1.0, pace: paces.z1, hrZone: `Zone 1 (${hrZones.z1})` });
        details = { warmup: getWarmup(), main, cooldown: getCooldown() };
      } else {
        finalType = 'Rest';
        desc = '休息或交叉训练';
        details = {
          main: [{ name: '完全休息或交叉训练', description: '可以选择游泳、骑行、瑜伽等无负重运动，促进血液循环与肌肉恢复。听从身体信号。' }]
        };
      }

      let actualDist = 0;
      if (details) {
        for (const seg of details.main) {
          if (seg.distanceKm) actualDist += seg.distanceKm * (seg.reps || 1);
        }
      }
      actualDist = Math.round(actualDist * 10) / 10;

      const workout: DailyWorkout = {
        date: currentDate,
        workoutType: finalType,
        description: desc,
        targetPace,
        targetHR,
        distanceKm: actualDist > 0 ? actualDist : 0,
        details
      };

      if (d === 6 || isRaceDay) {
        const phaseLabel = phase + (isRecovery ? ' (恢复周)' : '');
        workout.weeklySummary = {
          weekNum: w + 1,
          phase: phaseLabel,
          volume: weekVolume,
          tips: phaseTips[phase] ?? '听从身体，适时休息。'
        };
      }

      plan.push(workout);
    }
  }

  return plan;
}
