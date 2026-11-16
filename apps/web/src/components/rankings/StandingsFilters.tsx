'use client';

import { useRouter } from 'next/navigation';

export interface FilterLabels { league: string; division: string; season: string }
export interface FilterState {
  league: string;
  number: number;
  season: string;
  leagues: { id: string; label: string }[];
  /** Real sub-leagues of the chosen league only. */
  subLeagues: { number: number; label: string }[];
  seasons: { id: string; label: string }[];
}

/** Three compact selects. Changing the league resets the sub-league to the first real one; navigation is the state. */
export function StandingsFilters({ labels, state, base = '/rankings' }: { labels: FilterLabels; state: FilterState; base?: string }) {
  const router = useRouter();
  const go = (p: { league?: string; number?: number | null; season?: string }) => {
    const q = new URLSearchParams();
    q.set('league', p.league ?? state.league);
    if (p.number !== null) q.set('sub', String(p.number ?? state.number));
    q.set('season', p.season ?? state.season);
    router.push(`${base}?${q.toString()}`);
  };
  const sel = 'rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold text-navy focus:border-teal focus:outline-none';
  const lab = 'flex items-center gap-2 text-2xs font-bold uppercase tracking-wide text-navy-soft';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className={lab}>{labels.league}
        <select className={sel} value={state.league} onChange={(e) => go({ league: e.target.value, number: null })}>
          {state.leagues.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>
      <label className={lab}>{labels.division}
        <select className={sel} value={state.number} onChange={(e) => go({ number: Number(e.target.value) })} disabled={state.subLeagues.length === 0}>
          {state.subLeagues.map((s) => <option key={s.number} value={s.number}>{s.label}</option>)}
        </select>
      </label>
      <label className={lab}>{labels.season}
        <select className={sel} value={state.season} onChange={(e) => go({ season: e.target.value })}>
          {state.seasons.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
    </div>
  );
}
