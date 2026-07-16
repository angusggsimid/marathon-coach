import { useStore } from '../store/useStore';
import { type ChangeEvent, type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import {
  calculateVDOTFromFull, calculateVDOTFromHalf,
  calculateVDOTFrom5K10K, predictTime,
  getPlanBlockReason, PLAN_BLOCK_MESSAGES,
  MIN_PLAN_DAYS_HALF, MIN_PLAN_DAYS_FULL,
  hasUsablePerformance,
} from '../utils/training-engine';
import { cn } from '../utils/cn';
import { DataBackupCard } from './DataBackupCard';

function validateMMSS(val: string): boolean {
  if (!val) return true;
  return /^\d{1,2}:\d{2}$/.test(val) && Number(val.split(':')[1]) < 60;
}

// Auto-insert colon for mm:ss fields when user types digits directly
// "2257" → "22:57"  |  "22:57" → "22:57" (unchanged)  |  "22:" → "22:" (manual ok)
function autoFormatMMSS(raw: string): string {
  if (/^\d{1,2}:\d{0,2}$/.test(raw)) return raw;     // already has colon in right spot
  const digits = raw.replace(/\D/g, '').slice(0, 4);  // keep at most 4 digits
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ':' + digits.slice(2);
}
function validateHHMMSS(val: string): boolean {
  if (!val) return true;
  return /^\d{1,2}:\d{2}:\d{2}$/.test(val)
    && Number(val.split(':')[1]) < 60
    && Number(val.split(':')[2]) < 60;
}

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// ─── Intensity options ─────────────────────────────────────────────────────────
const INTENSITY_OPTIONS = [
  { value: 'light',    days: '4天', label: '轻松',   desc: '完赛导向，兼顾生活' },
  { value: 'moderate', days: '5天', label: '均衡',   desc: '成绩与生活平衡' },
  { value: 'heavy',   days: '6天', label: '进阶',   desc: '挑战个人极限' },
] as const;

// ─── Main component ────────────────────────────────────────────────────────────
// mm:ss → total seconds
function mmssToSec(val: string): number {
  const parts = val.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

export function ProfileForm() {
  const { profile, updateProfile, generatePlan, isPlanGenerated, planNeedsRegen, myRaces, setActiveTab } = useStore();
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Validation helpers
  const validateField = (name: string, value: string): string => {
    if (['pb5k', 'pb10k', 'ltPace'].includes(name))
      return value && !validateMMSS(value) ? '格式：mm:ss，例如 22:57' : '';
    if (['pbHalf', 'pbFull', 'goalTime'].includes(name))
      return value && !validateHHMMSS(value) ? '格式：hh:mm:ss，例如 03:30:00' : '';
    return '';
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name } = e.target;
    let { value } = e.target;

    // Auto-format mm:ss fields so typing "2257" becomes "22:57"
    if (['pb5k', 'pb10k', 'ltPace'].includes(name) && e.target.type === 'text') {
      value = autoFormatMMSS(value);
    }

    const finalValue: string | number =
      e.target.type === 'number' ? (value === '' ? '' : Number(value)) : value;
    if (e.target.type === 'text') {
      setErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
    }
    updateProfile({ [name]: finalValue });
    if (isPlanGenerated) setHasChanges(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (profile.pb5k   && !validateMMSS(profile.pb5k))   newErrors.pb5k   = '格式：mm:ss';
    if (profile.pb10k  && !validateMMSS(profile.pb10k))  newErrors.pb10k  = '格式：mm:ss';
    if (profile.ltPace && !validateMMSS(profile.ltPace)) newErrors.ltPace = '格式：mm:ss';
    if (profile.pbHalf && !validateHHMMSS(profile.pbHalf)) newErrors.pbHalf = '格式：hh:mm:ss';
    if (profile.pbFull && !validateHHMMSS(profile.pbFull)) newErrors.pbFull = '格式：hh:mm:ss';
    if (profile.goalTime && !validateHHMMSS(profile.goalTime)) newErrors.goalTime = '格式：hh:mm:ss';

    // 与引擎一致：PB 或 LT 至少一项有效；禁止空成绩用默认能力值
    if (!hasUsablePerformance(profile)) {
      newErrors.pb5k = PLAN_BLOCK_MESSAGES.no_performance;
    }

    // 短周期 / 过期硬守卫：与 generateTrainingPlan 同一套规则
    const block = getPlanBlockReason(profile);
    if (block === 'past_race') {
      newErrors.raceDate = PLAN_BLOCK_MESSAGES.past_race;
    } else if (block === 'too_short_half') {
      newErrors.raceDate = `距半马不足 ${MIN_PLAN_DAYS_HALF} 天，无法生成常规计划`;
    } else if (block === 'too_short_full') {
      newErrors.raceDate = `距全马不足 ${MIN_PLAN_DAYS_FULL} 天，无法生成常规计划`;
    } else if (block === 'no_performance') {
      newErrors.pb5k = PLAN_BLOCK_MESSAGES.no_performance;
    } else {
      // 过长周期：引擎允许但产品上限 2 年
      const raceMs = (() => {
        const m = profile.raceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return NaN;
        return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
      })();
      const todayMs = new Date().setHours(0, 0, 0, 0);
      const diffDays = Number.isNaN(raceMs) ? 0 : Math.round((raceMs - todayMs) / 86400000);
      if (diffDays > 730) newErrors.raceDate = '备赛周期过长（最多2年）';
    }

    // Cross-check: 10K shouldn't be faster per km than 5K
    if (profile.pb5k && profile.pb10k && validateMMSS(profile.pb5k) && validateMMSS(profile.pb10k)) {
      const pace5k  = mmssToSec(profile.pb5k)  / 5;   // sec/km
      const pace10k = mmssToSec(profile.pb10k) / 10;  // sec/km
      if (pace10k < pace5k * 0.95) {
        newErrors.pb10k = '10K 配速比 5K 还快，请确认是否输入有误';
      }
    }

    setErrors(newErrors);
    if (Object.values(newErrors).some(Boolean)) {
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-field-error]') as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    setHasChanges(false);
    generatePlan();
  };

  const planBlockPreview = useMemo(() => getPlanBlockReason(profile), [profile]);

  // Smart prediction
  const predictions = useMemo(() => {
    let vdot = 0;
    if (profile.pbFull && validateHHMMSS(profile.pbFull))
      vdot = calculateVDOTFromFull(profile.pbFull);
    else if (profile.pbHalf && validateHHMMSS(profile.pbHalf))
      vdot = calculateVDOTFromHalf(profile.pbHalf);
    else if (profile.pb5k || profile.pb10k)
      vdot = calculateVDOTFrom5K10K(profile.pb5k, profile.pb10k);
    if (vdot <= 0) return { half: '', full: '', vdot: 0 };
    return {
      half: profile.pbHalf ? '' : `预测半马 ≈ ${predictTime(vdot, 'half')}`,
      full: profile.pbFull ? '' : `预测全马 ≈ ${predictTime(vdot, 'full')}`,
      vdot: Math.round(vdot * 10) / 10,
    };
  }, [profile.pb5k, profile.pb10k, profile.pbHalf, profile.pbFull]);

  // Derive primary race directly from myRaces (same logic as store's primaryRaceProfile).
  // This is robust — not affected by the user manually toggling raceType or
  // profile.raceDate drifting after races are removed.
  const primaryRace = useMemo(() => {
    const valid = myRaces.filter(r => r.date && !r.dateTBD);
    if (valid.length === 0) return null;
    const pb = valid.filter(r => r.goal === 'pb');
    const candidates = pb.length > 0 ? pb : valid;
    return candidates.reduce((best, r) => (r.date! > best.date! ? r : best));
  }, [myRaces]);

  // How many additional races beyond the primary
  const extraRaceCount = Math.max(0, myRaces.length - 1);

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pb-10">

      {/* ── Hero header ── */}
      <div className="pt-2 pb-4">
        <h2 className="text-3xl font-bold tracking-tight text-white">备赛计划</h2>
        <p className="text-[var(--color-label-2)] text-sm mt-1">填写目标与成绩，30 秒生成专属课表</p>
      </div>

      <div className="bg-[var(--color-surface)] rounded-2xl px-4 py-4 border border-[var(--color-accent)]/15">
        <p className="text-[12px] font-semibold text-[var(--color-accent)] mb-3">从选赛到开练，只走三步</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { step: '1', title: '选比赛', desc: primaryRace ? '已同步目标' : '可先跳过' },
            { step: '2', title: '填成绩', desc: '至少一项' },
            { step: '3', title: '看今天', desc: '生成后直达' },
          ].map(item => (
            <div key={item.step} className="bg-[var(--color-surface-2)] rounded-xl px-3 py-3 min-w-0">
              <div className="w-5 h-5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] text-[11px] font-bold flex items-center justify-center mb-2">
                {item.step}
              </div>
              <p className="text-[13px] font-semibold text-white leading-tight">{item.title}</p>
              <p className="text-[10px] text-[var(--color-label-3)] mt-1 leading-tight">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Card: 目标赛事 ── */}
      <Card>
        <div className="flex items-center justify-between">
          <CardLabel>目标赛事</CardLabel>
          <button
            type="button"
            onClick={() => setActiveTab('races')}
            className="text-[11px] text-[var(--color-accent)] font-medium"
          >
            {primaryRace ? '管理赛事 →' : '赛事库 →'}
          </button>
        </div>

        {/* Guidance hint — shown only when user has no races selected */}
        {!primaryRace && (
          <p className="text-[11px] text-[var(--color-label-3)] mt-1.5 mb-1 leading-relaxed">
            直接填写日期快速开始；或先去{' '}
            <button
              type="button"
              onClick={() => setActiveTab('races')}
              className="text-[var(--color-accent)] font-medium"
            >
              赛事页
            </button>
            {' '}选择比赛，日期与项目自动同步。
          </p>
        )}

        {/* Primary race badge */}
        {primaryRace && (
          <div className="mt-2 flex items-center justify-between bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/20 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[var(--color-accent)] text-[12px] flex-shrink-0">⚑</span>
              <div className="min-w-0">
                <span className="text-[13px] font-semibold text-white truncate block">{primaryRace.name}</span>
                {extraRaceCount > 0 && (
                  <span className="text-[10px] text-[var(--color-label-3)]">另含 {extraRaceCount} 场配速赛</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('races')}
              className="text-[10px] text-[var(--color-label-3)] flex-shrink-0 ml-3"
            >
              更换
            </button>
          </div>
        )}

        {/* Race type toggle */}
        <div className="flex gap-2 mt-3">
          {(['half', 'full'] as const).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => updateProfile({ raceType: type })}
              className={cn(
                'flex-1 py-3 rounded-xl text-sm font-semibold transition-all',
                profile.raceType === type
                  ? 'bg-[var(--color-accent)] text-black'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-label-2)] active:bg-[var(--color-surface-3)]'
              )}
            >
              {type === 'half' ? '半马  21.1km' : '全马  42.2km'}
            </button>
          ))}
        </div>

        {/* Race date */}
        <div className="mt-4">
          <FieldLabel>比赛日期</FieldLabel>
          <input
            type="date"
            name="raceDate"
            value={profile.raceDate}
            onChange={handleChange}
            className={cn(
              'w-full mt-1.5 bg-[var(--color-surface-2)] text-white rounded-xl px-4 py-3 text-sm outline-none',
              'border border-transparent focus:border-[var(--color-accent)]',
              errors.raceDate && 'border-[var(--color-red)]'
            )}
          />
          {errors.raceDate && <FieldError>{errors.raceDate}</FieldError>}
          {(planBlockPreview === 'too_short_half' || planBlockPreview === 'too_short_full') && (
            <div className="mt-3 rounded-xl border border-[var(--color-orange)]/30 bg-[var(--color-orange)]/10 px-3 py-3">
              <p className="text-[12px] font-semibold text-[var(--color-orange)] mb-1">周期太短，不生成常规计划</p>
              <p className="text-[12px] text-[var(--color-label-2)] leading-relaxed">
                {PLAN_BLOCK_MESSAGES[planBlockPreview]}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* ── Card: 配速成绩 ── */}
      <Card>
        <CardLabel>配速参考</CardLabel>
        <p className="text-xs text-[var(--color-label-3)] mt-0.5 mb-3">至少填写一项，系统自动推算 VDOT</p>

        {/* Primary: 5K */}
        <div>
          <FieldLabel>5km 最好成绩 <span className="text-[var(--color-label-3)] font-normal ml-1">mm:ss</span></FieldLabel>
          <input
            type="text"
            name="pb5k"
            value={profile.pb5k}
            onChange={handleChange}
            placeholder="22:57"
            inputMode="text"
            className={cn(
              'w-full mt-1.5 bg-[var(--color-surface-2)] text-white rounded-xl px-4 py-3 font-mono text-base outline-none',
              'border border-transparent focus:border-[var(--color-accent)] placeholder:text-[var(--color-label-4)]',
              errors.pb5k && 'border-[var(--color-red)]'
            )}
          />
          {errors.pb5k && <FieldError>{errors.pb5k}</FieldError>}
        </div>

        {/* Secondary: 10K */}
        <div className="mt-3">
          <FieldLabel>10km 最好成绩 <span className="text-[var(--color-label-3)] font-normal ml-1">mm:ss — 可选</span></FieldLabel>
          <input
            type="text"
            name="pb10k"
            value={profile.pb10k}
            onChange={handleChange}
            placeholder="46:49"
            inputMode="text"
            className={cn(
              'w-full mt-1.5 bg-[var(--color-surface-2)] text-white rounded-xl px-4 py-3 font-mono text-base outline-none',
              'border border-transparent focus:border-[var(--color-accent)] placeholder:text-[var(--color-label-4)]',
              errors.pb10k && 'border-[var(--color-red)]'
            )}
          />
          {errors.pb10k && <FieldError>{errors.pb10k}</FieldError>}
        </div>

        {/* VDOT preview */}
        {predictions.vdot > 0 && (
          <div className="mt-3 flex items-center gap-3 bg-[var(--color-accent-dim)] rounded-xl px-4 py-3 border border-[var(--color-accent-border)]">
            <div>
              <p className="text-[10px] text-[var(--color-accent)] font-semibold uppercase tracking-wider">VDOT</p>
              <p className="text-xl font-bold text-white">{predictions.vdot}</p>
            </div>
            <div className="h-8 w-px bg-[var(--color-accent-border)]" />
            <div className="text-xs text-[var(--color-label-2)] leading-relaxed">
              {predictions.half && <p>{predictions.half}</p>}
              {predictions.full && <p>{predictions.full}</p>}
            </div>
          </div>
        )}
      </Card>

      {/* ── Card: 训练强度 ── */}
      <Card>
        <CardLabel>每周训练天数</CardLabel>
        <div className="flex gap-2 mt-3">
          {INTENSITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateProfile({ intensity: opt.value })}
              className={cn(
                'flex-1 rounded-xl py-3.5 px-2 text-center transition-all',
                profile.intensity === opt.value
                  ? 'bg-[var(--color-accent)] text-black'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-label-2)] active:bg-[var(--color-surface-3)]'
              )}
            >
              <p className="text-lg font-bold leading-none">{opt.label}</p>
              <p className={cn(
                'text-[11px] mt-1 font-medium',
                profile.intensity === opt.value ? 'text-black/70' : 'text-[var(--color-label-3)]'
              )}>{opt.days}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--color-label-3)] mt-2.5 px-1">
          {INTENSITY_OPTIONS.find(o => o.value === profile.intensity)?.desc}
        </p>
      </Card>

      {/* ── Advanced settings (collapsible) ── */}
      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--color-surface)] text-[var(--color-label-2)] text-sm font-medium active:bg-[var(--color-surface-2)]"
      >
        <span>高级设置</span>
        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {showAdvanced && (
        <div className="space-y-3">
          {/* 身体数据 */}
          <Card>
            <CardLabel>身体数据</CardLabel>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <AdvInput label="身高 (cm)" name="height" type="number" value={profile.height} onChange={handleChange} placeholder="175" />
              <AdvInput label="体重 (kg)" name="weight" type="number" value={profile.weight} onChange={handleChange} placeholder="70" />
            </div>
          </Card>

          {/* 乳酸阈值 */}
          <Card>
            <CardLabel>乳酸阈值 <span className="text-[var(--color-label-3)] font-normal ml-1">选填</span></CardLabel>
            <p className="text-[11px] text-[var(--color-label-3)] mt-1 mb-3 leading-relaxed">
              不填也没关系，系统会根据你的成绩自动推算。如果你有 COROS / Garmin 等运动手表并做过乳酸阈值测试，填入后配速和心率区间会更贴合你的实际状态。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <AdvInput label="LTHR (bpm)" name="lthr" type="number" value={profile.lthr} onChange={handleChange} placeholder="167" />
              <div>
                <AdvInput label="LT 配速 (mm:ss)" name="ltPace" type="text" value={profile.ltPace} onChange={handleChange} placeholder="04:33" error={errors.ltPace} />
              </div>
            </div>
          </Card>

          {/* 长距离 PB */}
          <Card>
            <CardLabel>长距离 PB <span className="text-[var(--color-label-3)] font-normal ml-1">覆盖 5K/10K 推算</span></CardLabel>
            <div className="space-y-3 mt-3">
              <div>
                <AdvInput label="半马 (hh:mm:ss)" name="pbHalf" type="text" value={profile.pbHalf} onChange={handleChange} placeholder="01:41:14" error={errors.pbHalf} />
                {predictions.half && <p className="text-[11px] text-[var(--color-label-3)] mt-1 pl-1">{predictions.half}</p>}
              </div>
              <div>
                <AdvInput label="全马 (hh:mm:ss)" name="pbFull" type="text" value={profile.pbFull || ''} onChange={handleChange} placeholder="03:30:00" error={errors.pbFull} />
                {predictions.full && <p className="text-[11px] text-[var(--color-label-3)] mt-1 pl-1">{predictions.full}</p>}
              </div>
            </div>
          </Card>

          {/* 目标 & 偏好 */}
          <Card>
            <CardLabel>目标与偏好</CardLabel>
            <div className="space-y-3 mt-3">
              <div>
                <AdvInput
                  label={`目标完成时间 (hh:mm:ss)`}
                  name="goalTime"
                  type="text"
                  value={profile.goalTime || ''}
                  onChange={handleChange}
                  placeholder={profile.raceType === 'half' ? '01:40:00' : '03:30:00'}
                  error={errors.goalTime}
                />
              </div>
              <div>
                <FieldLabel className="text-xs text-[var(--color-label-3)] font-medium uppercase tracking-wider">长跑偏好日</FieldLabel>
                <select
                  name="longRunDay"
                  value={profile.longRunDay ?? 0}
                  onChange={e => updateProfile({ longRunDay: Number(e.target.value) })}
                  className="w-full mt-1.5 bg-[var(--color-surface-2)] text-white rounded-xl px-4 py-3 text-sm outline-none border border-transparent focus:border-[var(--color-accent)] appearance-none"
                >
                  {DAY_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
                </select>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Submit ── */}
      <div className="pt-3">
        <div className="pb-3">
          <button
            type="submit"
            className={cn(
              'w-full bg-[var(--color-accent)] active:opacity-80 text-black font-bold py-4 rounded-2xl text-base tracking-wide',
              (hasChanges || planNeedsRegen) ? 'animate-pulse shadow-[0_0_28px_rgba(50,215,75,0.45)]' : 'shadow-[0_0_24px_rgba(50,215,75,0.20)]'
            )}
          >
            {planNeedsRegen ? '目标赛事已更新 · 重新生成' : hasChanges ? '参数已修改 · 重新生成' : '生成训练计划'}
          </button>
        </div>
      </div>

      {/* 数据与备份：档案页信息架构，非独立营销页 */}
      <DataBackupCard />
    </form>
  );
}

// ─── Small sub-components ──────────────────────────────────────────────────────

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl px-4 py-4">
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold text-[var(--color-label-3)] uppercase tracking-wider">{children}</p>;
}

function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-xs font-medium text-[var(--color-label-3)] uppercase tracking-wider', className)}>{children}</p>;
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <div data-field-error className="flex items-center gap-1 mt-1.5 text-[var(--color-red)] text-[11px]">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />
      {children}
    </div>
  );
}

function AdvInput({
  label, error, value, ...props
}: { label: string; error?: string; value: string | number | ''; } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value === '' ? '' : value}
        {...props}
        className={cn(
          'w-full mt-1.5 bg-[var(--color-surface-2)] text-white rounded-xl px-3 py-2.5 font-mono text-sm outline-none',
          'border border-transparent focus:border-[var(--color-accent)] placeholder:text-[var(--color-label-4)]',
          error && 'border-[var(--color-red)]'
        )}
      />
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
