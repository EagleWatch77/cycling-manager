import { getServerDictionary } from '@/i18n/server';
import { DANUBE_TOUR } from '@/mock/dashboard';
import { ensureStarterRider } from '@/lib/rider/repository';
import { getMySeasonRegistrations } from '@/lib/races/registration';
import { getCurrentSeasonInfo, getWeekDateRange } from '@/lib/calendar/season';
import { getSeasonSchedule } from '@/data/tourSchedule';
import { getTrainingPlan, listRecentCompletedTrainings } from '@/lib/training/repository';
import { getMyBikeCondition } from '@/lib/facilities/bike';
import { ensureMyDivision } from '@/lib/league/repository';
import { divisionCode } from '@/lib/league/divisions';
import { maxSeasonTours, visibleStages } from '@/lib/leagues';
import { dateRange, fullDate } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { SeasonCalendarCard, type CalendarEvent } from '@/components/SeasonCalendarCard';
import { TourPreviewCard } from '@/components/TourPreviewCard';
import { RiderSummaryCard } from '@/components/RiderSummaryCard';
import { StandingsCard } from '@/components/StandingsCard';
import { EquipmentCard, type BikeEquipmentItem } from '@/components/EquipmentCard';
import { ManagerTasksCard, type ManagerTask } from '@/components/ManagerTasksCard';
import { TrainingOverviewCard } from '@/components/TrainingOverviewCard';

/**
 * Home dashboard for a signed-in player.
 *
 * The rider is real: on first load ensureStarterRider() generates one starter
 * Rookie and persists it, and every later load reads that same rider back.
 * Training overview and bike equipment read real persisted data; manager
 * tasks are derived from that same real state. Standings stay a genuine empty
 * state until a race has been processed — no mock races, standings or
 * analysis for a real account.
 *
 * DANUBE_TOUR stays: it is shared game content (the stage/profile art for
 * this card), not per-player data. Its schedule position (startsInDays) is
 * computed live from the real season calendar, not hardcoded.
 */
export default async function DashboardPage() {
  const { t, locale } = await getServerDictionary();
  const rider = await ensureStarterRider();
  // Real league + sub-league (league_memberships). Every new account starts
  // in Rookie; there is no promotion yet. Falls back to Rookie only if the
  // sub-league tables are not deployed.
  const division = await ensureMyDivision();
  const league = division?.league ?? 'rookie';
  const divisionLabel = division ? `${t(`league.${division.league}`)} ${divisionCode(division.number)}` : null;

  const season = getCurrentSeasonInfo();
  const scheduled = getSeasonSchedule(season);

  // Season Calendar card shows only the Rider's own selected Tours (their
  // season program), never the full 5-Tour choice list — sorted by real
  // start date, capped at what this league may select.
  const myRegistrations = await getMySeasonRegistrations(scheduled.map((v) => v.tour.id));
  const selectedTourIds = new Set(myRegistrations.map((r) => r.tourId));
  const selectedTours = scheduled
    .filter((v) => selectedTourIds.has(v.tour.id))
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  const events: CalendarEvent[] = selectedTours.map((v) => ({
    id: v.tour.id,
    name: v.tour.name,
    weekNumber: v.schedule.weekNumber,
    stageCount: visibleStages(v.tour.masterStages, league as never).length,
    dateRange: dateRange(v.weekStart, v.weekEnd, locale),
  }));
  const maxSlots = maxSeasonTours(league as never);

  // Week axis for the calendar card: real UTC date range per season week.
  const weeks = Array.from({ length: season.totalWeeks }, (_, i) => {
    const week = i + 1;
    const { start, end } = getWeekDateRange(season, week);
    return { week, range: dateRange(start, end, locale) };
  });

  const danubeSchedule = scheduled.find((v) => v.tour.id === DANUBE_TOUR.id);
  const danubeTour = { ...DANUBE_TOUR, startsInDays: danubeSchedule?.startsInDays ?? 0 };

  // Same plannable-week rule as the Training page (see
  // lib/training/repository.ts): training is planned one week ahead. This
  // page only reads; it never processes plans (that stays on the Training page).
  const plannableWeek = Math.min(season.currentWeek + 1, season.totalWeeks);
  const [plan, recent, bike] = await Promise.all([
    getTrainingPlan(season.seasonId, plannableWeek),
    listRecentCompletedTrainings(1),
    rider ? getMyBikeCondition(rider.id) : Promise.resolve(null),
  ]);

  const bikeItems: BikeEquipmentItem[] | null = bike
    ? [
        { id: 'overall', labelKey: 'facilities.bikeOverall', icon: 'frame', condition: bike.overall },
        { id: 'tires', labelKey: 'facilities.bikeTires', icon: 'wheel', condition: bike.tires },
        { id: 'brakes', labelKey: 'facilities.bikeBrakes', icon: 'cog', condition: bike.brakes },
        { id: 'drivetrain', labelKey: 'facilities.bikeDrivetrain', icon: 'chain', condition: bike.drivetrain },
      ]
    : null;

  // Manager tasks: only reminders that follow from real state, no task system.
  const tasks: ManagerTask[] = [];
  if (rider && !plan) {
    tasks.push({ id: 'training', text: t('dashboard.taskPlanTraining', { n: plannableWeek }), href: '/rider/training' });
  }
  const canPickTour =
    events.length < maxSlots &&
    scheduled.some((v) => v.schedule.registrationOpen && v.startsInDays > 0 && !selectedTourIds.has(v.tour.id));
  if (rider && canPickTour) {
    tasks.push({ id: 'tours', text: t('dashboard.taskPickTours', { n: events.length, max: maxSlots }), href: '/races' });
  }

  return (
    <AppShell activeId="home" locale={locale}>
      <div className="space-y-3">
        {/* Top row: compact season calendar + wider upcoming race with elevation profile. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <SeasonCalendarCard
            t={t}
            events={events}
            maxSlots={maxSlots}
            todayLabel={fullDate(season.now, locale)}
            seasonNumber={season.seasonNumber}
            currentWeek={season.currentWeek}
            weeks={weeks}
            className="lg:col-span-4"
          />
          <TourPreviewCard t={t} locale={locale} league={league as never} tour={danubeTour} className="lg:col-span-8" />
        </div>

        {/* Bottom: rider | tasks + training | standings + bike. items-start keeps cards content-height. */}
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-3">
          <RiderSummaryCard t={t} rider={rider} />
          <div className="flex flex-col gap-3">
            <ManagerTasksCard t={t} tasks={tasks} />
            <TrainingOverviewCard t={t} week={plannableWeek} plan={plan} last={recent[0] ?? null} />
          </div>
          <div className="flex flex-col gap-3 md:col-span-2 md:grid md:grid-cols-2 md:items-start lg:col-span-1 lg:flex lg:flex-col">
            <StandingsCard t={t} rows={[]} subtitle={divisionLabel} />
            <EquipmentCard t={t} items={bikeItems} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
