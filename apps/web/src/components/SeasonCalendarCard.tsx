import type { T } from '@/i18n/config';
import { Card, CardLink } from './ui/Card';

export interface CalendarEvent {
  id: string;
  name: string;
  stageCount: number;
  dateRange: string;
}

/**
 * Season Calendar card — the Rider's own season program, not the Tour
 * selection list. Always renders exactly `maxSlots` timeline rows (the
 * league's season Tour limit, see lib/leagues.ts maxSeasonTours()): one
 * filled row per selected Tour (ascending by date), the rest empty
 * placeholders. Never shows more rows than the league allows and never
 * invents a Tour to fill a gap.
 */
export function SeasonCalendarCard({
  t, events, maxSlots,
}: {
  t: T;
  events: CalendarEvent[];
  maxSlots: number;
}) {
  const slots: (CalendarEvent | null)[] = Array.from({ length: maxSlots }, (_, i) => events[i] ?? null);

  return (
    <Card title={t('calendar.title')} dense className="col-span-12 lg:col-span-4">
      <ul className="flex-1 px-3.5 py-2.5">
        {slots.map((slot, i) => {
          const isLast = i === slots.length - 1;
          return (
            <li key={slot?.id ?? `empty-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={
                    slot
                      ? 'mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 border-teal bg-teal'
                      : 'mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 border-dashed border-line bg-card'
                  }
                />
                {!isLast && <span className="w-px flex-1 bg-line" />}
              </div>
              <div className={`min-w-0 flex-1 ${isLast ? 'pb-0.5' : 'pb-4'}`}>
                {slot ? (
                  <>
                    <span className="block truncate text-sm font-semibold text-navy">{slot.name}</span>
                    <span className="block text-2xs text-navy-muted">
                      {slot.dateRange}
                      {slot.stageCount > 0 && <> · {t('calendar.stages', { n: slot.stageCount })}</>}
                    </span>
                  </>
                ) : (
                  <span className="block text-2xs italic text-navy-muted/60">{t('calendar.emptySlot')}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <CardLink label={t('calendar.viewAll')} />
    </Card>
  );
}
