import { QUALITY_TE_TYPES } from './te-quality';

/**
 * 高温环境配速修正（执行层建议，不改计划存储）。
 * 科学依据：WBGT 类环境修正的简化档位表（经验近似，非精确模型）。
 * Race 暂不提示——比赛策略提示属后续范围，避免给出不当建议。
 */

export interface HeatAdvice {
  tempC: number;
  paceAddSecPerKm: number;
  advice: string;
}

const CAP_SEC = 40;

export function heatAdjustment(
  workoutType: string,
  tempC: number,
  humidityPct?: number,
): HeatAdvice | null {
  if (tempC < 26) return null;
  if (workoutType === 'Rest' || workoutType === 'Race') return null;

  // 基础档位（轻松课）
  let add: number;
  if (tempC <= 28) add = 8;
  else if (tempC <= 30) add = 12;
  else if (tempC <= 32) add = 18;
  else add = 25;

  // 高湿加重（湿球效应）
  if (humidityPct != null && humidityPct >= 75) add += 5;

  // 质量课对高温更敏感
  if (QUALITY_TE_TYPES.has(workoutType)) add = Math.round(add * 1.3);

  add = Math.min(add, CAP_SEC);

  const advice = tempC >= 30
    ? '优先晨跑/室内训练，注意补水'
    : '注意补水与体感，心率偏高属正常';

  return { tempC, paceAddSecPerKm: add, advice };
}