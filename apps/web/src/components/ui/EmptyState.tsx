import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The one empty-state shell every "no data model yet" screen uses — same
 * visual as the Rider Contract/History tabs and the Rankings empty state,
 * formalized here so new Team & Career pages don't each re-implement it.
 * Real data only: this renders instead of any invented row/number.
 */
export function EmptyState({
  icon, title, text, action, compact = false,
}: {
  icon: string;
  title?: string;
  text: string;
  action?: ReactNode;
  /** Smaller paddings/icon for use inside dense dashboard cards. */
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'gap-2 px-3.5 py-5' : 'gap-3 py-10'}`}>
      <span className={`flex items-center justify-center rounded-xl bg-teal-rail text-teal ${compact ? 'h-10 w-10' : 'h-14 w-14'}`}>
        <Icon name={icon} className={compact ? 'h-6 w-6' : 'h-8 w-8'} />
      </span>
      {title && <p className="text-sm font-bold text-navy">{title}</p>}
      <p className="max-w-sm text-xs text-navy-soft">{text}</p>
      {action}
    </div>
  );
}
