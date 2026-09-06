import { getServerDictionary } from '@/i18n/server';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getSeasonSchedule } from '@/data/tourSchedule';
import { fullDate, dateRange } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';

/**
 * Season calendar: real season/week/date (lib/calendar/season) plus every
 * Tour scheduled for the current season (data/tourSchedule), joined here.
 * No automatic season generation — a future season needs its own schedule
 * entries added by hand.
 */
export default async function CalendarPage() {
  const { t, locale } = await getServerDictionary();
  const season = getCurrentSeasonInfo();
  const scheduled = getSeasonSchedule(season);

  return (
    <AppShell activeId="calendar" locale={locale}>
      <div className="space-y-3">
        <Card dense>
          <div className="flex flex-wrap items-center gap-6 p-4">
            <div>
              <span className="block text-2xs text-navy-muted">{t('races.season')}</span>
              <span className="text-lg font-bold text-navy">{season.seasonNumber}</span>
            </div>
            <div>
              <span className="block text-2xs text-navy-muted">{t('races.week')}</span>
              <span className="text-lg font-bold text-navy">{season.currentWeek} / {season.totalWeeks}</span>
            </div>
            <div className="ml-auto text-sm text-navy-soft">{fullDate(season.now, locale)}</div>
          </div>
        </Card>

        <Card title={t('calendar.title')} dense>
          <ul className="divide-y divide-line">
            {scheduled.map((view) => (
              <li
                key={view.tour.id}
                className={`flex items-center gap-3 px-3.5 py-2.5 ${view.isCurrentWeek ? 'bg-teal-rail' : ''}`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                    view.isCurrentWeek ? 'border-teal bg-teal' : 'border-line bg-card'
                  }`}
                />
                <span className="w-20 shrink-0 text-2xs font-semibold text-navy-muted">
                  {t('races.weekN', { n: view.schedule.weekNumber })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-navy">{view.tour.name}</span>
                  <span className="block text-2xs text-navy-muted">
                    {t('calendar.stages', { n: view.tour.masterStages.length })} · {dateRange(view.weekStart, view.weekEnd, locale)}
                  </span>
                </span>
                {view.isCurrentWeek ? (
                  <span className="rounded bg-teal px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    {t('calendar.inProgress')}
                  </span>
                ) : (
                  <span className="whitespace-nowrap text-2xs font-medium text-navy-soft">
                    {t('calendar.days', { n: view.startsInDays })}
                  </span>
                )}
              </li>
            ))}
            {scheduled.length === 0 && (
              <li className="px-3.5 py-4 text-sm text-navy-soft">{t('races.noneEntered')}</li>
            )}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
