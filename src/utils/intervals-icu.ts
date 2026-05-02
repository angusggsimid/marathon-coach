/**
 * Intervals.icu API integration
 *
 * Pushes a training plan to the user's Intervals.icu calendar.
 * Intervals.icu then auto-syncs to connected Garmin / COROS / Polar / Wahoo / Suunto.
 *
 * Auth: Basic Auth — username "API_KEY", password = user's API key.
 * Endpoint: POST /api/v1/athlete/{id}/events
 *
 * CORS note: Intervals.icu does not set Access-Control-Allow-Origin for browser requests.
 * A lightweight Cloudflare Worker proxy is needed (see cloudflare-worker.js in project root).
 * Set VITE_ICU_PROXY in .env to your deployed worker URL, e.g.:
 *   VITE_ICU_PROXY=https://marathon-icu-proxy.yourname.workers.dev
 * If unset, the app tries direct calls (works in Node / Postman, may fail in browser).
 */

import type { DailyWorkout } from './training-engine';
import { format } from 'date-fns';

// Proxy URL injected at build time. Falls back to direct if not set.
const ICU_BASE = (import.meta.env.VITE_ICU_PROXY as string | undefined) || 'https://intervals.icu';

function basicAuth(apiKey: string): string {
  return 'Basic ' + btoa(`API_KEY:${apiKey}`);
}

export interface ICUSyncProgress {
  current: number;
  total: number;
}

export interface ICUSyncResult {
  success: number;
  failed: number;
  firstError?: string;
}

function buildEventName(w: DailyWorkout): string {
  const base = w.description.split(' - ')[0];
  const km = w.distanceKm && w.distanceKm > 0 ? ` ${w.distanceKm}km` : '';
  return `${base}${km}`;
}

function buildDescription(w: DailyWorkout): string {
  const lines: string[] = [];
  if (w.targetPace) lines.push(`配速目标：${w.targetPace}`);
  if (w.targetHR)   lines.push(`心率区间：${w.targetHR}`);
  if (w.details?.warmup) {
    const s = w.details.warmup;
    lines.push(`热身：${s.name}${s.distanceKm ? ' ' + s.distanceKm + 'km' : s.durationMins ? ' ' + s.durationMins + 'min' : ''}`);
  }
  if (w.details?.main?.length) {
    const parts = w.details.main.map(s => {
      const vol = s.distanceKm ? `${s.distanceKm}km` : s.durationMins ? `${s.durationMins}min` : '';
      const reps = s.reps && s.reps > 1 ? ` ×${s.reps}` : '';
      return `${s.name}${vol ? ' ' + vol : ''}${reps}`;
    });
    lines.push(`主训练：${parts.join(' → ')}`);
  }
  if (w.details?.cooldown) {
    const s = w.details.cooldown;
    lines.push(`冷身：${s.name}`);
  }
  return lines.join('\n');
}

/** Estimate moving time in seconds from distance (rough, based on 6 min/km average). */
function estimateMovingTime(w: DailyWorkout): number | undefined {
  if (!w.distanceKm || w.distanceKm <= 0) return undefined;
  return Math.round(w.distanceKm * 360); // 6 min/km = 360 s/km
}

/** Push all non-Rest workouts to Intervals.icu calendar. */
export async function syncPlanToICU(
  plan: DailyWorkout[],
  apiKey: string,
  athleteId: string,
  onProgress?: (p: ICUSyncProgress) => void,
): Promise<ICUSyncResult> {
  const workouts = plan.filter(w => w.workoutType !== 'Rest');
  const result: ICUSyncResult = { success: 0, failed: 0 };

  for (let i = 0; i < workouts.length; i++) {
    const w = workouts[i];
    onProgress?.({ current: i + 1, total: workouts.length });

    const body: Record<string, unknown> = {
      start_date_local: `${format(new Date(w.date), 'yyyy-MM-dd')}T00:00:00`,
      category:         'WORKOUT',
      type:             'Run',
      name:             buildEventName(w),
      description:      buildDescription(w),
    };

    const mt = estimateMovingTime(w);
    if (mt) body.moving_time = mt;

    try {
      const res = await fetch(`${ICU_BASE}/api/v1/athlete/${athleteId}/events`, {
        method:  'POST',
        headers: {
          'Authorization': basicAuth(apiKey),
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        result.success++;
      } else {
        result.failed++;
        if (!result.firstError) {
          const text = await res.text().catch(() => '');
          result.firstError = `HTTP ${res.status}${text ? ': ' + text.slice(0, 80) : ''}`;
        }
      }
    } catch (err) {
      result.failed++;
      if (!result.firstError) result.firstError = String(err);
    }

    // Small delay to avoid rate-limiting (Intervals.icu is generous but let's be polite)
    if (i < workouts.length - 1) await new Promise(r => setTimeout(r, 120));
  }

  return result;
}
