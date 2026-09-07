import { getServerDictionary } from '@/i18n/server';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCard } from '@/components/ui/SummaryCard';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Personál — UI shell only, per the chat report: no staff table (coach,
 * scout, physio, mechanic, ...) exists in the DB yet. Summary cards show
 * "—" rather than 0/fake numbers (0 would falsely imply "we counted and
 * there are zero", vs. "—" honestly says "not tracked yet"). No hiring
 * flow is wired — the CTA is a disabled placeholder for the future one.
 */
export default async function StaffPage() {
  const { t, locale } = await getServerDictionary();

  return (
    <AppShell activeId="staff" locale={locale}>
      <div className="space-y-3">
        <PageHeader icon={<Icon name="staff" className="h-4.5 w-4.5" />} title={t('nav.staff')} subtitle={t('staff.subtitle')} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon={<Icon name="staff" className="h-4.5 w-4.5" />} label={t('staff.countMembers')} value="—" />
          <SummaryCard icon={<Icon name="coin" className="h-4.5 w-4.5" />} label={t('staff.monthlyCost')} value="—" />
        </div>

        <div className="rounded-card border border-line bg-card p-3.5 shadow-card">
          <EmptyState icon="staff" text={t('staff.empty')}
            action={
              <span className="mt-1 cursor-not-allowed rounded-lg bg-line px-4 py-2 text-sm font-semibold text-navy-muted" aria-disabled="true">
                {t('staff.hireCta')}
              </span>
            } />
        </div>
      </div>
    </AppShell>
  );
}
