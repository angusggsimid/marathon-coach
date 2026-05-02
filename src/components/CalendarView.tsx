import type { ReactNode } from 'react';
import { TrainingLog } from './TrainingLog';
import { useStore, RPE_LABELS, RPE_COLORS } from '../store/useStore';
import { useEffectivePlan } from '../hooks/useEffectivePlan';
import type { RPELevel, CompletionStatus } from '../store/useStore';
import { getCheckInMessage } from '../utils/checkin-messages';
import type { CheckInMessage } from '../utils/checkin-messages';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Activity, Footprints, Flame, AlertTriangle, CheckCircle2, CalendarPlus, Download, Umbrella, Trash2 } from 'lucide-react';
import { downloadICS } from '../utils/export-ics';
import { downloadAllFIT } from '../utils/export-fit';
import { syncPlanToICU } from '../utils/intervals-icu';
import type { ICUSyncProgress } from '../utils/intervals-icu';
import { format, startOfWeek, addDays, addMonths, isSameMonth, isSameDay, startOfMonth, endOfMonth, endOfWeek, differenceInWeeks, isPast, isToday } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useState } from 'react';
import type { DailyWorkout, WorkoutSegment } from '../utils/training-engine';
import { cn } from '../utils/cn';

// ─── Check-in Modal ───────────────────────────────────────────────────────────

interface CheckInModalProps {
  workout: DailyWorkout;
  existing?: { status: CompletionStatus; rpe: RPELevel };
  onSave: (status: CompletionStatus, rpe: RPELevel) => void;
  onClose: () => void;
}

function CheckInModal({ workout, existing, onSave, onClose }: CheckInModalProps) {
  const [status, setStatus] = useState<CompletionStatus>(existing?.status ?? 'full');
  const [rpe, setRpe] = useState<RPELevel>(existing?.rpe ?? 2);

  const statusOptions: { value: CompletionStatus; label: string; activeClass: string }[] = [
    { value: 'full',    label: '✓ 完成', activeClass: 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/40' },
    { value: 'partial', label: '◑ 部分', activeClass: 'bg-[var(--color-orange)]/15 text-[var(--color-orange)] border-[var(--color-orange)]/40' },
    { value: 'skip',    label: '✕ 跳过', activeClass: 'bg-[var(--color-label-4)] text-[var(--color-label-2)] border-[var(--color-separator)]' },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[var(--color-surface)] rounded-t-3xl w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom duration-300 pb-safe">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-[var(--color-label-4)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-4 border-b border-[var(--color-separator)]">
          <div>
            <p className="text-[12px] text-[var(--color-label-3)] mb-1">{format(new Date(workout.date), 'yyyy年MM月dd日 EEEE', { locale: zhCN })}</p>
            <div className="flex items-center gap-2">
              <WorkoutBadge type={workout.workoutType} />
              <span className="text-[15px] font-semibold text-white">{workout.description.split(' - ')[0]}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-label-2)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-5 pb-6 space-y-5">
          {/* Completion status */}
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider mb-3">完成情况</p>
            <div className="grid grid-cols-3 gap-2">
              {statusOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={cn(
                    'py-2.5 rounded-xl border text-[13px] font-semibold transition-all',
                    status === opt.value
                      ? opt.activeClass
                      : 'border-[var(--color-separator)] text-[var(--color-label-3)] bg-[var(--color-surface-2)]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* RPE */}
          {status !== 'skip' && (
            <div>
              <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider mb-3">身体感受</p>
              <div className="grid grid-cols-5 gap-1.5">
                {([0, 1, 2, 3, 4] as RPELevel[]).map(level => (
                  <button
                    key={level}
                    onClick={() => setRpe(level)}
                    className={cn(
                      'py-2 rounded-xl border text-[10px] font-semibold transition-all leading-tight',
                      rpe === level
                        ? RPE_COLORS[level] + ' ring-1 ring-current'
                        : 'border-[var(--color-separator)] text-[var(--color-label-3)] bg-[var(--color-surface-2)]'
                    )}
                  >
                    {RPE_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Save */}
          <button
            onClick={() => onSave(status, status === 'skip' ? 2 : rpe)}
            className="w-full bg-[var(--color-accent)] text-black font-bold py-3.5 rounded-2xl text-[15px]"
          >
            保存打卡
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main CalendarView ────────────────────────────────────────────────────────

// ICU sync view states within the export sheet
type ICUView = 'menu' | 'setup' | 'syncing' | 'done';

export function CalendarView() {
  const { profile, completions, logCompletion, getWeeklyAdaptation, icuApiKey, icuAthleteId, saveICUCredentials, vacations, addVacation, removeVacation } = useStore();
  const plan = useEffectivePlan();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedWorkout, setSelectedWorkout] = useState<DailyWorkout | null>(null);
  const [checkInWorkout, setCheckInWorkout] = useState<DailyWorkout | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [calView, setCalView] = useState<'calendar' | 'log'>('calendar');
  const [quoteToast, setQuoteToast] = useState<CheckInMessage | null>(null);

  // ── Vacation sheet state ──
  const [showVacation, setShowVacation]   = useState(false);
  const [vacStart,     setVacStart]       = useState('');
  const [vacEnd,       setVacEnd]         = useState('');
  const [vacLabel,     setVacLabel]       = useState('');
  const [vacError,     setVacError]       = useState('');

  const showQuoteToast = (msg: CheckInMessage) => {
    setQuoteToast(msg);
    setTimeout(() => setQuoteToast(null), 4500);
  };

  // ICU sync state
  const [icuView, setIcuView] = useState<ICUView>('menu');
  const [icuKeyInput, setIcuKeyInput] = useState('');
  const [icuIdInput, setIcuIdInput] = useState('');
  const [icuProgress, setIcuProgress] = useState<ICUSyncProgress | null>(null);
  const [icuResult, setIcuResult] = useState<{ success: number; failed: number; firstError?: string } | null>(null);

  const workoutCount = plan.filter(w => w.workoutType !== 'Rest').length;

  const handleICUSync = async (apiKey: string, athleteId: string) => {
    saveICUCredentials(apiKey, athleteId);
    setIcuView('syncing');
    setIcuProgress({ current: 0, total: workoutCount });
    const result = await syncPlanToICU(plan, apiKey, athleteId, setIcuProgress);
    setIcuResult(result);
    setIcuView('done');
  };

  const handleVacationSave = () => {
    if (!vacStart) { setVacError('请选择开始日期'); return; }
    if (!vacEnd)   { setVacError('请选择结束日期'); return; }
    if (vacEnd < vacStart) { setVacError('结束日期不能早于开始日期'); return; }
    addVacation(vacStart, vacEnd, vacLabel.trim() || undefined);
    setVacStart(''); setVacEnd(''); setVacLabel(''); setVacError('');
  };

  const closeExport = () => {
    setShowExport(false);
    // Reset ICU state after sheet closes
    setTimeout(() => { setIcuView('menu'); setIcuProgress(null); setIcuResult(null); }, 300);
  };

  if (!plan || plan.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 px-6">
        <div className="w-16 h-16 bg-[var(--color-surface)] rounded-2xl flex items-center justify-center mb-5">
          <CalendarIcon className="w-8 h-8 text-[var(--color-label-3)]" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">还没有训练计划</h3>
        <p className="text-[var(--color-label-2)] text-sm max-w-xs leading-relaxed">
          前往「跑者档案」填写目标与成绩，30 秒生成你的专属课表。
        </p>
      </div>
    );
  }

  const weeksToRace = differenceInWeeks(new Date(profile.raceDate), new Date());

  // Today's workout
  const todayWorkout = plan.find(w => isSameDay(new Date(w.date), new Date()));
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayCompletion = completions[todayStr];

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(addMonths(currentMonth, -1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // Monthly volume bars
  const monthlyVolumes: { label: string; volume: number; isCurrent: boolean; date: Date }[] = [];
  if (plan.length > 0) {
    const startM = startOfMonth(new Date(plan[0].date));
    const endM = endOfMonth(new Date(plan[plan.length - 1].date));
    let currentM = startM;
    while (currentM <= endM) {
      const vol = plan.filter(w => isSameMonth(new Date(w.date), currentM)).reduce((s, w) => s + (w.distanceKm || 0), 0);
      monthlyVolumes.push({ label: format(currentM, 'M月'), volume: Math.round(vol), isCurrent: isSameMonth(currentM, currentMonth), date: currentM });
      currentM = startOfMonth(addDays(currentM, 32));
    }
  }
  const maxMonthlyVol = Math.max(...monthlyVolumes.map(m => m.volume), 1);

  let currentMonthVolume = 0;
  for (const w of plan) {
    if (isSameMonth(new Date(w.date), monthStart)) currentMonthVolume += w.distanceKm || 0;
  }

  // Build calendar grid
  const rows = [];
  let days = [];
  let day = startDate;

  while (day <= endDate) {
    const weekStartDay = day;
    const weekEndDay = addDays(weekStartDay, 6); // Sunday
    const weekStart = new Date(weekStartDay); weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekEndDay); weekEnd.setHours(23, 59, 59, 999);

    const weekWorkouts = plan.filter(w => {
      const d = new Date(w.date);
      return d >= weekStart && d <= weekEnd;
    });
    const actualWeekVolume = Math.round(weekWorkouts.reduce((s, w) => s + (w.distanceKm || 0), 0) * 10) / 10;

    // Weekly adaptation banner (shown on Sunday row-end, based on the past week)
    const sundayOfRow = weekEndDay;
    const adaptation = getWeeklyAdaptation(sundayOfRow);

    for (let i = 0; i < 7; i++) {
      const cloneDay = day;
      const workout = plan.find(w => isSameDay(new Date(w.date), cloneDay));
      const isCurrentMonth = isSameMonth(day, monthStart);
      const isTodayDate = isToday(day);
      const isPastDay = isPast(day) && !isTodayDate;
      const dayOfWeek = day.getDay();

      const dateStr = format(cloneDay, 'yyyy-MM-dd');
      const completion = completions[dateStr];
      const canCheckIn = workout && workout.workoutType !== 'Rest' && (isTodayDate || isPastDay);

      // Status dot for checked-in days
      const statusDot = completion
        ? completion.status === 'full' ? 'bg-green-500'
        : completion.status === 'partial' ? 'bg-yellow-500'
        : 'bg-zinc-600'
        : null;

      days.push(
        <div
          key={day.toString()}
          className={cn(
            'min-h-[108px] p-2 border-b border-r border-[var(--color-separator)] flex flex-col',
            !isCurrentMonth ? 'opacity-30' : '',
            isTodayDate ? 'bg-[var(--color-accent)]/5' : '',
            workout?.workoutType === 'Race' ? 'bg-[var(--color-yellow)]/5' : '',
            workout && workout.workoutType !== 'Rest' ? 'cursor-pointer active:bg-[var(--color-surface-2)]' : ''
          )}
          onClick={() => { if (workout && workout.workoutType !== 'Rest') setSelectedWorkout(workout); }}
        >
          {/* Date number */}
          <div className="flex items-start justify-between">
            <span className={cn(
              'text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full',
              isTodayDate ? 'bg-[var(--color-accent)] text-black' : 'text-[var(--color-label-2)]'
            )}>
              {format(day, 'd')}
            </span>
            <div className="flex items-center gap-1">
              {statusDot && <div className={cn('w-1.5 h-1.5 rounded-full mt-1', statusDot)} />}
              {workout && workout.distanceKm && workout.distanceKm > 0 && (
                <span className="text-[9px] text-[var(--color-label-3)] mt-0.5">
                  {workout.distanceKm}k
                </span>
              )}
            </div>
          </div>

          {/* Workout badge + desc */}
          {workout && (
            <div className="mt-1.5 flex-1 space-y-1">
              <WorkoutBadge type={workout.workoutType} />
              {/* Taper / race-day overlay pill */}
              {workout.workoutType === 'Race' && (
                <span className="inline-block text-[8px] font-bold px-1 py-0.5 rounded bg-[var(--color-yellow)]/20 text-[var(--color-yellow)] leading-none">🏁 赛事</span>
              )}
              {workout.workoutType !== 'Race' && workout.description?.includes('【减量') && (
                <span className="inline-block text-[8px] font-bold px-1 py-0.5 rounded bg-[var(--color-orange)]/15 text-[var(--color-orange)] leading-none">↓ 减量</span>
              )}
              {workout.workoutType !== 'Race' && workout.description?.includes('赛后第') && (
                <span className="inline-block text-[8px] font-bold px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 leading-none">↺ 恢复</span>
              )}
              {workout.description?.startsWith('休假') && (
                <span className="inline-block text-[8px] font-bold px-1 py-0.5 rounded bg-zinc-700/60 text-zinc-400 leading-none">🏖 休假</span>
              )}
              {workout.description?.includes('【复训第') && (
                <span className="inline-block text-[8px] font-bold px-1 py-0.5 rounded bg-purple-500/15 text-purple-400 leading-none">↑ 复训</span>
              )}
              {workout.workoutType !== 'Rest' && (
                <p className="text-[9px] text-[var(--color-label-3)] line-clamp-2 leading-tight">
                  {workout.description.split(' - ')[0].replace(/【.*?】/, '')}
                </p>
              )}
            </div>
          )}

          {/* Check-in button */}
          {canCheckIn && (
            <button
              onClick={(e) => { e.stopPropagation(); setCheckInWorkout(workout); }}
              className={cn(
                'mt-1 w-full text-[9px] font-semibold rounded-md py-1 transition-colors',
                completion
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-label-3)]'
                  : 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
              )}
            >
              {completion ? '已打卡' : '打卡'}
            </button>
          )}

          {/* Weekly summary on Sunday */}
          {dayOfWeek === 0 && actualWeekVolume > 0 && (
            <div className="mt-1 pt-1 border-t border-[var(--color-separator)]">
              <p className="text-[9px] font-semibold text-[var(--color-accent)]">{actualWeekVolume}km</p>
            </div>
          )}
        </div>
      );
      day = addDays(day, 1);
    }

    const workoutWithPhase = weekWorkouts.find(w => w.weeklySummary?.tips);
    const showAdaptation = adaptation.checkedCount > 0;

    rows.push(
      <div key={day.toString()} className="flex flex-col">
        <div className="grid grid-cols-7">{days}</div>
        {(workoutWithPhase || showAdaptation) && (
          <div className="px-3 py-2 border-b border-[var(--color-separator)] space-y-1">
            {showAdaptation && (
              <div className={cn(
                'flex items-center gap-1.5 text-[10px] font-medium rounded-lg px-2 py-1.5',
                adaptation.factor < 1 ? 'text-[var(--color-orange)] bg-[var(--color-orange)]/8' :
                adaptation.factor > 1 ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/8' :
                'text-[var(--color-label-3)] bg-[var(--color-surface-2)]'
              )}>
                <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                上周 {adaptation.checkedCount}/{adaptation.totalWorkouts} 打卡 · {adaptation.advice}
              </div>
            )}
          </div>
        )}
      </div>
    );
    days = [];
  }

  return (
    <>
      {/* ── Header row ── */}
      <div className="flex items-center justify-between px-1 mb-4">
        {/* Segmented control */}
        <div className="flex items-center bg-[var(--color-surface)] rounded-xl p-0.5 gap-0.5">
          <button
            onClick={() => setCalView('calendar')}
            className={cn(
              'text-[13px] font-medium px-3.5 py-1.5 rounded-[10px] transition-all',
              calView === 'calendar'
                ? 'bg-[var(--color-surface-2)] text-white shadow-sm'
                : 'text-[var(--color-label-3)]'
            )}
          >
            日历
          </button>
          <button
            onClick={() => setCalView('log')}
            className={cn(
              'text-[13px] font-medium px-3.5 py-1.5 rounded-[10px] transition-all',
              calView === 'log'
                ? 'bg-[var(--color-surface-2)] text-white shadow-sm'
                : 'text-[var(--color-label-3)]'
            )}
          >
            日志
          </button>
        </div>
        {calView === 'calendar' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVacation(true)}
              className={cn(
                'flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-xl active:opacity-60 transition-opacity',
                vacations.length > 0
                  ? 'bg-purple-500/15 text-purple-400'
                  : 'bg-[var(--color-surface)] text-[var(--color-label-2)]'
              )}
            >
              <Umbrella className="w-3.5 h-3.5" />
              休假{vacations.length > 0 ? ` · ${vacations.length}` : ''}
            </button>
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 bg-[var(--color-surface)] text-[var(--color-label-2)] text-[12px] font-medium px-3 py-2 rounded-xl active:opacity-60 transition-opacity"
            >
              <Download className="w-3.5 h-3.5" />
              导出
            </button>
          </div>
        )}
      </div>

      {/* ── Log view ── */}
      {calView === 'log' && <TrainingLog />}

      {calView === 'calendar' && (<>

      {/* ── Vacation sheet ── */}
      {showVacation && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setShowVacation(false)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-t-3xl w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom duration-300"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-[var(--color-label-4)]" />
            </div>
            <div className="px-5 pt-2 pb-2">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-[18px] font-bold text-white">休假 / 断训</h2>
                  <p className="text-[11px] text-[var(--color-label-3)] mt-0.5">假期内课表自动替换为休息，回来后逐步恢复强度</p>
                </div>
                <button
                  onClick={() => setShowVacation(false)}
                  className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-label-2)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Existing vacations */}
              {vacations.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider mb-2">已标记假期</p>
                  <div className="bg-[var(--color-surface-2)] rounded-2xl overflow-hidden">
                    {vacations.map((v, idx) => {
                      const gapDays = Math.round((new Date(v.end).getTime() - new Date(v.start).getTime()) / 86400000) + 1;
                      const [sy, sm, sd] = v.start.split('-').map(Number);
                      const [ey, em, ed] = v.end.split('-').map(Number);
                      const sameYear = sy === ey;
                      const dateRange = sameYear
                        ? `${sm}月${sd}日 – ${em}月${ed}日`
                        : `${sy}年${sm}月${sd}日 – ${ey}年${em}月${ed}日`;
                      return (
                        <div
                          key={v.id}
                          className={cn('flex items-center justify-between px-4 py-3', idx < vacations.length - 1 && 'border-b border-[var(--color-separator)]')}
                        >
                          <div>
                            <p className="text-[13px] font-semibold text-white">{v.label || '休假'}</p>
                            <p className="text-[11px] text-[var(--color-label-3)] mt-0.5">{dateRange} · {gapDays} 天</p>
                          </div>
                          <button
                            onClick={() => removeVacation(v.id)}
                            className="w-8 h-8 flex items-center justify-center text-[var(--color-red)] active:opacity-60"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add new vacation */}
              <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider mb-2">添加假期</p>

              {/* Date row */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[11px] text-[var(--color-label-3)] block mb-1">开始日期</label>
                  <input
                    type="date"
                    value={vacStart}
                    onChange={e => { setVacStart(e.target.value); setVacError(''); }}
                    className="w-full bg-[var(--color-surface-2)] rounded-xl px-3 py-3 text-[14px] text-white outline-none border border-transparent focus:border-[var(--color-accent)]/40"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--color-label-3)] block mb-1">结束日期</label>
                  <input
                    type="date"
                    value={vacEnd}
                    min={vacStart || undefined}
                    onChange={e => { setVacEnd(e.target.value); setVacError(''); }}
                    className="w-full bg-[var(--color-surface-2)] rounded-xl px-3 py-3 text-[14px] text-white outline-none border border-transparent focus:border-[var(--color-accent)]/40"
                  />
                </div>
              </div>

              {/* Label */}
              <div className="mb-4">
                <label className="text-[11px] text-[var(--color-label-3)] block mb-1">备注（可选）</label>
                <input
                  type="text"
                  placeholder="例：春节、出差、欧洲游..."
                  value={vacLabel}
                  onChange={e => setVacLabel(e.target.value)}
                  className="w-full bg-[var(--color-surface-2)] rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-[var(--color-label-4)] outline-none border border-transparent focus:border-[var(--color-accent)]/40"
                />
              </div>

              {/* Return-period info */}
              {vacStart && vacEnd && vacEnd >= vacStart && (() => {
                const days = Math.round((new Date(vacEnd).getTime() - new Date(vacStart).getTime()) / 86400000) + 1;
                let info = '';
                if (days <= 7)       info = `假期 ${days} 天 · 回来后直接恢复正常训练`;
                else if (days <= 14) info = `假期 ${days} 天 · 回来后 1 周减量 15%`;
                else if (days <= 28) info = `假期 ${days} 天 · 回来后 2 周减量 25%`;
                else                 info = `假期 ${days} 天 · 回来后 3 周减量 40%`;
                return <p className="text-[11px] text-[var(--color-label-3)] bg-[var(--color-surface-2)] rounded-xl px-3 py-2.5 mb-4">{info}</p>;
              })()}

              {vacError && <p className="mb-3 text-[12px] text-[var(--color-red)]">{vacError}</p>}

              <button
                onClick={handleVacationSave}
                className="w-full bg-[var(--color-accent)] text-black font-bold py-3.5 rounded-2xl text-[15px] flex items-center justify-center gap-2"
              >
                <Umbrella className="w-4 h-4" /> 标记为休假
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export action sheet ── */}
      {showExport && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={icuView === 'menu' ? closeExport : undefined}
        >
          <div
            className="bg-[var(--color-surface)] rounded-t-3xl w-full max-w-lg pb-safe animate-in slide-in-from-bottom duration-250"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full bg-[var(--color-label-4)]" />
            </div>

            {/* ── Menu view ── */}
            {icuView === 'menu' && (
              <>
                <div className="px-5 pb-2">
                  <p className="text-[17px] font-semibold text-white mb-1">导出训练计划</p>
                  <p className="text-[12px] text-[var(--color-label-3)]">全部 {workoutCount} 节课程</p>
                </div>
                <div className="px-4 pb-8 space-y-2.5 mt-3">

                  {/* ICS */}
                  <button
                    onClick={() => { downloadICS(plan); closeExport(); }}
                    className="w-full flex items-center gap-4 bg-[var(--color-surface-2)] rounded-2xl px-4 py-4 active:opacity-70 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-blue)]/15 flex items-center justify-center flex-shrink-0">
                      <CalendarPlus className="w-5 h-5 text-[var(--color-blue)]" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-white">导入日历</p>
                      <p className="text-[12px] text-[var(--color-label-3)] mt-0.5">iOS 日历 · Google Calendar · Outlook</p>
                    </div>
                  </button>

                  {/* FIT ZIP */}
                  <button
                    onClick={() => { downloadAllFIT(plan); closeExport(); }}
                    className="w-full flex items-center gap-4 bg-[var(--color-surface-2)] rounded-2xl px-4 py-4 active:opacity-70 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/15 flex items-center justify-center flex-shrink-0">
                      <Download className="w-5 h-5 text-[var(--color-accent)]" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-white">Garmin / Polar / Suunto <span className="text-[12px] font-normal text-[var(--color-label-3)]">.fit × {workoutCount}</span></p>
                      <p className="text-[12px] text-[var(--color-label-3)] mt-0.5">下载 ZIP → 导入 Garmin Connect / Polar Flow</p>
                    </div>
                  </button>

                  {/* Intervals.icu sync */}
                  <button
                    onClick={() => setIcuView(icuApiKey ? 'setup' : 'setup')}
                    className="w-full flex items-center gap-4 bg-[var(--color-surface-2)] rounded-2xl px-4 py-4 active:opacity-70 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-purple)]/15 flex items-center justify-center flex-shrink-0">
                      <Activity className="w-5 h-5 text-[var(--color-purple)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-semibold text-white">同步到 Intervals.icu</p>
                        {icuApiKey && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)]">已连接</span>
                        )}
                      </div>
                      <p className="text-[12px] text-[var(--color-label-3)] mt-0.5">自动推送到 Garmin · COROS · Wahoo · Polar</p>
                    </div>
                  </button>

                  <button
                    onClick={closeExport}
                    className="w-full py-3.5 text-[15px] font-semibold text-[var(--color-label-2)] bg-[var(--color-surface-2)] rounded-2xl active:opacity-70"
                  >
                    取消
                  </button>
                </div>
              </>
            )}

            {/* ── Setup / confirm view ── */}
            {icuView === 'setup' && (
              <div className="px-5 pb-8">
                <div className="flex items-center gap-3 mb-5">
                  <button onClick={() => setIcuView('menu')} className="text-[var(--color-accent)] text-[14px]">← 返回</button>
                  <p className="text-[17px] font-semibold text-white">Intervals.icu 同步</p>
                </div>

                {icuApiKey ? (
                  // Already connected — show summary + confirm
                  <div className="space-y-4">
                    <div className="bg-[var(--color-surface-2)] rounded-2xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-[12px] text-[var(--color-label-3)]">已连接账号</p>
                        <p className="text-[14px] font-mono text-white mt-0.5">#{icuAthleteId}</p>
                      </div>
                      <button
                        onClick={() => { setIcuKeyInput(icuApiKey); setIcuIdInput(icuAthleteId); }}
                        className="text-[12px] text-[var(--color-accent)]"
                      >
                        修改
                      </button>
                    </div>
                    <p className="text-[12px] text-[var(--color-label-3)] leading-relaxed">
                      将推送 <span className="text-white font-semibold">{workoutCount} 节课</span>到你的 Intervals.icu 日历。确保已在 Intervals.icu 设置页连接了 Garmin / COROS 账号。
                    </p>
                    <button
                      onClick={() => handleICUSync(icuApiKey, icuAthleteId)}
                      className="w-full bg-[var(--color-accent)] text-black font-bold py-3.5 rounded-2xl text-[15px]"
                    >
                      开始同步 {workoutCount} 节课
                    </button>
                  </div>
                ) : (
                  // First time — show credential form
                  <div className="space-y-4">
                    <p className="text-[13px] text-[var(--color-label-2)] leading-relaxed">
                      在 <span className="text-white">intervals.icu → 设置 → Developer Settings</span> 生成 API Key，再从地址栏复制你的 Athlete ID（如 <span className="font-mono text-white">i12345</span>）。
                    </p>
                    <div>
                      <p className="text-[12px] text-[var(--color-label-3)] mb-1.5">API Key</p>
                      <input
                        type="text"
                        value={icuKeyInput}
                        onChange={e => setIcuKeyInput(e.target.value)}
                        placeholder="粘贴你的 API Key"
                        className="w-full bg-[var(--color-surface-2)] text-white rounded-xl px-4 py-3 text-[14px] font-mono outline-none border border-transparent focus:border-[var(--color-accent)] placeholder:text-[var(--color-label-4)]"
                      />
                    </div>
                    <div>
                      <p className="text-[12px] text-[var(--color-label-3)] mb-1.5">Athlete ID</p>
                      <input
                        type="text"
                        value={icuIdInput}
                        onChange={e => setIcuIdInput(e.target.value)}
                        placeholder="例如 i12345"
                        className="w-full bg-[var(--color-surface-2)] text-white rounded-xl px-4 py-3 text-[14px] font-mono outline-none border border-transparent focus:border-[var(--color-accent)] placeholder:text-[var(--color-label-4)]"
                      />
                    </div>
                    <button
                      onClick={() => handleICUSync(icuKeyInput.trim(), icuIdInput.trim())}
                      disabled={!icuKeyInput.trim() || !icuIdInput.trim()}
                      className="w-full bg-[var(--color-accent)] text-black font-bold py-3.5 rounded-2xl text-[15px] disabled:opacity-30"
                    >
                      连接并同步
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Syncing view ── */}
            {icuView === 'syncing' && icuProgress && (
              <div className="px-5 pb-12 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-[var(--color-accent)]/15 flex items-center justify-center mb-4 mt-2">
                  <Activity className="w-7 h-7 text-[var(--color-accent)] animate-pulse" />
                </div>
                <p className="text-[17px] font-semibold text-white mb-1">同步中…</p>
                <p className="text-[13px] text-[var(--color-label-3)] mb-5">
                  {icuProgress.current} / {icuProgress.total} 节课
                </p>
                {/* Progress bar */}
                <div className="w-full bg-[var(--color-surface-2)] rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-[var(--color-accent)] transition-all duration-200"
                    style={{ width: `${(icuProgress.current / icuProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Done view ── */}
            {icuView === 'done' && icuResult && (
              <div className="px-5 pb-10 flex flex-col items-center text-center">
                <div className={cn(
                  'w-14 h-14 rounded-full flex items-center justify-center mb-4 mt-2',
                  icuResult.failed === 0 ? 'bg-[var(--color-accent)]/15' : 'bg-[var(--color-orange)]/15'
                )}>
                  <CheckCircle2 className={cn('w-7 h-7', icuResult.failed === 0 ? 'text-[var(--color-accent)]' : 'text-[var(--color-orange)]')} />
                </div>
                {icuResult.failed === 0 ? (
                  <>
                    <p className="text-[17px] font-semibold text-white mb-1">同步完成 🎉</p>
                    <p className="text-[13px] text-[var(--color-label-3)] leading-relaxed">
                      {icuResult.success} 节课已推送到 Intervals.icu。<br/>打开 Intervals.icu App 确认课表，手表将在下次同步时收到。
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[17px] font-semibold text-white mb-1">部分同步失败</p>
                    <p className="text-[13px] text-[var(--color-label-3)] leading-relaxed">
                      成功 {icuResult.success} 节，失败 {icuResult.failed} 节。
                      {icuResult.firstError && <span className="block mt-1 font-mono text-[11px] text-[var(--color-red)]">{icuResult.firstError}</span>}
                    </p>
                  </>
                )}
                <button
                  onClick={closeExport}
                  className="mt-5 w-full bg-[var(--color-surface-2)] text-[var(--color-label-2)] font-semibold py-3.5 rounded-2xl text-[15px]"
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Today card ── */}
      {todayWorkout && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider mb-2 px-1">
            今天 · {format(new Date(), 'M月d日 EEEE', { locale: zhCN })}
          </p>
          <div
            className={cn(
              'rounded-2xl overflow-hidden',
              todayWorkout.workoutType === 'Rest'
                ? 'bg-[var(--color-surface)]'
                : 'bg-[var(--color-surface)] cursor-pointer active:opacity-80'
            )}
            onClick={() => todayWorkout.workoutType !== 'Rest' && setSelectedWorkout(todayWorkout)}
          >
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <WorkoutBadge type={todayWorkout.workoutType} />
                  {todayCompletion && (
                    <span className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                      todayCompletion.status === 'full'    ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]' :
                      todayCompletion.status === 'partial' ? 'bg-[var(--color-orange)]/15 text-[var(--color-orange)]' :
                                                             'bg-[var(--color-surface-3)] text-[var(--color-label-3)]'
                    )}>
                      {todayCompletion.status === 'full' ? '已完成' : todayCompletion.status === 'partial' ? '部分完成' : '已跳过'}
                    </span>
                  )}
                </div>
                {todayWorkout.distanceKm && todayWorkout.distanceKm > 0 && (
                  <span className="text-2xl font-bold text-white tabular-nums">{todayWorkout.distanceKm}<span className="text-sm font-normal text-[var(--color-label-3)] ml-0.5">km</span></span>
                )}
              </div>

              {todayWorkout.workoutType !== 'Rest' && (
                <div className="mt-3 flex items-center gap-4">
                  {todayWorkout.targetPace && (
                    <div>
                      <p className="text-[10px] text-[var(--color-label-3)] uppercase tracking-wider">目标配速</p>
                      <p className="text-sm font-mono font-medium text-white mt-0.5">{todayWorkout.targetPace}</p>
                    </div>
                  )}
                  {todayWorkout.targetHR && (
                    <div>
                      <p className="text-[10px] text-[var(--color-label-3)] uppercase tracking-wider">心率区间</p>
                      <p className="text-sm font-medium text-white mt-0.5">{todayWorkout.targetHR}</p>
                    </div>
                  )}
                  {weeksToRace > 0 && (
                    <div className="ml-auto">
                      <p className="text-[10px] text-[var(--color-label-3)] uppercase tracking-wider text-right">距比赛</p>
                      <p className="text-sm font-semibold text-white mt-0.5 text-right">{weeksToRace} 周</p>
                    </div>
                  )}
                </div>
              )}
              {todayWorkout.workoutType === 'Rest' && (
                <p className="text-sm text-[var(--color-label-2)] mt-2">休息或交叉训练 · 游泳、骑行、瑜伽均可</p>
              )}
            </div>

            {/* Check-in strip */}
            {todayWorkout.workoutType !== 'Rest' && (
              <button
                onClick={e => { e.stopPropagation(); setCheckInWorkout(todayWorkout); }}
                className={cn(
                  'w-full py-3 text-sm font-semibold transition-all',
                  todayCompletion
                    ? 'bg-[var(--color-surface-2)] text-[var(--color-label-2)]'
                    : 'bg-[var(--color-accent)] text-black'
                )}
              >
                {todayCompletion ? '修改打卡记录' : '完成打卡'}
              </button>
            )}
          </div>
        </div>
      )}

      {weeksToRace < 8 && (
        <div className="bg-[var(--color-red)]/10 border border-[var(--color-red)]/25 rounded-2xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="text-[var(--color-red)] w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-label-2)] leading-relaxed">
            <span className="text-[var(--color-red)] font-semibold">备赛时间不足 </span>
            距离比赛日仅剩 {weeksToRace} 周，已生成压缩版计划，请量力而行。
          </p>
        </div>
      )}

      {/* ACWR card */}
      <ACWRCard plan={plan} completions={completions} />

      <div className="bg-[var(--color-surface)] rounded-3xl overflow-hidden mb-8">
        {/* Monthly volume chart */}
        <div className="px-4 pt-5 pb-4 border-b border-[var(--color-separator)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> 月跑量
            </p>
            <span className="text-xs font-mono text-[var(--color-accent)]">
              {Math.round(currentMonthVolume * 10) / 10} km 本月
            </span>
          </div>
          <div className="flex items-end gap-1.5 h-24 w-full">
            {monthlyVolumes.map((m, i) => {
              const heightPct = Math.max(5, (m.volume / maxMonthlyVol) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center h-full group relative">
                  <div className="absolute -top-7 bg-[var(--color-surface-3)] text-white text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    {m.volume} km
                  </div>
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={cn('w-full rounded-sm transition-all duration-500', m.isCurrent ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-3)]')}
                      style={{ height: `${heightPct}%`, minHeight: '3px' }}
                    />
                  </div>
                  <div className={cn('text-[9px] font-medium mt-1', m.isCurrent ? 'text-[var(--color-accent)]' : 'text-[var(--color-label-3)]')}>
                    {m.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Calendar header */}
        <div className="px-4 py-4 border-b border-[var(--color-separator)] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              {format(currentMonth, 'yyyy年 M月', { locale: zhCN })}
            </h2>
          </div>
          <div className="flex gap-1">
            <button onClick={prevMonth} className="p-2 rounded-xl bg-[var(--color-surface-2)] active:bg-[var(--color-surface-3)] text-[var(--color-label-2)]">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={nextMonth} className="p-2 rounded-xl bg-[var(--color-surface-2)] active:bg-[var(--color-surface-3)] text-[var(--color-label-2)]">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-[var(--color-separator)]">
          {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
            <div key={d} className="py-2.5 text-center text-[10px] font-semibold text-[var(--color-label-3)] tracking-wider">{d}</div>
          ))}
        </div>

        <div>{rows}</div>
      </div>

      {/* Workout Detail Sheet */}
      {selectedWorkout && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--color-surface)] rounded-t-3xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 rounded-full bg-[var(--color-label-4)]" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-2 pb-4 border-b border-[var(--color-separator)] flex-shrink-0">
              <div>
                <p className="text-[12px] text-[var(--color-label-3)] mb-1">
                  {format(new Date(selectedWorkout.date), 'yyyy年MM月dd日 (EEEE)', { locale: zhCN })}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <WorkoutBadge type={selectedWorkout.workoutType} />
                  <span className="text-[13px] text-[var(--color-label-2)]">{selectedWorkout.description}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedWorkout(null)}
                className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-label-2)] flex-shrink-0 ml-3"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="px-5 pt-4 pb-2 overflow-y-auto flex-1 space-y-5">
              {selectedWorkout.weeklySummary && (
                <div className="bg-[var(--color-accent)]/8 rounded-2xl p-4">
                  <p className="text-[var(--color-accent)] text-[13px] font-semibold mb-1">
                    第 {selectedWorkout.weeklySummary.weekNum} 周 · {selectedWorkout.weeklySummary.phase}
                  </p>
                  <p className="text-[var(--color-label-2)] text-[12px] leading-relaxed">{selectedWorkout.weeklySummary.tips}</p>
                </div>
              )}

              {selectedWorkout.details ? (
                <>
                  {selectedWorkout.details.warmup && (
                    <SegmentBlock
                      title="热身准备"
                      icon={<Activity className="w-3.5 h-3.5 text-[var(--color-blue)]" />}
                      segment={selectedWorkout.details.warmup}
                    />
                  )}
                  {selectedWorkout.details.main.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Flame className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-label-3)]">主训练</p>
                      </div>
                      <div className="space-y-2 border-l-2 border-[var(--color-accent)]/25 ml-1.5 pl-4">
                        {selectedWorkout.details.main.map((seg, idx) => (
                          <div key={idx} className="bg-[var(--color-surface-2)] rounded-2xl p-4">
                            <div className="flex justify-between items-start">
                              <span className="text-[15px] font-semibold text-white">{seg.name}</span>
                              {(seg.distanceKm || seg.durationMins) && (
                                <span className="text-[12px] font-mono font-semibold bg-[var(--color-accent)]/10 text-[var(--color-accent)] px-2 py-0.5 rounded-lg ml-2 flex-shrink-0">
                                  {seg.distanceKm ? `${seg.distanceKm}km` : `${seg.durationMins}min`}
                                  {seg.reps && ` × ${seg.reps}组`}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
                              {seg.pace && <Metric label="目标配速" value={seg.pace} />}
                              {seg.hrZone && <Metric label="心率区间" value={seg.hrZone} />}
                              {seg.rest && <Metric label="恢复时间" value={seg.rest} />}
                            </div>
                            {seg.description && (
                              <p className="text-[12px] text-[var(--color-label-3)] mt-3 leading-relaxed">{seg.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedWorkout.details.cooldown && (
                    <SegmentBlock
                      title="冷身拉伸"
                      icon={<Footprints className="w-3.5 h-3.5 text-[var(--color-purple)]" />}
                      segment={selectedWorkout.details.cooldown}
                    />
                  )}
                </>
              ) : (
                <div className="text-center py-10 text-[var(--color-label-3)] text-[13px]">暂无详细训练步骤</div>
              )}
            </div>

            {/* Check-in CTA */}
            {selectedWorkout.workoutType !== 'Rest' && (
              <div className="px-5 pt-3 pb-6 flex-shrink-0 border-t border-[var(--color-separator)]">
                {(isSameDay(new Date(selectedWorkout.date), new Date()) || isPast(new Date(selectedWorkout.date))) ? (
                  <button
                    onClick={() => { setCheckInWorkout(selectedWorkout); setSelectedWorkout(null); }}
                    className="w-full bg-[var(--color-accent)] text-black font-bold py-3.5 rounded-2xl text-[15px]"
                  >
                    完成打卡
                  </button>
                ) : (
                  <p className="text-center text-[13px] text-[var(--color-label-3)] py-1">
                    课程预览 · 训练当天可在此打卡
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Check-in Modal */}
      {checkInWorkout && (
        <CheckInModal
          workout={checkInWorkout}
          existing={completions[format(new Date(checkInWorkout.date), 'yyyy-MM-dd')]}
          onSave={(status, rpe) => {
            logCompletion(format(new Date(checkInWorkout.date), 'yyyy-MM-dd'), status, rpe);
            setCheckInWorkout(null);
            const msg = getCheckInMessage(status, rpe, checkInWorkout.workoutType);
            showQuoteToast(msg);
          }}
          onClose={() => setCheckInWorkout(null)}
        />
      )}

      </>)}

      {/* Quote toast */}
      {quoteToast && (
        <div className="fixed bottom-24 left-4 right-4 z-[100] pointer-events-none" style={{ maxWidth: '512px', margin: '0 auto' }}>
          <div
            className="rounded-2xl px-4 py-4 shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-300"
            style={{
              background: 'linear-gradient(135deg, #1c2a1e 0%, #161e18 100%)',
              borderLeft: '3px solid var(--color-accent)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(50,215,75,0.18)',
            }}
          >
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(50,215,75,0.18)' }}>
                <CheckCircle2 className="w-4 h-4 text-[var(--color-accent)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] text-white leading-relaxed font-medium">「{quoteToast.text}」</p>
                <p className="text-[12px] mt-2 font-medium" style={{ color: 'rgba(50,215,75,0.7)' }}>— {quoteToast.author}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── ACWR helpers ────────────────────────────────────────────────────────────

interface ACWRResult {
  acwr: number;
  acuteKm: number;        // last 7 days
  chronicAvgKm: number;   // avg weekly km over last 28 days
  daysOfData: number;     // how many completed days we found
}

function computeACWR(
  plan: DailyWorkout[],
  completions: Record<string, { status: string }>
): ACWRResult | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // How many days ago the plan starts
  const planStart = new Date(plan[0].date);
  planStart.setHours(0, 0, 0, 0);
  const daysSincePlanStart = Math.floor((today.getTime() - planStart.getTime()) / 86400000);

  if (daysSincePlanStart < 0) return null;

  // Build a lookup of planned km × completion factor
  const dailyLoad: Record<string, number> = {};
  for (const w of plan) {
    const d = new Date(w.date);
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
    if (diff < 0 || diff > 27) continue; // only last 28 days

    const dateStr = format(d, 'yyyy-MM-dd');
    const comp = completions[dateStr];
    const planned = w.distanceKm ?? 0;

    let factor = 0;
    if (comp) {
      if (comp.status === 'full')    factor = 1.0;
      else if (comp.status === 'partial') factor = 0.5;
      else factor = 0; // skip
    } else if (diff === 0) {
      // today — count planned if not yet checked in
      factor = 0;
    } else {
      // past day, no check-in — assume completed if it's a planned workout
      factor = planned > 0 ? 1.0 : 0;
    }

    dailyLoad[dateStr] = planned * factor;
  }

  const daysOfData = Object.keys(dailyLoad).length;
  if (daysOfData < 7) return null;

  // Acute: sum of last 7 days
  let acuteKm = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = format(d, 'yyyy-MM-dd');
    acuteKm += dailyLoad[key] ?? 0;
  }

  // Chronic: avg weekly load over last 28 days (4 rolling weeks)
  let chronicTotal = 0;
  for (let week = 0; week < 4; week++) {
    let weekKm = 0;
    for (let day = 0; day < 7; day++) {
      const d = new Date(today);
      d.setDate(d.getDate() - (week * 7 + day));
      const key = format(d, 'yyyy-MM-dd');
      weekKm += dailyLoad[key] ?? 0;
    }
    chronicTotal += weekKm;
  }
  const chronicAvgKm = chronicTotal / 4;

  if (chronicAvgKm < 0.5) return null; // avoid division-by-zero / meaningless ratio

  const acwr = Math.round((acuteKm / chronicAvgKm) * 100) / 100;

  return { acwr, acuteKm: Math.round(acuteKm * 10) / 10, chronicAvgKm: Math.round(chronicAvgKm * 10) / 10, daysOfData };
}

function getACWRZone(acwr: number): { label: string; advice: string; color: string; bgColor: string } {
  if (acwr < 0.8)  return { label: '训练不足', advice: '本周跑量偏低，可适当增加轻松跑强度。', color: '#0A84FF', bgColor: 'rgba(10,132,255,0.12)' };
  if (acwr <= 1.3) return { label: '安全区间', advice: '当前负荷科学合理，保持节奏即可。',        color: '#32D74B', bgColor: 'rgba(50,215,75,0.12)' };
  if (acwr <= 1.5) return { label: '负荷偏高', advice: '急性负荷偏高，建议今明两天安排轻松恢复跑。', color: '#FF9F0A', bgColor: 'rgba(255,159,10,0.12)' };
  return             { label: '危险区间', advice: '过度训练风险高！请立即减量并充分休息。',         color: '#FF453A', bgColor: 'rgba(255,69,58,0.12)' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ACWRCard({ plan, completions }: { plan: DailyWorkout[]; completions: Record<string, { status: string }> }) {
  const result = computeACWR(plan, completions);

  if (!result) {
    return (
      <div className="bg-[var(--color-surface)] rounded-2xl p-4 mb-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--color-blue)]/15 flex items-center justify-center flex-shrink-0">
          <Activity className="w-4 h-4 text-[var(--color-blue)]" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-white">急慢性负荷比 · 数据积累中</p>
          <p className="text-[11px] text-[var(--color-label-3)] mt-0.5">完成至少 7 天训练记录后显示</p>
        </div>
      </div>
    );
  }

  const { acwr, acuteKm, chronicAvgKm } = result;
  const zone = getACWRZone(acwr);

  // Zone bar: <0.8 blue | 0.8-1.3 green | 1.3-1.5 orange | >1.5 red
  // Map acwr (0 to 2.0) to position percentage (0% to 100%)
  const markerPct = Math.min(Math.max((acwr / 2.0) * 100, 2), 98);

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl p-4 mb-4" style={{ borderLeft: `3px solid ${zone.color}` }}>
      {/* Title row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" style={{ color: zone.color }} />
          <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider">急慢性负荷比 ACWR</p>
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: zone.color, backgroundColor: zone.bgColor }}
        >
          {zone.label}
        </span>
      </div>

      {/* ACWR value + stats */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-[32px] font-bold font-mono leading-none" style={{ color: zone.color }}>{acwr.toFixed(2)}</p>
          <p className="text-[11px] text-[var(--color-label-3)] mt-1">{zone.advice}</p>
        </div>
        <div className="text-right space-y-1">
          <div>
            <p className="text-[9px] text-[var(--color-label-3)] uppercase tracking-wider">急性 7天</p>
            <p className="text-[13px] font-mono font-semibold text-white">{acuteKm} km</p>
          </div>
          <div>
            <p className="text-[9px] text-[var(--color-label-3)] uppercase tracking-wider">慢性 28天均值</p>
            <p className="text-[13px] font-mono font-semibold text-white">{chronicAvgKm} km/周</p>
          </div>
        </div>
      </div>

      {/* Horizontal zone bar */}
      <div className="relative h-2 rounded-full overflow-hidden flex">
        <div className="flex-none w-[40%] bg-[#0A84FF]/50" />   {/* <0.8 undertraining */}
        <div className="flex-none w-[25%] bg-[#32D74B]/70" />   {/* 0.8-1.3 safe */}
        <div className="flex-none w-[10%] bg-[#FF9F0A]/70" />   {/* 1.3-1.5 caution */}
        <div className="flex-none w-[25%] bg-[#FF453A]/50" />   {/* >1.5 danger */}
        {/* Marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 rounded-full bg-white shadow-md"
          style={{ left: `${markerPct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-[var(--color-label-3)]">0.0</span>
        <span className="text-[9px] text-[var(--color-label-3)]">0.8</span>
        <span className="text-[9px] text-[var(--color-label-3)]">1.3</span>
        <span className="text-[9px] text-[var(--color-label-3)]">1.5</span>
        <span className="text-[9px] text-[var(--color-label-3)]">2.0</span>
      </div>
    </div>
  );
}

function SegmentBlock({ title, icon, segment }: { title: string; icon: ReactNode; segment: WorkoutSegment }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-label-3)]">{title}</p>
      </div>
      <div className="bg-[var(--color-surface-2)] rounded-2xl p-4">
        <p className="text-[15px] font-semibold text-white">{segment.name}</p>
        <div className="flex gap-4 mt-2">
          {segment.pace && <Metric label="配速" value={segment.pace} />}
          {segment.hrZone && <Metric label="心率" value={segment.hrZone} />}
        </div>
        {segment.description && (
          <p className="text-[12px] text-[var(--color-label-3)] mt-3 leading-relaxed">{segment.description}</p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-[var(--color-label-3)]">{label}</span>
      <span className="text-[13px] font-mono font-medium text-white mt-0.5">{value}</span>
    </div>
  );
}

function WorkoutBadge({ type }: { type: string }) {
  // Apple system colors — no borders, filled pills
  const styles: Record<string, string> = {
    LSD:            'bg-[#BF5AF2]/20 text-[#BF5AF2]',
    Tempo:          'bg-[#FF9F0A]/20 text-[#FF9F0A]',
    TempoIntervals: 'bg-[#FF9F0A]/15 text-[#FFB340]',
    Interval:       'bg-[#FF453A]/20 text-[#FF453A]',
    Fartlek:        'bg-[#FF375F]/15 text-[#FF375F]',
    Hills:          'bg-[#FFD60A]/15 text-[#FFD60A]',
    Progression:    'bg-[#5E5CE6]/20 text-[#7D7AFF]',
    Cruise:         'bg-[#5AC8FA]/15 text-[#5AC8FA]',
    Easy:           'bg-[#0A84FF]/15 text-[#0A84FF]',
    Recovery:       'bg-[#636366]/25 text-[#EBEBF5]/60',
    MP:             'bg-[#32D74B]/15 text-[#32D74B]',
    Rest:           'bg-[#636366]/20 text-[#EBEBF5]/40',
    Race:           'bg-[#FFD60A]/20 text-[#FFD60A]',
  };

  const labels: Record<string, string> = {
    LSD:            'LSD长跑',
    Tempo:          '节奏跑',
    TempoIntervals: '节奏间歇',
    Interval:       '间歇跑',
    Fartlek:        '法特莱克',
    Hills:          '坡度跑',
    Progression:    '渐进跑',
    Cruise:         '巡航间歇',
    Easy:           '轻松跑',
    Recovery:       '恢复跑',
    MP:             '马拉松配速',
    Rest:           '休息',
    Race:           '比赛日',
  };

  return (
    <span className={cn('inline-block px-2 py-0.5 rounded-md text-[9px] font-semibold tracking-wide', styles[type] || styles.Rest)}>
      {labels[type] || type}
    </span>
  );
}
