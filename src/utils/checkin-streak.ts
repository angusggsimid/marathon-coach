import { format } from 'date-fns';
import type { CompletionEntry } from './weekly-adaptation';

/**
 * 连续打卡天数。
 * 规则：从 asOf（本地日）往回数连续有打卡的天数；
 * 今天未打卡但从昨天起连续 → 连续段保留（UI 提示"今天还没打卡"）。
 */

export function countStreak(
  completions: Record<string, CompletionEntry>,
  asOf: Date = new Date(),
): number {
  let cursor = new Date(asOf);
  // 今天未打卡 → 从昨天起算连续段
  if (!completions[format(cursor, 'yyyy-MM-dd')]) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (completions[format(cursor, 'yyyy-MM-dd')]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}