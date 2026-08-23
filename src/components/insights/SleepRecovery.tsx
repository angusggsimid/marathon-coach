import { useMemo } from 'react';
import type { CorosSnapshot } from '../../utils/insights/types';
import { SectionCard } from './SectionCard';
import { useECharts } from './useECharts';
import { AXIS_STYLE, CHART, TOOLTIP_STYLE } from '../../utils/insights/theme';
import { recoveryInsight, sleepDebtInsight } from '../../utils/insights/insights';
import { sleepDebt } from '../../utils/insights/metrics';

function scoreColor(score: number | undefined): string {
  if (score === undefined) return CHART.fill;
  if (score >= 80) return CHART.accent;
  if (score >= 60) return CHART.blue;
  if (score >= 40) return CHART.orange;
  return CHART.red;
}

export function SleepRecovery({ id, snapshot }: { id?: string; snapshot: CorosSnapshot }) {
  const metrics = snapshot.dailyMetrics;
  const insight = useMemo(() => recoveryInsight(metrics), [metrics]);
  const debt = useMemo(() => sleepDebt(metrics), [metrics]);
  const debtTxt = useMemo(() => sleepDebtInsight(debt), [debt]);

  const sleepDays = metrics.filter((m) => m.sleepMinutes !== undefined);
  const dates = metrics.map((m) => m.date.slice(5));

  const sleepRef = useECharts({
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...TOOLTIP_STYLE,
      formatter: (p: Array<{ dataIndex: number }>) => {
        const m = metrics[p[0]?.dataIndex ?? -1];
        if (!m || m.sleepMinutes === undefined) return '';
        const h = Math.floor(m.sleepMinutes / 60);
        const mm = m.sleepMinutes % 60;
        return `${m.date}<br/>睡眠 ${h}h${String(mm).padStart(2, '0')}m · 分数 ${m.sleepScore ?? '—'}<br/>深睡 ${m.deepSleepPct ?? '—'}%`;
      },
    },
    legend: { data: ['深睡比'], textStyle: { color: CHART.label, fontSize: 11 }, top: 0, right: 0 },
    grid: { left: 34, right: 30, top: 24, bottom: 22 },
    xAxis: { type: 'category', data: dates, ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: [
      { type: 'value', name: 'h', nameTextStyle: { color: CHART.labelDim, fontSize: 10 }, ...AXIS_STYLE, axisLabel: { color: CHART.label, fontSize: 10, formatter: (v: number) => (v / 60).toFixed(0) } },
      { type: 'value', min: 0, max: 50, splitLine: { show: false }, axisLabel: { color: CHART.labelDim, fontSize: 9, formatter: '{value}%' }, axisLine: { show: false }, axisTick: { show: false } },
    ],
    series: [
      {
        type: 'bar', barWidth: '60%',
        data: metrics.map((m) => ({
          value: m.sleepMinutes ?? null,
          itemStyle: { color: scoreColor(m.sleepScore), borderRadius: [2, 2, 0, 0] },
        })),
        markLine: {
          silent: true, symbol: 'none',
          data: [{ yAxis: 390, label: { formatter: '6.5h', color: CHART.labelDim, fontSize: 9, position: 'insideEndTop' }, lineStyle: { color: CHART.labelDim, type: 'dashed', width: 1 } }],
        },
      },
      {
        name: '深睡比', type: 'line', yAxisIndex: 1, symbol: 'circle', symbolSize: 3, smooth: true,
        data: metrics.map((m) => m.deepSleepPct ?? null),
        lineStyle: { color: CHART.teal, width: 2.5 }, itemStyle: { color: CHART.teal },
      },
    ],
  }, [snapshot]);

  const stressDays = metrics.filter((m) => m.stressAvg !== undefined);
  const stressRef = useECharts({
    tooltip: {
      trigger: 'axis', ...TOOLTIP_STYLE,
      formatter: (p: Array<{ dataIndex: number; value: number }>) => {
        const m = metrics[p[0]?.dataIndex ?? -1];
        if (!m || m.stressAvg === undefined) return '';
        const level = m.stressAvg < 30 ? '放松' : m.stressAvg < 50 ? '低' : m.stressAvg < 70 ? '中' : '高';
        return `${m.date}<br/>压力 ${m.stressAvg}（${level}）`;
      },
    },
    grid: { left: 34, right: 12, top: 14, bottom: 22 },
    xAxis: { type: 'category', data: dates, ...AXIS_STYLE, splitLine: { show: false } },
    yAxis: { type: 'value', max: 100, nameTextStyle: { color: CHART.labelDim, fontSize: 10 }, ...AXIS_STYLE },
    series: [{
      type: 'line', symbol: 'none', smooth: true,
      data: metrics.map((m) => m.stressAvg ?? null),
      lineStyle: { color: CHART.purple, width: 2 }, itemStyle: { color: CHART.purple },
      areaStyle: { color: 'rgba(191,90,242,0.08)' },
    }],
  }, [snapshot]);

  const rec = snapshot.recovery;

  return (
    <SectionCard id={id} title="睡眠与恢复" sub="近 30 天" insight={insight}>
      {rec && (
        <div className="flex items-center gap-3 mb-3 bg-[var(--color-surface-2)] rounded-xl px-3 py-2.5">
          <div className="relative w-[42px] h-[42px] flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
              <circle
                cx="18" cy="18" r="15.5" fill="none"
                stroke={rec.pct >= 70 ? CHART.accent : rec.pct >= 40 ? CHART.orange : CHART.red}
                strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${(rec.pct / 100) * 97.4} 97.4`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-semibold">{rec.pct}%</span>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium">今日恢复 {rec.pct}%{rec.fullRecoveryH !== undefined && rec.fullRecoveryH > 0 ? ` · 预计 ${rec.fullRecoveryH}h 后完全恢复` : ''}</p>
            <p className="text-[11px] text-[var(--color-label-3)] mt-0.5">
              COROS 建议：{rec.level === 'Heavy training allowed' ? '可进行高强度训练' : rec.level ?? '—'}
            </p>
          </div>
        </div>
      )}
      {debt && (
        <div className={`flex items-center justify-between gap-3 mb-3 rounded-xl px-3 py-2.5 ${debt.debtMin >= 300 ? 'bg-[var(--color-red)]/10' : 'bg-[var(--color-surface-2)]'}`}>
          <div className="min-w-0">
            <p className="text-[10.5px] text-[var(--color-label-3)]">近 {debt.windowDays} 天睡眠负债（目标 7h/晚）</p>
            <p className={`font-mono text-[16px] font-semibold mt-0.5 ${debt.debtMin >= 300 ? 'text-[var(--color-red)]' : 'text-white'}`}>
              {Math.floor(debt.debtMin / 60)}h{String(Math.round(debt.debtMin % 60)).padStart(2, '0')}m
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10.5px] text-[var(--color-label-3)] whitespace-nowrap">窗口内平均</p>
            <p className="font-mono text-[14px] text-[var(--color-label-2)] mt-0.5 whitespace-nowrap">{(debt.avgSleepMin / 60).toFixed(1)}h/晚</p>
          </div>
        </div>
      )}
      {debtTxt && (
        <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--color-orange)] bg-[var(--color-orange)]/10 rounded-lg px-3 py-2">{debtTxt}</p>
      )}
      {sleepDays.length > 0 ? (
        <>
          <p className="text-[11px] text-[var(--color-label-3)] mb-1">睡眠时长（柱色 = COROS 睡眠分数）</p>
          <div ref={sleepRef} className="w-full h-[150px]" />
        </>
      ) : (
        <p className="text-[12px] text-[var(--color-label-3)] py-4 text-center">快照中没有睡眠数据</p>
      )}
      {stressDays.length > 0 && (
        <>
          <p className="text-[11px] text-[var(--color-label-3)] mb-1 mt-3">日常压力</p>
          <div ref={stressRef} className="w-full h-[110px]" />
        </>
      )}
    </SectionCard>
  );
}
