import { useMemo } from 'react';
import { useStore, RPE_LABELS, RPE_COLORS } from '../store/useStore';
import type { CompletionStatus, RPELevel } from '../store/useStore';
import { useEffectivePlan } from '../hooks/useEffectivePlan';
import { format, isPast, isToday } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CheckCircle2, MinusCircle, XCircle, Flame, TrendingUp, Calendar, Zap } from 'lucide-react';
import { cn } from '../utils/cn';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CompletionStatus, {
  icon: typeof CheckCircle2; label: string; color: string; bg: string;
}> = {
  full:    { icon: CheckCircle2, label: '已完成', color: 'var(--color-accent)',  bg: 'rgba(50,215,75,0.12)'  },
  partial: { icon: MinusCircle,  label: '部分完成', color: 'var(--color-orange)', bg: 'rgba(255,159,10,0.12)' },
  skip:    { icon: XCircle,      label: '已跳过',  color: 'var(--color-label-3)', bg: 'rgba(99,99,102,0.15)' },
};

const WORKOUT_TYPE_LABEL: Record<string, string> = {
  LSD: 'LSD 长跑', Tempo: '节奏跑', TempoIntervals: '节奏间歇',
  Interval: '间歇跑', Fartlek: '法特莱克', Hills: '坡度跑',
  Progression: '渐进跑', Cruise: '巡航间歇', Easy: '轻松跑',
  Recovery: '恢复跑', MP: '马拉松配速', Race: '比赛日',
};

// ─── Main component ───────────────────────────────────────────────────────────

export function TrainingLog() {
  // Use useEffectivePlan so dates are normalized (Date objects, not strings)
  // and race/vacation overlays are applied consistently with the calendar view.
  const plan = useEffectivePlan();
  const { completions } = useStore();

  // All past/today non-rest workouts that were scheduled
  const scheduledPast = useMemo(() =>
    plan
      .filter(w => w.workoutType !== 'Rest' && (isPast(w.date) || isToday(w.date)))
      .sort((a, b) => b.date.getTime() - a.date.getTime()), // newest first
  [plan]);

  // Logged entries (checked-in workouts), newest first
  const logEntries = useMemo(() =>
    scheduledPast
      .map(w => {
        const dateStr = format(w.date, 'yyyy-MM-dd');
        const entry = completions[dateStr];
        return entry ? { workout: w, dateStr, entry } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  [scheduledPast, completions]);

  // Stats
  const stats = useMemo(() => {
    const total   = scheduledPast.length;
    const logged  = logEntries.length;
    const full    = logEntries.filter(e => e.entry.status === 'full').length;
    const partial = logEntries.filter(e => e.entry.status === 'partial').length;
    const skipped = logEntries.filter(e => e.entry.status === 'skip').length;
    const completionRate = total > 0 ? Math.round(((full + partial) / total) * 100) : 0;

    // Current streak: consecutive full/partial from most recent entry
    let streak = 0;
    for (const { entry } of logEntries) {
      if (entry.status === 'full' || entry.status === 'partial') streak++;
      else break;
    }

    // Total km completed (full = 100%, partial = 50%)
    const totalKm = logEntries.reduce((sum, { workout, entry }) => {
      if (entry.status === 'skip') return sum;
      const factor = entry.status === 'full' ? 1 : 0.5;
      return sum + (workout.distanceKm ?? 0) * factor;
    }, 0);

    return { total, logged, full, partial, skipped, completionRate, streak, totalKm: Math.round(totalKm * 10) / 10 };
  }, [logEntries, scheduledPast]);

  // Group by month (newest first)
  const grouped = useMemo(() => {
    const map = new Map<string, typeof logEntries>();
    for (const entry of logEntries) {
      const key = format(entry.workout.date, 'yyyy-MM');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return map;
  }, [logEntries]);

  if (scheduledPast.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 px-6">
        <div className="w-16 h-16 bg-[var(--color-surface)] rounded-2xl flex items-center justify-center mb-5">
          <Calendar className="w-8 h-8 text-[var(--color-label-3)]" />
        </div>
        <h3 className="text-[17px] font-semibold text-white mb-2">暂无训练记录</h3>
        <p className="text-[13px] text-[var(--color-label-2)] leading-relaxed max-w-[240px]">
          开始训练并打卡后，你的训练日志会在这里积累。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />}
          label="打卡完成"
          value={stats.full + stats.partial}
          sub={`共安排 ${stats.total} 节`}
          accent
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" style={{ color: '#0A84FF' }} />}
          label="完成率"
          value={`${stats.completionRate}%`}
          sub={`跳过 ${stats.skipped} 次`}
        />
        <StatCard
          icon={<Flame className="w-4 h-4" style={{ color: 'var(--color-orange)' }} />}
          label="累计跑量"
          value={`${stats.totalKm} km`}
          sub="完成 + 部分折算"
        />
        <StatCard
          icon={<Zap className="w-4 h-4" style={{ color: '#FFD60A' }} />}
          label="当前连续"
          value={`${stats.streak} 次`}
          sub="连续完成打卡"
        />
      </div>

      {/* ── Log list ── */}
      {logEntries.length === 0 ? (
        <div className="text-center py-10 text-[var(--color-label-3)] text-[13px]">
          还没有打卡记录 · 去日历页完成今天的训练吧
        </div>
      ) : (
        Array.from(grouped.entries()).map(([monthKey, entries]) => (
          <div key={monthKey}>
            {/* Month header */}
            <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider mb-2 px-1">
              {format(new Date(monthKey + '-01'), 'yyyy年 M月', { locale: zhCN })}
              <span className="ml-2 text-[var(--color-label-4)]">
                {entries.filter(e => e.entry.status !== 'skip').length} 次完成
              </span>
            </p>

            <div className="bg-[var(--color-surface)] rounded-2xl overflow-hidden">
              {entries.map(({ workout, dateStr, entry }, idx) => {
                const cfg = STATUS_CONFIG[entry.status as CompletionStatus];
                const Icon = cfg.icon;
                const rpeLevel = entry.rpe as RPELevel;
                const isLast = idx === entries.length - 1;

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3.5',
                      !isLast && 'border-b border-[var(--color-separator)]'
                    )}
                  >
                    {/* Status icon */}
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: cfg.bg }}
                    >
                      <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-white leading-snug">
                          {WORKOUT_TYPE_LABEL[workout.workoutType] ?? workout.workoutType}
                        </span>
                        {workout.distanceKm && workout.distanceKm > 0 && (
                          <span className="text-[11px] font-mono text-[var(--color-label-3)]">
                            {entry.status === 'partial'
                              ? `~${Math.round(workout.distanceKm * 0.5 * 10) / 10}km`
                              : entry.status === 'skip' ? '—'
                              : `${workout.distanceKm}km`}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--color-label-3)] mt-0.5">
                        {format(workout.date, 'M月d日 EEEE', { locale: zhCN })}
                      </p>
                    </div>

                    {/* Right: status + RPE */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: cfg.color, background: cfg.bg }}
                      >
                        {cfg.label}
                      </span>
                      {entry.status !== 'skip' && (
                        <span
                          className={cn(
                            'text-[9px] font-semibold px-1.5 py-0.5 rounded-md border',
                            RPE_COLORS[rpeLevel]
                          )}
                        >
                          {RPE_LABELS[rpeLevel]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl px-4 py-3.5">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <p className="text-[10px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider">{label}</p>
      </div>
      <p className={cn(
        'text-[24px] font-bold leading-none',
        accent ? 'text-[var(--color-accent)]' : 'text-white'
      )}>
        {value}
      </p>
      <p className="text-[10px] text-[var(--color-label-3)] mt-1">{sub}</p>
    </div>
  );
}
