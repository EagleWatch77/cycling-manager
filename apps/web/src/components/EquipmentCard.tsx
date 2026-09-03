import type { T } from '@/i18n/config';
import type { EquipmentItem } from '@/mock/dashboard';
import { Card, CardLink } from './ui/Card';
import { Icon } from './ui/Icon';
import { ProgressBar } from './ui/ProgressBar';

/** The four existing equipment slots. No new slot is introduced here. */
export function EquipmentCard({ t, items }: { t: T; items: EquipmentItem[] }) {
  return (
    <Card title={t('equipment.title')} dense className="col-span-12 lg:col-span-4">
      <ul className="grid flex-1 grid-cols-2 gap-px bg-line">
        {items.map((item) => (
          <li key={item.slotKey} className="bg-card p-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal">
                <Icon name={item.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-2xs text-navy-muted">{t(item.slotKey)}</span>
                <span className="block truncate text-xs font-semibold text-navy">{item.name}</span>
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xs text-navy-muted">{t('equipment.condition')}</span>
              <ProgressBar value={item.condition} tone={item.condition < 80 ? 'warn' : 'teal'} className="flex-1" />
              <span className="w-8 text-right text-2xs font-bold tabular-nums text-navy">{item.condition}%</span>
            </div>
          </li>
        ))}
      </ul>
      <CardLink label={t('equipment.viewAll')} />
    </Card>
  );
}
