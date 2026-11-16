import { notFound } from 'next/navigation';
import { getServerDictionary } from '@/i18n/server';
import { LEAGUES, type LeagueId } from '@/lib/leagues';
import { previewStandings } from '@/lib/rankings/fixtures';
import { StandingsView } from '@/components/rankings/StandingsView';

/** Dev-only preview of a full sub-league (50 synthetic managers, in memory). Not reachable in production. */
export default async function RankingsPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { t } = await getServerDictionary();
  const sp = await searchParams;
  const league = (LEAGUES as readonly string[]).includes(sp.league ?? '') ? (sp.league as LeagueId) : 'rookie';
  return (
    <div className="space-y-2">
      <p className="text-2xs font-semibold text-navy-muted">DEV · 50 test managers, memory only</p>
      <StandingsView s={previewStandings(league, 50, Number(sp.ridden ?? 5))} t={t} />
    </div>
  );
}
