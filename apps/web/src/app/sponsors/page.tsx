import Link from 'next/link';
import { getServerDictionary } from '@/i18n/server';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCard } from '@/components/ui/SummaryCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';
import { ContractCard, OfferCard } from '@/components/sponsors/SponsorCards';
import { getMyLeague } from '@/lib/facilities/repository';
import { getMySponsorData } from '@/lib/sponsors/repository';
import { APPROVED_MAIN_SPONSORS } from '@/lib/sponsors/catalog';
import { demoContracts, demoOffers } from '@/lib/sponsors/demo';
import { MAX_OFFERS, SPONSOR_LIMITS, type SponsorKind } from '@/lib/sponsors/rules';

/**
 * Sponzori. Real data comes from the player's own rows (row-level security); `?demo=1` swaps in clearly labelled sample cards so the
 * design can be checked. No amount is invented: money fields are "Zatiaľ neurčené" until the owner approves the sponsor economy,
 * and signing / early termination stay disabled (the database has no function for them yet — migration 20261122_01).
 * The market shows ONLY the player's own (max 3) main offers, picked by the server-side generator (migration 20261122_03); the 30-company
 * catalogue is generator input and is never listed. Tabs are plain links (no client JavaScript), so the page also works with JS off and on slow phones.
 */
export default async function SponsorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t, locale } = await getServerDictionary();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tab = one(sp.tab) === 'market' ? 'market' : 'contracts';
  const demo = one(sp.demo) === '1';

  const now = new Date();
  const league = await getMyLeague();
  const real = await getMySponsorData(now);
  // DEMO names are fictional catalogue names (the players cannot read the catalogue from the database any more)
  const demoNames = APPROVED_MAIN_SPONSORS;
  const secondaryLabel = (n: number) => t('sp.demo.secondaryName', { n });
  const contracts = demo ? demoContracts(now, demoNames, secondaryLabel) : real.contracts;
  const offers = (demo ? demoOffers(now, demoNames) : real.offers).filter((o) => o.kind === 'main');

  const activeByKind: Record<SponsorKind, number> = {
    main: contracts.filter((c) => c.kind === 'main').length,
    secondary: contracts.filter((c) => c.kind === 'secondary').length,
  };
  const limits = SPONSOR_LIMITS[league];

  const href = (over: { tab?: string; demo?: boolean }) => {
    const q = new URLSearchParams();
    const tb = over.tab ?? tab; if (tb !== 'contracts') q.set('tab', tb);
    if (over.demo ?? demo) q.set('demo', '1');
    const s = q.toString();
    return s ? `/sponsors?${s}` : '/sponsors';
  };
  const tabCls = (active: boolean) =>
    `rounded-t-lg px-3.5 py-2 text-sm font-semibold transition-colors ${active ? 'border-b-2 border-teal text-teal-dark' : 'text-navy-muted hover:text-navy'}`;

  return (
    <AppShell activeId="sponsors" locale={locale}>
      <div className="space-y-3">
        <PageHeader icon={<Icon name="crown" className="h-4.5 w-4.5" />} title={t('nav.sponsors')} subtitle={t('sp.subtitle')}
          action={<Link href={href({ demo: !demo })} className="text-xs font-semibold text-teal hover:underline">{t(demo ? 'sp.demo.hide' : 'sp.demo.show')}</Link>} />

        {demo && <p role="status" className="rounded-card border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">{t('sp.demo.banner')}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard icon={<Icon name="crown" className="h-4.5 w-4.5" />} label={t('sp.slots.main')} value={`${activeByKind.main} / ${limits.main}`} />
          <SummaryCard icon={<Icon name="staff" className="h-4.5 w-4.5" />} label={t('sp.slots.secondary')} value={`${activeByKind.secondary} / ${limits.secondary}`} />
          <SummaryCard icon={<Icon name="cart" className="h-4.5 w-4.5" />} label={t('sp.slots.offers')} value={`${offers.length} / ${MAX_OFFERS.main}`} />
        </div>

        <nav className="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-line px-1" aria-label={t('nav.sponsors')}>
          <Link href={href({ tab: 'contracts' })} className={tabCls(tab === 'contracts')} aria-current={tab === 'contracts' ? 'page' : undefined}>{t('sp.tab.contracts')}</Link>
          <Link href={href({ tab: 'market' })} className={tabCls(tab === 'market')} aria-current={tab === 'market' ? 'page' : undefined}>{t('sp.tab.market')}</Link>
        </nav>

        {tab === 'contracts' ? (
          contracts.length === 0 ? (
            <Card><EmptyState icon="crown" text={t('sp.empty.contracts')} /></Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {contracts.map((c) => <ContractCard key={c.id} c={c} now={now} locale={locale} t={t} />)}
            </div>
          )
        ) : (
          <>
            <p className="px-1 text-xs text-navy-muted">{t('sp.market.note')}</p>
            {offers.length === 0 ? (
              <Card><EmptyState icon="cart" text={t('sp.empty.market')} /></Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {offers.map((o) => (
                  <OfferCard key={o.id} o={o} now={now} locale={locale} t={t} league={league} activeByKind={activeByKind}
                    lastSignedCompanyId={demo ? null : real.lastSignedCompanyId} economyEnabled={demo ? false : real.economyEnabled} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
