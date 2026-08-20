// Garmin FIT 适配器：FIT 二进制 → 归一化快照（与 snapshot-builder 同一契约）。
// 执行侧维度全量映射；fitness/dailyMetrics/recovery 在 FIT 中不存在 → 置空（诚实降级）。
import FitParser from 'fit-file-parser';
import type { ActualActivity, CorosSnapshot, LapPoint } from './types';

const parser = new FitParser({
  mode: 'list',
  speedUnit: 'm/s',
  lengthUnit: 'km',
  force: true,
});

function sanitizePace(sec: number | undefined): number | undefined {
  return sec !== undefined && Number.isFinite(sec) && sec >= 120 && sec <= 2000 ? sec : undefined;
}

function paceFromSpeed(ms: number | undefined): number | undefined {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return undefined;
  return sanitizePace(Math.round(1000 / ms));
}

function dayKey(d: unknown): string {
  const date = d instanceof Date ? d : typeof d === 'number' ? new Date(d * 1000) : new Date(String(d));
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mapLap(l: Record<string, unknown>): LapPoint | null {
  const distanceKm = Number(l.total_distance ?? l.distance ?? 0);
  const timeSec = Number(l.total_timer_time ?? l.timer_time ?? 0);
  if (!distanceKm || !timeSec) return null;
  const strideM = Number(l.avg_stride_length ?? 0);
  const vertM = Number(l.avg_vertical_oscillation ?? 0);
  return {
    index: Number(l.lap_index ?? l.message_index ?? 0),
    distanceM: Math.round(distanceKm * 1000),
    timeSec: Math.round(timeSec),
    avgPaceSec: paceFromSpeed(Number(l.avg_speed ?? l.speed ?? 0)),
    avgHr: Number(l.avg_heart_rate ?? l.heart_rate ?? 0) || undefined,
    maxHr: Number(l.max_heart_rate ?? 0) || undefined,
    cadence: Number(l.avg_cadence ?? 0) || undefined,
    groundTimeMs: Number(l.avg_stance_time ?? 0) || undefined,
    strideHeightCm: vertM ? Math.round(vertM * 100 * 10) / 10 : undefined,
    strideLengthCm: strideM ? Math.round(strideM * 100) : undefined,
    power: Number(l.avg_power ?? l.power ?? 0) || undefined,
    elevGainM: Number(l.total_ascent ?? 0) || undefined,
    descentM: Number(l.total_descent ?? 0) || undefined,
  };
}

function mapActivity(s: Record<string, unknown>, laps: LapPoint[]): ActualActivity | null {
  const distanceKm = Number(s.total_distance ?? 0);
  const durationSec = Number(s.total_timer_time ?? s.total_elapsed_time ?? 0);
  if (!distanceKm || !durationSec) return null;
  const sport = String(s.sport ?? '').toLowerCase();
  const type = sport.includes('run') ? 'run' : sport.includes('train') || sport.includes('fitness') ? 'strength' : `sport-${sport || 'x'}`;
  const strideM = Number(s.avg_stride_length ?? 0);
  return {
    id: `${dayKey(s.timestamp ?? s.start_time)}-${Math.round(durationSec)}`,
    date: dayKey(s.timestamp ?? s.start_time),
    type,
    rawType: String(s.sport ?? ''),
    name: String(s.event ?? s.sport ?? ''),
    durationSec: Math.round(durationSec),
    distanceKm,
    avgPaceSec: paceFromSpeed(Number(s.avg_speed ?? s.speed ?? 0)),
    avgHr: Number(s.avg_heart_rate ?? s.heart_rate ?? 0) || undefined,
    calories: Number(s.total_calories ?? 0) || undefined,
    laps: laps.length ? laps : undefined,
    aerobicTe: Number(s.total_training_effect ?? 0) || undefined,
    anaerobicTe: Number(s.total_anaerobic_training_effect ?? 0) || undefined,
    avgPower: Number(s.avg_power ?? 0) || undefined,
    avgStrideLengthM: strideM || undefined,
    elevGainM: Number(s.total_ascent ?? 0) || undefined,
    elevLossM: Number(s.total_descent ?? 0) || undefined,
  };
}

/** 解析多个 FIT 文件 → 归一化快照。失败文件跳过并计数。 */
export async function parseFitFiles(
  files: Array<{ name: string; buffer: ArrayBuffer }>,
): Promise<{ snapshot: CorosSnapshot; failed: number }> {
  const activities: ActualActivity[] = [];
  let failed = 0;

  for (const file of files) {
    try {
      const data = (await parser.parseAsync(file.buffer)) as {
        sessions?: Array<Record<string, unknown>>;
        laps?: Array<Record<string, unknown>>;
      };
      const sessions = data.sessions ?? [];
      if (sessions.length === 0) {
        failed++;
        continue;
      }
      const laps = (data.laps ?? []).map(mapLap).filter((l): l is LapPoint => l !== null);
      const act = mapActivity(sessions[0], laps);
      if (act) activities.push(act);
      else failed++;
    } catch {
      failed++;
    }
  }

  activities.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  return {
    snapshot: {
      version: 1,
      source: 'garmin-fit',
      builtAt: new Date().toISOString(),
      device: 'GARMIN（FIT 导入）',
      recovery: undefined,
      fitness: undefined,
      activities,
      dailyMetrics: [],
    },
    failed,
  };
}
