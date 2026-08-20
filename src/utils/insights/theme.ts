// ECharts 暗色主题常量（对齐 Apple Dark 色板）
export const CHART = {
  label: 'rgba(235,235,245,0.60)',
  labelDim: 'rgba(235,235,245,0.30)',
  grid: 'rgba(255,255,255,0.08)',
  accent: '#32D74B',
  blue: '#0A84FF',
  orange: '#FF9F0A',
  red: '#FF453A',
  purple: '#BF5AF2',
  teal: '#5AC8FA',
  yellow: '#FFD60A',
  fill: 'rgba(120,120,128,0.36)',
};

export const AXIS_STYLE = {
  axisLine: { lineStyle: { color: CHART.grid } },
  axisTick: { show: false },
  axisLabel: { color: CHART.label, fontSize: 10 },
  splitLine: { lineStyle: { color: CHART.grid } },
} as const;

export const TOOLTIP_STYLE = {
  backgroundColor: '#2C2C2E',
  borderColor: 'rgba(255,255,255,0.12)',
  textStyle: { color: '#fff', fontSize: 12 },
} as const;
