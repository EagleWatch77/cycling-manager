import type { T } from '@/i18n/config';
import type { Standings } from '@/lib/rankings/repository';
import { divisionCode } from '@/lib/league/divisions';
import { LEAGUES } from '@/lib/leagues';
import { WORLD_CHAMPIONSHIP } from '@/lib/rankings/config';
import { LeagueTable, LeagueLegend } from './LeagueTable';
import { StandingsFilters } from './StandingsFilters';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';

/** Presentational body of Rebríčky (filters + white league window); shared by the page and the dev previews. */
export function StandingsView({ s, t }: { s: Standings; t: T }) {
  const name = `${t(`league.${s.league}`)} ${divisionCode(s.number)}`;
  const filters = (
    <StandingsFilters
      labels={{ league: t('lt.filterLeague'), division: t('lt.filterDivision'), season: t('lt.filterSeason') }}
      state={{
        league: s.league, number: s.number, season: s.seasonId,
        leagues: LEAGUES.map((id) => ({ id, label: t(`league.${id}`) })),
        subLeagues: s.subLeagues.map((d) => ({ number: d.number, label: `${t(`league.${s.league}`)} ${divisionCode(d.number)}` })),
        seasons: s.seasons.map((x) => ({ id: x.id, label: t('lt.seasonN', { n: x.number }) })),
      }}
    />
  );
  const info = (icon: string, text: string) => (
    <span className="inline-flex items-center gap-1.5 text-table font-semibold text-navy-soft">
      <Icon name={icon} className="h-4 w-4 text-teal" />{text}
    </span>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-card border border-line bg-card px-4 py-3 shadow-card">{filters}</div>

      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        {s.subLeagues.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <h2 className="text-section text-navy">{name}</h2>
            {info('team', t('lt.infoOccupancy', { n: s.memberCount, max: s.capacity }))}
            {info('flag', t('lt.infoTours', { n: s.table.tours }))}
            {info('trophy', t('lt.infoMs', { n: WORLD_CHAMPIONSHIP.eventWeek }))}
          </div>
        )}
        {s.subLeagues.length === 0 ? (
          <EmptyState icon="trophy" text={t('lt.noSubLeague')} compact />
        ) : s.table.rows.length === 0 ? (
          <EmptyState icon="trophy" text={t('lt.empty')} compact />
        ) : (
          <div className="space-y-3">
            <LeagueTable table={s.table} t={t} />
            {!s.table.hasStandings && <p className="text-2xs font-medium text-navy-muted">{t('lt.pendingOrder')}</p>}
            <LeagueLegend table={s.table} t={t} />
          </div>
        )}
      </section>
    </div>
  );
}
