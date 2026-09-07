import Link from 'next/link';
import type { T } from '@/i18n/config';

const ARCHETYPES = ['climber', 'sprinter', 'puncheur', 'rouleur', 'timeTrial', 'classics', 'allrounder'];

/**
 * A plain GET <form> — submitting it navigates to a new URL with query
 * params, which the server component re-reads and re-queries with
 * (lib/market/playerRepository.ts getMarketPage). No client JS, no
 * client-side filtering of an already-fetched list: every filter change is
 * a real server-side query.
 */
export function MarketFilterBar({
  t, countries, search, country, archetype, ageMin, ageMax, potentialStars, sort,
}: {
  t: T;
  countries: { name: string; iso2: string }[];
  search: string;
  country: string;
  archetype: string;
  ageMin: string;
  ageMax: string;
  potentialStars: string;
  sort: string;
}) {
  return (
    <form method="get" className="rounded-card border border-line bg-card p-3 shadow-card">
      <input type="hidden" name="tab" value="premium" />
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[180px] flex-1">
          <span className="mb-1 block text-2xs font-semibold text-navy-muted">{t('market.colName')}</span>
          <input type="text" name="q" defaultValue={search} placeholder={t('market.searchPlaceholder')}
            className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal" />
        </label>

        <label>
          <span className="mb-1 block text-2xs font-semibold text-navy-muted">{t('market.filterCountry')}</span>
          <select name="country" defaultValue={country}
            className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-navy">
            <option value="">{t('market.allCountries')}</option>
            {countries.map((c) => <option key={c.iso2} value={c.name}>{c.name}</option>)}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-2xs font-semibold text-navy-muted">{t('market.filterArchetype')}</span>
          <select name="archetype" defaultValue={archetype}
            className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-navy">
            <option value="">{t('market.allArchetypes')}</option>
            {ARCHETYPES.map((a) => <option key={a} value={a}>{t(`style.${a}`)}</option>)}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-2xs font-semibold text-navy-muted">{t('market.filterAge')}</span>
          <span className="flex items-center gap-1">
            <input type="number" name="ageMin" defaultValue={ageMin} min={16} max={45} placeholder="—"
              className="w-14 rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-navy" />
            <span className="text-navy-muted">–</span>
            <input type="number" name="ageMax" defaultValue={ageMax} min={16} max={45} placeholder="—"
              className="w-14 rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-navy" />
          </span>
        </label>

        <label>
          <span className="mb-1 block text-2xs font-semibold text-navy-muted">{t('market.filterPotential')}</span>
          <select name="potential" defaultValue={potentialStars}
            className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-navy">
            <option value="">{t('market.anyPotential')}</option>
            {[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>{'★'.repeat(s)}</option>)}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-2xs font-semibold text-navy-muted">{t('market.filterSort')}</span>
          <select name="sort" defaultValue={sort}
            className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-navy">
            <option value="name">{t('market.sortName')}</option>
            <option value="age">{t('market.sortAge')}</option>
            <option value="country">{t('market.sortCountry')}</option>
            <option value="archetype">{t('market.sortArchetype')}</option>
            <option value="potential">{t('market.sortPotential')}</option>
          </select>
        </label>

        <button type="submit"
          className="rounded-lg bg-teal px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-teal-dark">
          {t('market.applyFilters')}
        </button>
        <Link href="/transfers?tab=premium"
          className="rounded-lg border border-line px-4 py-1.5 text-sm font-semibold text-navy-soft transition-colors hover:bg-surface">
          {t('market.clearFilters')}
        </Link>
      </div>
    </form>
  );
}
