import type { T, Locale } from '@/i18n/config';
import { Icon } from './ui/Icon';
import { LanguageSelector } from './public/LanguageSelector';
import { LogoutButton } from './LogoutButton';
import { ProfileMenu } from './ProfileMenu';

export interface TopBarNextTour {
  name: string;
  /** Real calendar range of the Tour's week, already formatted. */
  dateRange: string;
}

/**
 * Compact top bar. Left: the player's next scheduled Tour with its real dates,
 * or — with no Tour planned — the current page title. Right: season + week,
 * notifications, language switcher, manager profile menu.
 *
 * No budget, energy or form (the dashboard owns those) and no notification
 * count: there is no notification system yet, so the bell carries no badge.
 */
export function TopStatusBar({
  t, locale, pageTitle, nextTour, seasonNumber, week, totalWeeks, managerName, leagueLabel,
}: {
  t: T;
  locale: Locale;
  pageTitle: string;
  nextTour: TopBarNextTour | null;
  seasonNumber: number;
  week: number;
  totalWeeks: number;
  managerName: string | null;
  leagueLabel: string;
}) {
  return (
    <header className="flex items-center gap-2 border-b border-line bg-card px-3 py-2 sm:px-4">
      <div className="min-w-0 flex-1">
        {nextTour ? (
          <>
            <span className="block text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('top.nextTour')}</span>
            <span className="block truncate text-sm font-bold text-navy">
              {nextTour.name}
              <span className="font-medium text-navy-soft"> · {nextTour.dateRange}</span>
            </span>
          </>
        ) : (
          <h1 className="truncate text-sm font-bold text-navy">{pageTitle}</h1>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <span className="whitespace-nowrap rounded-lg bg-surface px-2 py-1 text-xs font-semibold text-navy-soft">
          <span className="hidden sm:inline">{t('races.season')} </span>
          {seasonNumber}
          <span className="text-navy-muted"> · </span>
          <span className="hidden sm:inline">{t('races.week')} </span>
          {week}/{totalWeeks}
        </span>
        <button
          type="button"
          aria-label={t('top.notifications')}
          className="rounded-lg p-2 text-navy-soft transition-colors hover:bg-teal-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          <Icon name="bell" className="h-4.5 w-4.5" />
        </button>
        <LanguageSelector locale={locale} label={t('lang.label')} variant="compact" />
        <ProfileMenu label={t('top.profile')} name={managerName} leagueLine={`${t('top.league')}: ${leagueLabel}`}>
          <LogoutButton label={t('auth.logout')} />
        </ProfileMenu>
      </div>
    </header>
  );
}
