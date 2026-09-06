import type { T } from '@/i18n/config';
import { Card, CardLink } from './ui/Card';

export interface CalendarEvent {
  id: string;
  name: string;
  stageCount: number;
  dateRange: string;
  startsInDays: number;
  status: 'live' | 'upcoming';
}

/** Compact upcoming-events list. The live event is highlighted. */
export function SeasonCalendarCard({ t, events }: { t: T; events: CalendarEvent[] }) {
  return (
    <Card title={t('calendar.title')} dense className="col-span-12 lg:col-span-4">
      <ul className="flex-1 divide-y divide-line">
        {events.map((e) => {
          const live = e.status === 'live';
          return (
            <li key={e.id} className={`flex items-center gap-2.5 px-3.5 py-2.5 ${live ? 'bg-teal-rail' : ''}`}>
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${live ? 'border-teal bg-teal' : 'border-line bg-card'}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-navy">{e.name}</span>
                <span className="block text-2xs text-navy-muted">
                  {t('calendar.stages', { n: e.stageCount })} · {e.dateRange}
                </span>
              </span>
              {live ? (
                <span className="rounded bg-teal px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  {t('calendar.inProgress')}
                </span>
              ) : (
                <span className="whitespace-nowrap text-2xs font-medium text-navy-soft">
                  {t('calendar.days', { n: e.startsInDays })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <CardLink label={t('calendar.viewAll')} />
    </Card>
  );
}
