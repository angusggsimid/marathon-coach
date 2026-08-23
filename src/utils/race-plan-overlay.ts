/**
 * race-plan-overlay.ts
 *
 * Taper + recovery logic based on:
 *   - Mujika & Padilla (2003) "Scientific bases for precompetition tapering"
 *   - Bosquet et al. (2007) meta-analysis (182 studies) — step-down > linear
 *   - Pfitzinger & Douglas "Advanced Marathoning" (3rd ed.)
 *   - Daniels' Running Formula (3rd ed.)
 *   - McMillan Running recovery guidelines
 *
 * Key principles applied:
 *   1. Taper duration and recovery duration both scale with DISTANCE × GOAL
 *   2. Step-down volume profile (large cut week 1, maintain) beats linear ramp
 *   3. Intensity preserved early in taper; only eliminated in final week
 *   4. Minimum recovery floors regardless of goal (full marathon ≥ 10 days)
 *
 * Multi-race design rules:
 *   A. Race day is injected even when the base plan has a Rest day scheduled
 *   B. When taper + recovery windows overlap, take the MIN volume factor
 *      (most conservative), NOT compound-multiply them
 *   C. Type conversion uses the ORIGINAL workout type as basis for every race;
 *      then the most-conservative converted type across all applicable races wins
 *   D. Double-taper guard respects primary race type: 21 days for full, 14 for half
 */

import { format } from 'date-fns';
import type { DailyWorkout } from './training-engine';
import type { MyRace, MyRaceGoal, MyRaceDistance, Vacation } from '../store/useStore';
// NOTE: No longer importing RACES seed data — we use myRace.date/name directly
// so crawler races are supported alongside seed races.

// ─── Taper + recovery tables ──────────────────────────────────────────────────
//
// taperDays: how many days before race to begin reducing volume
// recoveryDays: how many days of modified training after race
// Both values are the result of goal × distance intersection.

const TAPER_DAYS: Record<MyRaceDistance, Record<MyRaceGoal, number>> = {
  //         pb    finish  fun
  full:  { pb: 21, finish: 14, fun: 10 }, // Pfitzinger: 3wk; Hansons: 2wk; fun still needs 10d
  half:  { pb: 14, finish: 10, fun:  7 }, // Daniels: ~2wk for half pb
  '10k': { pb:  7, finish:  5, fun:  3 }, // community: 5–10d; fun 10K = 3d
};

const RECOVERY_DAYS: Record<MyRaceDistance, Record<MyRaceGoal, number>> = {
  //         pb    finish  fun
  // Full marathon: McMillan ~1 day/mile ≈ 26d; practical minimum regardless of goal = 10d
  full:  { pb: 21, finish: 14, fun: 10 },
  // Half marathon
  half:  { pb: 10, finish:  7, fun:  5 },
  // 10K
  '10k': { pb:  5, finish:  4, fun:  3 },
};

// ─── Step-down volume profile ─────────────────────────────────────────────────
//
// Bosquet 2007: optimal taper reduces volume by ~41% overall via a step-down
// (immediate large cut in week 1) rather than linear ramp.
//
// We implement 3 "phases" within the taper window:
//   Phase A (outer third):  volume → 0.75 of normal (−25%)
//   Phase B (middle third): volume → 0.60 of normal (−40%)
//   Phase C (inner third):  volume → 0.45–0.50 of normal (−50–55%)
//
// This is more aggressive early and flattens out — matching step-down evidence.

function taperVolumeFactor(daysToRace: number, taperDays: number, goal: MyRaceGoal): number {
  const phaseSize = taperDays / 3;
  // Phase C: innermost (closest to race)
  if (daysToRace <= phaseSize) {
    // Linear from 0.60 at phase boundary to floor at daysToRace=1
    const t = daysToRace / phaseSize; // 1 = start of phase C, 0 = race eve
    // fun floor capped at 0.60 (= Phase B boundary) to ensure Phase C never
    // increases volume as race day approaches (non-monotonic profile).
    // For fun races a flat 40% cut through the final days is appropriate.
    const floor = goal === 'pb' ? 0.45 : goal === 'finish' ? 0.50 : 0.60;
    return floor + t * (0.60 - floor);
  }
  // Phase B: middle
  if (daysToRace <= phaseSize * 2) {
    return 0.60;
  }
  // Phase A: outermost (first reduction)
  return 0.75;
}

// ─── Hard session conversion by taper phase ──────────────────────────────────
//
// Pfitzinger: maintain intensity early in taper, only eliminate in final week.
// Daniels: keep short fast work (strides/short tempo) through taper.

const HARD_TYPES   = new Set(['Interval', 'Intervals', 'Hills', 'Fartlek', 'TempoIntervals']);
const MEDIUM_TYPES = new Set(['Tempo', 'Cruise', 'Progression']);

function taperWorkoutType(
  originalType: string, // always the BASE plan type, not a previously-modified type
  daysToRace: number,
  taperDays: number,
): string {
  const phaseSize = taperDays / 3;

  // Phase C (final third / race week): no hard or medium sessions
  if (daysToRace <= phaseSize) {
    if (HARD_TYPES.has(originalType) || MEDIUM_TYPES.has(originalType)) {
      return daysToRace <= 3 ? 'Recovery' : 'Easy';
    }
  }

  // Phase B (middle): hard → tempo (preserve intensity, cut volume)
  if (daysToRace <= phaseSize * 2) {
    if (HARD_TYPES.has(originalType)) return 'Tempo';
  }

  // Phase A (outermost): keep original type, just reduce volume
  return originalType;
}

// ─── Workout-type conservatism ranking ───────────────────────────────────────
//
// When multiple races each produce a type-conversion for the same workout day
// (overlapping taper/recovery windows), we pick the MOST CONSERVATIVE type
// (lowest intensity = lowest rank number).

const TYPE_RANK: Record<string, number> = {
  Recovery:       0,
  Easy:           1,
  LSD:            2,
  Cruise:         3,
  MP:             3,
  Tempo:          4,
  Progression:    4,
  TempoIntervals: 5,
  Fartlek:        5,
  Interval:       6,
  Intervals:      6,
  Hills:          6,
};

function moreConservativeType(a: string, b: string): string {
  const rankA = TYPE_RANK[a] ?? 4;
  const rankB = TYPE_RANK[b] ?? 4;
  return rankA <= rankB ? a : b;
}

// ─── Recovery volume profile ──────────────────────────────────────────────────
//
// Graduated recovery: deepest in days 1–3, easing toward normal by end.

function recoveryVolumeFactor(daysAfter: number, totalRecoveryDays: number): number {
  const t = daysAfter / totalRecoveryDays; // ~0 = day after race, 1 = last recovery day
  // cubic ease-in: stays low early, rises late
  return Math.round((0.25 + 0.55 * (t * t)) * 10) / 10;
}

function recoveryWorkoutType(daysAfter: number, totalRecoveryDays: number): string {
  const pct = daysAfter / totalRecoveryDays;
  if (pct < 0.25) return 'Recovery'; // first 25% of recovery: pure recovery runs
  return 'Easy';                      // middle → late: easy (back to regular types next cycle)
}

// ─── Main overlay function ────────────────────────────────────────────────────

/**
 * Applies taper + recovery overlays to a base plan based on myRaces.
 *
 * @param basePlan          Generated DailyWorkout[] from training-engine
 * @param myRaces           User's registered races with distance + goal
 * @param primaryRaceType   Profile raceType ('full' | 'half') — used to set the
 *                          double-taper guard correctly (21d for full, 14d for half)
 *
 * Multi-race correctness guarantees:
 *   - Race day is injected even when base plan has Rest scheduled that day
 *   - Overlapping taper/recovery windows → min volume factor (not compound-multiply)
 *   - Type conversion always references the original base-plan type; most-conservative wins
 *   - Guard window matches actual primary race taper length
 */
export function applyRaceOverlays(
  basePlan: DailyWorkout[],
  myRaces: MyRace[],
  primaryRaceType?: 'full' | 'half',
): DailyWorkout[] {
  if (myRaces.length === 0) return basePlan;

  // Detect base plan's last date (primary race) to avoid double-taper
  // Use format() to get local calendar date, matching how workout dates are compared.
  const planDates = basePlan.map(w => w.date.getTime());
  const primaryRaceDateStr = planDates.length > 0
    ? format(new Date(Math.max(...planDates)), 'yyyy-MM-dd')
    : '';

  // Guard window: matches the primary race's actual taper duration
  // Full = 3 weeks; Half = 2 weeks
  const primaryTaperGuardDays = primaryRaceType === 'half' ? 14 : 21;

  return basePlan.map(workout => {
    const originalType = workout.workoutType;

    // ── Timezone-safe calendar date for this workout ──────────────────────────
    // Training engine sets workout times to local noon to avoid DST issues.
    // parseISO() creates UTC midnight. Use format() to get the LOCAL calendar
    // date string, then compare as YYYY-MM-DD strings to avoid cross-timezone
    // off-by-one where "noon local < UTC midnight" causes daysToRace = 0 on
    // the day BEFORE the race.
    const workoutDateStr = format(workout.date, 'yyyy-MM-dd');

    /** Calendar-day difference: race − workout (positive = race is in the future) */
    function calDiff(raceDateStr: string): number {
      return Math.round(
        (new Date(raceDateStr).getTime() - new Date(workoutDateStr).getTime()) / 86400000
      );
    }

    // ── Pass 1: detect a race-day match (must run even on Rest days) ──────────
    let raceDayResult: DailyWorkout | null = null;

    for (const myRace of myRaces) {
      // Skip TBD or missing dates — can't compute taper without a fixed date
      if (!myRace.date || myRace.dateTBD) continue;

      const daysToRace = calDiff(myRace.date);

      if (daysToRace !== 0) continue;

      // Guard: skip if this race is within the primary plan's taper window
      const daysFromPrimaryRace = Math.abs(calDiff(primaryRaceDateStr));
      if (daysFromPrimaryRace <= primaryTaperGuardDays) continue;

      const distKm =
        myRace.distance === 'full' ? 42.195 :
        myRace.distance === 'half' ? 21.1   : 10;

      raceDayResult = {
        ...workout,
        workoutType: 'Race',
        description: `${myRace.name ?? myRace.raceId} · ${goalLabel(myRace.goal)}`,
        distanceKm:  distKm,
        details:     undefined,
      };
      // If multiple races same day, last one wins (very rare edge case)
    }

    if (raceDayResult) return raceDayResult;

    // ── Rest days: no further modification ────────────────────────────────────
    if (originalType === 'Rest') return workout;

    // ── Pass 2: collect taper + recovery constraints from all races ───────────
    let minVolumeFactor  = 1.0;
    let currentType      = originalType;
    const descParts: string[] = [];

    for (const myRace of myRaces) {
      if (!myRace.date || myRace.dateTBD) continue;

      const daysToRace = calDiff(myRace.date);
      const taperDays  = TAPER_DAYS[myRace.distance][myRace.goal];
      const recDays    = RECOVERY_DAYS[myRace.distance][myRace.goal];
      const raceName   = myRace.name ?? myRace.raceId;

      // Double-taper guard
      const daysFromPrimaryRace = Math.abs(calDiff(primaryRaceDateStr));
      if (daysFromPrimaryRace <= primaryTaperGuardDays) continue;

      // ── Taper period ──────────────────────────────────────────────────────
      if (daysToRace > 0 && daysToRace <= taperDays) {
        const vf        = taperVolumeFactor(daysToRace, taperDays, myRace.goal);
        const converted = taperWorkoutType(originalType, daysToRace, taperDays);
        const reduction = Math.round((1 - vf) * 100);

        minVolumeFactor = Math.min(minVolumeFactor, vf);
        currentType     = moreConservativeType(currentType, converted);
        descParts.push(`减量${reduction}%·${raceName}`);
        continue;
      }

      // ── Recovery period ───────────────────────────────────────────────────
      if (daysToRace < 0 && Math.abs(daysToRace) <= recDays) {
        const daysAfter = Math.abs(daysToRace);
        const vf        = recoveryVolumeFactor(daysAfter, recDays);
        const converted = recoveryWorkoutType(daysAfter, recDays);

        minVolumeFactor = Math.min(minVolumeFactor, vf);
        currentType     = moreConservativeType(currentType, converted);
        descParts.push(`赛后第${daysAfter}天·${raceName}`);
      }
    }

    // No overlay active for this day
    if (descParts.length === 0) return workout;

    return {
      ...workout,
      workoutType: currentType,
      distanceKm:  Math.round((workout.distanceKm ?? 0) * minVolumeFactor * 10) / 10,
      description: `${workout.description}【${descParts.join(' / ')}】`,
    };
  });
}

function goalLabel(goal: MyRaceGoal): string {
  return goal === 'pb' ? '冲 PB' : goal === 'finish' ? '认真完赛' : '体验跑';
}

// ─── Exported reference tables (for UI display) ───────────────────────────────

export const GOAL_DISPLAY: Record<MyRaceGoal, { label: string; color: string; bg: string }> = {
  pb:     { label: '冲 PB',  color: '#FFD60A', bg: 'rgba(255,214,10,0.15)' },
  finish: { label: '认真完赛', color: '#32D74B', bg: 'rgba(50,215,75,0.15)'  },
  fun:    { label: '体验跑',  color: '#0A84FF', bg: 'rgba(10,132,255,0.15)' },
};

export { TAPER_DAYS, RECOVERY_DAYS };

/**
 * 双减量保护窗口内被抑制的次赛事（与 applyRaceOverlays 的 guard 同口径）。
 * 用于 UI 显式告知：这些赛事不会注入 Race 日/减量/恢复，按普通训练日处理。
 */
export interface SuppressedRace {
  raceId: string;
  name?: string;
  date: string;
  daysFromPrimary: number;
}

export function getSuppressedRaces(
  myRaces: MyRace[],
  primaryRaceDateStr: string,
  primaryRaceType?: 'full' | 'half',
): SuppressedRace[] {
  if (!primaryRaceDateStr) return [];
  const guardDays = primaryRaceType === 'half' ? 14 : 21;
  const primaryMs = new Date(primaryRaceDateStr).getTime();
  if (Number.isNaN(primaryMs)) return [];

  const out: SuppressedRace[] = [];
  for (const mr of myRaces) {
    if (!mr.date || mr.dateTBD) continue;
    if (mr.date === primaryRaceDateStr) continue; // 主赛自身
    const ms = new Date(mr.date).getTime();
    if (Number.isNaN(ms)) continue;
    const days = Math.abs(Math.round((ms - primaryMs) / 86400000));
    if (days > 0 && days <= guardDays) {
      out.push({ raceId: mr.raceId, name: mr.name, date: mr.date, daysFromPrimary: days });
    }
  }
  return out.sort((a, b) => a.daysFromPrimary - b.daysFromPrimary);
}


export function applyVacationOverlay(plan: DailyWorkout[], vacations: Vacation[]): DailyWorkout[] {
  if (vacations.length === 0) return plan;

  return plan.map(workout => {
    if (workout.workoutType === 'Race') return workout; // never override race days

    const dateStr = format(workout.date, 'yyyy-MM-dd');

    for (const vac of vacations) {
      // ── During vacation ────────────────────────────────────────────────────
      if (dateStr >= vac.start && dateStr <= vac.end) {
        return {
          ...workout,
          workoutType: 'Rest',
          distanceKm:  0,
          description: `休假${vac.label ? ' · ' + vac.label : ''}`,
          details:     undefined,
        };
      }

      // ── Return-to-training period ──────────────────────────────────────────
      if (workout.workoutType === 'Rest') continue; // rest days need no further mod

      const gapMs    = new Date(vac.end).getTime() - new Date(vac.start).getTime();
      const gapDays  = Math.round(gapMs / 86400000) + 1;
      const afterMs  = new Date(dateStr).getTime() - new Date(vac.end).getTime();
      const daysAfter = Math.round(afterMs / 86400000);

      if (daysAfter <= 0) continue;

      let returnFactor = 1.0;
      let returnWindow = 0;
      if (gapDays <= 7) {
        continue; // ≤1 week: no reduction
      } else if (gapDays <= 14) {
        returnFactor = 0.85; returnWindow = 7;
      } else if (gapDays <= 28) {
        returnFactor = 0.75; returnWindow = 14;
      } else {
        returnFactor = 0.60; returnWindow = 21;
      }

      if (daysAfter <= returnWindow) {
        const reduction = Math.round((1 - returnFactor) * 100);
        return {
          ...workout,
          distanceKm:  Math.round((workout.distanceKm ?? 0) * returnFactor * 10) / 10,
          description: `${workout.description}【复训第${daysAfter}天·减量${reduction}%】`,
        };
      }
    }

    return workout;
  });
}
