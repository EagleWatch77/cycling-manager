import type { ReactNode } from 'react';
import { Card } from './Card';
import { Icon } from './Icon';

/**
 * A Card with an icon + label title, in the teal-dark style already used
 * ad hoc for section headers (e.g. Training's "Rozvoj"/"Stav jazdca"
 * cards). Thin wrapper, not a new visual system — Card still does the
 * actual border/shadow/radius work.
 */
export function SectionCard({
  icon, title, action, dense = true, className = '', children,
}: {
  icon?: string;
  title: ReactNode;
  action?: ReactNode;
  dense?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card
      dense={dense}
      className={className}
      action={action}
      title={
        <span className="flex items-center gap-1.5 text-sm text-teal-dark">
          {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
          {title}
        </span>
      }
    >
      {children}
    </Card>
  );
}
