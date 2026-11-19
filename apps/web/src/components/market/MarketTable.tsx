import Link from 'next/link';
import type { T } from '@/i18n/config';
import type { MarketRiderView } from '@/lib/market/playerRepository';
import { Icon } from '@/components/ui/Icon';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { archetypeIcon } from '@/lib/rider/archetypeIcon';
import { RiderAvatar } from '@/components/rider/RiderAvatar';

/**
 * A real <table>, not a div/CSS "display:table" trick (an earlier version
 * of this used Link-as-table-row, which broke row height calculation badly
 * in the browser). "Whole row clickable" is instead one <Link> per cell —
 * `:hover` on the <tr> still highlights the full row regardless of which
 * cell's link the pointer is actually over, so the row still reads and
 * behaves as one clickable unit, entirely without client JS.
 *
 * Quick-orientation list only: rank, rider, country (flag), age, type, OVR. Potential stars live in the rider detail, not here.
 * Visual language = existing tokens only (navy header, teal accents, mint stripes); the order itself is decided in
 * lib/market/marketSort.ts and is not touched here.
 */
export function MarketTable({ t, riders, rankOffset }: { t: T; riders: MarketRiderView[]; rankOffset: number }) {
  if (riders.length === 0) {
    return <p className="rounded-card border border-line bg-card p-6 text-center text-sm text-navy-soft shadow-card">{t('market.noResults')}</p>;
  }

  const th = 'px-3 py-3 font-semibold sm:px-3.5';
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="bg-navy text-left text-2xs font-semibold uppercase tracking-wide text-white/80">
            <th className={`${th} w-10 text-center`}>{t('market.colRank')}</th>
            <th className={th}>{t('market.colName')}</th>
            <th className={`${th} w-14 text-center sm:w-auto sm:text-left`}>{t('market.colCountry')}</th>
            <th className={`${th} hidden w-14 sm:table-cell`}>{t('market.colAge')}</th>
            <th className={`${th} hidden md:table-cell`}>{t('market.colType')}</th>
            <th className={`${th} w-20 text-center text-teal-light`}>{t('rating.overall')}</th>
          </tr>
        </thead>
        <tbody>
          {riders.map((r, i) => {
            const href = `/transfers/${r.id}`;
            return (
              <tr key={r.id} className="group border-b border-line text-navy transition-colors last:border-0 odd:bg-card even:bg-mint-stripe hover:bg-teal-rail">
                <td className="p-0 text-center text-xs font-semibold tabular-nums text-navy-muted">
                  <Link href={href} className="block border-l-[3px] border-transparent px-2 py-3 group-hover:border-teal">{rankOffset + i + 1}</Link>
                </td>
                <td className="p-0 font-semibold text-navy">
                  <Link href={href} className="flex items-center gap-2.5 px-3 py-2 sm:px-3.5">
                    <RiderAvatar seed={r.id} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate">{r.firstName} {r.surname}</span>
                      <span className="block text-2xs font-medium text-navy-muted sm:hidden">{r.age} · {t(`style.${r.archetype}`)}</span>
                    </span>
                  </Link>
                </td>
                <td className="p-0 text-navy-soft">
                  <Link href={href} className="flex items-center justify-center gap-2 px-3 py-2 sm:justify-start sm:px-3.5" title={r.countryName}>
                    <CountryFlag iso2={r.countryIso2} name={r.countryName} />
                    <span className="hidden lg:inline">{r.countryName}</span>
                  </Link>
                </td>
                <td className="hidden p-0 tabular-nums text-navy-soft sm:table-cell"><Link href={href} className="block px-3.5 py-2">{r.age}</Link></td>
                <td className="hidden p-0 text-navy-soft md:table-cell">
                  <Link href={href} className="flex items-center gap-1.5 px-3.5 py-2">
                    <Icon name={archetypeIcon(r.archetype)} className="h-3.5 w-3.5 text-teal" />
                    {t(`style.${r.archetype}`)}
                  </Link>
                </td>
                <td className="p-0 text-center">
                  <Link href={href} className="flex items-center justify-center px-2 py-2" aria-label={`${t('rating.overall')} ${r.overallRating}`}>
                    <span className="inline-flex min-w-[2.75rem] items-center justify-center rounded-lg bg-navy px-2 py-1 text-base font-extrabold tabular-nums text-white shadow-sm group-hover:bg-teal">
                      {r.overallRating}
                    </span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
