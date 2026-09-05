import { getServerDictionary } from '@/i18n/server';
import { DANUBE_TOUR } from '@/mock/dashboard';
import { ensureStarterRider } from '@/lib/rider/repository';
import { AppShell } from '@/components/AppShell';
import { SeasonCalendarCard } from '@/components/SeasonCalendarCard';
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
 * DANUBE_TOUR stays: it is shared game content (the Tour schedule), not
 * per-player data, so it is the same for everyone and is not "fake".
 */
export default async function DashboardPage() {
  const { t, locale } = await getServerDictionary();
  const rider = await ensureStarterRider();
  // Every new account starts in Rookie; league lives on the profile, not the
  // rider, and there is no promotion yet.
  const league = 'rookie';

  return (
    <AppShell activeId="home" locale={locale}>
      <div className="grid grid-cols-12 gap-3">
        <SeasonCalendarCard t={t} events={[]} />
        <TourPreviewCard t={t} locale={locale} league={league as never} tour={DANUBE_TOUR} />

        <RiderSummaryCard t={t} rider={rider} />
        <StandingsCard t={t} rows={[]} />

        <EquipmentCard t={t} items={[]} />
      </div>
    </AppShell>
  );
}
