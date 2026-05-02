import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import type { Vacation } from '../store/useStore';
import { applyRaceOverlays } from '../utils/race-plan-overlay';
import type { DailyWorkout } from '../utils/training-engine';
import { format } from 'date-fns';

/**
 * Returns the training plan with taper/recovery overlays applied for all myRaces,
 * and vacation blocks applied on top.
 *
 * NOTE: Zustand persist serializes Date objects as ISO strings.
 * We normalize them back to Date instances here so downstream code
 * (race-plan-overlay, CalendarView) can call .getTime(), isSameDay(), etc.
 */
export function useEffectivePlan() {
  const { plan, myRaces, profile, vacations } = useStore();
  return useMemo(() => {
    // Normalize dates in case Zustand rehydrated them as strings
    const normalizedPlan = plan.map(w => ({
      ...w,
      date: w.date instanceof Date ? w.date : new Date(w.date as unknown as string),
    }));
    const withRaces = applyRaceOverlays(normalizedPlan, myRaces, profile.raceType);
    return applyVacationOverlay(withRaces, vacations);
  }, [plan, myRaces, profile.raceType, vacations]);
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
