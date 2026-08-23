// 归一化快照类型定义：snapshot-builder/coros-sync 的输出契约，也是手动导入 .json 的校验目标。

export interface LapPoint {
  index: number;
  distanceM: number;
  timeSec: number;
  avgPaceSec?: number;
  adjustedPaceSec?: number;
  avgHr?: number;
  maxHr?: number;
  cadence?: number;
  groundTimeMs?: number;
  strideHeightCm?: number;
  strideLengthCm?: number;
  power?: number;
  elevGainM?: number;
  descentM?: number;
}

export interface ActualActivity {
  id?: string;
  date: string; // YYYY-MM-DD
  type: 'run' | 'strength' | string;
  rawType?: string;
  name?: string;
  durationSec?: number;
  distanceKm?: number;
  avgPaceSec?: number;
  avgHr?: number;
  calories?: number;
  laps?: LapPoint[];
  // 活动详情（COROS getActivityDetail）
  trainingLoad?: number;
  aerobicTe?: number;
  anaerobicTe?: number;
  trainingFocus?: string;
  performance?: string;
  perceivedEffort?: string;
  movingAvgPaceSec?: number;
  bestKmPaceSec?: number;
  avgPower?: number;
  avgStrideLengthM?: number;
  elevGainM?: number;
  elevLossM?: number;
}

export interface DailyMetric {
  date: string;
  loadShort?: number;
  loadLong?: number;
  loadRatio?: number;
  loadComment?: string;
  restingHr?: number;
  sleepScore?: number;
  sleepMinutes?: number;
  deepSleepPct?: number;
  hrvMs?: number;
  hrvStatus?: string;
  hrvBaseline?: number;
  stressAvg?: number;
  steps?: number;
  restingCalories?: number;
}

export interface RecoveryStatus {
  pct: number;
  level?: string;
  fullRecoveryH?: number;
}

export interface FitnessProfile {
  vo2max?: number;
  ltPaceSec?: number;
  predictions?: {
    km5?: string;
    km10?: string;
    half?: string;
    full?: string;
  };
}

export interface CorosSnapshot {
  version: number;
  source: string;
  builtAt: string;
  device?: string;
  recovery?: RecoveryStatus;
  fitness?: FitnessProfile;
  activities: ActualActivity[];
  dailyMetrics: DailyMetric[];
}
