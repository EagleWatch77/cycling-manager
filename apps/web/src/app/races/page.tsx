import { getServerDictionary } from '@/i18n/server';
import { visibleStageCount } from '@/lib/leagues';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getSeasonSchedule } from '@/data/tourSchedule';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { TourCard } from '@/components/races/TourCard';

const LEAGUE = 'rookie' as const;
const TOURS_ALLOWED = 3;

/**
 * Races screen. Tour content comes from /data/tours; when each Tour runs
 * comes from /data/tourSchedule, joined here against the real season/week
 * (lib/calendar/season) — never a hardcoded season/week/date.
 *
 * Rookie sees only Rookie stages via visibleStages() inside each card. Tour
 * selection and registration happen on the Tour detail page.
 */
export default async function RacesPage() {
  const { t, locale } = await getServerDictionary();
  const season = getCurrentSeasonInfo();
  const scheduled = getSeasonSchedule(season);
  const raceWeeks = scheduled.map((v) => v.schedule.weekNumber);
  const usesSampleData = scheduled.some((v) => v.tour.id.startsWith('sample-'));

  return (
    <AppShell activeId="races" locale={locale}>
      <div className="space-y-4">
        {/* Header + season strip */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="mr-auto">
            <h1 className="text-3xl font-bold tracking-tight text-navy">{t('races.title')}</h1>
            <p className="mt-1 text-sm text-navy-soft">{t('races.subtitle')}</p>
          </div>

          <Card dense className="min-w-[15rem]">
            <div className="flex items-center gap-3 p-3">
              <Icon name="mountain" className="h-6 w-6 text-teal" />
              <div className="flex-1">
                <span className="block text-2xs text-navy-muted">{t('races.tourChoice')}</span>
                <span className="text-sm font-bold text-navy">
                  {t(`league.${LEAGUE}`)} · 0 / {TOURS_ALLOWED}
                </span>
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-teal-rail">
                  <span className="block h-full rounded-full bg-teal" style={{ width: '0%' }} />
                </span>
              </div>
            </div>
          </Card>

          <Card dense className="min-w-[13rem]">
            <div className="flex items-center gap-3 p-3">
              <Icon name="calendar" className="h-6 w-6 text-teal" />
              <div>
                <span className="block text-2xs text-navy-muted">{t('races.raceWeeks')}</span>
                <span className="text-sm font-bold text-navy">{raceWeeks.join(' · ')}</span>
              </div>
            </div>
          </Card>

          <Card dense>
            <div className="flex items-center gap-3 p-3">
              <Icon name="calendar" className="h-5 w-5 text-navy-muted" />
              <div>
                <span className="block text-2xs text-navy-muted">{t('races.season')}</span>
                <span className="text-sm font-bold text-navy">{season.seasonNumber}</span>
              </div>
            </div>
          </Card>

          <Card dense>
            <div className="flex items-center gap-3 p-3">
              <Icon name="calendar" className="h-5 w-5 text-navy-muted" />
              <div>
                <span className="block text-2xs text-navy-muted">{t('races.week')}</span>
                <span className="text-sm font-bold text-navy">{season.currentWeek} / {season.totalWeeks}</span>
              </div>
            </div>
          </Card>
        </div>

        {usesSampleData && (
          <p className="rounded-lg border border-line bg-card px-3 py-2 text-2xs text-navy-muted">
            {t('races.demoNote')}
          </p>
        )}

        {/* Tour grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {scheduled.map((view) => (
            <TourCard key={view.tour.id} t={t} locale={locale} league={LEAGUE} view={view} />
          ))}
        </div>
        {scheduled.length === 0 && (
          <p className="text-sm text-navy-soft">{t('races.noneEntered')}</p>
        )}

        {/* Explainer + your program */}
        <div className="grid grid-cols-12 gap-3">
          <Card dense className="col-span-12 lg:col-span-7">
            <div className="p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
                <Icon name="flag" className="h-4 w-4 text-teal" />
                {t('races.howTitle')}
              </h2>
              <ul className="mt-2 space-y-1 text-sm text-navy-soft">
                {['races.how1', 'races.how2', 'races.how3'].map((k) => (
                  <li key={k} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal" />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card title={t('races.yourProgram')} dense className="col-span-12 lg:col-span-5">
            <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
              <Icon name="calendar" className="h-8 w-8 text-navy-muted/50" />
              <p className="max-w-xs text-xs text-navy-soft">{t('races.noneEntered')}</p>
            </div>
          </Card>
        </div>

        <p className="text-2xs text-navy-muted">
          {t('races.weeksNote', { league: t(`league.${LEAGUE}`) })}
          {' · '}
          {t('races.canChoose', { n: TOURS_ALLOWED })}
          {' · '}
          {visibleStageCount(LEAGUE)} {t('tour.stages').toLowerCase()}
        </p>
      </div>
    </AppShell>
  );
}
