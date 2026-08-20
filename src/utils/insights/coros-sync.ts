// COROS 同步编排：按 Runbook 顺序拉取全部数据 → 构建快照。
// 详情（getActivityDetail）走增量缓存：已拉过的 LabelId 不重复请求。
import { callCorosTool, type CorosAuth } from '../coros-mcp';
import { buildSnapshotFromRaw, type SyncRawData } from './snapshot-builder';
import type { CorosSnapshot } from './types';

export interface SyncProgress {
  step: string;
  current: number;
  total: number;
}

export interface SyncResult {
  snapshot: CorosSnapshot;
  nextAuth: CorosAuth;
  detailCacheSize: number;
}

const DETAIL_CACHE_KEY = 'marathon-coros-detail-cache';
const DETAIL_CACHE_MAX = 300;

export function loadDetailCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DETAIL_CACHE_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveDetailCache(cache: Record<string, string>): void {
  try {
    const entries = Object.entries(cache);
    const trimmed = entries.length > DETAIL_CACHE_MAX
      ? Object.fromEntries(entries.slice(entries.length - DETAIL_CACHE_MAX))
      : cache;
    localStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(trimmed));
  } catch { /* 缓存写入失败不阻断同步 */ }
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runCorosSync(
  auth: CorosAuth,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  let currentAuth = auth;
  const call = (tool: string, args: Record<string, unknown>) =>
    callCorosTool(currentAuth, tool, args, (next) => { currentAuth = next; });

  const raw: SyncRawData = { sportRecordsTexts: [] };
  const progress = (step: string, current: number, total: number) => onProgress?.({ step, current, total });

  // 1) 活动列表：近 90 天，按 30 天分三批（全量单次会超时）
  for (let i = 0; i < 3; i++) {
    progress(`拉取活动列表（${i + 1}/3）`, i + 1, 3);
    const end = daysAgo(i * 30);
    const start = daysAgo(i * 30 + 29);
    raw.sportRecordsTexts.push(await call('querySportRecords', { startDate: fmtDate(start), endDate: fmtDate(end) }));
    await sleep(100);
  }

  // 2) 单值工具
  progress('拉取体能评估', 1, 6);
  raw.fitnessOverviewText = await call('queryFitnessAssessmentOverview', {});
  progress('拉取恢复状态', 2, 6);
  raw.recoveryText = await call('queryRecoveryStatus', {});
  progress('拉取设备信息', 3, 6);
  raw.devicesText = await call('queryDevices', {});
  progress('拉取训练负荷', 4, 6);
  raw.trainingLoadText = await call('queryTrainingLoadAssessment', { days: 31 });
  progress('拉取压力', 5, 6);
  raw.stressText = await call('queryStressLevel', { days: 31 });
  progress('拉取每日健康数据', 6, 6);
  raw.dailyHealthText = await call('queryDailyHealthData', { days: 31 });
  await sleep(100);

  // 3) 睡眠三件（日期窗口）
  const d30 = fmtDate(daysAgo(30));
  const dToday = fmtDate(new Date());
  progress('拉取睡眠数据', 1, 3);
  raw.sleepText = await call('querySleepData', { startDate: d30, endDate: dToday });
  progress('拉取睡眠 HRV', 2, 3);
  raw.sleepHrvText = await call('querySleepHrv', { startDate: d30, endDate: dToday });
  progress('拉取静息心率', 3, 3);
  raw.restingHrText = await call('queryRestingHeartRate', { days: 30 });
  await sleep(100);

  // 4) 分圈：近 30 天的跑步
  // 注意：不能用 /g 标志——String.match 配 /g 返回完整匹配数组，拿不到捕获组
  const labelRe = /LabelId: (\d+) \| SportType: (\d+)/;
  const recentRunIds: Array<{ labelId: string; sportType: string }> = [];
  // 活动日期是 YYYY-MM-DD（带横线），cutoff 必须同格式才能比较
  const cutoffDate = daysAgo(30);
  const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getDate()).padStart(2, '0')}`;
  for (const text of raw.sportRecordsTexts) {
    for (const block of text.split(/\n(?=\d+\.\s)/)) {
      const date = block.match(/— (\d{4}-\d{2}-\d{2})/)?.[1];
      if (!date || date < cutoff) continue;
      const m = block.match(labelRe);
      const typeLine = block.match(/^\d+\.\s(.+?) —/)?.[1] ?? '';
      if (m && typeLine.includes('Run')) recentRunIds.push({ labelId: m[1], sportType: m[2] });
    }
  }
  raw.lapsByText = {};
  for (let i = 0; i < recentRunIds.length; i++) {
    const { labelId, sportType } = recentRunIds[i];
    progress(`拉取分圈（${i + 1}/${recentRunIds.length}）`, i + 1, recentRunIds.length);
    try {
      raw.lapsByText[labelId] = await call('queryActivityLapData', { labelId, sportType: Number(sportType) });
    } catch { /* 单次失败跳过，不阻断整体 */ }
    await sleep(100);
  }

  // 5) 活动详情：全部活动，增量缓存
  const allIds: Array<{ labelId: string; sportType: string }> = [];
  const seen = new Set<string>();
  for (const text of raw.sportRecordsTexts) {
    for (const block of text.split(/\n(?=\d+\.\s)/)) {
      const m = block.match(labelRe);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        allIds.push({ labelId: m[1], sportType: m[2] });
      }
    }
  }
  const detailCache = loadDetailCache();
  const missing = allIds.filter((x) => !detailCache[x.labelId]);
  for (let i = 0; i < missing.length; i++) {
    const { labelId, sportType } = missing[i];
    progress(`拉取活动详情（${i + 1}/${missing.length}，已缓存 ${allIds.length - missing.length}）`, i + 1, missing.length);
    try {
      detailCache[labelId] = await call('getActivityDetail', { labelId, sportType: Number(sportType) });
    } catch { /* 单次失败跳过 */ }
    await sleep(100);
  }
  saveDetailCache(detailCache);
  raw.detailsByText = Object.fromEntries(allIds.map((x) => [x.labelId, detailCache[x.labelId]]).filter(([, v]) => v));

  // 6) 构建快照
  progress('构建快照', 1, 1);
  const snapshot = buildSnapshotFromRaw(raw);
  return { snapshot, nextAuth: currentAuth, detailCacheSize: Object.keys(detailCache).length };
}
