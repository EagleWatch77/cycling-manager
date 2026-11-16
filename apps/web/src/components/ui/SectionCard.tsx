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
  icon, title, action, dense = true, tone = 'plain', className = '', children,
}: {
  icon?: string;
  title: ReactNode;
  action?: ReactNode;
  dense?: boolean;
  /** 'tint' = soft teal header band with a bolder title (Home dashboard hierarchy). Default keeps the plain header. */
  tone?: 'plain' | 'tint';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card
      dense={dense}
      className={className}
      action={action}
      headerClassName={tone === 'tint' ? 'border-teal-light bg-teal-rail' : ''}
      title={
        <span className={`flex items-center gap-1.5 text-teal-dark ${tone === 'tint' ? 'text-xs font-extrabold' : 'text-sm'}`}>
          {icon && <Icon name={icon} className={`h-3.5 w-3.5 ${tone === 'tint' ? 'text-teal' : ''}`} />}
          {title}
        </span>
      }
    >
      {children}
    </Card>
  );
}
