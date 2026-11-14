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
 *
 * Kept deliberately compact: Tour name, date, stage count only. Reward
 * amounts live on the Tour detail page, never in this compact preview.
 */
export function SeasonCalendarCard({
  t, events, maxSlots, className = '',
}: {
  t: T;
  events: CalendarEvent[];
  maxSlots: number;
  className?: string;
}) {
  const slots: (CalendarEvent | null)[] = Array.from({ length: maxSlots }, (_, i) => events[i] ?? null);

  return (
    <Card title={t('calendar.title')} dense className={className}>
      <div className="flex h-full flex-col">
        <ul className="flex-1 px-3.5 py-2.5">
          {slots.map((slot, i) => {
            const isLast = i === slots.length - 1;
            return (
              <li key={slot?.id ?? `empty-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={
                      slot
                        ? 'mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-teal bg-teal'
                        : 'mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-dashed border-line bg-card'
                    }
                  />
                  {!isLast && <span className="w-px flex-1 bg-line" />}
                </div>
                <div className={`flex min-w-0 flex-1 items-start justify-between gap-2 ${isLast ? 'pb-0.5' : 'pb-3'}`}>
                  {slot ? (
                    <>
                      <span className="truncate text-sm font-bold text-navy">{slot.name}</span>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs font-semibold text-navy-soft">{slot.dateRange}</span>
                        {slot.stageCount > 0 && (
                          <span className="block text-2xs text-navy-muted">
                            {t('calendar.stages', { n: slot.stageCount })}
                          </span>
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs italic text-navy-muted/60">{t('calendar.emptySlot')}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <CardLink label={t('nav.calendar')} href="/calendar" />
      </div>
    </Card>
  );
}
