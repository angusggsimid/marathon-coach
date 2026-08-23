import { useMemo } from 'react';
import type { CorosSnapshot } from '../../utils/insights/types';
import { SectionCard } from './SectionCard';
import { useECharts } from './useECharts';
import { AXIS_STYLE, CHART, TOOLTIP_STYLE } from '../../utils/insights/theme';
import { efficiencyFactorSeries } from '../../utils/insights/metrics';
import { efTrendInsight } from '../../utils/insights/insights';

export function EfficiencySection({ id, snapshot }: { id?: string; snapshot: CorosSnapshot }) {
  const lt = snapshot.fitness?.ltPaceSec;
  const runs = useMemo(() => snapshot.activities.filter((a) => a.type === 'run'), [snapshot]);
  const efSeries = useMemo(() => (lt ? efficiencyFactorSeries(runs, lt) : []), [runs, lt]);
  const insight = useMemo(() => efTrendInsight(efSeries), [efSeries]);

  const efRef = useECharts({
    tooltip: {
      trigger: 'item', ...TOOLTIP_STYLE,
      formatter: (p: { dataIndex: number }) => {
        const pt = efSeries[p.dataIndex ?? -1];
        return pt ? `${pt.date} · ${pt.distanceKm.toFixed(1)} km<br/>EF ${pt.ef.toFixed(3)}（m/min 每 bpm）` : '';
      },
    },
    grid: { left: 44, right: 14, top: 16, bottom: 24 },
    xAxis: { type: 'category', data: efSeries.map((p) => p.date.slice(5)), ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: { type: 'value', scale: true, name: 'EF', nameTextStyle: { color: CHART.labelDim, fontSize: 10 }, ...AXIS_STYLE },
    series: [{
      type: 'line', symbol: 'circle', symbolSize: 6,
      data: efSeries.map((p) => Number(p.ef.toFixed(3))),
      lineStyle: { color: CHART.accent, width: 2 }, itemStyle: { color: CHART.accent },
      areaStyle: { color: 'rgba(50,215,75,0.08)' },
    }],
  }, [efSeries]);

  return (
    <SectionCard
      id={id}
      title="有氧效率 · EF"
      sub="效率因子 = 速度÷心率 · 仅稳定有氧跑"
      insight={insight}
    >
      {efSeries.length > 0 ? (
        <>
          <div ref={efRef} className="w-full h-[170px]" />
          <p className="text-[11px] text-[var(--color-label-3)] mt-1 px-1">
            同样强度下心率越低、EF 越高——EF 持续上升是有氧能力真实进步的最可靠信号（TrainingPeaks 体系）。
          </p>
        </>
      ) : (
        <p className="text-[12px] text-[var(--color-label-3)] py-6 text-center">
          没有足够的稳定有氧跑（≥5km 且配速在 Z2 或更慢）来计算 EF
        </p>
      )}
    </SectionCard>
  );
}
