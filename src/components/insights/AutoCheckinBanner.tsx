import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useStore } from '../../store/useStore';

/**
 * 自动打卡建议横幅：同步/导入后由活动↔计划匹配产出。
 * 只展示建议，由用户确认应用（applyAutoCheckins）；RPE 按配速评估，可到日历改。
 */
export default function AutoCheckinBanner() {
  const { autoCheckinSuggestions, applyAutoCheckins, dismissAutoCheckins } = useStore();
  if (autoCheckinSuggestions.length === 0) return null;

  const fullCount = autoCheckinSuggestions.filter(s => s.status === 'full').length;

  return (
    <div className="rounded-2xl bg-[var(--color-surface)] px-4 py-3 mt-2" data-testid="auto-checkin-banner">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] flex-shrink-0" />
        <p className="text-[13.5px] font-semibold">
          检测到 {autoCheckinSuggestions.length} 节课已跑完
        </p>
      </div>
      <p className="text-[11.5px] text-[var(--color-label-3)] mt-1 leading-relaxed">
        已按计划日期与距离自动匹配{fullCount > 0 ? `，其中 ${fullCount} 节完整完成` : ''}。
        标记后 RPE 按实际配速评估（可在训练日历中修改）。
      </p>
      <ul className="mt-2 space-y-1">
        {autoCheckinSuggestions.slice(0, 4).map(s => (
          <li key={s.dateStr} className="text-[11.5px] text-[var(--color-label-2)]">
            <span className="font-mono">{format(new Date(s.dateStr + 'T12:00:00'), 'M/d EEE', { locale: zhCN })}</span>
            <span className="mx-1.5 text-[var(--color-label-3)]">·</span>
            {s.workoutType}
            {s.status === 'partial' && <span className="ml-1 text-[var(--color-orange)]">部分</span>}
            <span className="mx-1.5 text-[var(--color-label-3)]">·</span>
            实际 {s.actualKm}km / 计划 {s.plannedKm}km
          </li>
        ))}
        {autoCheckinSuggestions.length > 4 && (
          <li className="text-[11.5px] text-[var(--color-label-3)]">
            …另有 {autoCheckinSuggestions.length - 4} 节
          </li>
        )}
      </ul>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={applyAutoCheckins}
          className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-black hover:opacity-90 transition-opacity"
        >
          标记完成
        </button>
        <button
          onClick={dismissAutoCheckins}
          className="text-[12px] px-2.5 py-1.5 rounded-lg border border-[var(--color-separator)] text-[var(--color-label-3)] hover:text-[var(--color-label-2)] transition-colors"
        >
          忽略
        </button>
      </div>
    </div>
  );
}