import type { T } from '@/i18n/config';
import { CardLink } from './ui/Card';
import { SectionCard } from './ui/SectionCard';

export interface CalendarEvent {
  id: string;
  name: string;
  /** Season week the Tour runs in (1-based), for the week axis marker. */
  weekNumber: number;
  stageCount: number;
  dateRange: string;
}

export interface CalendarWeek {
  week: number;
  /** Real date range of the week, already formatted (UTC calendar days). */
  range: string;
}

/**
 * Season Calendar card. Shows the shared game date, the season and week, a
 * 10-week axis (current week highlighted, real date range on hover/tap-hold
 * via title, and always printed for the current week) and the Rider's own
 * Tour slots, "Tour 1..N" (N = the league's season Tour limit, see
 * lib/leagues.ts maxSeasonTours()).
 *
 * A slot is filled only by a Tour the Rider actually selected, in date order;
 * the rest stay empty. Nothing is invented to fill a slot. All dates come
 * from the server-time season calendar (lib/calendar/season), so every
 * player sees the same values regardless of their device clock.
 */
export function SeasonCalendarCard({
  t, events, maxSlots, todayLabel, seasonNumber, currentWeek, weeks, className = '',
}: {
  t: T;
  events: CalendarEvent[];
  maxSlots: number;
  todayLabel: string;
  seasonNumber: number;
  currentWeek: number;
  weeks: CalendarWeek[];
  className?: string;
}) {
  const slots: (CalendarEvent | null)[] = Array.from({ length: maxSlots }, (_, i) => events[i] ?? null);
  const tourWeeks = new Set(events.map((e) => e.weekNumber));
  const current = weeks.find((w) => w.week === currentWeek);

  return (
    <SectionCard icon="calendar" title={t('calendar.title')} tone="tint" className={className}>
      <div className="flex h-full flex-col">
        <div className="space-y-1.5 px-3 py-2.5">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-bold text-navy">
              {t('races.season')} {seasonNumber}
              <span className="font-medium text-navy-soft"> · {t('races.week')} {currentWeek}/{weeks.length}</span>
            </span>
            <span className="shrink-0 text-2xs text-navy-muted">{todayLabel}</span>
          </p>
          <ol className="grid grid-cols-10 gap-0.5" aria-label={t('calendar.title')}>
            {weeks.map((w) => {
              const isCurrent = w.week === currentWeek;
              const isPast = w.week < currentWeek;
              const hasTour = tourWeeks.has(w.week);
              const tone = isCurrent
                ? 'bg-teal font-bold text-white'
                : isPast
                  ? 'bg-surface text-navy-muted'
                  : 'border border-line text-navy-soft';
              return (
                <li
                  key={w.week}
                  title={t('calendar.weekTooltip', { n: w.week, range: w.range })}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`relative flex h-6 items-center justify-center rounded text-2xs tabular-nums ${tone}`}
                >
                  {w.week}
                  {hasTour && (
                    <span aria-hidden="true" className={`absolute bottom-0.5 h-1 w-1 rounded-full ${isCurrent ? 'bg-white' : 'bg-teal'}`} />
                  )}
                </li>
              );
            })}
          </ol>
          {current && <p className="text-2xs text-navy-muted">{t('calendar.weekTooltip', { n: current.week, range: current.range })}</p>}
        </div>

        <ul className="flex-1 divide-y divide-line border-t border-line">
          {slots.map((slot, i) => (
            <li key={slot?.id ?? `empty-${i}`} className="flex items-start gap-2.5 px-3 py-2">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${slot ? 'border-teal bg-teal' : 'border-dashed border-line bg-card'}`} />
              {slot ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-navy">{slot.name}</span>
                  <span className="block truncate text-2xs text-navy-muted">
                    {t('calendar.tourSlot', { n: i + 1 })} · {t('calendar.stages', { n: slot.stageCount })} · {slot.dateRange}
                  </span>
                </span>
              ) : (
                <span className="min-w-0 flex-1">
                  <span className="block text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('calendar.tourSlot', { n: i + 1 })}</span>
                  <span className="block text-xs italic text-navy-muted/60">{t('calendar.emptySlot')}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <CardLink label={t('calendar.fullCalendar')} href="/calendar" />
      </div>
    </SectionCard>
  );
}
