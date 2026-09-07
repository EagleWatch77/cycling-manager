'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TAB_HREFS = ['/rider', '/rider/training', '/rider/contract', '/rider/history'] as const;

export interface RiderProfileTabLabels {
  overview: string;
  training: string;
  contract: string;
  history: string;
}

/**
 * The only client piece of the rider profile shell — usePathname() is only
 * needed to highlight the active tab, no rider data passes through here.
 * Exactly the 4 real, working tabs (item 1): no "čoskoro" placeholders.
 *
 * Labels are resolved server-side and passed as plain strings — `t` itself
 * is a function and cannot cross the server/client component boundary.
 */
export function RiderProfileTabs({ labels }: { labels: RiderProfileTabLabels }) {
  const pathname = usePathname();
  const tabs = TAB_HREFS.map((href) => ({
    href,
    label: href === '/rider' ? labels.overview
      : href === '/rider/training' ? labels.training
      : href === '/rider/contract' ? labels.contract
      : labels.history,
  }));

  return (
    <div className="flex gap-1 border-b border-line px-1">
      {tabs.map((tab) => {
        const active = tab.href === '/rider' ? pathname === '/rider' : pathname.startsWith(tab.href);
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
