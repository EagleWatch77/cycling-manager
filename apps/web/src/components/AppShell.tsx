import type { ReactNode } from 'react';
import { getDictionary, type Locale } from '@/i18n/config';
import { getLocale } from '@/i18n/server';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { dateRange, fullDate } from '@/lib/format';
import { getSeasonSchedule } from '@/data/tourSchedule';
import { getMySeasonRegistrations } from '@/lib/races/registration';
import { getMyLeague } from '@/lib/facilities/repository';
import { getMyManagerName } from '@/lib/profile/manager';
import { ensureMyDivision } from '@/lib/league/repository';
import { divisionCode } from '@/lib/league/divisions';
import { PRIMARY_NAV, SECONDARY_NAV, SETTINGS_NAV } from '@/lib/navigation';
import { ensureGameStateProcessed } from '@/lib/gameState';
import { SidebarNavigation } from './SidebarNavigation';
import { TopStatusBar } from './TopStatusBar';
import { PageHeroBanner } from './PageHeroBanner';
import { getCalendarState } from '@/lib/calendar/calendarVersion';

/**
 * Shared chrome for every page: left rail plus top status bar. Pages render
 * only their own content, so the shell stays in one place.
 *
 * The top bar shows the next registered Tour (real dates) or the page title,
 * plus season/week, notifications, language and the profile menu.
 *
 * Season/week/date come from the real server clock (lib/calendar/season),
 * never a hardcoded mock date — this is the one place that value is computed
 * for the whole app shell.
 *
 * PageHeroBanner (see the chat report) renders for every page EXCEPT Home —
 * `activeId === 'home'` is the one and only exception, matching the
 * dashboard page's own `<AppShell activeId="home">` call (app/dashboard/
 * page.tsx). Every other caller passes a different activeId and gets the
 * banner automatically — no per-page wiring needed. Home renders no banner
 * and no gap for one: the conditional simply doesn't mount it.
 */
export async function AppShell({
  activeId, children, locale, banner = true,
}: {
  activeId: string;
  children: ReactNode;
  locale?: Locale;
  /** Decorative panoramic banner above the page. Pages with their own compact header (Rebríčky) pass false. */
  banner?: boolean;
}) {
  const active = locale ?? (await getLocale());
  const t = getDictionary(active);
  const season = getCurrentSeasonInfo();
  // Global lazy game-state processing (currently: season-end aging) — see
  // lib/gameState.ts. Runs here, not in any one page/layout, so it fires
  // regardless of which authenticated page a player opens first.
  await ensureGameStateProcessed();

  // Top bar data — all real: the player's own registered Tours (earliest one
  // that has not finished yet), their profile name and league. No Tour → the
  // bar falls back to the page title.
  const cal = await getCalendarState();
  const scheduled = getSeasonSchedule(season, cal.version);
  // League + sub-league are real (league_memberships). If the sub-league
  // tables are not deployed yet this falls back to the plain league.
  const [registrations, managerName, division] = await Promise.all([
    getMySeasonRegistrations(scheduled.map((v) => v.tour.id)),
    getMyManagerName(),
    ensureMyDivision(),
  ]);
  const league = division?.league ?? (await getMyLeague());
  const leagueLabel = division ? `${t(`league.${division.league}`)} ${divisionCode(division.number)}` : t(`league.${league}`);
  const mine = new Set(registrations.map((r) => r.tourId));
  const next = scheduled
    .filter((v) => mine.has(v.tour.id) && v.weekEnd.getTime() >= season.now.getTime())
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())[0];
  const navItem = [...PRIMARY_NAV, ...SECONDARY_NAV, SETTINGS_NAV].find((n) => n.id === activeId);
  const pageTitle = navItem ? t(navItem.labelKey) : t('app.name');
  return (
    <div className="flex min-h-screen">
      <SidebarNavigation
        t={t}
        league={league}
        activeId={activeId}
        seasonLabel={`${t('races.season')} ${season.seasonNumber}`}
        weekLabel={`${t('races.week')} ${season.currentWeek} / ${season.totalWeeks}`}
        dateLabel={fullDate(season.now, active)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopStatusBar
          t={t}
          locale={active}
          pageTitle={pageTitle}
          nextTour={next ? { name: next.tour.name, dateRange: dateRange(next.weekStart, next.weekEnd, active) } : null}
          seasonNumber={season.seasonNumber}
          week={season.currentWeek}
          totalWeeks={season.totalWeeks}
          managerName={managerName}
          leagueLabel={leagueLabel}
        />
        <main className="flex-1 overflow-x-hidden p-4">
          {!cal.healthy && <p role="alert" className="mb-3 rounded-lg bg-warn/10 px-3 py-2 text-sm font-medium text-warn">{t('calendar.mismatch')}</p>}
          {activeId !== 'home' && banner && <PageHeroBanner />}
          {children}
        </main>
      </div>
    </div>
  );
}
