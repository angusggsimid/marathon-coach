import { useMemo } from 'react';
import type { CorosSnapshot } from '../../utils/insights/types';
import { SectionCard } from './SectionCard';
import { useECharts } from './useECharts';
import { AXIS_STYLE, CHART, TOOLTIP_STYLE } from '../../utils/insights/theme';
import { hrvTrendInsight } from '../../utils/insights/insights';
import { formatPace } from '../../utils/insights/format';

export function HrAnalysis({ snapshot }: { snapshot: CorosSnapshot }) {
  const metrics = snapshot.dailyMetrics;
  const insight = useMemo(() => hrvTrendInsight(metrics), [metrics]);

  const hrv = metrics.filter((m) => m.hrvMs !== undefined);
  const rhr = metrics.filter((m) => m.restingHr !== undefined);
  const dates = metrics.map((m) => m.date.slice(5));

  const hrvRef = useECharts({
    tooltip: {
      trigger: 'axis', ...TOOLTIP_STYLE,
      formatter: (p: Array<{ dataIndex: number }>) => {
        const m = metrics[p[0]?.dataIndex ?? -1];
        if (!m || m.hrvMs === undefined) return '';
        return `${m.date}<br/>HRV ${m.hrvMs} ms（${m.hrvStatus ?? '—'}）<br/>基线 ${m.hrvBaseline ?? '—'} ms`;
      },
    },
    grid: { left: 34, right: 12, top: 14, bottom: 22 },
    xAxis: { type: 'category', data: dates, ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: { type: 'value', name: 'ms', nameTextStyle: { color: CHART.labelDim, fontSize: 10 }, ...AXIS_STYLE },
    series: [
      {
        name: 'HRV', type: 'line', symbol: 'circle', symbolSize: 4,
        data: metrics.map((m) => m.hrvMs ?? null),
        lineStyle: { color: CHART.teal, width: 2 }, itemStyle: { color: CHART.teal },
        areaStyle: { color: 'rgba(90,200,250,0.08)' },
      },
      {
        name: '基线', type: 'line', symbol: 'none',
        data: metrics.map((m) => m.hrvBaseline ?? null),
        lineStyle: { color: CHART.labelDim, width: 1, type: 'dashed' }, itemStyle: { color: CHART.labelDim },
      },
    ],
  }, [snapshot]);

  const rhrRef = useECharts({
    tooltip: {
      trigger: 'axis', ...TOOLTIP_STYLE,
      formatter: (p: Array<{ dataIndex: number; value: number }>) => {
        const m = metrics[p[0]?.dataIndex ?? -1];
        return m ? `${m.date}<br/>静息心率 ${p[0]?.value} bpm` : '';
      },
    },
    grid: { left: 34, right: 12, top: 14, bottom: 22 },
    xAxis: { type: 'category', data: dates, ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: { type: 'value', name: 'bpm', nameTextStyle: { color: CHART.labelDim, fontSize: 10 }, scale: true, ...AXIS_STYLE },
    series: [{
      name: '静息心率', type: 'line', symbol: 'circle', symbolSize: 4,
      data: metrics.map((m) => m.restingHr ?? null),
      lineStyle: { color: CHART.red, width: 2 }, itemStyle: { color: CHART.red },
    }],
  }, [snapshot]);

  const latestRhr = rhr[rhr.length - 1]?.restingHr;
  const latestHrv = hrv[hrv.length - 1];

  // 恢复雷达：四维均 0-100，100 = 好。口径全部可解释：
  // 睡眠=COROS 睡眠分数均值；HRV=≥基线天数占比；静息心率=基线之上每 +1bpm 扣 10 分；负荷=非 Excessive 天数占比
  const radar = useMemo(() => {
    const recent = metrics.slice(-7);
    const dims: Array<{ name: string; value: number }> = [];

    const scores = recent.filter((m) => m.sleepScore !== undefined).map((m) => m.sleepScore as number);
    if (scores.length >= 3) dims.push({ name: '睡眠', value: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) });

    const hrvDays = recent.filter((m) => m.hrvMs !== undefined && m.hrvBaseline !== undefined);
    if (hrvDays.length >= 3) {
      const above = hrvDays.filter((m) => (m.hrvMs ?? 0) >= (m.hrvBaseline ?? 0)).length;
      dims.push({ name: 'HRV', value: Math.round((above / hrvDays.length) * 100) });
    }

    const base = metrics.slice(0, -7).filter((m) => m.restingHr !== undefined).map((m) => m.restingHr as number);
    const recentRhr = recent.filter((m) => m.restingHr !== undefined).map((m) => m.restingHr as number);
    if (base.length >= 5 && recentRhr.length >= 3) {
      const b = base.reduce((s, v) => s + v, 0) / base.length;
      const r = recentRhr.reduce((s, v) => s + v, 0) / recentRhr.length;
      dims.push({ name: '静息心率', value: Math.max(0, Math.min(100, Math.round(100 - Math.max(0, r - b) * 10))) });
    }

    const loadDays = recent.filter((m) => m.loadComment !== undefined);
    if (loadDays.length >= 3) {
      const ok = loadDays.filter((m) => m.loadComment !== 'Excessive').length;
      dims.push({ name: '负荷', value: Math.round((ok / loadDays.length) * 100) });
    }
    return dims;
  }, [metrics]);

  const radarRef = useECharts({
    tooltip: { ...TOOLTIP_STYLE },
    radar: {
      indicator: radar.map((d) => ({ name: d.name, max: 100 })),
      radius: '62%',
      axisName: { color: CHART.label, fontSize: 11 },
      splitLine: { lineStyle: { color: CHART.grid } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: CHART.grid } },
    },
    series: [{
      type: 'radar',
      data: [{
        value: radar.map((d) => d.value),
        areaStyle: { color: 'rgba(50,215,75,0.18)' },
        lineStyle: { color: CHART.accent, width: 2 },
        itemStyle: { color: CHART.accent },
      }],
    }],
  }, [radar]);

  return (
    <SectionCard
      title="心率与 HRV"
      sub={snapshot.fitness?.ltPaceSec ? `LT ${formatPace(snapshot.fitness.ltPaceSec)} /km` : undefined}
      insight={insight}
    >
      <div className="flex gap-2 mb-2">
        {latestRhr !== undefined && <Stat label="最新静息心率" value={`${latestRhr} bpm`} color={CHART.red} />}
        {latestHrv?.hrvMs !== undefined && <Stat label="最新 HRV" value={`${latestHrv.hrvMs} ms`} color={CHART.teal} sub={latestHrv.hrvStatus} />}
      </div>
      {hrv.length > 0 ? (
        <>
          <p className="text-[11px] text-[var(--color-label-3)] mb-1">HRV（虚线为个人基线）</p>
          <div ref={hrvRef} className="w-full h-[150px]" />
        </>
      ) : (
        <p className="text-[12px] text-[var(--color-label-3)] py-4 text-center">快照中没有 HRV 数据</p>
      )}
      {rhr.length > 0 && (
        <>
          <p className="text-[11px] text-[var(--color-label-3)] mb-1 mt-3">静息心率</p>
          <div ref={rhrRef} className="w-full h-[130px]" />
        </>
      )}
      {radar.length >= 3 && (
        <>
          <p className="text-[11px] text-[var(--color-label-3)] mb-1 mt-3">近 7 天恢复轮廓（100 = 好）</p>
          <div ref={radarRef} className="w-full h-[190px]" />
        </>
      )}
    </SectionCard>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="flex-1 bg-[var(--color-surface-2)] rounded-xl px-3 py-2">
      <p className="text-[10.5px] text-[var(--color-label-3)]">{label}</p>
      <p className="font-mono text-[17px] font-semibold mt-0.5" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--color-label-3)]">{sub}</p>}
    </div>
  );
}
