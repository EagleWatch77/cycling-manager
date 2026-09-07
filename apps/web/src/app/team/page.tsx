import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { POTENTIAL_MIN, POTENTIAL_MAX } from '@/lib/rider/config';
import { potentialToStars } from '@/lib/rider/development';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCard } from '@/components/ui/SummaryCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import type { StoredRider } from '@/lib/rider/repository';

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

/**
 * Tím — roster overview. No multi-rider team model exists yet (see the
 * chat report): a player owns exactly one rider (riders.player_id is
 * UNIQUE). This page is honest about that — it lists the one rider that
 * really is "your team" today via existing ownership, rather than
 * inventing a roster or a team name. The table/columns are shaped for a
 * real multi-rider roster so nothing here needs restructuring once that
 * model exists — only the data source changes.
 */
export default async function TeamPage() {
  const { t, locale } = await getServerDictionary();
  const rider = await getMyRider();

  if (!rider) {
    return (
      <AppShell activeId="team" locale={locale}>
        <Card className="col-span-12">
          <EmptyState icon="rider" title={t('rider.createTitle')} text={t('rider.createText')}
            action={
              <a href="/rider" className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark">
                {t('rider.createCta')}
              </a>
            } />
        </Card>
      </AppShell>
    );
  }

  const riders: StoredRider[] = [rider];
  const avgAge = Math.round(riders.reduce((sum, r) => sum + r.age, 0) / riders.length);

  const columns: DataTableColumn<StoredRider>[] = [
    { header: t('team.colRider'), render: (r) => (
      <span className="flex items-center gap-2 font-semibold text-navy">
        <RiderAvatar seed={r.id} size="sm" />
        <span>{r.firstName} {r.surname}</span>
      </span>
    ) },
    { header: t('team.colCountry'), render: (r) => <span className="text-navy-soft"><span className="mr-1.5">{FLAGS[r.countryIso2] ?? '🏳️'}</span>{r.countryIso2}</span> },
    { header: t('team.colAge'), render: (r) => <span className="text-navy-soft">{r.age}</span> },
    { header: t('team.colType'), render: (r) => <span className="text-navy-soft">{t(`style.${r.inferredArchetype}`)}</span> },
    { header: t('team.colPotential'), render: (r) => {
      const stars = potentialToStars(r.potential, POTENTIAL_MIN, POTENTIAL_MAX);
      return <span className="text-teal" aria-label={`${stars}/5`}>{'★'.repeat(stars)}<span className="text-line">{'★'.repeat(5 - stars)}</span></span>;
    } },
    { header: t('team.colStatus'), render: () => <StatusBadge label={t('team.statusActive')} tone="teal" /> },
    { header: t('team.colContract'), render: () => <span className="text-navy-muted">—</span> },
  ];

  return (
    <AppShell activeId="team" locale={locale}>
      <div className="space-y-3">
        <PageHeader icon={<Icon name="team" className="h-4.5 w-4.5" />} title={t('nav.team')} subtitle={t('team.subtitle')} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon={<Icon name="team" className="h-4.5 w-4.5" />} label={t('team.countRiders')} value={riders.length} />
          <SummaryCard icon={<Icon name="calendar" className="h-4.5 w-4.5" />} label={t('team.avgAge')} value={avgAge} />
        </div>

        <DataTable columns={columns} rows={riders} rowKey={(r) => r.id} rowHref={() => '/rider'} emptyText={t('team.empty')} />

        <p className="text-2xs text-navy-soft">{t('team.limitNote')}</p>
      </div>
    </AppShell>
  );
}
