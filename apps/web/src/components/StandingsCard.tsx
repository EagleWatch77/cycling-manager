import type { T } from '@/i18n/config';
import type { StandingRow } from '@/mock/dashboard';
import { elapsed, gap } from '@/lib/format';
import { Card, CardLink } from './ui/Card';
import { EmptyState } from './ui/EmptyState';

/**
 * Compact classification table. The player's row is highlighted. With no
 * rows (no race has been processed yet) it shows an empty state instead of
 * any invented standing.
 */
export function StandingsCard({ t, rows, className = '' }: { t: T; rows: StandingRow[]; className?: string }) {
  return (
    <Card title={t('standings.title')} dense className={className}>
      {rows.length === 0 ? (
        <EmptyState compact icon="trophy" title={t('ranking.emptyTitle')} text={t('ranking.emptyText')} />
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-2xs uppercase tracking-wide text-navy-muted">
              <th className="w-8 px-3.5 py-1.5 text-left font-semibold">{t('standings.pos')}</th>
              <th className="py-1.5 text-left font-semibold">{t('standings.rider')}</th>
              <th className="px-3.5 py-1.5 text-right font-semibold">{t('standings.time')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.position} className={r.isPlayer ? 'bg-teal-rail font-semibold' : ''}>
                <td className="px-3.5 py-1.5 tabular-nums text-navy-muted">{r.position}</td>
                <td className="py-1.5 text-navy">
                  <span className="mr-1.5">{r.flag}</span>
                  {r.rider}
                </td>
                <td className="px-3.5 py-1.5 text-right tabular-nums text-navy-soft">
                  {r.gapSec === 0 ? elapsed(r.timeSec) : gap(r.gapSec)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <CardLink label={t('standings.viewAll')} href="/rankings" />
    </Card>
  );
}
