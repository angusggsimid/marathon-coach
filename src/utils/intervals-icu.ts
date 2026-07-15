/**
 * Intervals.icu API integration
 *
 * Pushes a training plan to the user's Intervals.icu calendar.
 * Intervals.icu then auto-syncs to connected Garmin / COROS / Polar / Wahoo / Suunto.
 *
 * Auth: Basic Auth — username "API_KEY", password = user's API key.
 * Endpoint: POST /api/v1/athlete/{id}/events
 *
 * ─── 幂等安全门槛（2026-07-15）────────────────────────────────────────────
 * 官方文档支持 bulk + external_id + upsert=true，但：
 * 1) upsert 匹配范围声明为「本应用创建的事件」；API Key 路径是否等价于 OAuth
 *    client 的 external_id 命名空间，无法在无真实账号合同测试下证明。
 * 2) 当前 Worker 白名单仅 /events（单条 POST），历史实现也是逐条 POST 新建。
 * 3) 因此 ICU_IDEMPOTENT_SYNC_PROVEN = false：禁止宣称「安全一键重同步」；
 *    再次同步 UI 必须展示人工清理警告；不得后台自动同步。
 * 仍写入稳定 external_id，便于将来在合同测试通过后升级 bulk upsert。
 *
 * CORS note: Intervals.icu does not set Access-Control-Allow-Origin for browser requests.
 * A lightweight Cloudflare Worker proxy is needed (see cloudflare-worker.js in project root).
 * Set VITE_ICU_PROXY in .env to your deployed worker URL, e.g.:
 *   VITE_ICU_PROXY=https://marathon-icu-proxy.yourname.workers.dev
 * If unset, the app tries direct calls (works in Node / Postman, may fail in browser).
 */

import type { DailyWorkout } from './training-engine';
import { normalizeWorkoutDate } from './training-engine';
import { format } from 'date-fns';
import { toDateKey } from './weekly-adaptation';

// Proxy URL injected at build time. Falls back to direct if not set.
// Node 自测无 Vite 时 import.meta.env 可能为 undefined。
function resolveIcuBase(): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const proxy = env?.VITE_ICU_PROXY;
    if (proxy) return proxy;
  } catch {
    /* ignore */
  }
  return 'https://intervals.icu';
}
const ICU_BASE = resolveIcuBase();

/**
 * 是否已通过合同测试证明「重复同步不会创建重复事件」。
 * 未证明前 UI 不得提供无警告的一键重同步，也不得文案宣称幂等安全。
 */
export const ICU_IDEMPOTENT_SYNC_PROVEN = false;

/** 再次同步时的固定人工清理警告（与 UI 共用） */
export const ICU_RESYNC_WARNING =
  '再次同步可能在 Intervals.icu 日历中产生重复训练事件。请先在 Intervals.icu 删除本应用此前创建的计划课次，再继续同步。当前未验证 API Key 路径下的幂等 upsert。';

function basicAuth(apiKey: string): string {
  return 'Basic ' + btoa(`API_KEY:${apiKey}`);
}

export interface ICUSyncProgress {
  current: number;
  total: number;
}

export interface ICUSyncResult {
  /** 成功节数 */
  success: number;
  /** 失败节数 */
  failed: number;
  /** 本次尝试同步的非 Rest 总节数 */
  total: number;
  firstError?: string;
  /** 至少一节成功 */
  anySucceeded: boolean;
  /**
   * 全量成功合同：total>0 且 failed=0 且 success===total。
   * 只有此项为 true 才允许 markExportSuccess / 清除 stale。
   */
  allSucceeded: boolean;
}

/** 全量成功合同（与 ICUSyncResult.allSucceeded 一致，便于 UI/测试单测） */
export function isICUCompleteSuccess(result: {
  success: number;
  failed: number;
  total: number;
}): boolean {
  return (
    result.total > 0 &&
    result.failed === 0 &&
    result.success === result.total
  );
}

/** 稳定 external_id：本地日 + 课型；同课重复同步使用同一 id（是否 upsert 取决于服务端） */
export function buildICUExternalId(w: DailyWorkout): string {
  const dayKey = toDateKey(
    normalizeWorkoutDate(w.date as Date | string),
  );
  const type = String(w.workoutType || 'Run').replace(/[^A-Za-z0-9_-]/g, '');
  return `marathon-${dayKey}-${type || 'Run'}`;
}

export function buildICUEventBody(w: DailyWorkout): Record<string, unknown> {
  const dayKey = format(
    normalizeWorkoutDate(w.date as Date | string),
    'yyyy-MM-dd',
  );
  const body: Record<string, unknown> = {
    start_date_local: `${dayKey}T00:00:00`,
    category: 'WORKOUT',
    type: 'Run',
    name: buildEventName(w),
    description: buildDescription(w),
    external_id: buildICUExternalId(w),
  };
  const mt = estimateMovingTime(w);
  if (mt) body.moving_time = mt;
  return body;
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

/**
 * Push all non-Rest workouts to Intervals.icu calendar.
 * 使用逐条 POST + external_id；不宣称幂等。
 * 可注入 fetch 以便合同/单元测试。
 */
export async function syncPlanToICU(
  plan: DailyWorkout[],
  apiKey: string,
  athleteId: string,
  onProgress?: (p: ICUSyncProgress) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<ICUSyncResult> {
  const workouts = plan.filter(w => w.workoutType !== 'Rest');
  const total = workouts.length;
  const result: ICUSyncResult = {
    success: 0,
    failed: 0,
    total,
    anySucceeded: false,
    allSucceeded: false,
  };

  for (let i = 0; i < workouts.length; i++) {
    const w = workouts[i];
    onProgress?.({ current: i + 1, total });

    const body = buildICUEventBody(w);

    try {
      const res = await fetchImpl(`${ICU_BASE}/api/v1/athlete/${athleteId}/events`, {
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

  result.anySucceeded = result.success > 0;
  result.allSucceeded = isICUCompleteSuccess(result);
  return result;
}
