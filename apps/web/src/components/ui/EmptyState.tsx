import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The one empty-state shell every "no data model yet" screen uses — same
 * visual as the Rider Contract/History tabs and the Rankings empty state,
 * formalized here so new Team & Career pages don't each re-implement it.
 * Real data only: this renders instead of any invented row/number.
 */
export function EmptyState({
  icon, title, text, action,
}: {
  icon: string;
  title?: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-rail text-teal">
        <Icon name={icon} className="h-8 w-8" />
      </span>
      {title && <p className="text-sm font-bold text-navy">{title}</p>}
      <p className="max-w-sm text-xs text-navy-soft">{text}</p>
      {action}
    </div>
  );
}
