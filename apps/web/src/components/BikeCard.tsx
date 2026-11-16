import type { T } from '@/i18n/config';
import { CardLink } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { SectionCard } from './ui/SectionCard';
import { attentionCount, type BikeComponentView, type ComponentStatus } from '@/lib/facilities/bikeDisplay';

const LABEL: Record<BikeComponentView['id'], string> = {
  wheels: 'bikeCard.wheels', tires: 'facilities.bikeTires', brakes: 'facilities.bikeBrakes', drivetrain: 'facilities.bikeDrivetrain',
};
const ICON: Record<BikeComponentView['id'], string> = { wheels: 'wheel', tires: 'wheel', brakes: 'cog', drivetrain: 'chain' };
const STATUS_KEY: Record<ComponentStatus, string> = { ok: 'bikeCard.statusOk', service: 'bikeCard.statusService', maintenance: 'bikeCard.statusMaintenance' };
const STATUS_TONE: Record<ComponentStatus, string> = { ok: 'text-teal-dark', service: 'text-warn', maintenance: 'text-danger' };
const BAR_TONE: Record<ComponentStatus, string> = { ok: 'bg-teal', service: 'bg-warn', maintenance: 'bg-danger' };

/**
 * "Môj bicykel": 2 x 2 component tiles (wheels, tires, brakes, drivetrain)
 * showing the stored wear (0 % = new, 100 % = fully worn; the database keeps
 * condition, 100 = new) and the existing service status. Missing values (wheels
 * today) show a dash. Component level is shown only when level data exists.
 * `items = null` = no bike data for this manager.
 */
export function BikeCard({ t, items, className = '' }: { t: T; items: readonly BikeComponentView[] | null; className?: string }) {
  const attention = items ? attentionCount(items) : 0;
  return (
    <SectionCard icon="frame" title={t('bikeCard.title')} tone="tint" className={className}>
      {items ? (
        <>
          <ul className="grid grid-cols-2 gap-px bg-line">
            {items.map((item) => (
              <li key={item.id} data-component={item.id} className="bg-card">
                <a href={`/bike?component=${item.id}`} className="block px-3 py-2.5 transition-colors hover:bg-teal-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal">
                    <Icon name={ICON[item.id]} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-navy-soft">{t(LABEL[item.id])}</span>
                  {item.level != null && <span className="text-2xs font-bold tabular-nums text-navy-muted">{t('bikeCard.levelShort', { n: item.level })}</span>}
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-1">
                  <span className="text-lg font-extrabold leading-none tabular-nums text-navy">{item.wear == null ? '—' : `${item.wear} %`}</span>
                  {item.status ? (
                    <span className={`text-2xs font-bold ${STATUS_TONE[item.status]}`}>{t(STATUS_KEY[item.status])}</span>
                  ) : (
                    <span className="text-2xs text-navy-muted">—</span>
                  )}
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-teal-rail" aria-hidden="true">
                  {item.wear != null && item.status && <div className={`h-full rounded-full ${BAR_TONE[item.status]}`} style={{ width: `${item.wear}%` }} />}
                </div>
                </a>
              </li>
            ))}
          </ul>
          {attention > 0 && (
            <p role="status" className="border-t border-line bg-teal-rail px-3.5 py-1.5 text-xs font-semibold text-navy-soft">
              {t('bikeCard.attention', { n: attention })}
            </p>
          )}
        </>
      ) : (
        <EmptyState compact icon="chain" text={t('equipment.bikeEmpty')} />
      )}
      <CardLink label={t('bikeCard.detail')} href="/bike" />
    </SectionCard>
  );
}
