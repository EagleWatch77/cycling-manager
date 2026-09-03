import type { T, Locale } from '@/i18n/config';
import type { Player } from '@/mock/dashboard';
import { money } from '@/lib/format';
import { Icon } from './ui/Icon';
import { ProgressBar } from './ui/ProgressBar';
import { LanguageSelector } from './public/LanguageSelector';

/**
 * Horizontal status bar. Shows only values the game already tracks; it does not
 * invent mechanics to fill space, so there is no team, sponsor or staff readout
 * for a Rookie player.
 */
export function TopStatusBar({ t, locale, player }: { t: T; locale: Locale; player: Player }) {
  return (
    <header className="flex items-center gap-1 border-b border-line bg-card px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5 pr-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-light text-lg">
          {player.countryFlag}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-navy">{player.riderName}</span>
          <span className="block text-2xs text-navy-muted">
            {t('top.league')}: {t(`league.${player.league}`)}
          </span>
        </span>
      </div>

      <Stat icon="euro" label={t('top.budget')} value={money(player.budget, locale)} />
      <Meter icon="bolt" label={t('top.energy')} value={player.energy} />
      <Meter icon="heart" label={t('top.form')} value={player.form} />

      <div className="ml-auto flex items-center gap-1.5 pl-3">
        <LanguageSelector locale={locale} label={t('lang.label')} variant="compact" />
        <button
          type="button"
          aria-label={t('top.notifications')}
          className="relative rounded-lg p-2 text-navy-soft transition-colors hover:bg-teal-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          <Icon name="bell" className="h-4.5 w-4.5" />
          {player.notifications > 0 && (
            <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {player.notifications}
            </span>
          )}
        </button>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-white">
          <Icon name="rider" className="h-4 w-4" />
        </span>
      </div>
    </header>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 border-l border-line px-4">
      <span className="text-navy-muted"><Icon name={icon} className="h-4 w-4" /></span>
      <span>
        <span className="block text-2xs text-navy-muted">{label}</span>
        <span className="block text-sm font-semibold text-navy">{value}</span>
      </span>
    </div>
  );
}

function Meter({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 border-l border-line px-4">
      <span className="text-navy-muted"><Icon name={icon} className="h-4 w-4" /></span>
      <span className="w-28">
        <span className="block text-2xs text-navy-muted">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-navy">{value}%</span>
          <ProgressBar value={value} className="flex-1" />
        </span>
      </span>
    </div>
  );
}
