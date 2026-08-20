import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import type { Vacation } from '../store/useStore';
import { applyRaceOverlays } from '../utils/race-plan-overlay';
import { applyWeeklyAdaptation } from '../utils/weekly-adaptation';
import { applySessionReadiness, sessionReadiness } from '../utils/insights/readiness';
import { cycleCaps } from '../utils/insights/cycle';
import type { DailyWorkout } from '../utils/training-engine';
import { normalizeWorkoutDate } from '../utils/training-engine';
import { format } from 'date-fns';

/** 2.3：客观裁决（store 层按同步时点计算）+ 用户否决，供自适应双源合并 */
export function useAdaptationInputs() {
  const objective = useStore(s => s.corosObjective);
  const override = useStore(s => s.adaptationOverride);
  const profile = useStore(s => s.profile);
  const corosSnapshot = useStore(s => s.corosSnapshot);
  return useMemo(
    () => ({ objective, override, cycle: cycleCaps(corosSnapshot, profile) }),
    [objective, override, corosSnapshot, profile],
  );
}

/**
 * Race taper/recovery + vacation overlays（不含周自适应）。
 * 自适应系数计算与 UI meta 应基于此计划，避免与最终缩放用不同底表。
 *
 * NOTE: Zustand persist serializes Date objects as ISO strings.
 * We normalize them back to local Date instances here.
 */
export function useBasePlan() {
  const { plan, myRaces, profile, vacations } = useStore();
  return useMemo(() => {
    const normalizedPlan = plan.map(w => ({
      ...w,
      date: normalizeWorkoutDate(w.date as Date | string),
    }));
    const withRaces = applyRaceOverlays(normalizedPlan, myRaces, profile.raceType);
    return applyVacationOverlay(withRaces, vacations);
  }, [plan, myRaces, profile.raceType, vacations]);
}

/**
 * Returns the training plan with:
 * 1) race taper/recovery overlays
 * 2) vacation overlays
 * 3) weekly adaptation on next future week distances only
 */
export function useEffectivePlan() {
  const basePlan = useBasePlan();
  const completions = useStore(s => s.completions);
  const profile = useStore(s => s.profile);
  const corosSnapshot = useStore(s => s.corosSnapshot);
  const sessionOverride = useStore(s => s.sessionOverride);
  const { objective, override, cycle } = useAdaptationInputs();
  return useMemo(
    () => {
      const weeklyAdapted = applyWeeklyAdaptation(basePlan, completions, undefined, objective, override, cycle);
      // 任务 3：课级就绪门（恢复不足时降级 3 天内第一个强度课）
      const gate = applySessionReadiness(
        weeklyAdapted,
        profile,
        sessionReadiness(corosSnapshot),
        new Date(),
        sessionOverride,
      );
      return gate.plan;
    },
    [basePlan, completions, profile, corosSnapshot, sessionOverride, objective, override, cycle],
  );
}

/** 任务 3：供 UI 展示课级降级信息（与 useEffectivePlan 同口径） */
export function useSessionGate() {
  const basePlan = useBasePlan();
  const profile = useStore(s => s.profile);
  const corosSnapshot = useStore(s => s.corosSnapshot);
  const sessionOverride = useStore(s => s.sessionOverride);
  return useMemo(() => {
    const readiness = sessionReadiness(corosSnapshot);
    const gate = applySessionReadiness(basePlan, profile, readiness, new Date(), sessionOverride);
    return { readiness, downgraded: gate.downgraded, overridden: readiness.level === 'risk' && !gate.downgraded && sessionOverride !== null };
  }, [basePlan, profile, corosSnapshot, sessionOverride]);
}

// ─── Vacation overlay ─────────────────────────────────────────────────────────
//
// During vacation  → workout becomes Rest (distanceKm = 0)
// Return period    → volume reduced based on vacation length:
//   ≤ 7 days   → no reduction
//   8–14 days  → −15% for 7 days after
//   15–28 days → −25% for 14 days after
//   > 28 days  → −40% for 21 days after

function applyVacationOverlay(plan: DailyWorkout[], vacations: Vacation[]): DailyWorkout[] {
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
