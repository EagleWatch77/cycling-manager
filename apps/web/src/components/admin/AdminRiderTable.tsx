'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AdminRiderRow } from '@/lib/rider/adminRepository';

/**
 * Client-side search/filter over an already-fetched, already-authorized
 * list. Safe to receive the raw rows as props here specifically because
 * this component only ever renders inside /admin/riders, which is gated
 * server-side by requireAdmin() before this data is fetched at all — an
 * admin's own browser is allowed to have this data. Never reuse this
 * component (or pass AdminRiderRow[]) anywhere reachable by a normal player.
 */
export function AdminRiderTable({ riders }: { riders: AdminRiderRow[] }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'ai' | 'player'>('all');
  const [archetype, setArchetype] = useState('all');
  const [country, setCountry] = useState('all');

  const archetypes = useMemo(
    () => Array.from(new Set(riders.map((r) => r.inferredArchetype))).sort(),
    [riders],
  );
  const countries = useMemo(
    () => Array.from(new Set(riders.map((r) => r.countryName))).sort(),
    [riders],
  );

  const filtered = riders.filter((r) => {
    if (type === 'ai' && !r.isAi) return false;
    if (type === 'player' && r.isAi) return false;
    if (archetype !== 'all' && r.inferredArchetype !== archetype) return false;
    if (country !== 'all' && r.countryName !== country) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const name = `${r.firstName} ${r.surname}`.toLowerCase();
      if (!name.includes(needle)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        />
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}
          className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-navy">
          <option value="all">All types</option>
          <option value="player">Player-owned</option>
          <option value="ai">AI</option>
        </select>
        <select value={archetype} onChange={(e) => setArchetype(e.target.value)}
          className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-navy">
          <option value="all">All archetypes</option>
          {archetypes.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)}
          className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-navy">
          <option value="all">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="ml-auto text-2xs text-navy-muted">{filtered.length} / {riders.length} riders</span>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-2xs font-semibold uppercase tracking-wide text-navy-muted">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Age</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Archetype</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Owner (player_id)</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface">
                <td className="px-3 py-2 font-medium text-navy">
                  <Link href={`/admin/riders/${r.id}`} className="hover:underline">
                    {r.firstName} {r.surname}
                  </Link>
                </td>
                <td className="px-3 py-2 text-navy-soft">{r.age}</td>
                <td className="px-3 py-2 text-navy-soft">{r.countryName}</td>
                <td className="px-3 py-2 text-navy-soft">{r.inferredArchetype}</td>
                <td className="px-3 py-2 text-navy-soft">{r.isAi ? 'AI' : 'Player'}</td>
                <td className="px-3 py-2 font-mono text-2xs text-navy-muted">{r.playerId ?? '—'}</td>
                <td className="px-3 py-2 text-navy-soft">{new Date(r.createdAt).toISOString().slice(0, 10)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-navy-soft">No matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
