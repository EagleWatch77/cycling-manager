import { getServerDictionary } from '@/i18n/server';
import { DANUBE_TOUR } from '@/mock/dashboard';
import { getMyRiderContract } from '@/lib/contract/repository';
import { ensureStarterRider } from '@/lib/rider/repository';
import { getMySeasonRegistrations } from '@/lib/races/registration';
import { getCurrentSeasonInfo, getWeekDateRange } from '@/lib/calendar/season';
import { getSeasonSchedule, getSelectionState } from '@/data/tourSchedule';
import { getTrainingPlan, listRecentCompletedTrainings } from '@/lib/training/repository';
import { findMyBikeCondition } from '@/lib/facilities/bike';
import { buildComponentView, type BikeComponentView } from '@/lib/facilities/bikeDisplay';
import { ensureMyDivision } from '@/lib/league/repository';
import { divisionCode } from '@/lib/league/divisions';
import { maxSeasonTours, visibleStages } from '@/lib/leagues';
import { dateRange, fullDate } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { SeasonCalendarCard, type CalendarEvent } from '@/components/SeasonCalendarCard';
import { TourPreviewCard, type CurrentTourView } from '@/components/TourPreviewCard';
import { RiderSummaryCard } from '@/components/RiderSummaryCard';
import { StandingsCard } from '@/components/StandingsCard';
import { BikeCard } from '@/components/BikeCard';
import { ManagerTasksCard, type ManagerTask } from '@/components/ManagerTasksCard';
import { TrainingOverviewCard } from '@/components/TrainingOverviewCard';

/**
 * Home dashboard for a signed-in player.
 *
 * The rider is real: on first load ensureStarterRider() generates one starter
 * Rookie and persists it, and every later load reads that same rider back.
 * Training overview and the bike card (wear = 100 - stored condition) read real persisted data; manager
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

  // "Aktuálne Tour": the player's own next selected Tour that has not ended
  // yet, else the next Tour with open registration, else the next upcoming
  // one. Real schedule + registrations only; no Tour left = empty state.
  const upcoming = scheduled.filter((v) => v.weekEnd.getTime() >= season.now.getTime());
  const pick =
    upcoming.find((v) => selectedTourIds.has(v.tour.id)) ??
    upcoming.find((v) => v.schedule.registrationOpen && v.startsInDays > 0) ??
    upcoming[0] ??
    null;
  const currentTour: CurrentTourView | null = pick
    ? {
        id: pick.tour.id,
        name: pick.tour.name,
        heroImage: pick.tour.heroImage || undefined,
        term: dateRange(pick.weekStart, pick.weekEnd, locale),
        startsInDays: pick.startsInDays,
        registration: getSelectionState(pick.tour.id, scheduled, selectedTourIds, maxSlots),
        // Elevation profiles exist only for Danube (mock/dashboard.ts, unchanged).
        stages: visibleStages(pick.tour.masterStages, league as never).map((st) => ({
          ...st,
          profile: pick.tour.id === DANUBE_TOUR.id ? DANUBE_TOUR.masterStages.find((d) => d.number === st.number)?.profile : undefined,
        })),
      }
    : null;

  // Same plannable-week rule as the Training page (see
  // lib/training/repository.ts): training is planned one week ahead. This
  // page only reads; it never processes plans (that stays on the Training page).
  const plannableWeek = Math.min(season.currentWeek + 1, season.totalWeeks);
  const [plan, recent, bike, contract] = await Promise.all([
    getTrainingPlan(season.seasonId, plannableWeek),
    listRecentCompletedTrainings(1),
    rider ? findMyBikeCondition(rider.id) : Promise.resolve(null),
    rider ? getMyRiderContract() : Promise.resolve(null),
  ]);

  // Only the stored components. Wheel condition and component levels are not
  // stored yet (null = shown as "-" / hidden), never assumed.
  const bikeItems: BikeComponentView[] | null = bike
    ? [
        buildComponentView({ id: 'wheels', condition: null, level: null }),
        buildComponentView({ id: 'tires', condition: bike.tires, level: null }),
        buildComponentView({ id: 'brakes', condition: bike.brakes, level: null }),
        buildComponentView({ id: 'drivetrain', condition: bike.drivetrain, level: null }),
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

  const contractWeeksLeft = contract && contract.state === 'active' ? contract.remainingWeeks : null;

  return (
    <AppShell activeId="home" locale={locale}>
      <div className="space-y-3">
        {/* Manager tasks across the full width. */}
        <ManagerTasksCard t={t} tasks={tasks} />

        {/* My rider | my bike. */}
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
          <RiderSummaryCard t={t} rider={rider} contractWeeksLeft={contractWeeksLeft} />
          <BikeCard t={t} items={bikeItems} />
        </div>

        {/* Season calendar (+ training overview) | current Tour (+ standings). */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <SeasonCalendarCard
              t={t}
              events={events}
              maxSlots={maxSlots}
              todayLabel={fullDate(season.now, locale)}
              seasonNumber={season.seasonNumber}
              currentWeek={season.currentWeek}
              weeks={weeks}
            />
            <TrainingOverviewCard t={t} week={plannableWeek} plan={plan} last={recent[0] ?? null} />
          </div>
          <div className="flex flex-col gap-3">
            <TourPreviewCard t={t} locale={locale} tour={currentTour} />
            <StandingsCard t={t} rows={[]} subtitle={divisionLabel} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
