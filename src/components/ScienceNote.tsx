import { BookOpen } from 'lucide-react';
import { SCIENCE_NOTES, type ScienceNoteId } from '../content/science-notes';

/**
 * 科学知识科普层（R4）：数据卡背后的"为什么"。
 * 原生 details/summary——默认收起零噪音，展开零 JS 开销。
 */
export default function ScienceNote({ id, label }: { id: ScienceNoteId; label?: string }) {
  const note = SCIENCE_NOTES[id];
  return (
    <details className="mt-2" data-testid={`science-note-${id}`}>
      <summary className="text-[11px] text-[var(--color-label-3)] cursor-pointer select-none flex items-center gap-1 hover:text-[var(--color-label-2)] transition-colors list-none">
        <BookOpen size={12} className="flex-shrink-0" />
        {label ?? '为什么看这个指标？'}
      </summary>
      <div className="mt-2 rounded-xl bg-[var(--color-surface-2)] px-3 py-2.5 space-y-2 text-[11px] leading-relaxed text-[var(--color-label-2)]">
        <p>
          <span className="font-semibold text-white">{note.title} · </span>{note.what}
        </p>
        <p><span className="font-semibold text-white">为什么重要：</span>{note.why}</p>
        <p><span className="font-semibold text-white">机制与来源：</span>{note.science}</p>
        <div>
          <span className="font-semibold text-white">常见误区：</span>
          <ul className="mt-0.5 space-y-0.5">
            {note.misconceptions.map((m, i) => (
              <li key={i} className="text-[var(--color-label-3)]">· {m}</li>
            ))}
          </ul>
        </div>
        <p><span className="font-semibold text-white">个体差异：</span>{note.individuality}</p>
        {note.action && (
          <p><span className="font-semibold text-white">怎么做：</span>{note.action}</p>
        )}
      </div>
    </details>
  );
}