import { useMemo, useState } from 'react';
import { addDays, differenceInDays, format, startOfWeek } from 'date-fns';
import type { ActualActivity, CorosSnapshot } from '../../utils/insights/types';
import { SectionCard } from './SectionCard';
import { useECharts } from './useECharts';
import { AXIS_STYLE, CHART, TOOLTIP_STYLE } from '../../utils/insights/theme';
import { dailyCalories } from '../../utils/insights/metrics';

export function ActivityOverview({ id, snapshot }: { id?: string; snapshot: CorosSnapshot }) {
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [pinnedDay, setPinnedDay] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, ActualActivity[]>();
    for (const a of snapshot.activities) {
      map.set(a.date, [...(map.get(a.date) ?? []), a]);
    }
    return map;
  }, [snapshot]);

  const metricByDate = useMemo(() => {
    const map = new Map<string, { steps?: number; stressAvg?: number; restingCalories?: number }>();
    for (const m of snapshot.dailyMetrics) map.set(m.date, { steps: m.steps, stressAvg: m.stressAvg, restingCalories: m.restingCalories });
    return map;
  }, [snapshot]);

  const grid = useMemo(() => {
    const today = new Date();
    const start = startOfWeek(addDays(today, -90), { weekStartsOn: 1 });
    const days = differenceInDays(today, start) + 1;
    const weeks: Array<Array<{ date: string; km: number; count: number }>> = [];
    for (let w = 0; w * 7 < days; w++) {
      const col: Array<{ date: string; km: number; count: number }> = [];
      for (let d = 0; d < 7; d++) {
        const date = format(addDays(start, w * 7 + d), 'yyyy-MM-dd');
        const acts = byDate.get(date) ?? [];
        const km = acts.reduce((s, a) => s + (a.type === 'run' ? a.distanceKm ?? 0 : 0), 0);
        col.push({ date, km, count: acts.length });
      }
      weeks.push(col);
    }
    return weeks;
  }, [byDate]);

  const cal = useMemo(() => dailyCalories(snapshot.activities, snapshot.dailyMetrics), [snapshot]);
  const calRef = useECharts({
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...TOOLTIP_STYLE,
      formatter: (p: Array<{ dataIndex: number }>) => {
        const c = cal[p[0]?.dataIndex ?? -1];
        if (!c) return '';
        return `${c.date}<br/>训练 ${c.training} kcal · 静息 ${c.resting} kcal<br/>合计 ${c.training + c.resting} kcal`;
      },
    },
    legend: { data: ['训练消耗', '静息消耗'], textStyle: { color: CHART.label, fontSize: 11 }, top: 0 },
    grid: { left: 40, right: 12, top: 26, bottom: 22 },
    xAxis: { type: 'category', data: cal.map((c) => c.date.slice(5)), ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: { type: 'value', name: 'kcal', nameTextStyle: { color: CHART.labelDim, fontSize: 10 }, ...AXIS_STYLE },
    series: [
      { name: '训练消耗', type: 'bar', stack: 'cal', barWidth: '60%', data: cal.map((c) => c.training), itemStyle: { color: CHART.accent } },
      { name: '静息消耗', type: 'bar', stack: 'cal', barWidth: '60%', data: cal.map((c) => c.resting), itemStyle: { color: 'rgba(120,120,128,0.5)', borderRadius: [2, 2, 0, 0] } },
    ],
  }, [snapshot]);

  const activeDay = hoverDay ?? pinnedDay;
  const activeActs = activeDay ? byDate.get(activeDay) ?? [] : [];
  const activeMetric = activeDay ? metricByDate.get(activeDay) : undefined;

  return (
    <SectionCard id={id} title="训练日历与能量" sub="近 90 天">
      <div>
        <div className="flex gap-[3px]">
          {grid.map((week, i) => (
            <div key={i} className="flex flex-col gap-[3px] flex-1 min-w-0">
              {week.map((day) => (
                <div
                  key={day.date}
                  onMouseEnter={() => setHoverDay(day.date)}
                  onMouseLeave={() => setHoverDay(null)}
                  onClick={() => setPinnedDay(pinnedDay === day.date ? null : day.date)}
                  className={`aspect-square w-full rounded-[3px] cursor-pointer ${activeDay === day.date ? 'ring-1 ring-white' : ''}`}
                  style={{ background: heatColor(day.km) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--color-label-3)]">
        <span>少</span>
        {[0, 4, 8, 12, 16].map((km) => <span key={km} className="w-[11px] h-[11px] rounded-[3px]" style={{ background: heatColor(km) }} />)}
        <span>多（跑量 km）</span>
      </div>

      {activeDay && (
        <div className="mt-2 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-[12px] text-[var(--color-label-2)]">
          <span className="font-mono text-white mr-2">{activeDay}</span>
          {activeActs.length > 0 ? (
            <>
              <span className="mr-2">{activeActs.filter((a) => a.type === 'run').reduce((s, a) => s + (a.distanceKm ?? 0), 0).toFixed(1)} km 跑步</span>
              <span className="mr-2">· {activeActs.length} 次活动</span>
              <span className="mr-2">· {activeActs.reduce((s, a) => s + (a.calories ?? 0), 0)} kcal</span>
            </>
          ) : (
            <span className="mr-2">无训练</span>
          )}
          {activeMetric?.steps !== undefined && <span className="mr-2">· {activeMetric.steps.toLocaleString()} 步</span>}
          {activeMetric?.stressAvg !== undefined && <span>· 压力 {activeMetric.stressAvg}</span>}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-[var(--color-separator)]">
        <p className="text-[11px] uppercase tracking-wider text-[var(--color-label-3)] font-semibold mb-1">每日能量消耗（训练 + 静息）</p>
        <div ref={calRef} className="w-full h-[150px]" />
      </div>
    </SectionCard>
  );
}

function heatColor(km: number): string {
  if (km <= 0) return 'var(--color-surface-2)';
  if (km < 4) return 'rgba(50,215,75,0.25)';
  if (km < 8) return 'rgba(50,215,75,0.45)';
  if (km < 12) return 'rgba(50,215,75,0.70)';
  return '#32D74B';
}
