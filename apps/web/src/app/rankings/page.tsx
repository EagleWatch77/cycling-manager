import { getServerDictionary } from '@/i18n/server';
import { getStandings } from '@/lib/rankings/repository';
import { divisionCode } from '@/lib/league/divisions';
import { LEAGUES } from '@/lib/leagues';
import { LeagueTable, LeagueLegend } from '@/components/rankings/LeagueTable';
import { StandingsFilters } from '@/components/rankings/StandingsFilters';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Rebríčky - league standing of the MANAGERS (never of riders). Opens on the
 * signed-in manager's own season, league and sub-league; other leagues and
 * sub-leagues can be browsed. Same data source as the Home window.
 */
export default async function LeagueStandingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerDictionary();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sub = parseInt(one(sp.sub) ?? '', 10);
  const s = await getStandings({ league: one(sp.league), number: Number.isFinite(sub) ? sub : undefined, season: one(sp.season) });
  if (!s) return <Card className="col-span-12"><EmptyState icon="trophy" text={t('lt.empty')} compact /></Card>;

  const name = `${t(`league.${s.league}`)} ${divisionCode(s.number)}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <StandingsFilters
          labels={{ league: t('lt.filterLeague'), division: t('lt.filterDivision'), season: t('lt.filterSeason') }}
          state={{
            league: s.league, number: s.number, season: s.seasonId,
            leagues: LEAGUES.map((id) => ({ id, label: t(`league.${id}`) })),
            subLeagues: s.subLeagues.map((d) => ({ number: d.number, label: `${t(`league.${s.league}`)} ${divisionCode(d.number)}` })),
            seasons: s.seasons.map((x) => ({ id: x.id, label: t('lt.seasonN', { n: x.number }) })),
          }}
        />
        {s.subLeagues.length > 0 && (
          <p className="text-xs font-semibold text-navy-soft">
            <span className="text-navy">{name}</span> · {t('lt.occupancy', { n: s.memberCount, max: s.capacity })}
          </p>
        )}
      </div>

      {s.subLeagues.length === 0 ? (
        <Card className="col-span-12"><EmptyState icon="trophy" text={t('lt.noSubLeague')} compact /></Card>
      ) : s.table.rows.length === 0 ? (
        <Card className="col-span-12"><EmptyState icon="trophy" text={t('lt.empty')} compact /></Card>
      ) : (
        <>
          <LeagueTable table={s.table} t={t} />
          {!s.table.hasStandings && <p className="text-2xs font-medium text-navy-muted">{t('lt.pendingOrder')}</p>}
          <LeagueLegend table={s.table} t={t} />
        </>
      )}
    </div>
  );
}
