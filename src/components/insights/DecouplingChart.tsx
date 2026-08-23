import { useMemo } from 'react';
import type { CorosSnapshot } from '../../utils/insights/types';
import { SectionCard } from './SectionCard';
import { useECharts } from './useECharts';
import { AXIS_STYLE, CHART, TOOLTIP_STYLE } from '../../utils/insights/theme';
import { decouplingSeries } from '../../utils/insights/metrics';
import { decouplingInsight } from '../../utils/insights/insights';
import ScienceNote from '../ScienceNote';

function driftColor(pct: number): string {
  if (pct < 5) return CHART.accent;
  if (pct < 10) return CHART.orange;
  return CHART.red;
}

export function DecouplingChart({ snapshot }: { snapshot: CorosSnapshot }) {
  const runs = useMemo(() => snapshot.activities.filter((a) => a.type === 'run'), [snapshot]);
  const points = useMemo(() => decouplingSeries(runs), [runs]);
  const insight = useMemo(() => decouplingInsight(points), [points]);

  const ref = useECharts({
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...TOOLTIP_STYLE,
      formatter: (p: Array<{ dataIndex: number }>) => {
        const pt = points[p[0]?.dataIndex ?? -1];
        if (!pt) return '';
        const verdict = pt.driftPct < 5 ? '优秀（<5%）' : pt.driftPct < 10 ? '中等（5-10%）' : '偏高（>10%）';
        return `${pt.date} · ${pt.distanceKm.toFixed(1)} km<br/>心率漂移 ${pt.driftPct.toFixed(1)}% · ${verdict}`;
      },
    },
    grid: { left: 40, right: 14, top: 16, bottom: 24 },
    xAxis: { type: 'category', data: points.map((p) => p.date.slice(5)), ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: {
      type: 'value', name: '漂移 %', nameTextStyle: { color: CHART.labelDim, fontSize: 10 }, scale: true, ...AXIS_STYLE,
    },
    series: [{
      type: 'bar', barWidth: '55%',
      data: points.map((p) => ({
        value: Number(p.driftPct.toFixed(1)),
        itemStyle: { color: driftColor(p.driftPct), borderRadius: [3, 3, 0, 0] },
      })),
      markLine: {
        silent: true, symbol: 'none',
        data: [
          { yAxis: 5, label: { formatter: '5% 优秀线', color: CHART.accent, fontSize: 9, position: 'insideEndTop' }, lineStyle: { color: 'rgba(50,215,75,0.5)', type: 'dashed', width: 1 } },
          { yAxis: 0, label: { show: false }, lineStyle: { color: 'rgba(255,255,255,0.2)', type: 'solid', width: 1 } },
        ],
      },
    }],
  }, [points]);

  return (
    <SectionCard
      title="有氧解耦 · 心率漂移"
      sub="前后半程 速度÷心率 的变化 · 目标 <5%"
      insight={insight}
    >
      {points.length > 0 ? (
        <>
          <div ref={ref} className="w-full h-[170px]" />
          <p className="text-[11px] text-[var(--color-label-3)] mt-1 px-1">
            每次足够长的跑步（≥8 个分圈）独立计算：配速不变而心率上升 = 有氧耐力不足。负值 = 后半程心血管更轻松。
          </p>
        </>
      ) : (
        <p className="text-[12px] text-[var(--color-label-3)] py-6 text-center">没有带分圈数据的跑步，无法计算心率漂移</p>
      )}
      <ScienceNote id="decoupling" />
    </SectionCard>
  );
}
