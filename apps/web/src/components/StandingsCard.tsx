import type { T } from '@/i18n/config';
import type { StandingRow } from '@/mock/dashboard';
import { elapsed, gap } from '@/lib/format';
import { Card, CardLink } from './ui/Card';

/** Compact classification table. The player's row is highlighted. */
export function StandingsCard({ t, rows }: { t: T; rows: StandingRow[] }) {
  return (
    <Card title={t('standings.title')} dense className="col-span-12 lg:col-span-4">
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
      <CardLink label={t('standings.viewAll')} />
    </Card>
  );
}
