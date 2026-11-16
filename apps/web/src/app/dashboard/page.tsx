import { getServerDictionary } from '@/i18n/server';
import { DANUBE_TOUR } from '@/mock/dashboard';
import { getMyRiderContract } from '@/lib/contract/repository';
import { ensureStarterRider } from '@/lib/rider/repository';
import { getMySeasonRegistrations } from '@/lib/races/registration';
import { getCurrentSeasonInfo, getWeekDateRange } from '@/lib/calendar/season';
import { getSeasonSchedule, getSelectionState } from '@/data/tourSchedule';
import { BASE_BIKE_LEVEL, BIKE_EQUIPMENT_IDS } from '@/lib/bike/equipment';
import { findMyBikeComponentStates } from '@/lib/facilities/bike';
import { ensureMyDivision } from '@/lib/league/repository';
import { MiniPanel } from '@/components/dashboard/MiniPanel';
import { StandingsPanel } from '@/components/dashboard/StandingsPanel';
import { getStandings } from '@/lib/rankings/repository';
import { homeRows } from '@/lib/rankings/table';
import { LiveRaceCard } from '@/components/LiveRaceCard';
import { divisionCode } from '@/lib/league/divisions';
import { maxSeasonTours, visibleStages } from '@/lib/leagues';
import { dateRange, fullDate } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { SeasonCalendarCard, type CalendarEvent } from '@/components/SeasonCalendarCard';
import { TourPreviewCard, type CurrentTourView } from '@/components/TourPreviewCard';
import { RiderSummaryCard } from '@/components/RiderSummaryCard';
import { BikeCard, type BikeOverviewItem } from '@/components/BikeCard';

/**
 * Home dashboard (layout per the Cycling Dynasty reference, our own content).
 *
 * Desktop: 8/4 split. Left: Preteky naživo, then Kalendár sezóny (3) +
 * Najbližšie preteky (5, dominant), then Priebežné poradie + Môj bicykel.
 * Right: Môj jazdec only (the space below it is intentionally free). Bottom
 * row: Sponzori | Manažérske úlohy | Technický riaditeľ. Mobile: one column in
 * DOM order. Real data only; windows without data are an intentional dash.
 *
 * Manažérske úlohy are now long-term career goals (not implemented yet). The
 * old short-term reminders live on, unrendered, in
 * lib/dashboard/shortTermReminders.ts. Training overview, facilities, market,
 * finance, staff, achievements and the other earlier small windows are no
 * longer on Home (their pages are unchanged).
 *
 * DANUBE_TOUR stays: shared game content (the stage/profile art), not
 * per-player data. Everything about timing comes from the real season calendar.
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
        // Real start of the Tour week minus server "now"; null once it has started.
        countdownMs: pick.startsInDays > 0 ? Math.max(0, pick.weekStart.getTime() - season.now.getTime()) : null,
        registration: getSelectionState(pick.tour.id, scheduled, selectedTourIds, maxSlots),
        // Elevation profiles exist only for Danube (mock/dashboard.ts, unchanged).
        stages: visibleStages(pick.tour.masterStages, league as never).map((st) => ({
          ...st,
          profile: pick.tour.id === DANUBE_TOUR.id ? DANUBE_TOUR.masterStages.find((d) => d.number === st.number)?.profile : undefined,
        })),
      }
    : null;

  const [bike, contract] = await Promise.all([
    rider ? findMyBikeComponentStates(rider.id) : Promise.resolve(null),
    rider ? getMyRiderContract() : Promise.resolve(null),
  ]);

  // Same source as /bike: bike_condition (condition, 100 = new = the "state" shown here). Frame and wheels come
  // from migration 20261116_03; until it is run they are null (dash). Component levels are not stored (base level).
  const bikeItems: BikeOverviewItem[] | null = rider
    ? BIKE_EQUIPMENT_IDS.map((id) => ({ id, level: BASE_BIKE_LEVEL, state: bike ? bike[id] : null }))
    : null;
  // ONE shared source with /rankings: the manager's own season, league and sub-league.
  const standings = await getStandings();
  const standingsRows = standings ? homeRows(standings.table) : [];
  const standingsHref = standings ? `/rankings?league=${standings.league}&sub=${standings.number}&season=${standings.seasonId}` : '/rankings';
  const contractWeeksLeft = contract && contract.state === 'active' ? contract.remainingWeeks : null;

  return (
    <AppShell activeId="home" locale={locale}>
      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-12">
        <LiveRaceCard t={t} className="lg:col-span-8 lg:col-start-1 lg:row-start-1" />
        <RiderSummaryCard t={t} rider={rider} contractWeeksLeft={contractWeeksLeft} className="self-start lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1" />
        <TourPreviewCard t={t} locale={locale} tour={currentTour} className="lg:col-span-5 lg:col-start-4 lg:row-start-2" />
        <SeasonCalendarCard
          t={t}
          events={events}
          maxSlots={maxSlots}
          todayLabel={fullDate(season.now, locale)}
          seasonNumber={season.seasonNumber}
          currentWeek={season.currentWeek}
          weeks={weeks}
          className="lg:col-span-3 lg:col-start-1 lg:row-start-2"
        />
        <StandingsPanel
          t={t}
          title={`${t('dashboard.liveStandingsTitle')}${divisionLabel ? ` · ${divisionLabel}` : ''}`}
          rows={standingsRows}
          hasStandings={standings?.table.hasStandings ?? false}
          href={standingsHref}
          className="self-start lg:col-span-4 lg:col-start-1 lg:row-start-3"
        />
        <BikeCard t={t} items={bikeItems} className="lg:col-span-4 lg:col-start-5 lg:row-start-3" />

        {/* Bottom row across the full width. Contents are empty on purpose. */}
        <MiniPanel icon="heart" title={t('dashboard.sponsorsTitle')} className="self-start lg:col-span-4 lg:col-start-1 lg:row-start-4" />
        <MiniPanel icon="bell" title={t('dashboard.tasksTitle')} className="self-start lg:col-span-4 lg:col-start-5 lg:row-start-4" />
        <MiniPanel icon="staff" title={t('dashboard.technicalDirectorTitle')} className="self-start lg:col-span-4 lg:col-start-9 lg:row-start-4" />
      </div>
    </AppShell>
  );
}
