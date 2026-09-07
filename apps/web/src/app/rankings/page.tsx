import { getServerDictionary } from '@/i18n/server';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getRiderRankingsPage, hasAnyRankingData } from '@/lib/ranking/repository';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { RankingsToolbar } from '@/components/rankings/RankingsToolbar';
import { RankingsTable } from '@/components/rankings/RankingsTable';
import { MarketPagination } from '@/components/market/MarketPagination';

/**
 * Jazdci — the one fully functional Rankings tab (see the chat report).
 * Ranked strictly by real, persisted race_results points via the
 * rider_rankings view — never by attributes/potential/development. Right
 * now race_results is empty (no race-processing pipeline exists yet — see
 * the report), so this legitimately renders the "not available yet" empty
 * state below rather than any invented row.
 */
export default async function RiderRankingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerDictionary();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  const season = getCurrentSeasonInfo();
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);
  const search = one(sp.q);

  const [result, anyData] = await Promise.all([
    getRiderRankingsPage({ seasonId: season.seasonId, page, search }),
    hasAnyRankingData(season.seasonId),
  ]);

  if (!anyData) {
    return (
      <Card className="col-span-12">
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-rail text-teal">
            <Icon name="trophy" className="h-8 w-8" />
          </span>
          <p className="text-sm font-bold text-navy">{t('ranking.emptyTitle')}</p>
          <p className="max-w-xs text-xs text-navy-soft">{t('ranking.emptyText')}</p>
        </div>
      </Card>
    );
  }

  const buildHref = (targetPage: number) => `/rankings?page=${targetPage}${search ? `&q=${encodeURIComponent(search)}` : ''}`;

  return (
    <>
      <RankingsToolbar t={t} seasonNumber={season.seasonNumber} search={search} />
      <RankingsTable t={t} riders={result.riders} rankOffset={(result.page - 1) * result.pageSize} />
      <MarketPagination t={t} page={result.page} pageSize={result.pageSize} total={result.total} buildHref={buildHref} />
    </>
  );
}
