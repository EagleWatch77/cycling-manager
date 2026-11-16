import type { ReactNode } from 'react';
import { getServerDictionary } from '@/i18n/server';
import { AppShell } from '@/components/AppShell';
import { PageHeaderBand } from '@/components/ui/PageHeaderBand';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { RankingsTabs } from '@/components/rankings/RankingsTabs';

/**
 * Shared shell for /rankings/* — heading + tabs render once here, not per
 * route. "Tímy" is intentionally not a tab at all (see RankingsTabs' own
 * doc comment: no team model exists in the DB yet).
 */
export default async function RankingsLayout({ children }: { children: ReactNode }) {
  const { t, locale } = await getServerDictionary();
  const season = getCurrentSeasonInfo();

  return (
    <AppShell activeId="rankings" locale={locale} banner={false}>
      <div className="space-y-3">
        <PageHeaderBand
          icon="trophy"
          title={t('page.rankings')}
          meta={`${t('races.season')} ${season.seasonNumber} · ${t('races.week')} ${season.currentWeek} / ${season.totalWeeks}`}
        />

        <RankingsTabs labels={{
          league: t('lt.tab'),
          riders: t('ranking.tabRiders'),
          division: t('ranking.tabDivision'),
          nations: t('ranking.tabNations'),
          achievements: t('ranking.tabAchievements'),
        }} />

        {children}
      </div>
    </AppShell>
  );
}
