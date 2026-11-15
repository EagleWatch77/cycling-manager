import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The shared card-heading style: teal-dark text + small teal outline icon.
 * This is the exact look of the Taktika card (the visual reference for the
 * Rider → Prehľad page). Rendered inside Card's `title` slot, which already
 * provides the uppercase / tracking / weight and the header padding, so
 * every card heading has the same font, size, case, icon size, icon–text
 * gap and header height. Use it for the rider page cards; not a new style.
 */
export function CardTitle({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-teal-dark">
      <Icon name={icon} className="h-3.5 w-3.5 text-teal" />
      {children}
    </span>
  );
}
