/**
 * FIT 范围导出：基于 effectivePlan 过滤今天 / 本周 / 全部。
 * 与 export-fit 编码解耦，便于纯函数测试。
 */
import {
  addDays,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import type { DailyWorkout } from './training-engine';
import { toDateKey } from './weekly-adaptation';
import { downloadAllFIT } from './export-fit';
import type { FitExportRange } from './plan-fingerprint';
import { isExportTestOverrideAllowed } from './export-test-gate';

export type { FitExportRange };

export interface FitRangeOption {
  range: FitExportRange;
  label: string;
  fileCount: number;
  disabled: boolean;
  disabledReason?: string;
}

/** 可导出的跑步课（非 Rest） */
export function isExportableWorkout(w: DailyWorkout): boolean {
  return w.workoutType !== 'Rest';
}

export function filterPlanByFitRange(
  plan: DailyWorkout[],
  range: FitExportRange,
  asOf: Date = new Date(),
): DailyWorkout[] {
  const today = startOfDay(asOf);
  const todayKey = format(today, 'yyyy-MM-dd');
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekStartKey = format(weekStart, 'yyyy-MM-dd');
  const weekEndKey = format(weekEnd, 'yyyy-MM-dd');

  return plan.filter(w => {
    if (!isExportableWorkout(w)) return false;
    const key = toDateKey(w.date as Date | string);
    if (!key) return false;
    if (range === 'all') return true;
    if (range === 'today') return key === todayKey;
    // week
    return key >= weekStartKey && key <= weekEndKey;
  });
}

export function countFitFiles(
  plan: DailyWorkout[],
  range: FitExportRange,
  asOf: Date = new Date(),
): number {
  return filterPlanByFitRange(plan, range, asOf).length;
}

export function buildFitRangeOptions(
  plan: DailyWorkout[],
  asOf: Date = new Date(),
): FitRangeOption[] {
  const todayCount = countFitFiles(plan, 'today', asOf);
  const weekCount = countFitFiles(plan, 'week', asOf);
  const allCount = countFitFiles(plan, 'all', asOf);

  return [
    {
      range: 'today',
      label: '今天',
      fileCount: todayCount,
      disabled: todayCount === 0,
      disabledReason:
        todayCount === 0 ? '今天没有可导出的跑步训练' : undefined,
    },
    {
      range: 'week',
      label: '本周',
      fileCount: weekCount,
      disabled: weekCount === 0,
      disabledReason:
        weekCount === 0 ? '本周没有可导出的跑步训练' : undefined,
    },
    {
      range: 'all',
      label: '全部计划',
      fileCount: allCount,
      disabled: allCount === 0,
      disabledReason: allCount === 0 ? '计划中没有可导出的跑步训练' : undefined,
    },
  ];
}

/** ZIP 文件名：范围 + 日期 */
export function fitZipFileName(
  range: FitExportRange,
  asOf: Date = new Date(),
): string {
  const day = format(startOfDay(asOf), 'yyyy-MM-dd');
  const tag =
    range === 'today' ? 'today' : range === 'week' ? 'week' : 'all';
  return `garmin-workouts-${tag}-${day}.zip`;
}

export type FitDownloadImpl = (plan: DailyWorkout[], zipName: string) => void;

/** 测试/验收注入：覆盖默认 downloadAllFIT；传 null 清除。生产域名下 no-op。 */
let fitDownloadOverride: FitDownloadImpl | null = null;

export function setFitDownloadOverrideForTest(impl: FitDownloadImpl | null): void {
  if (!isExportTestOverrideAllowed()) return;
  fitDownloadOverride = impl;
}

/**
 * 下载指定范围的 FIT ZIP。
 * 调用方应传入 effectivePlan，并在成功后记录 fit 渠道元数据。
 * downloadImpl 可注入以便单元测试异常路径；全局 override 仅门禁放行时生效。
 * 返回 ok 表示「浏览器下载已触发」，非用户已保存。
 */
export function downloadFitByRange(
  plan: DailyWorkout[],
  range: FitExportRange,
  asOf: Date = new Date(),
  downloadImpl?: FitDownloadImpl,
): { ok: boolean; fileCount: number; reason?: string } {
  const gatedOverride = isExportTestOverrideAllowed() ? fitDownloadOverride : null;
  const impl = downloadImpl ?? gatedOverride ?? downloadAllFIT;
  try {
    const filtered = filterPlanByFitRange(plan, range, asOf);
    if (filtered.length === 0) {
      return {
        ok: false,
        fileCount: 0,
        reason:
          range === 'today'
            ? '今天没有可导出的跑步训练'
            : range === 'week'
              ? '本周没有可导出的跑步训练'
              : '没有可导出的跑步训练',
      };
    }
    impl(filtered, fitZipFileName(range, asOf));
    return { ok: true, fileCount: filtered.length };
  } catch {
    return {
      ok: false,
      fileCount: 0,
      reason: '导出失败，请重试',
    };
  }
}

/** 本地周边界（供测试） */
export function localWeekBounds(asOf: Date): { start: string; end: string } {
  const today = startOfDay(asOf);
  return {
    start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    end: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  };
}

export function localTodayKey(asOf: Date): string {
  return format(startOfDay(asOf), 'yyyy-MM-dd');
}

/** 构造跨午夜边界测试用：asOf 当天起 N 天 */
export function dayKeysFrom(asOf: Date, count: number): string[] {
  const start = startOfDay(asOf);
  return Array.from({ length: count }, (_, i) =>
    format(addDays(start, i), 'yyyy-MM-dd'),
  );
}
