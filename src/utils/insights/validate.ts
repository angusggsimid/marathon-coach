import type { ActualActivity, CorosSnapshot, DailyMetric, LapPoint } from './types';

export type ValidationResult =
  | { ok: true; snapshot: CorosSnapshot; dropped: number }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, min: number, max: number): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 && v.length < 500 ? v : undefined;
}

function validDate(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
}

function parseLap(v: unknown, dropped: { n: number }): LapPoint | null {
  if (!isObj(v)) { dropped.n++; return null; }
  const index = num(v.index, 1, 999);
  const distanceM = num(v.distanceM, 0, 5000);
  const timeSec = num(v.timeSec, 0, 7200);
  if (index === undefined || distanceM === undefined || timeSec === undefined) { dropped.n++; return null; }
  return {
    index,
    distanceM,
    timeSec,
    avgPaceSec: num(v.avgPaceSec, 120, 2000),
    adjustedPaceSec: num(v.adjustedPaceSec, 120, 2000),
    avgHr: num(v.avgHr, 30, 250),
    maxHr: num(v.maxHr, 30, 250),
    cadence: num(v.cadence, 40, 300),
    groundTimeMs: num(v.groundTimeMs, 100, 600),
    strideHeightCm: num(v.strideHeightCm, 1, 30),
    strideLengthCm: num(v.strideLengthCm, 20, 250),
    power: num(v.power, 0, 1000),
    elevGainM: num(v.elevGainM, 0, 500),
    descentM: num(v.descentM, 0, 500),
  };
}

function parseActivity(v: unknown, dropped: { n: number }): ActualActivity | null {
  if (!isObj(v) || !validDate(v.date)) { dropped.n++; return null; }
  const type = str(v.type);
  if (!type) { dropped.n++; return null; }
  const laps = Array.isArray(v.laps)
    ? (v.laps.map((l) => parseLap(l, dropped)).filter((l): l is LapPoint => l !== null))
    : undefined;
  return {
    id: str(v.id),
    date: v.date,
    type,
    rawType: str(v.rawType),
    name: str(v.name),
    durationSec: num(v.durationSec, 0, 43200),
    distanceKm: num(v.distanceKm, 0, 250),
    avgPaceSec: num(v.avgPaceSec, 120, 2000),
    avgHr: num(v.avgHr, 30, 250),
    calories: num(v.calories, 0, 6000),
    laps: laps && laps.length > 0 ? laps : undefined,
    trainingLoad: num(v.trainingLoad, 0, 2000),
    aerobicTe: num(v.aerobicTe, 0, 5),
    anaerobicTe: num(v.anaerobicTe, 0, 5),
    trainingFocus: str(v.trainingFocus),
    performance: str(v.performance),
    perceivedEffort: str(v.perceivedEffort),
    movingAvgPaceSec: num(v.movingAvgPaceSec, 120, 2000),
    bestKmPaceSec: num(v.bestKmPaceSec, 120, 2000),
    avgPower: num(v.avgPower, 0, 1000),
    avgStrideLengthM: num(v.avgStrideLengthM, 0.2, 2.5),
    elevGainM: num(v.elevGainM, 0, 5000),
    elevLossM: num(v.elevLossM, 0, 5000),
  };
}

function parseMetric(v: unknown, dropped: { n: number }): DailyMetric | null {
  if (!isObj(v) || !validDate(v.date)) { dropped.n++; return null; }
  return {
    date: v.date,
    loadShort: num(v.loadShort, 0, 1000),
    loadLong: num(v.loadLong, 0, 1000),
    loadRatio: num(v.loadRatio, 0, 10),
    loadComment: str(v.loadComment),
    restingHr: num(v.restingHr, 25, 120),
    sleepScore: num(v.sleepScore, 0, 100),
    sleepMinutes: num(v.sleepMinutes, 0, 1440),
    deepSleepPct: num(v.deepSleepPct, 0, 100),
    hrvMs: num(v.hrvMs, 0, 500),
    hrvStatus: str(v.hrvStatus),
    hrvBaseline: num(v.hrvBaseline, 0, 500),
    stressAvg: num(v.stressAvg, 0, 100),
    steps: num(v.steps, 0, 300000),
    restingCalories: num(v.restingCalories, 0, 6000),
  };
}

/**
 * 严格校验上传的 snapshot JSON。
 * 纪律：未知字段丢弃并计数；数值超范围丢弃；日期非法的整条记录丢弃。
 * 不接受空活动列表——没有数据就不假装能解读。
 */
export function parseSnapshot(input: unknown): ValidationResult {
  if (!isObj(input)) return { ok: false, error: '文件不是有效的 JSON 对象' };
  if (input.version !== 1) return { ok: false, error: `不支持的 snapshot 版本：${String(input.version)}` };
  if (typeof input.source !== 'string') return { ok: false, error: '缺少 source 字段' };
  if (!Array.isArray(input.activities)) return { ok: false, error: '缺少 activities 数组' };

  const dropped = { n: 0 };
  const activities = input.activities
    .map((a) => parseActivity(a, dropped))
    .filter((a): a is ActualActivity => a !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (activities.length === 0) return { ok: false, error: '没有可解读的活动数据' };

  const dailyMetrics = Array.isArray(input.dailyMetrics)
    ? input.dailyMetrics.map((m) => parseMetric(m, dropped)).filter((m): m is DailyMetric => m !== null)
    : [];

  let fitness: CorosSnapshot['fitness'];
  if (isObj(input.fitness)) {
    const f = input.fitness;
    const predictions = isObj(f.predictions)
      ? {
          km5: typeof f.predictions.km5 === 'string' && TIME_RE.test(f.predictions.km5) ? f.predictions.km5 : undefined,
          km10: typeof f.predictions.km10 === 'string' && TIME_RE.test(f.predictions.km10) ? f.predictions.km10 : undefined,
          half: typeof f.predictions.half === 'string' && TIME_RE.test(f.predictions.half) ? f.predictions.half : undefined,
          full: typeof f.predictions.full === 'string' && TIME_RE.test(f.predictions.full) ? f.predictions.full : undefined,
        }
      : undefined;
    fitness = {
      vo2max: num(f.vo2max, 10, 100),
      ltPaceSec: num(f.ltPaceSec, 120, 2000),
      predictions,
    };
  }

  let recovery: CorosSnapshot['recovery'];
  if (isObj(input.recovery)) {
    const pct = num(input.recovery.pct, 0, 100);
    if (pct !== undefined) {
      recovery = {
        pct,
        level: str(input.recovery.level),
        fullRecoveryH: num(input.recovery.fullRecoveryH, 0, 500),
      };
    }
  }

  return {
    ok: true,
    dropped: dropped.n,
    snapshot: {
      version: 1,
      source: input.source,
      builtAt: str(input.builtAt) ?? '',
      device: str(input.device),
      recovery,
      fitness,
      activities,
      dailyMetrics,
    },
  };
}
