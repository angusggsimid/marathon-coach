import { useMemo, useState } from 'react';
import type { ActualActivity, CorosSnapshot } from '../../utils/insights/types';
import { SectionCard } from './SectionCard';
import { paceToZone, ZONE_COLORS } from '../../utils/insights/zones';
import { formatDuration, formatPace } from '../../utils/insights/format';
import ScienceNote from '../ScienceNote';

export function ActivityDetail({ snapshot }: { snapshot: CorosSnapshot }) {
  const lt = snapshot.fitness?.ltPaceSec;
  const [selectedId, setSelectedId] = useState<string>('');

  const allSorted = useMemo(() => [...snapshot.activities].sort((a, b) => b.date.localeCompare(a.date)), [snapshot]);
  const selected = allSorted.find((a) => (a.id ?? a.date + a.rawType) === selectedId) ?? null;

  return (
    <SectionCard title="活动详情" sub={`全部 ${allSorted.length} 次活动`}>
      <details>
        <summary className="cursor-pointer list-none text-[12.5px] text-[var(--color-label-2)] bg-[var(--color-surface-2)] rounded-lg px-3 py-2 hover:text-white transition-colors">
          选择一次活动查看详情 ▾
        </summary>
        <div className="mt-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-[var(--color-surface-2)] text-[13px] text-white rounded-lg px-3 py-2 border border-[var(--color-separator)] outline-none"
          >
            <option value="">选择活动…</option>
            {allSorted.map((a) => (
              <option key={a.id ?? a.date + a.rawType} value={a.id ?? a.date + a.rawType}>
                {a.date} · {a.name ?? a.rawType ?? a.type}{a.type === 'run' && a.distanceKm ? ` · ${a.distanceKm.toFixed(1)} km` : ''}
              </option>
            ))}
          </select>
        </div>

      {selected && (
        <div className="mt-3 rounded-xl bg-[var(--color-surface-2)]/60 p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2">
            <Detail label="距离" value={selected.distanceKm ? `${selected.distanceKm.toFixed(2)} km` : undefined} />
            <Detail label="时长" value={formatDuration(selected.durationSec)} />
            <Detail label="均速" value={selected.avgPaceSec ? `${formatPace(selected.avgPaceSec)} /km` : undefined} />
            <Detail label="移动均速" value={selected.movingAvgPaceSec ? `${formatPace(selected.movingAvgPaceSec)} /km` : undefined} />
            <Detail label="最快 1km" value={selected.bestKmPaceSec ? `${formatPace(selected.bestKmPaceSec)} /km` : undefined} />
            <Detail label="平均心率" value={selected.avgHr ? `${selected.avgHr} bpm` : undefined} />
            <Detail label="步频" value={selected.laps ? avgLap(selected, (l) => l.cadence, 0, ' spm') : undefined} />
            <Detail label="步幅" value={selected.laps ? avgLap(selected, (l) => l.strideLengthCm, 0, ' cm') : selected.avgStrideLengthM ? `${selected.avgStrideLengthM.toFixed(2)} m` : undefined} />
            <Detail label="触地时间" value={selected.laps ? avgLap(selected, (l) => l.groundTimeMs, 0, ' ms') : undefined} />
            <Detail label="功率" value={(selected.avgPower ?? avgLapNum(selected, (l) => l.power)) ? `${selected.avgPower ?? avgLapNum(selected, (l) => l.power)} W` : undefined} />
            <Detail label="爬升 / 下降" value={selected.elevGainM !== undefined ? `${selected.elevGainM} / ${selected.elevLossM ?? 0} m` : undefined} />
            <Detail label="训练负荷" value={selected.trainingLoad !== undefined ? String(selected.trainingLoad) : undefined} />
            <Detail label="有氧 TE" value={selected.aerobicTe !== undefined ? selected.aerobicTe.toFixed(1) : undefined} />
            <Detail label="训练重点" value={selected.trainingFocus} />
            <Detail label="表现评估" value={selected.performance} />
            <Detail label="自感疲劳" value={selected.perceivedEffort} />
            <Detail label="消耗" value={selected.calories ? `${selected.calories} kcal` : undefined} />
          </div>
          {selected.laps && lt && (
            <div className="mt-3">
              <div className="flex gap-[2px] items-end h-[46px]">
                {selected.laps.map((l) => {
                  const z = paceToZone(l.avgPaceSec, lt);
                  return (
                    <div
                      key={l.index}
                      title={`第${l.index}km ${formatPace(l.avgPaceSec)}/km ${l.avgHr ?? '—'}bpm${l.cadence ? ` ${l.cadence}spm` : ''}`}
                      className="flex-1 rounded-t-[2px] min-w-[6px]"
                      style={{
                        background: z ? ZONE_COLORS[z] : 'var(--color-fill)',
                        height: l.avgPaceSec ? `${Math.max(18, 100 - ((l.avgPaceSec - (lt - 60)) / 240) * 100)}%` : '18%',
                      }}
                    />
                  );
                })}
              </div>
              <p className="text-[10px] text-[var(--color-label-3)] mt-1">每公里配速柱（颜色 = 落区，越高越快）</p>
            </div>
          )}
        <ScienceNote id="te" />
        </div>
      )}
      </details>
    </SectionCard>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] text-[var(--color-label-3)]">{label}</p>
      <p className="text-[12.5px] font-mono text-white mt-0.5">{value}</p>
    </div>
  );
}

function avgLap(a: ActualActivity, f: (l: NonNullable<ActualActivity['laps']>[number]) => number | undefined, digits: number, suffix: string): string | undefined {
  const vs = a.laps?.map(f).filter((v): v is number => v !== undefined) ?? [];
  if (!vs.length) return undefined;
  return (vs.reduce((s, v) => s + v, 0) / vs.length).toFixed(digits) + suffix;
}

function avgLapNum(a: ActualActivity, f: (l: NonNullable<ActualActivity['laps']>[number]) => number | undefined): number | undefined {
  const vs = a.laps?.map(f).filter((v): v is number => v !== undefined) ?? [];
  if (!vs.length) return undefined;
  return Math.round(vs.reduce((s, v) => s + v, 0) / vs.length);
}
