import Link from 'next/link';
import type { T } from '@/i18n/config';
import type { MarketRiderView } from '@/lib/market/playerRepository';
import { Icon } from '@/components/ui/Icon';
import { archetypeIcon } from '@/lib/rider/archetypeIcon';
import { RiderAvatar } from '@/components/rider/RiderAvatar';

/**
 * A real <table>, not a div/CSS "display:table" trick (an earlier version
 * of this used Link-as-table-row, which broke row height calculation badly
 * in the browser). "Whole row clickable" is instead one <Link> per cell —
 * `:hover` on the <tr> still highlights the full row regardless of which
 * cell's link the pointer is actually over, so the row still reads and
 * behaves as one clickable unit, entirely without client JS.
 */
export function MarketTable({ t, riders, rankOffset }: { t: T; riders: MarketRiderView[]; rankOffset: number }) {
  if (riders.length === 0) {
    return <p className="rounded-card border border-line bg-card p-6 text-center text-sm text-navy-soft shadow-card">{t('market.noResults')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs font-semibold uppercase tracking-wide text-navy-muted">
            <th className="px-3.5 py-2.5 font-semibold">{t('market.colRank')}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t('market.colName')}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t('market.colCountry')}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t('market.colAge')}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t('market.colType')}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t('market.colPotential')}</th>
          </tr>
        </thead>
        <tbody>
          {riders.map((r, i) => {
            const href = `/transfers/${r.id}`;
            return (
              <tr key={r.id} className="border-b border-line text-navy transition-colors last:border-0 hover:bg-surface">
                <td className="p-0 text-navy-muted"><Link href={href} className="block px-3.5 py-2">{rankOffset + i + 1}</Link></td>
                <td className="p-0 font-semibold text-navy">
                  <Link href={href} className="flex items-center gap-2 px-3.5 py-1.5">
                    <RiderAvatar seed={r.id} size="sm" />
                    <span>{r.firstName} {r.surname}</span>
                  </Link>
                </td>
                <td className="p-0 text-navy-soft">
                  <Link href={href} className="block px-3.5 py-2">
                    <span className="mr-1.5">{flagEmoji(r.countryIso2)}</span>{r.countryIso2}
                  </Link>
                </td>
                <td className="p-0 text-navy-soft"><Link href={href} className="block px-3.5 py-2">{r.age}</Link></td>
                <td className="p-0 text-navy-soft">
                  <Link href={href} className="flex items-center gap-1.5 px-3.5 py-2">
                    <Icon name={archetypeIcon(r.archetype)} className="h-3.5 w-3.5 text-teal" />
                    {t(`style.${r.archetype}`)}
                  </Link>
                </td>
                <td className="p-0 text-teal">
                  <Link href={href} className="block px-3.5 py-2" aria-label={`${r.potentialStars}/5`}>
                    {'★'.repeat(r.potentialStars)}
                    <span className="text-line">{'★'.repeat(5 - r.potentialStars)}</span>
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

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

function flagEmoji(iso2: string): string {
  return FLAGS[iso2] ?? '🏳️';
}
