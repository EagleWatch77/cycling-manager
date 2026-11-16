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
import { ensureMyDivision, getMyDivisionMembers } from '@/lib/league/repository';
import { getMyRecentResults } from '@/lib/races/recentResults';
import { getMarketPoolSummary } from '@/lib/market/repository';
import { getMyFacilities } from '@/lib/facilities/repository';
import { FACILITY_IDS } from '@/lib/facilities/config';
import { MiniPanel, type MiniRow } from '@/components/dashboard/MiniPanel';
import { divisionCode } from '@/lib/league/divisions';
import { maxSeasonTours, visibleStages } from '@/lib/leagues';
import { dateRange, fullDate } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { SeasonCalendarCard, type CalendarEvent } from '@/components/SeasonCalendarCard';
import { TourPreviewCard, type CurrentTourView } from '@/components/TourPreviewCard';
import { RiderSummaryCard } from '@/components/RiderSummaryCard';
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
  const [plan, recent, bike, contract, members, results, market, facilities] = await Promise.all([
    getTrainingPlan(season.seasonId, plannableWeek),
    listRecentCompletedTrainings(1),
    rider ? findMyBikeCondition(rider.id) : Promise.resolve(null),
    rider ? getMyRiderContract() : Promise.resolve(null),
    getMyDivisionMembers(),
    rider ? getMyRecentResults(rider.id) : Promise.resolve([]),
    getMarketPoolSummary(season.seasonId),
    getMyFacilities(),
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

  // Small windows. Real data only; a window with nothing real behind it gets
  // no rows (renders the neutral dash) and no link.
  const FACILITY_LABEL: Record<(typeof FACILITY_IDS)[number], string> = {
    training: 'facilities.trainingCenter', recovery: 'facilities.recoveryCenter', scouting: 'facilities.scoutingDept',
    technical: 'facilities.technicalFacility', teamCenter: 'facilities.teamCenter',
  };
  const divisionRows: MiniRow[] = division
    ? [
        { key: 'division', label: t('dashboard.division'), value: divisionLabel ?? '—' },
        { key: 'members', label: t('dashboard.divisionMembers'), value: members.length },
        { key: 'rank', label: t('standings.title'), value: '—' },
      ]
    : [];
  const resultRows: MiniRow[] = results.map((r) => ({
    key: r.id, label: r.tourName, value: t('dashboard.resultValue', { pos: r.position, pts: r.points }),
  }));
  const marketRows: MiniRow[] = market.active ? [{ key: 'free', label: t('dashboard.marketFree'), value: market.freeCount }] : [];
  const facilityRows: MiniRow[] = FACILITY_IDS.map((id) => ({ key: id, label: t(FACILITY_LABEL[id]), value: facilities[id] }));

  return (
    <AppShell activeId="home" locale={locale}>
      <div className="space-y-3">
        {/* Manager tasks across the full width. */}
        <ManagerTasksCard t={t} tasks={tasks} />

        {/* Wide main column + narrow right column. On mobile the right column
            (rider, bike, news) comes first: it is what a manager checks first. */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
          <div className="order-2 flex flex-col gap-3 lg:order-1 lg:col-span-8">
            <SeasonCalendarCard
              t={t}
              events={events}
              maxSlots={maxSlots}
              todayLabel={fullDate(season.now, locale)}
              seasonNumber={season.seasonNumber}
              currentWeek={season.currentWeek}
              weeks={weeks}
            />
            <TourPreviewCard t={t} locale={locale} tour={currentTour} />
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
              <MiniPanel icon="trophy" title={t('dashboard.divisionTitle')} rows={divisionRows} href="/rankings/division" linkLabel={t('dashboard.detail')} />
              <MiniPanel icon="flag" title={t('dashboard.resultsTitle')} rows={resultRows} href="/rankings" linkLabel={t('dashboard.detail')} />
              <MiniPanel icon="chart" title={t('analysis.title')} />
              <TrainingOverviewCard t={t} week={plannableWeek} plan={plan} last={recent[0] ?? null} />
            </div>
          </div>
          <div className="order-1 flex flex-col gap-3 lg:order-2 lg:col-span-4">
            <RiderSummaryCard t={t} rider={rider} contractWeeksLeft={contractWeeksLeft} />
            <BikeCard t={t} items={bikeItems} />
            <MiniPanel icon="bell" title={t('dashboard.newsTitle')} />
          </div>
        </div>

        {/* Bottom row: future management windows. */}
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MiniPanel icon="coin" title={t('nav.finance')} />
          <MiniPanel icon="heart" title={t('dashboard.sponsorsTitle')} />
          <MiniPanel icon="staff" title={t('nav.staff')} />
          <MiniPanel icon="cart" title={t('nav.transfers')} rows={marketRows} href="/transfers" linkLabel={t('dashboard.detail')} />
          <MiniPanel icon="building" title={t('nav.facilities')} rows={facilityRows} href="/facilities" linkLabel={t('dashboard.detail')} />
          <MiniPanel icon="crown" title={t('ranking.tabAchievements')} />
        </div>
      </div>
    </AppShell>
  );
}
