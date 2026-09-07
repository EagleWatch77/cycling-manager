import { getServerDictionary } from '@/i18n/server';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Skauting — UI shell only, per the chat report: no scouting data model
 * (no active-scouting or watchlist table) exists anywhere in the DB yet, so
 * both sections render a clean empty state rather than invented progress
 * percentages or a fake shortlist. The "Scouting knowledge" panel is real
 * explanatory copy, not a data section.
 */
export default async function ScoutingPage() {
  const { t, locale } = await getServerDictionary();

  return (
    <AppShell activeId="scouting" locale={locale}>
      <div className="space-y-3">
        <PageHeader icon={<Icon name="search" className="h-4.5 w-4.5" />} title={t('nav.scouting')} subtitle={t('scouting.subtitle')} />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <SectionCard icon="search" title={t('scouting.activeTitle')}>
            <EmptyState icon="search" text={t('scouting.empty')} />
          </SectionCard>

          <SectionCard icon="heart" title={t('scouting.watchlistTitle')}>
            <EmptyState icon="heart" text={t('scouting.watchlistEmpty')} />
          </SectionCard>
        </div>

        <SectionCard icon="chart" title={t('scouting.knowledgeTitle')}>
          <p className="p-3.5 text-sm leading-relaxed text-navy-soft">{t('scouting.knowledgeText')}</p>
        </SectionCard>
      </div>
    </AppShell>
  );
}
