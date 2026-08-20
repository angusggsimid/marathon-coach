import { useMemo } from 'react';
import type { CorosSnapshot } from '../../utils/insights/types';
import { SectionCard } from './SectionCard';
import { CHART } from '../../utils/insights/theme';
import { ZONE_COLORS, ZONE_LABELS } from '../../utils/insights/zones';
import { seilerDistribution, zoneDistribution } from '../../utils/insights/metrics';
import { paceStabilityInsight, seilerInsight } from '../../utils/insights/insights';

export function SeilerCard({ snapshot }: { snapshot: CorosSnapshot }) {
  const lt = snapshot.fitness?.ltPaceSec;
  const runs = useMemo(() => snapshot.activities.filter((a) => a.type === 'run'), [snapshot]);
  const seiler = useMemo(() => (lt ? seilerDistribution(runs, lt, 28) : null), [runs, lt]);
  const dist = useMemo(() => (lt ? zoneDistribution(runs, lt) : null), [runs, lt]);
  const insight = useMemo(() => seilerInsight(seiler), [seiler]);
  const stability = useMemo(() => paceStabilityInsight(snapshot.activities), [snapshot]);

  const zones = dist?.shares ?? [];

  return (
    <SectionCard
      title="强度分布 · Seiler 三区"
      sub="近 4 周 · 目标 ≈80% 低强度"
      insight={insight}
    >
      {seiler ? (
        <>
          <div className="flex w-full h-[28px] rounded-md overflow-hidden">
            <div style={{ width: `${seiler.lowPct}%`, background: CHART.blue }} title={`低强度（Z1-Z2）${seiler.lowKm.toFixed(1)} km（${seiler.lowPct.toFixed(0)}%）`} />
            <div style={{ width: `${seiler.midPct}%`, background: 'rgba(120,120,128,0.7)' }} title={`灰区（Z3）${seiler.midKm.toFixed(1)} km（${seiler.midPct.toFixed(0)}%）`} />
            <div style={{ width: `${seiler.highPct}%`, background: CHART.red }} title={`高强度（Z4+）${seiler.highKm.toFixed(1)} km（${seiler.highPct.toFixed(0)}%）`} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10.5px] text-[var(--color-label-2)]">
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: CHART.blue }} />低强度 {seiler.lowKm.toFixed(0)} km（{seiler.lowPct.toFixed(0)}%）</span>
            <span><span className="inline-block w-2 h-2 rounded-full mr-1 bg-[var(--color-fill)]" />灰区 {seiler.midKm.toFixed(0)} km（{seiler.midPct.toFixed(0)}%）</span>
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: CHART.red }} />高强度 {seiler.highKm.toFixed(0)} km（{seiler.highPct.toFixed(0)}%）</span>
            {stability && <span className="text-[var(--color-label-3)]">· {stability}</span>}
          </div>
          {zones.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 border-t border-[var(--color-separator)]">
              {zones.map((z) => (
                <span key={z.zone} className="text-[10px] text-[var(--color-label-3)]">
                  <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: ZONE_COLORS[z.zone] }} />
                  {ZONE_LABELS[z.zone]} {z.pct.toFixed(0)}%
                </span>
              ))}
              {dist && dist.estimatedPct > 50 && <span className="text-[10px] text-[var(--color-label-3)]">（部分按均速估算）</span>}
            </div>
          )}
        </>
      ) : (
        <p className="text-[12px] text-[var(--color-label-3)] py-6 text-center">近 4 周跑量不足 10 km，无法计算强度分布</p>
      )}
    </SectionCard>
  );
}
