import type { T } from '@/i18n/config';
import { SectionCard } from '../ui/SectionCard';
import { CardLink } from '../ui/Card';
import { Flag } from '../rankings/LeagueTable';
import type { TableRow } from '@/lib/rankings/table';

export interface StandingsPanelRow { row: TableRow; extra: boolean }

/**
 * Home window "Priebežné poradie": sub-league name, then rank / flag / manager /
 * total points of the top five (plus the signed-in manager's own row below when
 * he is outside them). No stage points, no MS. The whole window links to the
 * full table of the manager's own league and sub-league. Same data as /rankings.
 */
export function StandingsPanel({
  t, title, rows, hasStandings, href, className = '',
}: {
  t: T;
  title: string;
  rows: readonly StandingsPanelRow[];
  hasStandings: boolean;
  href: string;
  className?: string;
}) {
  return (
    <SectionCard icon="trophy" title={<>{title}</>} tone="tint" className={`relative ${className}`}>
      {rows.length === 0 ? (
        <p data-empty="true" className="px-3.5 py-2.5 text-sm font-semibold text-navy-muted" aria-label="—">—</p>
      ) : (
        <ol className="divide-y divide-line text-xs">
          {rows.map(({ row, extra }) => (
            <li key={row.manager.managerId} data-me={row.manager.isMe || undefined} data-extra={extra || undefined}
              className={`flex items-center gap-2 px-3.5 py-1.5 ${row.manager.isMe ? 'bg-teal-rail' : ''} ${extra ? 'border-t-2 border-dashed border-line' : ''}`}>
              <span className="w-5 shrink-0 text-center font-semibold tabular-nums text-navy-soft">{row.position ?? '—'}</span>
              <Flag code={row.manager.countryCode} t={t} />
              <span className={`min-w-0 flex-1 truncate ${row.manager.isMe ? 'font-extrabold' : 'font-semibold'} text-navy`}>{row.manager.displayName ?? '—'}</span>
              <span className="shrink-0 font-bold tabular-nums text-navy">{row.total}</span>
            </li>
          ))}
        </ol>
      )}
      {!hasStandings && rows.length > 0 && <p className="px-3.5 pb-1.5 text-2xs text-navy-muted">{t('lt.homePending')}</p>}
      <a href={href} className="absolute inset-0 rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal" aria-label={t('lt.viewAll')} />
      <CardLink label={t('lt.viewAll')} href={href} />
    </SectionCard>
  );
}
