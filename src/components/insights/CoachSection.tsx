import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import type { CorosSnapshot } from '../../utils/insights/types';
import { buildCoachReport, engineEffectiveLtPace, type CoachReport } from '../../utils/insights/coach';
import { cycleCaps } from '../../utils/insights/cycle';
import { SectionCard } from './SectionCard';

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]',
  medium: 'bg-[var(--color-blue)]/15 text-[var(--color-blue)]',
  low: 'bg-[var(--color-surface-2)] text-[var(--color-label-3)]',
};
const CONFIDENCE_LABEL: Record<string, string> = { high: '高置信', medium: '中置信', low: '参照' };

export function CoachSection({ id, snapshot }: { id?: string; snapshot: CorosSnapshot }) {
  const { profile, applyCorosCalibration } = useStore();
  const [result, setResult] = useState<{ applied: string[]; planRegenerated: boolean } | null>(null);

  const report: CoachReport = useMemo(() => buildCoachReport(snapshot, profile), [snapshot, profile]);

  const patchRows = report.recommendations.filter((r) => r.autoPatch && r.recommendedValue);
  const effLt = engineEffectiveLtPace(profile);
  const currentLtLabel = profile.ltPace ? profile.ltPace : effLt ? `${effLt.paceSec >= 0 ? formatSec(effLt.paceSec) : '—'}（${effLt.source}）` : '未设置';
  const currentLthrLabel = profile.lthr === '' ? '未设置' : String(profile.lthr);
  const alreadySynced =
    patchRows.length > 0 &&
    (report.patch.ltPace === undefined || report.patch.ltPace === profile.ltPace) &&
    (report.patch.lthr === undefined || report.patch.lthr === profile.lthr);

  const doCalibrate = () => setResult(applyCorosCalibration(report.patch));
  const factor = report.adaptation?.factor;
  const cycle = useMemo(() => cycleCaps(snapshot, profile), [snapshot, profile]);

  return (
    <SectionCard
      id={id}
      title="教练处方 · 训练引擎联动"
      sub="COROS 实测数据 → 引擎参数"
    >
      {/* ── A. 下周自适应裁决 ── */}
      {report.adaptation && (
        <div className={`rounded-xl px-4 py-3 mb-4 ${
          factor === 0.9 ? 'bg-[var(--color-orange)]/10 border border-[var(--color-orange)]/25'
            : factor === 1.05 ? 'bg-[var(--color-accent-dim)] border border-[var(--color-accent-border)]'
            : 'bg-[var(--color-surface-2)]'
        }`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[22px] font-bold">
              {factor === 1 ? '1.00' : factor?.toFixed(2)}
            </span>
            <div className="flex-1 min-w-[200px]">
              <p className="text-[13px] font-medium">下周训练量调整（身体数据裁决）</p>
              <p className="text-[11.5px] text-[var(--color-label-2)] mt-0.5">{report.adaptation.summary}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {report.adaptation.signals.map((s) => (
              <span key={s.name} title={s.detail} className={`text-[10.5px] px-2 py-0.5 rounded-full ${
                s.direction === 'risk' ? 'bg-[var(--color-red)]/15 text-[var(--color-red)]'
                  : s.direction === 'positive' ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                  : 'bg-[var(--color-surface-3)] text-[var(--color-label-3)]'
              }`}>
                {s.direction === 'risk' ? '▲ ' : s.direction === 'positive' ? '▼ ' : '● '}{s.name}
              </span>
            ))}
          </div>
          <p className="text-[10.5px] text-[var(--color-label-3)] mt-2">
            悬停查看各信号证据。此裁决已并入周自适应：引擎取「客观 × 打卡」保守值，可在训练页证明卡查看与否决。
          </p>
        </div>
      )}

      {/* ── A2. 周期层信号（任务 4）── */}
      {(cycle.decouplingAvg !== null || cycle.efWeeklyPct !== null || cycle.vo2maxDivergence) && (
        <div className="rounded-xl bg-[var(--color-surface-2)]/60 px-4 py-3 mb-4">
          <p className="text-[11px] uppercase tracking-wider text-[var(--color-label-3)] font-semibold mb-2">
            有氧基础与训练响应 · 增量上限
          </p>
          <div className="space-y-1.5 text-[12px] text-[var(--color-label-2)] leading-relaxed">
            {cycle.decouplingAvg !== null && (
              <p>
                有氧解耦（近 4 次长跑均值）：<span className={`font-mono ${cycle.decouplingAvg > 10 ? 'text-[var(--color-orange)]' : 'text-[var(--color-accent)]'}`}>{cycle.decouplingAvg.toFixed(1)}%</span>
                <span className="text-[var(--color-label-3)]">（&lt;5% 扎实 / 5-10% 建设中 / &gt;10% 延长基础期）</span>
              </p>
            )}
            {cycle.efWeeklyPct !== null && (
              <p>
                EF 趋势：<span className={`font-mono ${cycle.efWeeklyPct < -1 ? 'text-[var(--color-orange)]' : 'text-[var(--color-accent)]'}`}>{cycle.efWeeklyPct >= 0 ? '+' : ''}{cycle.efWeeklyPct.toFixed(1)}%/周</span>
                <span className="text-[var(--color-label-3)]">（下滑时本周不增量）</span>
              </p>
            )}
            {cycle.vo2maxDivergence && (
              <p className="text-[var(--color-orange)]">
                VO₂max 交叉校验：手表 {cycle.vo2maxDivergence.coros} vs 引擎 VDOT {cycle.vo2maxDivergence.engine.toFixed(1)}（差 {cycle.vo2maxDivergence.diff > 0 ? '+' : ''}{cycle.vo2maxDivergence.diff.toFixed(0)}）——档案 PB 可能过期，建议用近期真实比赛成绩更新。
              </p>
            )}
            {cycle.reasons.map((r, i) => (
              <p key={i} className="text-[var(--color-orange)]">· {r}</p>
            ))}
          </div>
        </div>
      )}

      {/* ── B. 一键校准 ── */}
      <div className="rounded-xl bg-[var(--color-surface-2)]/60 px-4 py-3 mb-4">
        <p className="text-[11px] uppercase tracking-wider text-[var(--color-label-3)] font-semibold mb-2">
          校准通道 · 写入训练引擎
        </p>
        {result ? (
          <div>
            <p className="text-[14px] font-semibold text-[var(--color-accent)]">✓ 已校准训练引擎</p>
            <ul className="mt-1.5 space-y-0.5">
              {result.applied.map((a) => (
                <li key={a} className="text-[12px] font-mono text-[var(--color-label-2)]">· {a}</li>
              ))}
            </ul>
            <p className="text-[12px] text-[var(--color-label-2)] mt-1.5">
              {result.planRegenerated
                ? '训练计划已按新阈值重算，去「训练」页查看。'
                : '档案已校准；计划重算被引擎守卫拦截，请在「档案」页重新生成。'}
            </p>
            <button
              onClick={() => setResult(null)}
              className="mt-2.5 text-[11.5px] text-[var(--color-label-3)] underline"
            >
              收起
            </button>
          </div>
        ) : patchRows.length === 0 ? (
          <p className="text-[12px] text-[var(--color-label-3)]">当前没有可写入的校准项（缺少实测数据或已与引擎一致）。</p>
        ) : alreadySynced ? (
          <div>
            <p className="text-[13px] text-[var(--color-accent)]">✓ 引擎已是最新校准，无需操作</p>
            <p className="text-[11.5px] text-[var(--color-label-3)] mt-1">
              ltPace {profile.ltPace}{profile.lthr !== '' ? ` · lthr ${profile.lthr}` : ''} 与 COROS 实测一致。
            </p>
          </div>
        ) : (
          <div>
            <div className="space-y-1.5">
              {patchRows.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-[12.5px] flex-wrap">
                  <span className="text-[var(--color-label-3)] w-[88px] flex-shrink-0">{r.target}</span>
                  <span className="font-mono text-[var(--color-label-2)] line-through">
                    {r.id === 'lt-pace' ? currentLtLabel : currentLthrLabel}
                  </span>
                  <span className="text-[var(--color-label-3)]">→</span>
                  <span className="font-mono text-[var(--color-accent)] font-semibold">{r.recommendedValue}</span>
                </div>
              ))}
            </div>
            <button
              onClick={doCalibrate}
              className="mt-3 rounded-lg bg-[var(--color-accent)] text-black text-[14px] font-semibold px-5 py-2.5 hover:opacity-90 transition-opacity"
            >
              一键校准训练引擎
            </button>
            <p className="text-[10.5px] text-[var(--color-label-3)] mt-2">
              直接更新档案与训练计划（引擎即时重算）；打卡、赛事、休假不受影响。
            </p>
          </div>
        )}
      </div>

      {/* ── C. 建议列表 ── */}
      <div className="grid grid-cols-1 gap-2">
        {report.recommendations.map((r) => (
          <div key={r.id + (r.target ?? '')} className="rounded-xl border border-[var(--color-separator)] px-3.5 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13.5px] font-semibold">{r.title}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${CONFIDENCE_STYLE[r.confidence]}`}>
                {CONFIDENCE_LABEL[r.confidence]}
              </span>
              {r.autoPatch && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent-dim)] text-[var(--color-accent)]">
                  可自动写入
                </span>
              )}
              {r.target && <span className="text-[10px] font-mono text-[var(--color-label-3)]">{r.target}</span>}
            </div>
            {r.recommendedValue && (
              <p className="text-[12.5px] mt-1.5">
                {r.currentValue && <span className="text-[var(--color-label-3)]">{r.currentValue} → </span>}
                <span className="font-mono text-[var(--color-accent)]">{r.recommendedValue}</span>
              </p>
            )}
            <ul className="mt-1.5 space-y-0.5">
              {r.evidence.map((e, i) => (
                <li key={i} className="text-[11.5px] text-[var(--color-label-2)] leading-relaxed">· {e}</li>
              ))}
            </ul>
            {r.engineEffect !== '—' && (
              <p className="text-[11px] text-[var(--color-label-3)] mt-1.5">引擎效果：{r.engineEffect}</p>
            )}
          </div>
        ))}
        {report.recommendations.length === 0 && (
          <p className="text-[12px] text-[var(--color-label-3)] py-4 text-center">当前数据没有可生成的建议</p>
        )}
      </div>
    </SectionCard>
  );
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
