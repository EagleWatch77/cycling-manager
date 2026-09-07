import type { ReactNode } from 'react';

/**
 * Shared page title block — same shape used ad hoc across Rider Training,
 * Rankings, Market (icon + title + subtitle, optional right-side slot),
 * now formalized so new Team & Career pages don't each hand-roll it.
 */
export function PageHeader({
  icon, title, subtitle, action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal">
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
          {subtitle && <p className="text-sm font-medium text-navy-soft">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
