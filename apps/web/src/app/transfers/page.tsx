import Link from 'next/link';
import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getMarketPage, type MarketSort } from '@/lib/market/playerRepository';
import { isPremiumEntitled } from '@/lib/premium/entitlement';
import { COUNTRIES } from '@/lib/rider/shared';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { MarketTable } from '@/components/market/MarketTable';
import { MarketPagination } from '@/components/market/MarketPagination';
import { MarketFilterBar } from '@/components/market/MarketFilterBar';

const SORTS: readonly MarketSort[] = ['name', 'age', 'country', 'archetype', 'potential'];

/**
 * Trh jazdcov — read-only browsing only (see the chat report, item 28: no
 * signing/bidding/purchase flow yet). Free vs Premium is decided ENTIRELY
 * server-side per request: `tab=premium` in the URL is just what tells this
 * page which query to run, not what grants access — getMarketPage() itself
 * re-checks isPremiumEntitled() and silently serves the free pool to anyone
 * not entitled, and the market_riders_select_available RLS policy is a
 * second, independent gate under that. Nothing here ever generates a market
 * pool — this page only ever reads what already exists (see
 * lib/market/repository.ts / the Admin Market Tools panel).
 */
export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t, locale } = await getServerDictionary();
  const rider = await getMyRider();

  if (!rider) {
    return (
      <AppShell activeId="transfers" locale={locale}>
        <Card className="col-span-12">
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-rail text-teal">
              <Icon name="rider" className="h-8 w-8" />
            </span>
            <p className="text-sm font-bold text-navy">{t('rider.createTitle')}</p>
            <p className="max-w-xs text-xs text-navy-soft">{t('rider.createText')}</p>
            <a href="/rider" className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark">
              {t('rider.createCta')}
            </a>
          </div>
        </Card>
      </AppShell>
    );
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  const premiumEntitled = await isPremiumEntitled();
  const requestedTab = one(sp.tab) === 'premium' ? 'premium' : 'free';
  // A free player landing on ?tab=premium (e.g. a stale link) is quietly
  // treated as 'free' here too — same rule getMarketPage() itself enforces,
  // kept in sync so the active tab in the UI never claims premium falsely.
  const activeTab = requestedTab === 'premium' && premiumEntitled ? 'premium' : 'free';

  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);
  const search = one(sp.q);
  const country = one(sp.country);
  const archetype = one(sp.archetype);
  const ageMin = one(sp.ageMin);
  const ageMax = one(sp.ageMax);
  const potentialRaw = one(sp.potential);
  const potentialStars = ([1, 2, 3, 4, 5] as const).find((s) => String(s) === potentialRaw);
  const sortRaw = one(sp.sort);
  const sort: MarketSort = SORTS.includes(sortRaw as MarketSort) ? (sortRaw as MarketSort) : 'name';

  const season = getCurrentSeasonInfo();
  const result = await getMarketPage({
    seasonId: season.seasonId,
    tier: activeTab,
    page,
    search: activeTab === 'premium' ? search : undefined,
    country: activeTab === 'premium' ? country : undefined,
    archetype: activeTab === 'premium' ? archetype : undefined,
    ageMin: activeTab === 'premium' && ageMin ? Number(ageMin) : undefined,
    ageMax: activeTab === 'premium' && ageMax ? Number(ageMax) : undefined,
    potentialStars: activeTab === 'premium' ? potentialStars : undefined,
    sort: activeTab === 'premium' ? sort : undefined,
  });

  const filterQS = activeTab === 'premium'
    ? `&q=${encodeURIComponent(search)}&country=${encodeURIComponent(country)}&archetype=${encodeURIComponent(archetype)}` +
      `&ageMin=${ageMin}&ageMax=${ageMax}&potential=${potentialRaw}&sort=${sort}`
    : '';
  const buildHref = (targetPage: number) => `/transfers?tab=${activeTab}&page=${targetPage}${filterQS}`;

  const countries = [...COUNTRIES].map((c) => ({ name: c.name, iso2: c.iso2 })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AppShell activeId="transfers" locale={locale}>
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-rail text-teal">
            <Icon name="cart" className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-navy">{t('market.title')}</h1>
            <p className="text-sm font-medium text-navy-soft">{t('market.subtitle')}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 border-b border-line">
          <Link href="/transfers?tab=free"
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'free' ? 'border-b-2 border-teal text-teal-dark' : 'text-navy-muted hover:text-navy'
            }`}>
            {t('market.tabFree')}
          </Link>
          <Link href="/transfers?tab=premium"
            className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'premium' ? 'border-b-2 border-teal text-teal-dark' : 'text-navy-muted hover:text-navy'
            }`}>
            {t('market.tabPremium')}
            {!premiumEntitled && <Icon name="crown" className="h-3.5 w-3.5 text-warn" />}
          </Link>
        </div>

        {/* Info box */}
        {activeTab === 'free' ? (
          <div className="rounded-card border border-line bg-surface p-3.5">
            <p className="text-sm font-bold text-navy">{t('market.freeInfoTitle')}</p>
            <p className="mt-0.5 text-sm text-navy-soft">{t('market.freeInfoText')}</p>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-card border border-warn/30 bg-warn/5 p-3.5">
            <Icon name="crown" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div>
              <p className="text-sm font-bold text-navy">{t('market.premiumInfoTitle')}</p>
              <p className="mt-0.5 text-sm text-navy-soft">{t('market.premiumInfoText')}</p>
            </div>
          </div>
        )}

        {activeTab === 'premium' && (
          <MarketFilterBar t={t} countries={countries} search={search} country={country} archetype={archetype}
            ageMin={ageMin} ageMax={ageMax} potentialStars={potentialRaw} sort={sort} />
        )}

        <MarketTable t={t} riders={result.riders} rankOffset={(result.page - 1) * result.pageSize} />

        <MarketPagination t={t} page={result.page} pageSize={result.pageSize} total={result.total} buildHref={buildHref} />
      </div>
    </AppShell>
  );
}
