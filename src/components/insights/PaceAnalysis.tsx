import { useMemo, useState } from 'react';
import type { CorosSnapshot } from '../../utils/insights/types';
import { SectionCard } from './SectionCard';
import { useECharts } from './useECharts';
import { AXIS_STYLE, CHART, TOOLTIP_STYLE } from '../../utils/insights/theme';
import { sessionSeries, splitHalves } from '../../utils/insights/metrics';
import { paceZoneBands, ZONE_COLORS, ZONE_LABELS } from '../../utils/insights/zones';
import { formatPace } from '../../utils/insights/format';

export function PaceAnalysis({ snapshot }: { snapshot: CorosSnapshot }) {
  const lt = snapshot.fitness?.ltPaceSec;
  const runs = useMemo(() => snapshot.activities.filter((a) => a.type === 'run'), [snapshot]);
  const runsWithLaps = useMemo(
    () => runs.filter((a) => a.laps?.length).sort((a, b) => b.date.localeCompare(a.date)),
    [runs],
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(runsWithLaps[0]?.id);
  const selected = runsWithLaps.find((a) => a.id === selectedId) ?? runsWithLaps[0];
  const split = useMemo(() => (selected ? splitHalves(selected) : null), [selected]);
  const sessions = useMemo(() => (lt ? sessionSeries(runs, lt) : []), [runs, lt]);

  // ── 图 A：课次时间轴（分区距离堆叠柱 + 均速折线）──────────────────────────
  const timelineRef = useECharts({
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...TOOLTIP_STYLE,
      formatter: (params: Array<{ dataIndex: number; seriesName: string; value: number }>) => {
        const s = sessions[params[0]?.dataIndex ?? -1];
        if (!s) return '';
        const zoneLines = [1, 2, 3, 4, 5, 6]
          .filter((z) => s.zoneKm[z])
          .map((z) => `${ZONE_LABELS[z]} ${(s.zoneKm[z] ?? 0).toFixed(1)} km`)
          .join(' · ');
        return `${s.date} ${s.name ?? ''}<br/>距离 ${s.distanceKm.toFixed(1)} km · 均速 ${formatPace(s.avgPaceSec)} /km<br/>${zoneLines}`;
      },
    },
    legend: { show: false },
    grid: { left: 34, right: 42, top: 18, bottom: 24 },
    xAxis: { type: 'category', data: sessions.map((s) => s.date.slice(5)), ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: [
      { type: 'value', name: 'km', nameTextStyle: { color: CHART.labelDim, fontSize: 10 }, ...AXIS_STYLE },
      {
        type: 'value', inverse: true, scale: true, splitLine: { show: false },
        axisLabel: { color: CHART.labelDim, fontSize: 9, formatter: (v: number) => formatPace(v) },
        axisLine: { show: false }, axisTick: { show: false },
      },
    ],
    series: [
      ...[1, 2, 3, 4, 5, 6].map((z) => ({
        name: ZONE_LABELS[z], type: 'bar' as const, stack: 'zone', barWidth: '60%',
        data: sessions.map((s) => Number((s.zoneKm[z] ?? 0).toFixed(2)) || 0),
        itemStyle: { color: ZONE_COLORS[z] },
      })),
      {
        name: '均速', type: 'line' as const, yAxisIndex: 1, symbol: 'circle', symbolSize: 4,
        data: sessions.map((s) => s.avgPaceSec ?? null),
        lineStyle: { color: '#fff', width: 1.5 }, itemStyle: { color: '#fff' },
      },
    ],
  }, [sessions]);

  // ── 图 B：跑姿效率（步频柱 + 步幅线 + 触地时间线，各带科学参考带）─────────
  const formSessions = sessions.filter((s) => s.avgCadence !== undefined);
  const formRef = useECharts({
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...TOOLTIP_STYLE,
      formatter: (params: Array<{ dataIndex: number }>) => {
        const s = formSessions[params[0]?.dataIndex ?? -1];
        if (!s) return '';
        return `${s.date} ${s.name ?? ''}<br/>步频 ${Math.round(s.avgCadence ?? 0)} spm · 步幅 ${(s.avgStrideCm ?? 0).toFixed(0)} cm · 触地 ${Math.round(s.avgGroundTimeMs ?? 0)} ms`;
      },
    },
    legend: { data: ['步频', '步幅', '触地时间'], textStyle: { color: CHART.label, fontSize: 10 }, top: 0, itemWidth: 14, itemGap: 10 },
    grid: { left: 40, right: 34, top: 30, bottom: 24 },
    xAxis: { type: 'category', data: formSessions.map((s) => s.date.slice(5)), ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: [
      { type: 'value', name: 'spm', nameTextStyle: { color: CHART.labelDim, fontSize: 9 }, scale: true, ...AXIS_STYLE },
      {
        type: 'value', scale: true,
        splitLine: { show: false }, axisLabel: { color: CHART.labelDim, fontSize: 9 },
        axisLine: { show: false }, axisTick: { show: false },
      },
      {
        type: 'value', scale: true,
        splitLine: { show: false }, axisLabel: { color: CHART.labelDim, fontSize: 9 },
        axisLine: { show: false }, axisTick: { show: false },
      },
    ],
    series: [
      {
        name: '步频', type: 'bar', barWidth: '45%',
        data: formSessions.map((s) => Math.round(s.avgCadence ?? 0)),
        itemStyle: { color: CHART.teal, borderRadius: [3, 3, 0, 0] },
        markArea: {
          silent: true,
          data: [[
            { yAxis: 170, itemStyle: { color: 'rgba(90,200,250,0.07)' } },
            { yAxis: 185 },
          ]],
        },
      },
      {
        name: '步幅', type: 'line', yAxisIndex: 1, symbol: 'circle', symbolSize: 4,
        data: formSessions.map((s) => Number((s.avgStrideCm ?? 0).toFixed(1))),
        lineStyle: { color: CHART.yellow, width: 2 }, itemStyle: { color: CHART.yellow },
        markArea: {
          silent: true,
          data: [[
            { yAxis: 90, itemStyle: { color: 'rgba(255,214,10,0.06)' } },
            { yAxis: 120 },
          ]],
        },
      },
      {
        name: '触地时间', type: 'line', yAxisIndex: 2, symbol: 'diamond', symbolSize: 4,
        data: formSessions.map((s) => Math.round(s.avgGroundTimeMs ?? 0)),
        lineStyle: { color: CHART.purple, width: 1.5, type: 'dashed' }, itemStyle: { color: CHART.purple },
        markArea: {
          silent: true,
          data: [[
            { yAxis: 200, itemStyle: { color: 'rgba(191,90,242,0.06)' } },
            { yAxis: 260 },
          ]],
        },
      },
    ],
  }, [formSessions]);

  // ── 图 C：单次每公里配速曲线 + 区间带 ─────────────────────────────────────
  const bands = lt ? paceZoneBands(lt).bands : [];
  const lapPaces = selected?.laps?.map((l) => l.avgPaceSec ?? null) ?? [];
  const validPaces = lapPaces.filter((p): p is number => p !== null);
  const yMin = Math.min(...validPaces, lt ?? 400) - 25;
  const yMax = Math.max(...validPaces, lt ?? 400) + 40;

  const paceRef = useECharts({
    tooltip: {
      trigger: 'axis', ...TOOLTIP_STYLE,
      formatter: (p: Array<{ dataIndex: number }>) => {
        const lap = selected?.laps?.[p[0]?.dataIndex ?? -1];
        if (!lap) return '';
        return `第 ${lap.index} km<br/>配速 ${formatPace(lap.avgPaceSec)} /km · 心率 ${lap.avgHr ?? '—'} bpm<br/>步频 ${lap.cadence ?? '—'} spm · 触地 ${lap.groundTimeMs ?? '—'} ms`;
      },
    },
    grid: { left: 42, right: 14, top: 16, bottom: 24 },
    xAxis: { type: 'category', data: selected?.laps?.map((l) => String(l.index)) ?? [], name: 'km', nameTextStyle: { color: CHART.labelDim }, ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: {
      type: 'value', inverse: true, min: yMin, max: yMax,
      axisLabel: { color: CHART.label, fontSize: 10, formatter: (v: number) => formatPace(v) },
      axisLine: { lineStyle: { color: CHART.grid } }, axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART.grid } },
    },
    series: [{
      type: 'line', data: lapPaces, symbol: 'circle', symbolSize: 5,
      lineStyle: { color: '#fff', width: 2 }, itemStyle: { color: '#fff' },
      markLine: lt ? {
        silent: true, symbol: 'none',
        data: [{ yAxis: lt, label: { formatter: `LT ${formatPace(lt)}`, color: CHART.orange, fontSize: 10, position: 'insideEndTop' }, lineStyle: { color: CHART.orange, type: 'dashed', width: 1 } }],
      } : undefined,
      markArea: bands.length ? {
        silent: true,
        data: bands.map((b) => [
          { yAxis: Math.max(b.fast ?? yMin, yMin), itemStyle: { color: hexToRgba(ZONE_COLORS[b.zone], 0.07) } },
          { yAxis: Math.min(b.slow ?? yMax, yMax) },
        ]),
      } : undefined,
    }],
  }, [selected?.id, lt]);

  return (
    <SectionCard title="强度与效率明细" sub={lt ? `区间基于实测阈值 ${formatPace(lt)} /km` : '缺少阈值配速，无法落区'}>
      {sessions.length > 0 && (
        <>
          <p className="text-[11px] text-[var(--color-label-3)] mb-1">课次时间轴：柱 = 各区间距离（堆叠），白线 = 均速</p>
          <div ref={timelineRef} className="w-full h-[190px]" />
        </>
      )}

      {formSessions.length > 0 && (
        <>
          <p className="text-[11px] text-[var(--color-label-3)] mb-1 mt-4">
            跑姿效率（参考带：步频 170-185 spm · 步幅 90-120 cm · 触地 200-260 ms）
          </p>
          <div ref={formRef} className="w-full h-[190px]" />
        </>
      )}

      {selected && lt && (
        <div className="mt-4 pt-3 border-t border-[var(--color-separator)]">
          <div className="flex items-center justify-between mb-2">
            <select
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="bg-[var(--color-surface-2)] text-[12px] text-white rounded-lg px-2.5 py-1.5 border border-[var(--color-separator)] outline-none max-w-[70%]"
            >
              {runsWithLaps.map((a) => (
                <option key={a.id} value={a.id}>{a.date} · {a.name ?? '跑步'} · {a.distanceKm?.toFixed(1)} km</option>
              ))}
            </select>
            {split && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 ${
                split.diffSec > 5 ? 'bg-[var(--color-orange)]/15 text-[var(--color-orange)]' : 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
              }`}>
                {split.diffSec > 5 ? `后半掉速 +${Math.round(split.diffSec)}s/km` : split.diffSec < -3 ? `负分割 ${Math.round(split.diffSec)}s/km` : `前后半均衡 ${split.diffSec >= 0 ? '+' : ''}${Math.round(split.diffSec)}s/km`}
              </span>
            )}
          </div>
          <div ref={paceRef} className="w-full h-[210px]" />
        </div>
      )}
    </SectionCard>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith('rgba')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
