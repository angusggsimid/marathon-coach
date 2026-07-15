import type { ReactNode } from 'react';
import { TrainingLog } from './TrainingLog';
import { useStore, RPE_LABELS, RPE_COLORS } from '../store/useStore';
import { useBasePlan, useEffectivePlan } from '../hooks/useEffectivePlan';
import type { RPELevel, CompletionStatus } from '../store/useStore';
import { getCheckInMessage } from '../utils/checkin-messages';
import type { CheckInMessage } from '../utils/checkin-messages';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Activity, Footprints, Flame, AlertTriangle, CheckCircle2, CalendarPlus, Download, Umbrella, Trash2, Share2, Copy, ChevronDown } from 'lucide-react';
import { downloadICS } from '../utils/export-ics';
import {
  ICU_IDEMPOTENT_SYNC_PROVEN,
  ICU_RESYNC_WARNING,
  syncPlanToICU,
} from '../utils/intervals-icu';
import type { ICUSyncProgress } from '../utils/intervals-icu';
import { format, startOfWeek, addDays, addMonths, isSameMonth, isSameDay, startOfMonth, endOfMonth, endOfWeek, differenceInWeeks, isPast, isToday } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import type { DailyWorkout, WorkoutSegment } from '../utils/training-engine';
import { cn } from '../utils/cn';
import {
  buildWeekSnapshot,
  formatWeeklyReportText,
} from '../utils/week-snapshot';
import {
  isChannelStale,
  isFitChannelStale,
  planFingerprint,
  type FitExportRange,
} from '../utils/plan-fingerprint';
import {
  buildFitRangeOptions,
  downloadFitByRange,
} from '../utils/fit-export-range';
import type { ICUSyncResult } from '../utils/intervals-icu';

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
type ICUView = 'menu' | 'fit-range' | 'setup' | 'syncing' | 'done';

export function CalendarView() {
  const {
    profile, completions, logCompletion, getWeeklyAdaptation,
    icuApiKey, icuAthleteId, saveICUCredentials, clearICUCredentials,
    vacations, addVacation, removeVacation, myRaces,
    exportSync, markExportSuccess,
  } = useStore();
  const basePlan = useBasePlan();
  const plan = useEffectivePlan();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedWorkout, setSelectedWorkout] = useState<DailyWorkout | null>(null);
  const [checkInWorkout, setCheckInWorkout] = useState<DailyWorkout | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [calView, setCalView] = useState<'week' | 'calendar' | 'log'>('week');
  const [quoteToast, setQuoteToast] = useState<CheckInMessage | null>(null);
  const [proofExpanded, setProofExpanded] = useState(false);
  // 周日/周一默认展开周报权重；其余折叠，用户可手动开
  const [reportExpanded, setReportExpanded] = useState(() => {
    const d = new Date().getDay();
    return d === 0 || d === 1;
  });
  const [reportCopyState, setReportCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');

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
  const [icuResult, setIcuResult] = useState<ICUSyncResult | null>(null);
  const [icuAckDuplicate, setIcuAckDuplicate] = useState(false);

  const workoutCount = plan.filter(w => w.workoutType !== 'Rest').length;
  const currentPlanFp = useMemo(() => planFingerprint(plan), [plan]);
  // 同一 snapshot：basePlan 算系数，effectivePlan 供本周关键课距离
  const weekSnap = useMemo(
    () => buildWeekSnapshot(basePlan, completions, new Date(), plan),
    [basePlan, completions, plan],
  );
  const fitOptions = useMemo(() => buildFitRangeOptions(plan), [plan]);
  const staleFit = isFitChannelStale(exportSync?.fit, plan);
  const staleIcs = isChannelStale(exportSync?.ics, currentPlanFp);
  const staleIcu = isChannelStale(exportSync?.icu, currentPlanFp);
  const hasAnyStale = staleFit || staleIcs || staleIcu;
  const everSyncedIcu = !!exportSync?.icu?.exportedAt;

  const handleICUSync = async (apiKey: string, athleteId: string) => {
    saveICUCredentials(apiKey, athleteId);
    setIcuView('syncing');
    setIcuProgress({ current: 0, total: workoutCount });
    const result = await syncPlanToICU(plan, apiKey, athleteId, setIcuProgress);
    setIcuResult(result);
    // 仅全量成功才记渠道元数据；部分成功保留 stale
    if (result.allSucceeded) {
      markExportSuccess('icu', currentPlanFp);
    }
    setIcuView('done');
  };

  const handleFitExport = (range: FitExportRange) => {
    const res = downloadFitByRange(plan, range);
    if (res.ok) {
      // 传入 effectivePlan：按范围切片记指纹，不覆盖其他 range 槽位
      markExportSuccess('fit', plan, range);
      closeExport();
    }
  };

  const handleIcsExport = () => {
    downloadICS(plan);
    markExportSuccess('ics', currentPlanFp);
    closeExport();
  };

  const copyWeeklyReport = async () => {
    const text = formatWeeklyReportText(weekSnap);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) throw new Error('copy failed');
      }
      setReportCopyState('ok');
      setTimeout(() => setReportCopyState('idle'), 2200);
    } catch {
      setReportCopyState('fail');
      setTimeout(() => setReportCopyState('idle'), 3200);
    }
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
    setTimeout(() => {
      setIcuView('menu');
      setIcuProgress(null);
      setIcuResult(null);
      setIcuAckDuplicate(false);
    }, 300);
  };

  const copyShareText = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareText);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = shareText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2200);
  };

  const sharePlan = async () => {
    if (navigator.share) {
      await navigator.share({ title: '我的马拉松备赛计划', text: shareText });
      return;
    }
    await copyShareText();
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

  const raceDateParts = profile.raceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const raceDateLocal = raceDateParts
    ? new Date(+raceDateParts[1], +raceDateParts[2] - 1, +raceDateParts[3])
    : new Date(profile.raceDate);
  const weeksToRace = differenceInWeeks(raceDateLocal, new Date());

  // Today's workout
  const todayWorkout = plan.find(w => isSameDay(new Date(w.date), new Date()));
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayCompletion = completions[todayStr];
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const currentWeekWorkouts = plan
    .filter(w => {
      const d = new Date(w.date);
      return d >= currentWeekStart && d <= currentWeekEnd;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const currentWeekVolume = Math.round(currentWeekWorkouts.reduce((sum, w) => sum + (w.distanceKm || 0), 0) * 10) / 10;
  const currentWeekWorkoutCount = currentWeekWorkouts.filter(w => w.workoutType !== 'Rest').length;
  const targetRace = myRaces.find(r => r.date === profile.raceDate && !r.dateTBD);
  const targetRaceName = targetRace?.name ?? (profile.raceType === 'full' ? '全马目标赛' : '半马目标赛');
  const shareText = [
    `我正在备赛：${targetRaceName}`,
    `比赛日：${profile.raceDate}`,
    `本周计划：${currentWeekVolume}km · ${currentWeekWorkoutCount} 节课`,
    todayWorkout ? `今天训练：${workoutTitle(todayWorkout)}${todayWorkout.distanceKm ? ` · ${todayWorkout.distanceKm}km` : ''}` : '今天训练：未安排',
    '用马拉松备赛生成训练计划',
  ].join('\n');

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
            'min-h-[92px] p-1.5 border-b border-r border-[var(--color-separator)] flex flex-col',
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
              'text-[13px] font-semibold w-6 h-6 flex items-center justify-center rounded-full',
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

          {/* Workout summary */}
          {workout && (
            <div className="mt-1.5 flex-1">
              <CalendarWorkoutPill type={workout.workoutType} />
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
                'flex items-start gap-1.5 text-[10px] font-medium rounded-lg px-2 py-1.5 leading-relaxed break-words',
                adaptation.factor < 1 ? 'text-[var(--color-orange)] bg-[var(--color-orange)]/8' :
                adaptation.factor > 1 ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/8' :
                'text-[var(--color-label-3)] bg-[var(--color-surface-2)]'
              )}>
                <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" />
                <span className="min-w-0">
                  该周 {adaptation.checkedCount}/{adaptation.totalWorkouts} 打卡 · {adaptation.advice}
                </span>
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
            onClick={() => setCalView('week')}
            className={cn(
              'text-[13px] font-medium px-3 py-1.5 rounded-[10px] transition-all',
              calView === 'week'
                ? 'bg-[var(--color-surface-2)] text-white shadow-sm'
                : 'text-[var(--color-label-3)]'
            )}
          >
            本周
          </button>
          <button
            onClick={() => setCalView('calendar')}
            className={cn(
              'text-[13px] font-medium px-3 py-1.5 rounded-[10px] transition-all',
              calView === 'calendar'
                ? 'bg-[var(--color-surface-2)] text-white shadow-sm'
                : 'text-[var(--color-label-3)]'
            )}
          >
            月历
          </button>
          <button
            onClick={() => setCalView('log')}
            className={cn(
              'text-[13px] font-medium px-3 py-1.5 rounded-[10px] transition-all',
              calView === 'log'
                ? 'bg-[var(--color-surface-2)] text-white shadow-sm'
                : 'text-[var(--color-label-3)]'
            )}
          >
            日志
          </button>
        </div>
        {calView !== 'log' && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowShare(true)}
              aria-label="分享计划"
              title="分享计划"
              className="w-9 h-9 bg-[var(--color-surface)] text-[var(--color-label-2)] rounded-xl flex items-center justify-center active:opacity-60 transition-opacity"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowVacation(true)}
              className={cn(
                'flex items-center gap-1 text-[12px] font-medium px-2.5 py-2 rounded-xl active:opacity-60 transition-opacity',
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
              className="flex items-center gap-1 bg-[var(--color-surface)] text-[var(--color-label-2)] text-[12px] font-medium px-2.5 py-2 rounded-xl active:opacity-60 transition-opacity"
            >
              <Download className="w-3.5 h-3.5" />
              导出
            </button>
          </div>
        )}
      </div>

      {/* ── Log view ── */}
      {calView === 'log' && <TrainingLog />}

      {calView !== 'log' && (<>

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
          onClick={icuView === 'menu' || icuView === 'fit-range' ? closeExport : undefined}
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
                  <p className="text-[12px] text-[var(--color-label-3)]">使用最新有效计划 · 共 {workoutCount} 节可导出</p>
                </div>
                <div className="px-4 pb-8 space-y-2.5 mt-3">

                  {/* ICS */}
                  <button
                    onClick={handleIcsExport}
                    className="w-full flex items-center gap-4 bg-[var(--color-surface-2)] rounded-2xl px-4 py-4 active:opacity-70 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-blue)]/15 flex items-center justify-center flex-shrink-0">
                      <CalendarPlus className="w-5 h-5 text-[var(--color-blue)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-white">导入日历</p>
                      <p className="text-[12px] text-[var(--color-label-3)] mt-0.5">iOS 日历 · Google Calendar · Outlook</p>
                    </div>
                  </button>

                  {/* FIT：进入范围选择 */}
                  <button
                    onClick={() => setIcuView('fit-range')}
                    className="w-full flex items-center gap-4 bg-[var(--color-surface-2)] rounded-2xl px-4 py-4 active:opacity-70 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/15 flex items-center justify-center flex-shrink-0">
                      <Download className="w-5 h-5 text-[var(--color-accent)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-white">Garmin / Polar / Suunto <span className="text-[12px] font-normal text-[var(--color-label-3)]">.fit</span></p>
                      <p className="text-[12px] text-[var(--color-label-3)] mt-0.5">今天 / 本周 / 全部 · 显示文件数</p>
                    </div>
                  </button>

                  {/* Intervals.icu sync */}
                  <button
                    onClick={() => { setIcuAckDuplicate(false); setIcuView('setup'); }}
                    className="w-full flex items-center gap-4 bg-[var(--color-surface-2)] rounded-2xl px-4 py-4 active:opacity-70 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-purple)]/15 flex items-center justify-center flex-shrink-0">
                      <Activity className="w-5 h-5 text-[var(--color-purple)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[15px] font-semibold text-white">同步到 Intervals.icu</p>
                        {icuApiKey && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)]">已连接</span>
                        )}
                      </div>
                      <p className="text-[12px] text-[var(--color-label-3)] mt-0.5">
                        {ICU_IDEMPOTENT_SYNC_PROVEN
                          ? '自动推送到 Garmin · COROS · Wahoo · Polar'
                          : '手动同步 · 重复推送可能产生重复事件'}
                      </p>
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

            {/* ── FIT range picker ── */}
            {icuView === 'fit-range' && (
              <div className="px-5 pb-8">
                <div className="flex items-center gap-3 mb-4">
                  <button type="button" onClick={() => setIcuView('menu')} className="text-[var(--color-accent)] text-[14px]">← 返回</button>
                  <p className="text-[17px] font-semibold text-white">导出 FIT 范围</p>
                </div>
                <p className="text-[12px] text-[var(--color-label-3)] mb-3 leading-relaxed">
                  使用最新有效计划（含赛事覆盖、休假与周自适应）。ZIP 文件名含范围与日期。
                </p>
                <div className="space-y-2">
                  {fitOptions.map(opt => (
                    <button
                      key={opt.range}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => handleFitExport(opt.range)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left border transition-opacity',
                        opt.disabled
                          ? 'bg-[var(--color-surface-2)]/60 border-transparent opacity-50 cursor-not-allowed'
                          : 'bg-[var(--color-surface-2)] border-transparent active:opacity-70',
                      )}
                    >
                      <Download className={cn('w-4 h-4 flex-shrink-0', opt.disabled ? 'text-[var(--color-label-4)]' : 'text-[var(--color-accent)]')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-white">{opt.label}</p>
                        <p className="text-[12px] text-[var(--color-label-3)] mt-0.5">
                          {opt.disabled
                            ? (opt.disabledReason ?? '无可导出文件')
                            : `${opt.fileCount} 个 .fit 文件`}
                        </p>
                      </div>
                      {!opt.disabled && (
                        <span className="text-[12px] font-semibold text-[var(--color-accent)] tabular-nums flex-shrink-0">
                          ×{opt.fileCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
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
                    <p className="text-[11px] text-[var(--color-orange)]/90 leading-relaxed">
                      安全提示：API Key 仅保留在当前页面会话，不会写入本地存储。关闭标签页后需重新粘贴。
                    </p>
                    {!ICU_IDEMPOTENT_SYNC_PROVEN && everSyncedIcu && (
                      <div className="rounded-xl border border-[var(--color-orange)]/30 bg-[var(--color-orange)]/10 px-3 py-2.5">
                        <p className="text-[11px] text-[var(--color-orange)] leading-relaxed font-medium">
                          {ICU_RESYNC_WARNING}
                        </p>
                        <label className="mt-2 flex items-start gap-2 text-[11px] text-[var(--color-label-2)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={icuAckDuplicate}
                            onChange={e => setIcuAckDuplicate(e.target.checked)}
                            className="mt-0.5"
                          />
                          <span>我已了解可能产生重复事件，并已自行清理或接受风险</span>
                        </label>
                      </div>
                    )}
                    <button
                      onClick={() => handleICUSync(icuApiKey, icuAthleteId)}
                      disabled={!ICU_IDEMPOTENT_SYNC_PROVEN && everSyncedIcu && !icuAckDuplicate}
                      className="w-full bg-[var(--color-accent)] text-black font-bold py-3.5 rounded-2xl text-[15px] disabled:opacity-30"
                    >
                      {everSyncedIcu && !ICU_IDEMPOTENT_SYNC_PROVEN
                        ? `确认后再次同步 ${workoutCount} 节课`
                        : `开始同步 ${workoutCount} 节课`}
                    </button>
                    <button
                      type="button"
                      onClick={() => { clearICUCredentials(); setIcuKeyInput(''); }}
                      className="w-full py-3 text-[13px] font-medium text-[var(--color-label-2)] bg-[var(--color-surface-2)] rounded-2xl"
                    >
                      清除本页密钥
                    </button>
                  </div>
                ) : (
                  // First time — show credential form
                  <div className="space-y-4">
                    <p className="text-[13px] text-[var(--color-label-2)] leading-relaxed">
                      在 <span className="text-white">intervals.icu → 设置 → Developer Settings</span> 生成 API Key，再从地址栏复制你的 Athlete ID（如 <span className="font-mono text-white">i12345</span>）。
                    </p>
                    <p className="text-[11px] text-[var(--color-orange)]/90 leading-relaxed">
                      安全提示：API Key 仅保留在当前页面会话，不会写入本地存储；Athlete ID 可记住以便下次填写。
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
                  icuResult.allSucceeded ? 'bg-[var(--color-accent)]/15' : 'bg-[var(--color-orange)]/15'
                )}>
                  <CheckCircle2 className={cn('w-7 h-7', icuResult.allSucceeded ? 'text-[var(--color-accent)]' : 'text-[var(--color-orange)]')} />
                </div>
                {icuResult.allSucceeded ? (
                  <>
                    <p className="text-[17px] font-semibold text-white mb-1">同步完成 🎉</p>
                    <p className="text-[13px] text-[var(--color-label-3)] leading-relaxed">
                      {icuResult.success} 节课已推送到 Intervals.icu。<br/>打开 Intervals.icu App 确认课表，手表将在下次同步时收到。
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[17px] font-semibold text-white mb-1">
                      {icuResult.success > 0 ? '部分同步失败' : '同步失败'}
                    </p>
                    <p
                      className="text-[13px] text-[var(--color-label-3)] leading-relaxed"
                      data-testid="icu-partial-result"
                    >
                      成功 {icuResult.success} 节，失败 {icuResult.failed} 节
                      {icuResult.total > 0 ? `（共 ${icuResult.total} 节）` : ''}。
                      {icuResult.success > 0 && (
                        <span className="block mt-1 text-[var(--color-orange)]">
                          未全部成功，不标记为已同步；计划过期提醒仍保留。
                        </span>
                      )}
                      {icuResult.firstError && (
                        <span className="block mt-1 font-mono text-[11px] text-[var(--color-red)]">
                          {icuResult.firstError}
                        </span>
                      )}
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

      {/* ── Share sheet ── */}
      {showShare && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setShowShare(false)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-t-3xl w-full max-w-lg pb-safe animate-in slide-in-from-bottom duration-250"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full bg-[var(--color-label-4)]" />
            </div>
            <div className="px-5 pb-8">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[17px] font-semibold text-white">分享备赛计划</p>
                  <p className="text-[12px] text-[var(--color-label-3)] mt-0.5">适合发给跑友或发到小红书草稿</p>
                </div>
                <button
                  onClick={() => setShowShare(false)}
                  aria-label="关闭分享"
                  className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-label-2)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="rounded-3xl p-5 mb-4 bg-[var(--color-surface-2)] border border-[var(--color-separator)]">
                <p className="text-[12px] font-semibold text-[var(--color-accent)] mb-2">我的马拉松备赛</p>
                <h3 className="text-[20px] font-bold text-white leading-snug">{targetRaceName}</h3>
                <p className="text-[12px] text-[var(--color-label-3)] mt-1">比赛日 {profile.raceDate} · 距比赛 {Math.max(weeksToRace, 0)} 周</p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <ShareMetric label="本周跑量" value={`${currentWeekVolume} km`} />
                  <ShareMetric label="训练课" value={`${currentWeekWorkoutCount} 节`} />
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--color-separator)]">
                  <p className="text-[11px] text-[var(--color-label-3)] mb-1">今天</p>
                  <p className="text-[14px] font-semibold text-white">
                    {todayWorkout ? workoutTitle(todayWorkout) : '未安排训练'}
                    {todayWorkout?.distanceKm ? ` · ${todayWorkout.distanceKm}km` : ''}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={sharePlan}
                  className="bg-[var(--color-accent)] text-black font-bold py-3.5 rounded-2xl text-[14px] flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" /> 系统分享
                </button>
                <button
                  onClick={copyShareText}
                  className="bg-[var(--color-surface-2)] text-[var(--color-label-2)] font-semibold py-3.5 rounded-2xl text-[14px] flex items-center justify-center gap-2"
                >
                  {shareCopied ? <CheckCircle2 className="w-4 h-4 text-[var(--color-accent)]" /> : <Copy className="w-4 h-4" />}
                  {shareCopied ? '已复制' : '复制文案'}
                </button>
              </div>
            </div>
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

      {/* 本周状态区：证明 + 周报 + 过期提醒（非三张等重卡片） */}
      {calView === 'week' && (
        <div className="mb-3 space-y-2 min-w-0" data-testid="week-status">
          {/* A. 三行证明：仅 factor≠1 且 active */}
          {weekSnap.showProofCard && weekSnap.proof && (
            <div
              className={cn(
                'rounded-2xl px-3 py-2.5 text-[12px] leading-relaxed break-words min-w-0',
                weekSnap.factor < 1
                  ? 'text-[var(--color-orange)] bg-[var(--color-orange)]/10 border border-[var(--color-orange)]/25'
                  : 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/25',
              )}
              data-testid="adaptation-proof"
            >
              <p className="font-semibold">① 改了什么：{weekSnap.proof.change}</p>
              <p className="mt-1 font-medium opacity-95">② 依据什么：{weekSnap.proof.evidence}</p>
              <p className="mt-1 font-medium opacity-95">③ 什么没变：{weekSnap.proof.unchanged}</p>
              <button
                type="button"
                aria-expanded={proofExpanded}
                onClick={() => setProofExpanded(v => !v)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold opacity-90 underline-offset-2 hover:underline"
              >
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', proofExpanded && 'rotate-180')} />
                {proofExpanded ? '收起证据' : '展开证据'}
              </button>
              {proofExpanded && (
                <div className="mt-2 pt-2 border-t border-current/15 text-[11px] font-normal opacity-90 space-y-0.5">
                  <p>上一完整周：{weekSnap.prevWeekStart} ~ {weekSnap.prevWeekEnd}</p>
                  <p>打卡 {weekSnap.checkedCount}/{weekSnap.planWorkoutCount} · 完成率 {Math.round(weekSnap.completionRate * 100)}%</p>
                  <p>平均 RPE：{weekSnap.avgRpe.toFixed(1)}（{weekSnap.avgRpeLabel}）</p>
                  <p>本周作用范围：{weekSnap.targetWeekStart} ~ {weekSnap.targetWeekEnd}</p>
                  <p className="opacity-80">{weekSnap.advice}</p>
                </div>
              )}
            </div>
          )}

          {/* B. 轻量周报（折叠；周日/周一略加重） */}
          <div
            className={cn(
              'rounded-2xl px-3 py-2 min-w-0 border',
              weekSnap.highlightReport
                ? 'bg-[var(--color-surface)] border-[var(--color-separator)]'
                : 'bg-[var(--color-surface)]/70 border-transparent',
            )}
            data-testid="weekly-report"
          >
            <button
              type="button"
              aria-expanded={reportExpanded}
              onClick={() => setReportExpanded(v => !v)}
              className="w-full flex items-center justify-between gap-2 text-left min-w-0"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider">
                  上周 60 秒小结
                  {weekSnap.highlightReport ? ' · 周末回顾' : ''}
                </p>
                <p className="text-[13px] font-medium text-white truncate mt-0.5">
                  {weekSnap.hasCheckins
                    ? weekSnap.factor === 1 || !weekSnap.adaptationActive
                      ? '计划保持 · 可查看完成与体感'
                      : weekSnap.proof?.change ?? '已根据上周打卡调整'
                    : '暂无打卡 · 补记后生成周报'}
                </p>
              </div>
              <ChevronDown className={cn(
                'w-4 h-4 text-[var(--color-label-3)] flex-shrink-0 transition-transform',
                reportExpanded && 'rotate-180',
              )} />
            </button>
            {reportExpanded && (
              <div className="mt-2 pt-2 border-t border-[var(--color-separator)] space-y-1.5">
                {weekSnap.emptyMessage ? (
                  <div className="space-y-2">
                    <p className="text-[12px] text-[var(--color-label-2)] leading-relaxed">{weekSnap.emptyMessage}</p>
                    <button
                      type="button"
                      onClick={() => setCalView('log')}
                      className="text-[12px] font-semibold text-[var(--color-accent)]"
                    >
                      去补记打卡
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {weekSnap.reportLines.map((line, i) => (
                      <li key={i} className="text-[12px] text-[var(--color-label-2)] leading-relaxed break-words">
                        · {line}
                      </li>
                    ))}
                  </ul>
                )}
                {!weekSnap.showProofCard && weekSnap.hasCheckins && weekSnap.factor === 1 && (
                  <p className="text-[11px] text-[var(--color-label-3)]">保持计划，无强调调整卡。</p>
                )}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={copyWeeklyReport}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-accent)] px-2 py-1 rounded-lg bg-[var(--color-accent)]/10"
                  >
                    <Copy className="w-3 h-3" />
                    复制周报
                  </button>
                  {reportCopyState === 'ok' && (
                    <span className="text-[11px] text-[var(--color-accent)]">已复制</span>
                  )}
                  {reportCopyState === 'fail' && (
                    <span className="text-[11px] text-[var(--color-orange)]">复制失败，请长按选择文本</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* D. 计划版本过期提醒：非阻塞、分渠道 */}
          {hasAnyStale && (
            <div
              className="rounded-2xl px-3 py-2.5 border border-[var(--color-orange)]/25 bg-[var(--color-orange)]/8 min-w-0"
              data-testid="plan-stale-banner"
              role="status"
            >
              <p className="text-[12px] font-semibold text-[var(--color-orange)] leading-relaxed break-words">
                训练计划已更新，你之前导出或同步的版本可能已过期。
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-[var(--color-label-2)]">
                {staleFit && <li>· Garmin FIT 导出版本可能过期</li>}
                {staleIcs && <li>· 日历 ICS 导出版本可能过期</li>}
                {staleIcu && <li>· Intervals.icu 同步版本可能过期</li>}
              </ul>
              <button
                type="button"
                onClick={() => setShowExport(true)}
                className="mt-2 text-[11px] font-semibold text-[var(--color-accent)]"
              >
                重新导出 / 同步
              </button>
              {staleIcu && !ICU_IDEMPOTENT_SYNC_PROVEN && (
                <p className="mt-1 text-[10px] text-[var(--color-label-3)] leading-relaxed">
                  Intervals.icu 再次同步前请先清理旧事件；未验证幂等安全。
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {calView === 'week' && (
        <div className="bg-[var(--color-surface)] rounded-3xl overflow-hidden mb-4">
          <div className="px-4 py-4 border-b border-[var(--color-separator)] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider mb-1">本周训练</p>
              <h2 className="text-[20px] font-bold text-white truncate">
                {format(currentWeekStart, 'M月d日', { locale: zhCN })} - {format(currentWeekEnd, 'M月d日', { locale: zhCN })}
              </h2>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[22px] font-bold text-[var(--color-accent)] tabular-nums leading-none">{currentWeekVolume}</p>
              <p className="text-[10px] text-[var(--color-label-3)] mt-1">本周 · {currentWeekWorkoutCount} 节</p>
            </div>
          </div>
          <div>
            {weekDays.map((dayItem, idx) => {
              const workout = plan.find(w => isSameDay(new Date(w.date), dayItem));
              const dateStr = format(dayItem, 'yyyy-MM-dd');
              const completion = completions[dateStr];
              const canCheckIn = workout && workout.workoutType !== 'Rest' && (isToday(dayItem) || isPast(dayItem));
              return (
                <button
                  key={dateStr}
                  disabled={!workout || workout.workoutType === 'Rest'}
                  onClick={() => workout && workout.workoutType !== 'Rest' && setSelectedWorkout(workout)}
                  className={cn(
                    'w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors',
                    idx < weekDays.length - 1 && 'border-b border-[var(--color-separator)]',
                    isToday(dayItem) ? 'bg-[var(--color-accent)]/6' : '',
                    workout && workout.workoutType !== 'Rest' ? 'active:bg-[var(--color-surface-2)]' : 'cursor-default'
                  )}
                >
                  <div className="w-10 flex-shrink-0 text-center">
                    <p className={cn('text-[11px] font-semibold', isToday(dayItem) ? 'text-[var(--color-accent)]' : 'text-[var(--color-label-3)]')}>
                      {format(dayItem, 'EEE', { locale: zhCN })}
                    </p>
                    <p className={cn('text-[18px] font-bold leading-none mt-1', isToday(dayItem) ? 'text-white' : 'text-[var(--color-label-2)]')}>
                      {format(dayItem, 'd')}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {workout ? <WorkoutBadge type={workout.workoutType} /> : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-label-3)]">未安排</span>}
                      {completion && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-accent)]/12 text-[var(--color-accent)]">已打卡</span>
                      )}
                    </div>
                    <p className="text-[14px] font-semibold text-white mt-1 truncate">{workout ? workoutTitle(workout) : '自由安排'}</p>
                    {workout?.targetPace && (
                      <p className="text-[11px] text-[var(--color-label-3)] mt-0.5">目标配速 {workout.targetPace}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {workout?.distanceKm && workout.distanceKm > 0 && (
                      <p className="text-[15px] font-bold text-white tabular-nums">{workout.distanceKm}<span className="text-[10px] text-[var(--color-label-3)] ml-0.5">km</span></p>
                    )}
                    {canCheckIn && (
                      <span
                        onClick={e => { e.stopPropagation(); setCheckInWorkout(workout); }}
                        className="inline-block mt-1 text-[10px] font-semibold text-[var(--color-accent)]"
                      >
                        {completion ? '修改' : '打卡'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ACWR card */}
      <ACWRCard plan={plan} completions={completions} />

      {calView === 'calendar' && (
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
      )}

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

function workoutTitle(workout: DailyWorkout): string {
  if (workout.workoutType === 'Rest') return '休息或交叉训练';
  return workout.description.split(' - ')[0].replace(/【.*?】/g, '').trim() || workout.description;
}

function ShareMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--color-bg)] px-3 py-3">
      <p className="text-[10px] text-[var(--color-label-3)] uppercase tracking-wider">{label}</p>
      <p className="text-[17px] font-bold text-white mt-1">{value}</p>
    </div>
  );
}

function CalendarWorkoutPill({ type }: { type: string }) {
  const styles: Record<string, string> = {
    LSD: 'bg-[#BF5AF2]/20 text-[#BF5AF2]',
    Tempo: 'bg-[#FF9F0A]/20 text-[#FF9F0A]',
    TempoIntervals: 'bg-[#FF9F0A]/15 text-[#FFB340]',
    Interval: 'bg-[#FF453A]/20 text-[#FF453A]',
    Fartlek: 'bg-[#FF375F]/15 text-[#FF375F]',
    Hills: 'bg-[#FFD60A]/15 text-[#FFD60A]',
    Progression: 'bg-[#5E5CE6]/20 text-[#7D7AFF]',
    Cruise: 'bg-[#5AC8FA]/15 text-[#5AC8FA]',
    Easy: 'bg-[#0A84FF]/15 text-[#0A84FF]',
    Recovery: 'bg-[#636366]/25 text-[#EBEBF5]/60',
    MP: 'bg-[#32D74B]/15 text-[#32D74B]',
    Rest: 'bg-[#636366]/20 text-[#EBEBF5]/45',
    Race: 'bg-[#FFD60A]/20 text-[#FFD60A]',
  };
  const labels: Record<string, string> = {
    LSD: 'LSD',
    Tempo: '节奏',
    TempoIntervals: '节奏',
    Interval: '间歇',
    Fartlek: '变速',
    Hills: '坡',
    Progression: '渐进',
    Cruise: '巡航',
    Easy: '轻松',
    Recovery: '恢复',
    MP: 'MP',
    Rest: '休',
    Race: '赛',
  };

  return (
    <span className={cn('inline-flex max-w-full px-1.5 py-0.5 rounded-md text-[9px] font-semibold leading-none', styles[type] || styles.Rest)}>
      {labels[type] || type}
    </span>
  );
}

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
