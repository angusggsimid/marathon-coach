// 浏览器版快照构建：COROS MCP 原始文本 → CorosSnapshot。
// 与 scripts/build-coros-snapshot.mjs 同一套解析规则（单一口径，两处同步维护）。
import type { ActualActivity, CorosSnapshot, DailyMetric, LapPoint } from './types';

export interface SyncRawData {
  sportRecordsTexts: string[];
  fitnessOverviewText?: string;
  recoveryText?: string;
  devicesText?: string;
  trainingLoadText?: string;
  sleepText?: string;
  sleepHrvText?: string;
  restingHrText?: string;
  stressText?: string;
  dailyHealthText?: string;
  lapsByText?: Record<string, string>;
  detailsByText?: Record<string, string>;
}

function parseDuration(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return undefined;
}

// 配速合理性：2:00-33:20 /km 之外视为脏数据
function sanitizePace(sec: number | undefined): number | undefined {
  return sec !== undefined && Number.isFinite(sec) && sec >= 120 && sec <= 2000 ? sec : undefined;
}

// ─── 活动列表 ─────────────────────────────────────────────────────────────────

function parseActivities(texts: string[]): ActualActivity[] {
  const acts: ActualActivity[] = [];
  for (const text of texts) {
    const blocks = text.split(/\n(?=\d+\.\s)/);
    for (const b of blocks) {
      const m = b.match(/^\d+\.\s(.+?) — (\d{4}-\d{2}-\d{2})/);
      if (!m) continue;
      const pick = (pat: RegExp) => b.match(pat)?.[1]?.trim();
      const sportType = pick(/SportType: (\d+)/);
      const rawType = m[1].trim();
      acts.push({
        id: pick(/LabelId: (\d+)/),
        date: m[2],
        type: rawType.includes('Run') ? 'run' : sportType === '402' ? 'strength' : `sport-${sportType ?? 'x'}`,
        rawType,
        name: pick(/Location: (.+)/),
        durationSec: parseDuration(pick(/Duration: ([\d:]+)/)),
        distanceKm: pick(/Distance: ([\d.]+) km/) ? Number(pick(/Distance: ([\d.]+) km/)) : undefined,
        avgPaceSec: sanitizePace(parseDuration(pick(/Average Pace: ([\d:]+) \/km/))),
        avgHr: pick(/Avg HR: (\d+) bpm/) ? Number(pick(/Avg HR: (\d+) bpm/)) : undefined,
        calories: pick(/Calories: (\d+) kcal/) ? Number(pick(/Calories: (\d+) kcal/)) : undefined,
      });
    }
  }
  return acts.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── 分圈（type=10 的 1km 自动分段组，lapIndex 去重）────────────────────────

function attachLaps(activities: ActualActivity[], lapsByText: Record<string, string>): void {
  const byId = new Map(activities.map((a) => [a.id, a]));
  for (const [id, text] of Object.entries(lapsByText)) {
    const act = byId.get(id);
    if (!act) continue;
    let d: { lapGroups?: Array<{ type?: number; lapDistance?: number; laps?: Array<Record<string, number>> }> };
    try {
      d = JSON.parse(text);
    } catch {
      continue;
    }
    const groups = (d.lapGroups ?? []).filter((g) => g.laps?.length);
    const kmGroup =
      groups.find((g) => g.type === 10) ??
      groups.filter((g) => g.lapDistance === 100000).sort((a, b) => (b.laps?.length ?? 0) - (a.laps?.length ?? 0))[0];
    if (!kmGroup) continue;
    const laps: LapPoint[] = [];
    const seen = new Set<number>();
    for (const l of kmGroup.laps ?? []) {
      if (seen.has(l.lapIndex)) continue;
      seen.add(l.lapIndex);
      laps.push({
        index: l.lapIndex,
        distanceM: Math.round((l.distance ?? 0) / 100),
        timeSec: Math.round(l.time ?? 0),
        avgPaceSec: sanitizePace(Math.round(l.avgPace ?? 0)),
        adjustedPaceSec: sanitizePace(Math.round(l.adjustedPace ?? 0)),
        avgHr: l.avgHr || undefined,
        maxHr: l.maxHr || undefined,
        cadence: l.avgCadence || undefined,
        groundTimeMs: l.groundTime || undefined,
        strideHeightCm: l.strideHeight ? l.strideHeight / 10 : undefined,
        strideLengthCm: l.avgStrideLength || undefined,
        power: l.avgPower || undefined,
        elevGainM: l.elevGain || undefined,
        descentM: l.totalDescent || undefined,
      });
    }
    if (laps.length) act.laps = laps.sort((a, b) => a.index - b.index);
  }
}

// ─── 活动详情 ─────────────────────────────────────────────────────────────────

function attachDetails(activities: ActualActivity[], detailsByText: Record<string, string>): void {
  const byId = new Map(activities.map((a) => [a.id, a]));
  for (const [id, text] of Object.entries(detailsByText)) {
    const a = byId.get(id);
    if (!a) continue;
    const pick = (pat: RegExp) => text.match(pat)?.[1]?.trim();
    const load = pick(/Training Load: (\d+)/);
    if (load) a.trainingLoad = Number(load);
    const aero = pick(/Aerobic TE: ([\d.]+)/);
    if (aero) a.aerobicTe = Number(aero);
    const anaer = pick(/Anaerobic TE: ([\d.]+)/);
    if (anaer) a.anaerobicTe = Number(anaer);
    a.trainingFocus = pick(/Training Focus: (.+)/);
    a.performance = pick(/Performance: (.+)/);
    a.perceivedEffort = pick(/Perceived Effort: (.+)/);
    a.movingAvgPaceSec = sanitizePace(parseDuration(pick(/Moving Average Pace: ([\d:]+) \/km/)));
    a.bestKmPaceSec = sanitizePace(parseDuration(pick(/Best Kilometer: ([\d:]+) \/km/)));
    const power = pick(/Average Power: (\d+) W/);
    if (power && a.type === 'run') a.avgPower = Number(power);
    const stride = pick(/Average Stride Length: ([\d.]+) m/);
    if (stride) a.avgStrideLengthM = Number(stride);
    const elev = text.match(/Elevation Gain \/ Loss: (\d+) m \/ (\d+) m/);
    if (elev) {
      a.elevGainM = Number(elev[1]);
      a.elevLossM = Number(elev[2]);
    }
  }
}

// ─── 体能 / 恢复 / 设备 ───────────────────────────────────────────────────────

function parseFitness(text?: string): CorosSnapshot['fitness'] {
  if (!text) return undefined;
  const num = (pat: RegExp) => { const m = text.match(pat); return m ? Number(m[1]) : undefined; };
  const pace = text.match(/Threshold Pace: (\d+):(\d+)/);
  return {
    vo2max: num(/VO2max: (\d+)/),
    ltPaceSec: pace ? Number(pace[1]) * 60 + Number(pace[2]) : undefined,
    predictions: {
      km5: text.match(/5 km Prediction: ([\d:]+)/)?.[1],
      km10: text.match(/10 km Prediction: ([\d:]+)/)?.[1],
      half: text.match(/Half Marathon Prediction: ([\d:]+)/)?.[1],
      full: text.match(/(?<!Half )Marathon Prediction: ([\d:]+)/)?.[1],
    },
  };
}

function parseRecovery(text?: string): CorosSnapshot['recovery'] {
  if (!text) return undefined;
  const pct = text.match(/Recovery: (\d+)%/)?.[1];
  if (pct === undefined) return undefined;
  return {
    pct: Number(pct),
    level: text.match(/Level: (.+)/)?.[1]?.trim(),
    fullRecoveryH: Number(text.match(/Estimated Full Recovery: (\d+)h/)?.[1] ?? NaN) || undefined,
  };
}

function parseDevice(text?: string): string {
  if (!text) return 'COROS';
  return text.match(/^\d+\.\s(.+)$/m)?.[1]?.trim() ?? 'COROS';
}

// ─── 日指标 ───────────────────────────────────────────────────────────────────

function parseDailyMetrics(raw: SyncRawData): DailyMetric[] {
  const metrics = new Map<string, DailyMetric>();
  const day = (date: string): DailyMetric => {
    if (!metrics.has(date)) metrics.set(date, { date });
    return metrics.get(date)!;
  };

  if (raw.trainingLoadText) {
    for (const b of raw.trainingLoadText.split(/\n(?=\d{4}-\d{2}-\d{2}\n)/)) {
      const date = b.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
      if (!date) continue;
      const d = day(date);
      d.loadShort = Number(b.match(/Short-Term Load: (\d+)/)?.[1] ?? NaN) || undefined;
      d.loadLong = Number(b.match(/Long-Term Load: (\d+)/)?.[1] ?? NaN) || undefined;
      d.loadRatio = Number(b.match(/Load Ratio: ([\d.]+)/)?.[1] ?? NaN) || undefined;
      d.loadComment = b.match(/Comment: (.+)/)?.[1]?.trim();
    }
  }

  if (raw.restingHrText) {
    for (const m of raw.restingHrText.matchAll(/(\d{4}-\d{2}-\d{2}): (\d+) bpm/g)) day(m[1]).restingHr = Number(m[2]);
  }

  if (raw.sleepText) {
    for (const b of raw.sleepText.split(/\n(?=\d{4}-\d{2}-\d{2}\n)/)) {
      const date = b.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
      if (!date) continue;
      const d = day(date);
      d.sleepScore = Number(b.match(/Sleep Score: (\d+)/)?.[1] ?? NaN) || undefined;
      const ms = b.match(/Main Sleep: (\d+)h (\d+)min/);
      if (ms) d.sleepMinutes = Number(ms[1]) * 60 + Number(ms[2]);
      d.deepSleepPct = Number(b.match(/Deep Sleep Ratio: (\d+)%/)?.[1] ?? NaN) || undefined;
    }
  }

  if (raw.sleepHrvText) {
    for (const b of raw.sleepHrvText.split(/\n(?=\d{4}-\d{2}-\d{2}:)/)) {
      const date = b.match(/^(\d{4}-\d{2}-\d{2}):/)?.[1];
      if (!date) continue;
      // 文件含 Assessment 汇总段与 Time Series 明细段；只有汇总段有 HRV Avg，命中才赋值
      const avg = b.match(/HRV Avg: (\d+) ms/);
      if (!avg) continue;
      const d = day(date);
      d.hrvMs = Number(avg[1]);
      d.hrvStatus = b.match(/HRV Avg: \d+ ms — (.+)/)?.[1]?.trim();
      d.hrvBaseline = Number(b.match(/Baseline: (\d+) ms/)?.[1] ?? NaN) || undefined;
    }
  }

  if (raw.stressText) {
    for (const b of raw.stressText.split(/\n(?=\d{4}-\d{2}-\d{2}:)/)) {
      const date = b.match(/^(\d{4}-\d{2}-\d{2}):/)?.[1];
      if (!date) continue;
      const avg = b.match(/Average Stress: (\d+)/);
      if (!avg) continue;
      day(date).stressAvg = Number(avg[1]);
    }
  }

  if (raw.dailyHealthText) {
    for (const b of raw.dailyHealthText.split(/--- (?=\d{8} ---)/)) {
      const date = b.match(/^(\d{4})(\d{2})(\d{2}) ---/)?.slice(1).join('-');
      if (!date) continue;
      const steps = b.match(/Steps: ([\d,]+)/)?.[1];
      if (!steps) continue;
      const d = day(date);
      d.steps = Number(steps.replace(/,/g, ''));
      const cal = b.match(/Calories: (\d+) kcal/)?.[1];
      if (cal) d.restingCalories = Number(cal);
    }
  }

  return [...metrics.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ─── 汇总 ─────────────────────────────────────────────────────────────────────

export function buildSnapshotFromRaw(raw: SyncRawData): CorosSnapshot {
  const activities = parseActivities(raw.sportRecordsTexts);
  if (raw.lapsByText) attachLaps(activities, raw.lapsByText);
  if (raw.detailsByText) attachDetails(activities, raw.detailsByText);
  return {
    version: 1,
    source: 'coros-mcp-live',
    builtAt: new Date().toISOString(),
    device: parseDevice(raw.devicesText),
    recovery: parseRecovery(raw.recoveryText),
    fitness: parseFitness(raw.fitnessOverviewText),
    activities,
    dailyMetrics: parseDailyMetrics(raw),
  };
}
