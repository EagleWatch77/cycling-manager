import type { ReactNode } from 'react';
import { CardLink } from '../ui/Card';
import { SectionCard } from '../ui/SectionCard';

export interface MiniRow {
  key: string;
  label: ReactNode;
  /** A real value, or '—' when the value is not tracked yet. */
  value: ReactNode;
}

/**
 * Compact Home dashboard window: icon + small title, short label/value rows
 * and an optional detail link. With no rows it renders the intentional empty
 * state - one neutral dash, no "coming soon" text, no illustration - so a
 * future feature only has to start passing rows. Links are rendered only for
 * windows that have real data behind them.
 */
export function MiniPanel({
  icon, title, rows = [], href, linkLabel, className = '',
}: {
  icon: string;
  title: ReactNode;
  rows?: readonly MiniRow[];
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  const empty = rows.length === 0;
  return (
    <SectionCard icon={icon} title={title} tone="tint" className={className}>
      {empty ? (
        <p data-empty="true" className="px-3.5 py-2.5 text-sm font-semibold text-navy-muted" aria-label="—">—</p>
      ) : (
        <dl className="divide-y divide-line text-xs">
          {rows.map((r) => (
            <div key={r.key} className="flex items-baseline justify-between gap-3 px-3.5 py-1.5">
              <dt className="min-w-0 truncate text-navy-soft">{r.label}</dt>
              <dd className="shrink-0 font-bold tabular-nums text-navy">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!empty && href && linkLabel && <CardLink label={linkLabel} href={href} />}
    </SectionCard>
  );
}
