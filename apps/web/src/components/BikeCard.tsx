import type { T } from '@/i18n/config';
import { CardLink } from './ui/Card';
import { SectionCard } from './ui/SectionCard';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { attentionCount, type BikeComponentView, type ComponentStatus } from '@/lib/facilities/bikeDisplay';

const LABEL: Record<BikeComponentView['id'], string> = {
  wheels: 'bikeCard.wheels', tires: 'facilities.bikeTires', brakes: 'facilities.bikeBrakes', drivetrain: 'facilities.bikeDrivetrain',
};
const ICON: Record<BikeComponentView['id'], string> = { wheels: 'wheel', tires: 'wheel', brakes: 'cog', drivetrain: 'chain' };
const STATUS_KEY: Record<ComponentStatus, string> = { ok: 'bikeCard.statusOk', service: 'bikeCard.statusService', maintenance: 'bikeCard.statusMaintenance' };
const STATUS_TONE: Record<ComponentStatus, string> = { ok: 'text-teal-dark', service: 'text-warn', maintenance: 'text-danger' };
const DOT_TONE: Record<ComponentStatus, string> = { ok: 'bg-teal', service: 'bg-warn', maintenance: 'bg-danger' };

/**
 * Compact dashboard bike card. Shows only what the data model really stores:
 * wear of tires, brakes and drivetrain (stored condition, shown as wear).
 * Wheels, component levels, bike name, frame and weight are not stored yet,
 * so they appear as "-" (wheels) or are left out (levels, name, frame, weight).
 * `items = null` = no bike data for this manager.
 */
export function BikeCard({ t, items, className = '' }: { t: T; items: readonly BikeComponentView[] | null; className?: string }) {
  const showLevel = !!items && items.some((i) => i.level != null);
  const attention = items ? attentionCount(items) : 0;
  return (
    <SectionCard icon="frame" title={t('bikeCard.title')} className={className}>
      {items ? (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-navy-muted">
                <th className="px-3.5 py-1.5 text-left font-semibold">{t('bikeCard.component')}</th>
                {showLevel && <th className="px-1 py-1.5 text-center font-semibold">{t('bikeCard.level')}</th>}
                <th className="px-1 py-1.5 text-right font-semibold">{t('bikeCard.wear')}</th>
                <th className="px-3.5 py-1.5 text-right font-semibold">{t('bikeCard.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => (
                <tr key={item.id} data-component={item.id}>
                  <td className="px-3.5 py-2">
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal">
                        <Icon name={ICON[item.id]} className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate text-navy-soft">{t(LABEL[item.id])}</span>
                    </span>
                  </td>
                  {showLevel && <td className="px-1 py-2 text-center font-bold tabular-nums text-navy">{item.level ?? '—'}</td>}
                  <td className="px-1 py-2 text-right font-bold tabular-nums text-navy">{item.wear == null ? '—' : `${item.wear} %`}</td>
                  <td className="px-3.5 py-2 text-right">
                    {item.status ? (
                      <span className={`inline-flex items-center gap-1 font-semibold ${STATUS_TONE[item.status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${DOT_TONE[item.status]}`} aria-hidden="true" />
                        {t(STATUS_KEY[item.status])}
                      </span>
                    ) : (
                      <span className="text-navy-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {attention > 0 && (
            <p role="status" className="border-t border-line bg-teal-rail px-3.5 py-2 text-xs font-semibold text-navy-soft">
              {t('bikeCard.attention', { n: attention })}
            </p>
          )}
        </>
      ) : (
        <EmptyState compact icon="chain" text={t('equipment.bikeEmpty')} />
      )}
      <CardLink label={t('bikeCard.detail')} href="/facilities" />
    </SectionCard>
  );
}
