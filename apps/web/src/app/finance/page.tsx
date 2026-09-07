import { getServerDictionary } from '@/i18n/server';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCard } from '@/components/ui/SummaryCard';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Financie — UI shell only. No ledger/transactions table exists in the DB
 * yet, so every summary card shows "—" rather than a number — including
 * budget: the "Rozpočet" figure in the top status bar (mock/dashboard.ts
 * PLAYER.budget) is demo-only mock data by that file's own header comment,
 * not a real persisted value, so it is deliberately NOT reused here (see
 * the chat report — production ranking/finance data must come from the DB,
 * never that mock file). Overview/Expenses/Income sections are structured
 * so a future ledger/transactions repository can fill them in without
 * restructuring this page.
 */
export default async function FinancePage() {
  const { t, locale } = await getServerDictionary();

  return (
    <AppShell activeId="finance" locale={locale}>
      <div className="space-y-3">
        <PageHeader icon={<Icon name="coin" className="h-4.5 w-4.5" />} title={t('nav.finance')} subtitle={t('finance.subtitle')} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon={<Icon name="coin" className="h-4.5 w-4.5" />} label={t('finance.budget')} value="—" />
          <SummaryCard icon={<Icon name="chart" className="h-4.5 w-4.5" />} label={t('finance.income')} value="—" />
          <SummaryCard icon={<Icon name="cart" className="h-4.5 w-4.5" />} label={t('finance.expenses')} value="—" />
          <SummaryCard icon={<Icon name="bolt" className="h-4.5 w-4.5" />} label={t('finance.balance')} value="—" />
        </div>

        <SectionCard icon="chart" title={t('finance.overviewTitle')}>
          <EmptyState icon="coin" text={t('finance.empty')} />
        </SectionCard>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <SectionCard icon="cart" title={t('finance.expensesTitle')}>
            <ul className="p-3.5">
              {[t('finance.expensesRiders'), t('finance.expensesStaff'), t('finance.expensesFacilities'), t('finance.expensesTransfers')].map((label) => (
                <li key={label} className="flex items-center justify-between gap-2.5 border-b border-line py-2 text-sm last:border-0">
                  <span className="text-navy-soft">{label}</span>
                  <span className="font-semibold tabular-nums text-navy-muted">—</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard icon="trophy" title={t('finance.incomeTitle')}>
            <ul className="p-3.5">
              {[t('finance.incomeRaces'), t('finance.incomeSponsors'), t('finance.incomeOther')].map((label) => (
                <li key={label} className="flex items-center justify-between gap-2.5 border-b border-line py-2 text-sm last:border-0">
                  <span className="text-navy-soft">{label}</span>
                  <span className="font-semibold tabular-nums text-navy-muted">—</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
