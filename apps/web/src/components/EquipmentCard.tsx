import type { T } from '@/i18n/config';
import { Card, CardLink } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { ProgressBar } from './ui/ProgressBar';

export interface BikeEquipmentItem {
  id: string;
  /** i18n key of the part label. */
  labelKey: string;
  icon: string;
  /** 0-100, straight from the persisted bike condition. */
  condition: number;
}

/**
 * Bike equipment: the real persisted bike condition (overall = weakest part,
 * tires, brakes, drivetrain — see lib/facilities/bikeCalc.ts). `items = null`
 * means there is no rider yet, so there is no bike to show.
 */
export function EquipmentCard({ t, items, className = '' }: { t: T; items: BikeEquipmentItem[] | null; className?: string }) {
  return (
    <Card title={t('equipment.bikeTitle')} dense className={className}>
      {items ? (
        <ul className="grid grid-cols-2 gap-px bg-line">
          {items.map((item) => (
            <li key={item.id} className="bg-card p-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal">
                  <Icon name={item.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="truncate text-2xs text-navy-muted">{t(item.labelKey)}</span>
                    <span className="text-2xs font-bold tabular-nums text-navy">{item.condition}%</span>
                  </span>
                  <ProgressBar value={item.condition} tone={item.condition < 80 ? 'warn' : 'teal'} className="mt-1" />
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon="chain" text={t('equipment.bikeEmpty')} />
      )}
      <CardLink label={t('facilities.bikeServiceTitle')} href="/facilities" />
    </Card>
  );
}
