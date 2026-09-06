import { getServerDictionary } from '@/i18n/server';
import { DANUBE_TOUR } from '@/mock/dashboard';
import { ensureStarterRider } from '@/lib/rider/repository';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getSeasonSchedule } from '@/data/tourSchedule';
import { dateRange } from '@/lib/format';
import { AppShell } from '@/components/AppShell';
import { SeasonCalendarCard, type CalendarEvent } from '@/components/SeasonCalendarCard';
import { TourPreviewCard } from '@/components/TourPreviewCard';
import { RiderSummaryCard } from '@/components/RiderSummaryCard';
import { StandingsCard } from '@/components/StandingsCard';
import { EquipmentCard } from '@/components/EquipmentCard';

/**
 * Home dashboard for a signed-in player.
 *
 * The rider is real: on first load ensureStarterRider() generates one starter
 * Rookie and persists it, and every later load reads that same rider back.
 * Everything else on the board is a genuine empty state until those systems
 * exist — no mock races, standings, analysis or equipment for a real account.
 *
 * DANUBE_TOUR stays: it is shared game content (the stage/profile art for
 * this card), not per-player data. Its schedule position (startsInDays) is
 * computed live from the real season calendar, not hardcoded.
 */
export default async function DashboardPage() {
  const { t, locale } = await getServerDictionary();
  const rider = await ensureStarterRider();
  // Every new account starts in Rookie; league lives on the profile, not the
  // rider, and there is no promotion yet.
  const league = 'rookie';

  const season = getCurrentSeasonInfo();
  const scheduled = getSeasonSchedule(season);
  const events: CalendarEvent[] = scheduled.map((v) => ({
    id: v.tour.id,
    name: v.tour.name,
    stageCount: v.tour.masterStages.length,
    dateRange: dateRange(v.weekStart, v.weekEnd, locale),
    startsInDays: v.startsInDays,
    status: v.isCurrentWeek ? 'live' : 'upcoming',
  }));
  const danubeSchedule = scheduled.find((v) => v.tour.id === DANUBE_TOUR.id);
  const danubeTour = { ...DANUBE_TOUR, startsInDays: danubeSchedule?.startsInDays ?? 0 };

  return (
    <AppShell activeId="home" locale={locale}>
      <div className="grid grid-cols-12 gap-3">
        <SeasonCalendarCard t={t} events={events} />
        <TourPreviewCard t={t} locale={locale} league={league as never} tour={danubeTour} />

        <RiderSummaryCard t={t} rider={rider} />
        <StandingsCard t={t} rows={[]} />

        <EquipmentCard t={t} items={[]} />
      </div>
    </AppShell>
  );
}
