import { useMemo } from 'react';
import type { CorosSnapshot } from '../../utils/insights/types';
import { SectionCard } from './SectionCard';
import { useECharts } from './useECharts';
import { AXIS_STYLE, CHART, TOOLTIP_STYLE } from '../../utils/insights/theme';
import { loadInsight } from '../../utils/insights/insights';
import ScienceNote from '../ScienceNote';

export function LoadChart({ id, snapshot }: { id?: string; snapshot: CorosSnapshot }) {
  const insight = useMemo(() => loadInsight(snapshot.dailyMetrics), [snapshot]);

  const load = snapshot.dailyMetrics.filter((m) => m.loadShort !== undefined || m.loadLong !== undefined);
  const dates = load.map((m) => m.date.slice(5));

  // 图 1：短期（疲劳）vs 长期（体能）
  const pmcRef = useECharts({
    tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
    legend: { data: ['短期（疲劳）', '长期（体能）'], textStyle: { color: CHART.label, fontSize: 10 }, top: 0, itemWidth: 14, itemGap: 10 },
    grid: { left: 34, right: 12, top: 26, bottom: 22 },
    xAxis: { type: 'category', data: dates, ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: { type: 'value', ...AXIS_STYLE },
    series: [
      {
        name: '短期（疲劳）', type: 'line', smooth: true, symbol: 'none',
        data: load.map((m) => m.loadShort ?? null),
        lineStyle: { color: CHART.orange, width: 2 }, itemStyle: { color: CHART.orange },
        areaStyle: { color: 'rgba(255,159,10,0.08)' },
      },
      {
        name: '长期（体能）', type: 'line', smooth: true, symbol: 'none',
        data: load.map((m) => m.loadLong ?? null),
        lineStyle: { color: CHART.blue, width: 2 }, itemStyle: { color: CHART.blue },
      },
    ],
  }, [snapshot]);

  // 图 2：状态 Form（体能−疲劳）+ 负荷比（ACWR）
  const formRef = useECharts({
    tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
    legend: { data: ['状态 Form', '负荷比'], textStyle: { color: CHART.label, fontSize: 10 }, top: 0, itemWidth: 14, itemGap: 10 },
    grid: { left: 34, right: 34, top: 26, bottom: 22 },
    xAxis: { type: 'category', data: dates, ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: [
      { type: 'value', scale: true, ...AXIS_STYLE },
      { type: 'value', min: 0, max: 2.5, splitLine: { show: false }, axisLabel: { color: CHART.labelDim, fontSize: 9 }, axisLine: { show: false }, axisTick: { show: false } },
    ],
    series: [
      {
        name: '状态 Form', type: 'line', smooth: true, symbol: 'none',
        data: load.map((m) => (m.loadLong !== undefined && m.loadShort !== undefined ? m.loadLong - m.loadShort : null)),
        lineStyle: { color: CHART.accent, width: 2 }, itemStyle: { color: CHART.accent },
        areaStyle: { color: 'rgba(50,215,75,0.06)' },
        markLine: {
          silent: true, symbol: 'none',
          data: [{ yAxis: 0, label: { formatter: '0（平衡线）', color: CHART.labelDim, fontSize: 9, position: 'insideEndTop' }, lineStyle: { color: 'rgba(255,255,255,0.2)', type: 'solid', width: 1 } }],
        },
      },
      {
        name: '负荷比', type: 'line', yAxisIndex: 1, symbol: 'none',
        data: load.map((m) => m.loadRatio ?? null),
        lineStyle: { color: CHART.purple, width: 1.5, type: 'dashed' }, itemStyle: { color: CHART.purple },
        markLine: {
          silent: true, symbol: 'none',
          data: [
            { yAxis: 1.5, label: { formatter: '1.5 风险线', color: CHART.red, fontSize: 9, position: 'insideEndTop' }, lineStyle: { color: 'rgba(255,69,58,0.5)', type: 'dotted', width: 1 } },
            { yAxis: 0.8, label: { formatter: '0.8 下限', color: CHART.labelDim, fontSize: 9, position: 'insideEndBottom' }, lineStyle: { color: 'rgba(255,255,255,0.15)', type: 'dotted', width: 1 } },
          ],
        },
      },
    ],
  }, [snapshot]);

  return (
    <SectionCard id={id} title="训练负荷" sub="COROS 短长期负荷 · PMC 模型" insight={insight}>
      {load.length > 0 ? (
        <>
          <p className="text-[11px] text-[var(--color-label-3)] mb-1">短期（疲劳）与长期（体能）负荷</p>
          <div ref={pmcRef} className="w-full h-[150px]" />
          <p className="text-[11px] text-[var(--color-label-3)] mb-1 mt-3">状态 Form（体能−疲劳，正值=可上强度）与负荷比（0.8-1.3 最佳）</p>
          <div ref={formRef} className="w-full h-[150px]" />
        </>
      ) : (
        <p className="text-[12px] text-[var(--color-label-3)] py-6 text-center">快照中没有负荷数据</p>
      )}
      <ScienceNote id="load" />
    </SectionCard>
  );
}
