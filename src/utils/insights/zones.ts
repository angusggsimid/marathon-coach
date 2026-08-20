// 区间展示层：数值判定单一事实源在 training-engine.paceToZoneSec，
// 本文件只提供展示用的标签/颜色/区间带，禁止另写边界常量。
import { paceToZoneSec } from '../training-engine';

export interface PaceZoneBands {
  /** zone → [fast, slow] 边界（sec/km）；z1 无快边界，z6 无慢边界 */
  bands: Array<{ zone: number; fast: number | null; slow: number | null }>;
  ltPaceSec: number;
}

export function paceToZone(paceSec: number | undefined, ltPaceSec: number): number | null {
  if (paceSec === undefined || !Number.isFinite(paceSec) || ltPaceSec <= 0) return null;
  return paceToZoneSec(paceSec, ltPaceSec);
}

export function paceZoneBands(ltPaceSec: number): PaceZoneBands {
  const t = ltPaceSec;
  return {
    ltPaceSec: t,
    bands: [
      { zone: 1, fast: t + 97, slow: null },
      { zone: 2, fast: t + 52, slow: t + 97 },
      { zone: 3, fast: t + 13, slow: t + 51 },
      { zone: 4, fast: t - 12, slow: t + 12 },
      { zone: 5, fast: t - 30, slow: t - 13 },
      { zone: 6, fast: null, slow: t - 30 },
    ],
  };
}

export const ZONE_LABELS: Record<number, string> = {
  1: 'Z1 恢复',
  2: 'Z2 有氧耐力',
  3: 'Z3 有氧动力',
  4: 'Z4 乳酸阈值',
  5: 'Z5 速度耐力',
  6: 'Z6 冲刺',
};

export const ZONE_COLORS: Record<number, string> = {
  1: 'rgba(120,120,128,0.55)',
  2: '#0A84FF',
  3: '#32D74B',
  4: '#FF9F0A',
  5: '#FF453A',
  6: '#BF5AF2',
};
