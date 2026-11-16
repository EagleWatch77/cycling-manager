import { notFound } from 'next/navigation';
import { getServerDictionary } from '@/i18n/server';
import { LEAGUES, type LeagueId } from '@/lib/leagues';
import { previewTable, PREVIEW_RULES } from '@/lib/rankings/fixtures';
import { LeagueTable, LeagueLegend } from '@/components/rankings/LeagueTable';

/** Dev-only preview of a full sub-league (50 synthetic managers, in memory). Not reachable in production. */
export default async function RankingsPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { t } = await getServerDictionary();
  const sp = await searchParams;
  const league = (LEAGUES as readonly string[]).includes(sp.league ?? '') ? (sp.league as LeagueId) : 'rookie';
  const table = previewTable(league, 50, Number(sp.ridden ?? 5), PREVIEW_RULES);
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-navy-soft">DEV · {league} · 50 test managers (memory only)</p>
      <LeagueTable table={table} t={t} />
      <LeagueLegend table={table} t={t} />
    </div>
  );
}
