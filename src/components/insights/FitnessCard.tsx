import { useMemo } from 'react';
import type { CorosSnapshot } from '../../utils/insights/types';
import { SectionCard } from './SectionCard';
import { useECharts } from './useECharts';
import { AXIS_STYLE, CHART, TOOLTIP_STYLE } from '../../utils/insights/theme';
import { weeklyVolume } from '../../utils/insights/metrics';
import { formatPace } from '../../utils/insights/format';

// VO2max 分档（跑者人群，参考 Daniels 表）
function vo2maxTier(v: number): { label: string; color: string } {
  if (v >= 60) return { label: '精英', color: CHART.purple };
  if (v >= 52) return { label: '优秀', color: CHART.accent };
  if (v >= 44) return { label: '良好', color: CHART.blue };
  if (v >= 36) return { label: '中等', color: CHART.orange };
  return { label: '入门', color: CHART.fill };
}

export function FitnessCard({ snapshot }: { snapshot: CorosSnapshot }) {
  const f = snapshot.fitness;
  const vo2 = f?.vo2max;
  const tier = vo2 !== undefined ? vo2maxTier(vo2) : null;
  const weeks = useMemo(() => weeklyVolume(snapshot.activities).slice(-10), [snapshot]);

  const volRef = useECharts({
    tooltip: {
      trigger: 'axis', ...TOOLTIP_STYLE,
      formatter: (p: Array<{ name: string }>) => {
        const w = weeks.find((x) => x.weekStart.slice(5) === p[0]?.name);
        return w ? `${w.weekStart} 周<br/>跑量 ${w.km.toFixed(1)} km · ${w.runCount} 次` : '';
      },
    },
    grid: { left: 34, right: 12, top: 14, bottom: 22 },
    xAxis: { type: 'category', data: weeks.map((w) => w.weekStart.slice(5)), ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: { type: 'value', name: 'km', nameTextStyle: { color: CHART.labelDim, fontSize: 10 }, ...AXIS_STYLE },
    series: [{
      type: 'bar', barWidth: '55%',
      data: weeks.map((w) => Number(w.km.toFixed(1))),
      itemStyle: { color: CHART.accent, borderRadius: [3, 3, 0, 0] },
    }],
  }, [snapshot]);

  const gaugeRef = useECharts({
    series: [{
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      min: 25,
      max: 75,
      radius: '95%',
      progress: { show: true, width: 12, itemStyle: { color: tier?.color ?? CHART.fill } },
      axisLine: { lineStyle: { width: 12, color: [[1, 'rgba(255,255,255,0.08)']] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      anchor: { show: false },
      title: { show: true, offsetCenter: [0, '38%'], color: CHART.label, fontSize: 12 },
      detail: {
        valueAnimation: true, offsetCenter: [0, '5%'], fontSize: 30, fontWeight: 700,
        color: '#fff', formatter: '{value}',
      },
      data: [{ value: vo2 ?? 0, name: vo2 !== undefined ? `VO₂max · ${tier?.label}` : '无数据' }],
    }],
  }, [vo2]);

  const preds = f?.predictions;
  const predRows = [
    { label: '5K', v: preds?.km5 },
    { label: '10K', v: preds?.km10 },
    { label: '半马', v: preds?.half },
    { label: '全马', v: preds?.full },
  ];

  return (
    <SectionCard title="体能画像" sub={f?.ltPaceSec ? `实测阈值 ${formatPace(f.ltPaceSec)} /km` : undefined}>
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
        <div ref={gaugeRef} className="flex-shrink-0 mx-auto sm:mx-0" style={{ width: 170, height: 130 }} />
        <div className="flex-1 min-w-0 w-full">
          {predRows.some((r) => r.v) ? (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-[var(--color-label-3)] font-semibold">手表比赛预测</p>
              {predRows.map((r) => r.v && (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--color-label-2)]">{r.label}</span>
                  <span className="font-mono text-[14px] font-semibold">{r.v}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--color-label-3)]">快照中没有比赛预测数据</p>
          )}
          <p className="text-[10.5px] text-[var(--color-label-3)] mt-3 leading-relaxed">
            VO₂max 与预测为手表当前值。COROS 未开放历史体能趋势数据，暂无法绘制时间轴。
          </p>
        </div>
      </div>
      {weeks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-separator)]">
          <p className="text-[11px] uppercase tracking-wider text-[var(--color-label-3)] font-semibold mb-1">周跑量（近 10 周）</p>
          <div ref={volRef} className="w-full h-[120px]" />
        </div>
      )}
    </SectionCard>
  );
}
