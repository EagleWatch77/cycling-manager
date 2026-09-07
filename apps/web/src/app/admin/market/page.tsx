import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getMarketPoolSummary, getAdminMarketRiders } from '@/lib/market/repository';
import { MARKET_AUTO_GENERATION_WEEK } from '@/lib/market/config';
import { MarketToolsPanel } from '@/components/admin/MarketToolsPanel';

/**
 * Admin-only Transfer Market test tooling. Generation/reset are gated by
 * requireAdmin() here AND independently inside the server actions
 * (app/admin/market/actions.ts) AND by market_riders_admin_all RLS — three
 * independent layers, same defense-in-depth pattern as /admin/riders.
 *
 * This page does NOT create anything on load — it only reads the current
 * pool status. Generation happens exclusively when the admin clicks the
 * button (see MarketToolsPanel / generateMarketPoolAction).
 */
export default async function AdminMarketPage() {
  const admin = await requireAdmin();
  const season = getCurrentSeasonInfo();

  const [summary, riders] = await Promise.all([
    getMarketPoolSummary(season.seasonId),
    getAdminMarketRiders(season.seasonId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <span className="inline-block rounded bg-danger px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-white">Admin</span>
        <h1 className="mt-2 text-xl font-bold text-navy">Market Tools</h1>
        <p className="mt-1 text-sm text-navy-soft">
          Signed in as {admin.email ?? admin.id}. Test-only override for the Transfer Market pool — real game design still
          generates this automatically at Season Week {MARKET_AUTO_GENERATION_WEEK} (not yet implemented; see report).
        </p>
        <Link href="/admin/riders" className="mt-1 inline-block text-2xs font-semibold text-teal hover:underline">
          → Rider Inspector
        </Link>
      </div>

      <MarketToolsPanel seasonId={season.seasonId} initialSummary={summary} />

      {riders.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs font-semibold uppercase tracking-wide text-navy-muted">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Age</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Archetype</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Generated</th>
              </tr>
            </thead>
            <tbody>
              {riders.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium text-navy">{r.firstName} {r.surname}</td>
                  <td className="px-3 py-2 text-navy-soft uppercase">{r.tier}</td>
                  <td className="px-3 py-2 text-navy-soft">{r.status}</td>
                  <td className="px-3 py-2 text-navy-soft">{r.age}</td>
                  <td className="px-3 py-2 text-navy-soft">{r.countryName}</td>
                  <td className="px-3 py-2 text-navy-soft">{r.inferredArchetype}</td>
                  <td className="px-3 py-2 text-navy-soft">{r.source}</td>
                  <td className="px-3 py-2 text-navy-soft">{new Date(r.generatedAt).toISOString().slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
