import { addDays, differenceInDays } from 'date-fns';

export type CalculationMethod = 'coros';

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
  return 40; // fallback
}

// Base peak weekly mileage from VDOT (Jack Daniels + RRCA reference)
export function getBaseCapacityFromVDOT(vdot: number, raceType: 'half' | 'full'): number {
  const fullMap: Record<number, number> = { 30: 40, 40: 55, 50: 75, 60: 100, 70: 130 };
  const halfMap: Record<number, number> = { 30: 30, 40: 45, 50: 60, 60: 85, 70: 110 };
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
export function calculatePaces(profile: UserProfile) {
  let tPaceSec = timeToSeconds(profile.ltPace);
  if (!tPaceSec) {
    const halfSec = timeToSeconds(profile.pbHalf);
    if (halfSec) tPaceSec = (halfSec / 21.1) * 0.93;
    else {
      const tenKSec = timeToSeconds(profile.pb10k);
      if (tenKSec) tPaceSec = (tenKSec / 10) * 1.05;
      else {
        const fiveKSec = timeToSeconds(profile.pb5k);
        if (fiveKSec) tPaceSec = (fiveKSec / 5) * 1.1;
        else tPaceSec = 273; // 4:33 default
      }
    }
  }

  return {
    z1: `> ${formatPace(tPaceSec + 97)}`,
    z2: `${formatPace(tPaceSec + 52)}-${formatPace(tPaceSec + 97)}`,
    z3: `${formatPace(tPaceSec + 22)}-${formatPace(tPaceSec + 51)}`,
    z4: `${formatPace(tPaceSec - 12)}-${formatPace(tPaceSec + 12)}`,  // ±12s — matches COROS EvoLab official spec
    z5: `${formatPace(tPaceSec - 30)}-${formatPace(tPaceSec - 13)}`,
    z6: `< ${formatPace(tPaceSec - 30)}`,
    isCustom: false
  };
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

export function generateTrainingPlan(profile: UserProfile): DailyWorkout[] {
  const plan: DailyWorkout[] = [];
  const today = new Date();
  const raceDate = new Date(profile.raceDate);

  const totalDays = differenceInDays(raceDate, today);
  if (totalDays <= 0) return [];

  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const paces = calculatePaces(profile);
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

  // 1. VDOT — priority: Full > Half > 5K/10K (longer race = more reliable predictor)
  let vdot = calculateVDOTFrom5K10K(profile.pb5k, profile.pb10k);
  if (profile.pbFull) vdot = calculateVDOTFromFull(profile.pbFull);
  else if (profile.pbHalf) vdot = calculateVDOTFromHalf(profile.pbHalf);

  // 2. Base capacity from VDOT
  const baseCapacity = getBaseCapacityFromVDOT(vdot, profile.raceType);

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
  const recoveryDepth = 0.83; // only -17%, prevents huge bounce-back

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

      // Cap weekly increase at 9% over previous non-recovery week
      if (w > 0) {
        const prevNonRecovery = w >= 2 && targetVolumes[w - 1] < targetVolumes[w - 2] * 0.90
          ? targetVolumes[w - 2] : targetVolumes[w - 1];
        targetVolume = Math.min(targetVolume, prevNonRecovery * 1.09);
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

    const ltSec = timeToSeconds(profile.ltPace) || 273;
    const easyPaceSec = ltSec + 80;

    // --- Progressive minimum distances (ramp with progress) ---
    const minEasyKm = Math.max(5, Math.ceil((35 * 60) / easyPaceSec));
    const minIntensityKm = Math.max(6, Math.ceil((45 * 60) / easyPaceSec));

    // LSD floor: starts just above easy run, ramps to full minimum by build phase
    const minLSD_early = minEasyKm + 3;  // ~8-9km in base phase
    const minLSD_peak = profile.raceType === 'full' ? 14 : 10;
    const minLSDKm = Math.round(minLSD_early + (minLSD_peak - minLSD_early) * Math.min(1, progress * 1.5));

    const PEAK_LSD = profile.raceType === 'full'
      ? { light: 30, moderate: 32, heavy: 34 }[profile.intensity]
      : { light: 18, moderate: 20, heavy: 22 }[profile.intensity];

    const startLSD = Math.max(minLSDKm, minLSD_early);
    let lsdDistance = startLSD + (PEAK_LSD - startLSD) * Math.pow(progress, 0.8);
    lsdDistance = Math.min(lsdDistance, PEAK_LSD);

    if (isTaperWeek) {
      const taperIdx = w - preTaperWeeks;
      // Pfitzinger taper long runs:
      //   Full:  22km → 14km → 8km  (3-week taper)
      //   Half:  16km → 10km        (2-week taper — Pfitzinger 12-week half plan)
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

    lsdDistance = Math.round(lsdDistance);

    // During taper/recovery weeks, LSD legitimately takes a larger slice of reduced volume.
    // Using the normal cap would force weekVolume ABOVE target (e.g. 16km LSD / 0.40 = 40km
    // minimum, which exceeds a 36km taper target — defeating the whole taper).
    // Pfitzinger taper design: LSD = 60–70% of a reduced week is normal and expected.
    const lsdCapRatio = (isTaperWeek || isRecovery)
      ? 0.65
      : profile.raceType === 'full' ? (baseWeekVolume <= 60 ? 0.50 : 0.45) : 0.42;
    const minWeekVolumeForLSD = Math.ceil(lsdDistance / Math.max(0.25, lsdCapRatio));
    let weekVolume = Math.max(baseWeekVolume, minWeekVolumeForLSD);

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
    if (remainingDist < requiredRemainingDist && weekVolume < peakMPW) {
      weekVolume += requiredRemainingDist - remainingDist;
      remainingDist = requiredRemainingDist;
    }

    for (let d = 0; d < 7; d++) {
      const dayIndex = w * 7 + d;
      if (dayIndex > totalDays) break;

      const currentDate = addDays(today, dayIndex);
      currentDate.setHours(12, 0, 0, 0);
      const isRaceDay = dayIndex === totalDays;
      const dow = currentDate.getDay(); // 0=Sunday

      // Relative day offsets from lsdDay, with configurable long run day
      const rel = (offset: number) => (lsdDay + offset) % 7;

      let wType = 'Rest';
      let dist = 0;

      // Enforce minimum easy distance
      const getEasyDist = (ratio: number, days: number) => {
        let d = remainingDist * ratio;
        if (d > 0 && d < minEasyFloor) d = Math.max(d, Math.min(remainingDist / days, minEasyFloor));
        return Math.max(minEasyFloor, d);
      };

      if (profile.intensity === 'light') {
        // 4 days: LSD(+0), Intensity(+2), Easy(+4), Easy(+6)
        if (dow === rel(0)) { wType = 'LSD'; dist = lsdDistance; }
        else if (dow === rel(2) && intensitySessions > 0) { wType = 'Intensity'; dist = intensityA_km; }
        else if (dow === rel(2) && intensitySessions === 0) { wType = 'Easy'; dist = getEasyDist(0.4, 3); }
        else if (dow === rel(4)) { wType = 'Easy'; dist = getEasyDist(0.3, 3); }
        else if (dow === rel(6)) { wType = 'Easy'; dist = getEasyDist(0.3, 3); }
      } else if (profile.intensity === 'moderate') {
        // 1-quality: LSD(+0), Easy(+2), IntensityA(+3), Easy(+4), Easy(+6)           [5 days]
        // 2-quality: LSD(+0), Easy(+2), IntensityA(+3), Easy(+4), IntensityB(+5), Easy(+6) [6 days]
        //   IntensityB at rel(5) — never rel(6) — ensures 2 easy days before next LSD
        //   Pfitzinger principle: long run legs must be fresh (≥2 days from last hard session)
        if (dow === rel(0)) { wType = 'LSD'; dist = lsdDistance; }
        else if (dow === rel(3) && intensitySessions > 0) { wType = 'Intensity';  dist = intensityA_km; }
        else if (dow === rel(5) && intensitySessions > 1) { wType = 'Intensity2'; dist = intensityB_km; }
        else if (dow === rel(2)) { wType = 'Easy'; dist = getEasyDist(0.40, intensitySessions > 1 ? 3 : 3); }
        else if (dow === rel(4)) { wType = 'Easy'; dist = getEasyDist(0.35, intensitySessions > 1 ? 3 : 3); }
        else if (dow === rel(6)) { wType = 'Easy'; dist = getEasyDist(0.25, 3); }
      } else {
        // Heavy: 6 days: LSD(+0), Easy(+2), IntensityA(+3), Recovery(+4), IntensityB(+5), Easy(+6)
        const recDist = Math.max(minRecoveryKm, Math.min(8, remainingDist * 0.18));
        const easyDist = Math.max(0, remainingDist - recDist);
        if (dow === rel(0)) { wType = 'LSD'; dist = lsdDistance; }
        else if (dow === rel(2)) { wType = 'Easy'; dist = Math.max(minEasyFloor, easyDist * 0.45); }
        else if (dow === rel(3) && intensitySessions > 0) { wType = 'Intensity'; dist = intensityA_km; }
        else if (dow === rel(4)) { wType = 'Recovery'; dist = recDist; }
        else if (dow === rel(5) && intensitySessions > 1) { wType = 'Intensity2'; dist = intensityB_km; }
        else if (dow === rel(5) && intensitySessions <= 1) { wType = 'Easy'; dist = Math.max(minEasyFloor, easyDist * 0.3); }
        else if (dow === rel(6)) { wType = 'Easy'; dist = Math.max(minEasyFloor, easyDist * 0.55); }
        else if (dow === rel(3) && intensitySessions === 0) { wType = 'Easy'; dist = Math.max(minEasyFloor, easyDist * 0.3); }
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
      if (isTaperWeek) {
        poolA = ['TempoIntervals', 'MP'];
        poolB = ['TempoIntervals'];
      } else if (phase === '基础/建构期') {
        poolA = ['Fartlek', 'TempoIntervals', 'Cruise'];
        poolB = ['Fartlek', 'TempoIntervals'];
      } else {
        // 强度/专项期: different systems pairing
        poolA = ['Tempo', 'Cruise', 'MP', 'Progression'];
        poolB = ['Interval', 'Fartlek', 'TempoIntervals'];
      }

      let finalType = wType;
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
        if (isMixedLSD && dist > 18) {
          details = {
            warmup: getWarmup(),
            main: [
              { name: '有氧耐力积累', distanceKm: Math.max(1, Math.floor(dist * 0.8)), pace: paces.z2, hrZone: `Zone 2 (${hrZones.z2})`, description: '保持 Zone 2 有氧耐力心率' },
              { name: '有氧功率/M配速模拟', distanceKm: Math.max(1, Math.ceil(dist * 0.2)), pace: paces.z3, hrZone: `Zone 3 (${hrZones.z3})`, description: '在疲劳状态下切入 Zone 3 模拟比赛配速' }
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
