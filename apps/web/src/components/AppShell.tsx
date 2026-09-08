import type { ReactNode } from 'react';
import { getDictionary, type Locale } from '@/i18n/config';
import { getLocale } from '@/i18n/server';
import { PLAYER } from '@/mock/dashboard';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { fullDate } from '@/lib/format';
import { ensureGameStateProcessed } from '@/lib/gameState';
import { SidebarNavigation } from './SidebarNavigation';
import { TopStatusBar } from './TopStatusBar';

/**
 * Shared chrome for every page: left rail plus top status bar. Pages render
 * only their own content, so the shell stays in one place.
 *
 * Season/week/date come from the real server clock (lib/calendar/season),
 * never a hardcoded mock date — this is the one place that value is computed
 * for the whole app shell.
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
  const season = getCurrentSeasonInfo();
  // Global lazy game-state processing (currently: season-end aging) — see
  // lib/gameState.ts. Runs here, not in any one page/layout, so it fires
  // regardless of which authenticated page a player opens first.
  await ensureGameStateProcessed();
  return (
    <div className="flex min-h-screen">
      <SidebarNavigation
        t={t}
        league={PLAYER.league}
        activeId={activeId}
        seasonLabel={`${t('races.season')} ${season.seasonNumber}`}
        weekLabel={`${t('races.week')} ${season.currentWeek} / ${season.totalWeeks}`}
        dateLabel={fullDate(season.now, active)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopStatusBar t={t} locale={active} player={PLAYER} />
        <main className="flex-1 overflow-x-hidden p-4">{children}</main>
      </div>
    </div>
  );
}
