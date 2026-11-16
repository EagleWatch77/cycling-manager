'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TAB_HREFS = ['/rankings', '/rankings/riders', '/rankings/division', '/rankings/nations', '/rankings/achievements'] as const;

export interface RankingsTabLabels {
  league: string;
  riders: string;
  division: string;
  nations: string;
  achievements: string;
}

/**
 * "Tímy" is deliberately not a tab here — no team/ownership model exists at
 * all in the DB (see the chat report), unlike Nations/Achievements which
 * can be computed once race_results has rows. Labels are resolved
 * server-side and passed as plain strings, not the `t` function itself —
 * `t` cannot cross the server/client component boundary (see the earlier
 * RiderProfileTabs fix for the same bug).
 */
export function RankingsTabs({ labels }: { labels: RankingsTabLabels }) {
  const pathname = usePathname();
  const LABEL: Record<(typeof TAB_HREFS)[number], string> = {
    '/rankings': labels.league,
    '/rankings/riders': labels.riders,
    '/rankings/division': labels.division,
    '/rankings/nations': labels.nations,
    '/rankings/achievements': labels.achievements,
  };
  const tabs = TAB_HREFS.map((href) => ({ href, label: LABEL[href] }));

  return (
    <div className="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-line px-1">
      {tabs.map((tab) => {
        const active = tab.href === '/rankings' ? pathname === '/rankings' : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href}
            className={`rounded-t-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
              active ? 'border-b-2 border-teal text-teal-dark' : 'text-navy-muted hover:text-navy'
            }`}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
