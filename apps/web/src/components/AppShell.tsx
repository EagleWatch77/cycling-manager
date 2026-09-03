import type { ReactNode } from 'react';
import { getDictionary, type Locale } from '@/i18n/config';
import { getLocale } from '@/i18n/server';
import { PLAYER } from '@/mock/dashboard';
import { SidebarNavigation } from './SidebarNavigation';
import { TopStatusBar } from './TopStatusBar';

/**
 * Shared chrome for every page: left rail plus top status bar. Pages render
 * only their own content, so the shell stays in one place.
 */
export async function AppShell({
  activeId, children, locale,
}: {
  activeId: string;
  children: ReactNode;
  locale?: Locale;
}) {
  const active = locale ?? (await getLocale());
  const t = getDictionary(active);
  return (
    <div className="flex min-h-screen">
      <SidebarNavigation
        t={t}
        league={PLAYER.league}
        activeId={activeId}
        seasonLabel="Sezóna 2026"
        dateLabel="14. máj 2026"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopStatusBar t={t} locale={active} player={PLAYER} />
        <main className="flex-1 overflow-x-hidden p-4">{children}</main>
      </div>
    </div>
  );
}
