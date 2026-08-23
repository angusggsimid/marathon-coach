import type { ReactNode } from 'react';

/** 区块卡片：标题 + 解读句（insight 为 null 时不显示，绝不编造）；id 供锚点导航 */
export function SectionCard({ id, title, sub, insight, children, className }: {
  id?: string;
  title: string;
  sub?: string;
  insight?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`bg-[var(--color-surface)] rounded-2xl p-4 min-w-0 scroll-mt-24 ${className ?? ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        {sub && <span className="text-[11px] text-[var(--color-label-3)]">{sub}</span>}
      </div>
      {insight && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-accent)] bg-[var(--color-accent-dim)] rounded-lg px-3 py-2">
          {insight}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}
