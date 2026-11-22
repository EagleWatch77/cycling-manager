import type { ReactNode } from 'react';

/**
 * Compact stat tile used in the summary row at the top of a data-heavy page
 * (Tím, Financie, Trh) — a value, a label, and an optional icon. Pass "—"
 * as `value` when the underlying number doesn't exist yet rather than
 * omitting the whole card, so the row layout stays stable.
 */
export function SummaryCard({ icon, label, value, compact = false }: { icon?: ReactNode; label: string; value: ReactNode; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2.5 rounded-card border border-line bg-card px-3 py-2 shadow-card">
        {icon && <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal sm:flex">{icon}</span>}
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight tabular-nums text-navy">{value}</p>
          <p className="text-xs leading-tight text-navy-soft">{label}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-card p-3.5 shadow-card">
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-lg font-bold tabular-nums text-navy">{value}</p>
        <p className="text-2xs uppercase tracking-wide text-navy-muted">{label}</p>
      </div>
    </div>
  );
}
