import type { ReactNode } from 'react';
import { getServerDictionary } from '@/i18n/server';
import { AppShell } from '@/components/AppShell';
import { RankingsTabs } from '@/components/rankings/RankingsTabs';

/**
 * Shared shell for /rankings/* — heading + tabs render once here, not per
 * route. "Tímy" is intentionally not a tab at all (see RankingsTabs' own
 * doc comment: no team model exists in the DB yet).
 */
export default async function RankingsLayout({ children }: { children: ReactNode }) {
  const { t, locale } = await getServerDictionary();

  return (
    <AppShell activeId="rankings" locale={locale}>
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy">{t('page.rankings')}</h1>
          <p className="mt-0.5 text-sm font-medium text-navy-soft">{t('ranking.subtitle')}</p>
        </div>

        <RankingsTabs labels={{
          riders: t('ranking.tabRiders'),
          nations: t('ranking.tabNations'),
          achievements: t('ranking.tabAchievements'),
        }} />

        {children}
      </div>
    </AppShell>
  );
}
