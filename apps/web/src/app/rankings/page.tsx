import { getServerDictionary } from '@/i18n/server';
import { getStandings } from '@/lib/rankings/repository';
import { StandingsView } from '@/components/rankings/StandingsView';
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
  return <StandingsView s={s} t={t} />;
}
