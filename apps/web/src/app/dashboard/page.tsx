import { getServerDictionary } from '@/i18n/server';
import {
  PLAYER, RIDER_ATTRIBUTES, LIVE_RACE, SEASON_CALENDAR, DANUBE_TOUR,
  STANDINGS, LAST_STAGE_ANALYSIS, EQUIPMENT, NEXT_TRAINING,
} from '@/mock/dashboard';
import { AppShell } from '@/components/AppShell';
import { RaceStatusCard } from '@/components/RaceStatusCard';
import { SeasonCalendarCard } from '@/components/SeasonCalendarCard';
import { TourPreviewCard } from '@/components/TourPreviewCard';
import { RiderSummaryCard } from '@/components/RiderSummaryCard';
import { StandingsCard } from '@/components/StandingsCard';
import { RaceAnalysisCard } from '@/components/RaceAnalysisCard';
import { EquipmentCard } from '@/components/EquipmentCard';
import { NextTrainingCard, SeasonPositionCard } from '@/components/SmallCards';

/**
 * Home dashboard for a signed-in player. All data arrives from the mock module
 * as props so swapping in real loaders later touches this file only.
 */
export default async function DashboardPage() {
  const { t, locale } = await getServerDictionary();

  return (
    <AppShell activeId="home" locale={locale}>
      <div className="grid grid-cols-12 gap-3">
        <RaceStatusCard t={t} locale={locale} race={LIVE_RACE} />

        <SeasonCalendarCard t={t} events={SEASON_CALENDAR} />
        <TourPreviewCard t={t} locale={locale} league={PLAYER.league} tour={DANUBE_TOUR} />

        <RiderSummaryCard t={t} player={PLAYER} attributes={RIDER_ATTRIBUTES} />
        <StandingsCard t={t} rows={STANDINGS} />
        <RaceAnalysisCard t={t} analysis={LAST_STAGE_ANALYSIS} />

        <EquipmentCard t={t} items={EQUIPMENT} />
        <NextTrainingCard
          t={t}
          training={{ name: NEXT_TRAINING.name, scheduled: NEXT_TRAINING.scheduled, load: NEXT_TRAINING.load }}
        />
        <SeasonPositionCard t={t} player={PLAYER} />
      </div>
    </AppShell>
  );
}
