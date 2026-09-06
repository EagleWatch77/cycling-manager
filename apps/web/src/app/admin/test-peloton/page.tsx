import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listAllRiders } from '@/lib/rider/repository';
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';
import { MINIMUM_RACE_FIELD } from '@/lib/rider/aiConfig';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import { generatePelotonAction } from './actions';

/**
 * Admin/development-only view: validate the AI Rookie Generator V1 output.
 * Not linked from any player-facing navigation. Deliberately unlocalized —
 * this is a dev tool, not game UI.
 */
export default async function TestPelotonPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const riders = await listAllRiders();
  const realCount = riders.filter((r) => !r.isAi).length;
  const aiCount = riders.filter((r) => r.isAi).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-bold text-navy">Test Peloton (admin/dev)</h1>
        <p className="mt-1 text-sm text-navy-soft">
          Generator validation only — not part of the player-facing game.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-card p-4 shadow-card">
        <div className="text-sm text-navy">
          <span className="font-bold">{riders.length}</span> total riders
          {' '}(<span className="font-bold">{realCount}</span> real,{' '}
          <span className="font-bold">{aiCount}</span> AI) · minimum race field:{' '}
          <span className="font-bold">{MINIMUM_RACE_FIELD}</span>
        </div>
        <form action={generatePelotonAction} className="ml-auto">
          <button
            type="submit"
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark"
          >
            Generate Test Peloton
          </button>
        </form>
      </div>

      {aiCount > 0 || realCount > 0 ? (
        <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs font-semibold uppercase tracking-wide text-navy-muted">
                <th className="px-3 py-2">Avatar</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Nationality</th>
                <th className="px-3 py-2">Age</th>
                <th className="px-3 py-2">Archetype</th>
                <th className="px-3 py-2 text-right">Mean</th>
                <th className="px-3 py-2 text-right">Min</th>
                <th className="px-3 py-2 text-right">Max</th>
              </tr>
            </thead>
            <tbody>
              {riders.map((r) => {
                const values = SKILL_ATTRIBUTES.map((a) => r.attributes[a]);
                const mean = values.reduce((s, v) => s + v, 0) / values.length;
                const min = Math.min(...values);
                const max = Math.max(...values);
                return (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <RiderAvatar seed={r.id} size="sm" />
                    </td>
                    <td className="px-3 py-2 font-medium text-navy">{r.firstName} {r.surname}</td>
                    <td className="px-3 py-2 text-navy-soft">{r.isAi ? 'AI' : 'Real'}</td>
                    <td className="px-3 py-2 text-navy-soft">{r.countryName}</td>
                    <td className="px-3 py-2 text-navy-soft">{r.age}</td>
                    <td className="px-3 py-2 text-navy-soft">{r.inferredArchetype}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-navy">{mean.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-navy-soft">{min}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-navy-soft">{max}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-navy-soft">No riders yet.</p>
      )}
    </div>
  );
}
