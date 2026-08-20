import { useStore } from '../store/useStore';
import { calculatePaces, calculateHRZones } from '../utils/training-engine';
import { Gauge, HeartPulse, Info } from 'lucide-react';
import { cn } from '../utils/cn';

export function TrainingStats() {
  const { profile } = useStore();
  const paces = calculatePaces(profile);
  const hrZones = calculateHRZones(profile);

  const paceEstimated = !profile.ltPace;
  const hrEstimated   = !profile.lthr;

  return (
    <div className="space-y-5 pb-6">

      {/* Page title */}
      <div className="pt-1 pb-1">
        <h1 className="text-[22px] font-bold text-white tracking-tight">训练配速与心率</h1>
        <p className="text-[13px] text-[var(--color-label-2)] mt-0.5">基于 COROS EvoLab 6 区间模型；连接手表后区间优先用手表实测阈值</p>
      </div>

      {/* 使用提示（合并卡） */}
      <div className="bg-[var(--color-surface)] rounded-2xl p-4 flex items-start gap-3">
        <div className="w-[30px] h-[30px] rounded-full bg-[var(--color-blue)]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Info className="w-[15px] h-[15px] text-[var(--color-blue)]" />
        </div>
        <p className="text-[13px] text-[var(--color-label-2)] leading-relaxed">
          <span className="text-white font-semibold">怎么用：</span>
          配速为主，心率为辅。强度课按配速跑，轻松跑和长跑别超过心率上限。看不懂没关系——训练页每天会直接告诉你目标配速。
        </p>
      </div>

      {/* Pace Zones */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-[14px] h-[14px] text-[var(--color-label-3)]" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--color-label-3)]">
              配速区间 · COROS EvoLab
            </p>
          </div>
          {paces && <SourceBadge estimated={paceEstimated} />}
        </div>
        {paces && paceEstimated && (
          <p className="text-[11px] text-[var(--color-label-3)] px-1 mb-2 leading-relaxed">
            根据你的历史成绩推算，随着训练积累会越来越贴合你的实际状态。
          </p>
        )}
        <div className="bg-[var(--color-surface)] rounded-2xl overflow-hidden">
          {paces ? (
            <>
              <PaceRow label="Zone 1 (恢复)"    value={paces.z1} sub="排酸、热身、冷身" />
              <PaceRow label="Zone 2 (有氧耐力)" value={paces.z2} sub="LSD、Easy跑 — 占80%总量" />
              <PaceRow label="Zone 3 (有氧动力)" value={paces.z3} sub="马拉松配速 (MP) 专项" />
              <PaceRow label="Zone 4 (乳酸阈值)" value={paces.z4} sub="Tempo、Cruise Intervals" isAnchor />
              <PaceRow label="Zone 5 (速度耐力)" value={paces.z5} sub="VO2max 间歇、Fartlek" />
              <PaceRow label="Zone 6 (冲刺能力)" value={paces.z6} sub="短冲刺跑" isLast />
            </>
          ) : (
            <p className="px-4 py-6 text-[13px] text-[var(--color-label-2)] leading-relaxed">
              尚未填写成绩或 LT 配速，无法推算区间。请到「档案」至少填写一项成绩——系统不会用默认配速假装你有数据。
            </p>
          )}
        </div>
      </div>

      {/* HR Zones */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-[14px] h-[14px] text-[var(--color-label-3)]" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--color-label-3)]">
              心率区间 · COROS EvoLab
            </p>
          </div>
          <SourceBadge estimated={hrEstimated} />
        </div>
        {hrEstimated && (
          <p className="text-[11px] text-[var(--color-label-3)] px-1 mb-2 leading-relaxed">
            根据常见跑者数据推算。如有运动手表，可在「档案 → 高级设置」填入 LTHR 获得个人专属区间。
          </p>
        )}
        <div className="bg-[var(--color-surface)] rounded-2xl overflow-hidden">
          <HRRow label="Zone 1 (恢复区)"   value={hrZones.z1} accentClass="bg-[var(--color-fill)]"    sub="热身 / 冷身" />
          <HRRow label="Zone 2 (有氧基础)"  value={hrZones.z2} accentClass="bg-[var(--color-blue)]"    sub="占 80% 训练量" />
          <HRRow label="Zone 3 (有氧动力)"  value={hrZones.z3} accentClass="bg-[var(--color-accent)]"  sub="马拉松配速区" />
          <HRRow label="Zone 4 (乳酸阈值)"  value={hrZones.z4} accentClass="bg-[var(--color-orange)]"  sub="强度课核心" />
          <HRRow label="Zone 5 (无氧耐力)"  value={hrZones.z5} accentClass="bg-[var(--color-red)]"     sub="最大摄氧量" />
          <HRRow label="Zone 6 (无氧动力)"  value={hrZones.z6} accentClass="bg-[var(--color-purple)]"  sub="短冲刺" isLast />
        </div>
      </div>

    </div>
  );
}

function SourceBadge({ estimated }: { estimated: boolean }) {
  return estimated ? (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-label-3)]">
      系统推算
    </span>
  ) : (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
      来自手表 ✓
    </span>
  );
}

// ─── Pace row ─────────────────────────────────────────────────────────────────
function PaceRow({
  label, value, sub, isAnchor, isLast,
}: {
  label: string; value: string; sub: string; isAnchor?: boolean; isLast?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-center justify-between px-4 py-3',
      !isLast && 'border-b border-[var(--color-separator)]',
      isAnchor && 'bg-[var(--color-accent)]/[0.06]',
    )}>
      <div>
        <p className={cn(
          'text-[15px] font-medium leading-snug',
          isAnchor ? 'text-[var(--color-accent)]' : 'text-white',
        )}>
          {label}
        </p>
        <p className="text-[12px] text-[var(--color-label-3)] mt-0.5">{sub}</p>
      </div>
      <div className="text-right ml-4 flex-shrink-0">
        <p className={cn(
          'font-mono text-[15px] font-semibold',
          isAnchor ? 'text-[var(--color-accent)]' : 'text-white',
        )}>
          {value}
        </p>
        {isAnchor && (
          <p className="text-[10px] text-[var(--color-accent)]/60 uppercase tracking-wide">LT 锚点</p>
        )}
      </div>
    </div>
  );
}

// ─── HR row ───────────────────────────────────────────────────────────────────
function HRRow({
  label, value, accentClass, sub, isLast,
}: {
  label: string; value: string; accentClass: string; sub: string; isLast?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3',
      !isLast && 'border-b border-[var(--color-separator)]',
    )}>
      <div className={cn('w-1 h-8 rounded-full flex-shrink-0', accentClass)} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-white leading-snug">{label}</p>
        <p className="text-[12px] text-[var(--color-label-3)] mt-0.5">{sub}</p>
      </div>
      <p className="font-mono text-[15px] font-semibold text-white flex-shrink-0">{value}</p>
    </div>
  );
}
