import Link from 'next/link';
import type { T } from '@/i18n/config';
import type { RankingRow } from '@/lib/ranking/repository';
import { RiderAvatar } from '@/components/rider/RiderAvatar';

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

/** Subtle top-3 accent — a left rail color, never a large podium card. */
function rankAccentClass(rank: number): string {
  if (rank === 1) return 'border-l-2 border-l-amber-400';
  if (rank === 2) return 'border-l-2 border-l-slate-400';
  if (rank === 3) return 'border-l-2 border-l-orange-700/60';
  return '';
}

function RankChange({ value }: { value: number | null }) {
  if (value === null || value === 0) {
    return <span className="text-navy-muted">—</span>;
  }
  if (value > 0) {
    return <span className="font-semibold text-teal-dark">↑ {value}</span>;
  }
  return <span className="font-semibold text-danger">↓ {Math.abs(value)}</span>;
}

/**
 * A real <table>, not a div/CSS "display:table" trick — same rationale as
 * MarketTable (see its own doc comment: an earlier Link-as-table-row
 * version broke row-height calculation badly). One <Link> per cell keeps
 * "whole row clickable" working via `:hover` on the <tr>, without client JS.
 */
export function RankingsTable({ t, riders, rankOffset }: { t: T; riders: RankingRow[]; rankOffset: number }) {
  if (riders.length === 0) {
    return <p className="rounded-card border border-line bg-card p-6 text-center text-sm text-navy-soft shadow-card">{t('ranking.noResults')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs font-semibold uppercase tracking-wide text-navy-muted">
            <th className="px-3.5 py-2.5 font-semibold">{t('ranking.colRank')}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t('ranking.colChange')}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t('ranking.colRider')}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t('ranking.colCountry')}</th>
            <th className="px-3.5 py-2.5 font-semibold">{t('ranking.colAge')}</th>
            <th className="px-3.5 py-2.5 text-right font-semibold">{t('ranking.colPoints')}</th>
          </tr>
        </thead>
        <tbody>
          {riders.map((r, i) => {
            const rank = rankOffset + i + 1;
            const href = `/riders/${r.riderId}`;
            return (
              <tr key={r.riderId} className={`border-b border-line text-navy transition-colors last:border-0 hover:bg-surface ${rankAccentClass(rank)}`}>
                <td className="p-0 font-semibold text-navy-muted"><Link href={href} className="block px-3.5 py-2">{rank}</Link></td>
                <td className="p-0"><Link href={href} className="block px-3.5 py-2"><RankChange value={r.rankChange} /></Link></td>
                <td className="p-0 font-semibold text-navy">
                  <Link href={href} className="flex items-center gap-2 px-3.5 py-1.5">
                    <RiderAvatar seed={r.riderId} size="sm" />
                    <span>{r.firstName} {r.surname}</span>
                  </Link>
                </td>
                <td className="p-0 text-navy-soft">
                  <Link href={href} className="block px-3.5 py-2">
                    <span className="mr-1.5">{FLAGS[r.countryIso2] ?? '🏳️'}</span>{r.countryIso2}
                  </Link>
                </td>
                <td className="p-0 text-navy-soft"><Link href={href} className="block px-3.5 py-2">{r.age}</Link></td>
                <td className="p-0 text-right font-bold tabular-nums text-navy"><Link href={href} className="block px-3.5 py-2">{r.points.toLocaleString()}</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
