import type { T } from '@/i18n/config';
import type { LeagueId } from '@/lib/leagues';
import { PRIMARY_NAV, SECONDARY_NAV, SETTINGS_NAV, isAvailable, type NavItem } from '@/lib/navigation';
import { Icon } from './ui/Icon';

/**
 * Left rail. Fully data-driven: sections come from `navigation.ts` and their
 * per-league availability from `isAvailable()`, so no league logic lives here.
 */
export function SidebarNavigation({
  t, league, activeId, seasonLabel, dateLabel,
}: {
  t: T;
  league: LeagueId;
  activeId: string;
  seasonLabel: string;
  dateLabel: string;
}) {
  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-line bg-card">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-teal">
          <Icon name="mountain" className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold leading-tight text-navy">{t('app.name')}</span>
      </div>

      <NavGroup t={t} label={t('nav.group.core')} items={PRIMARY_NAV} league={league} activeId={activeId} />
      <NavGroup t={t} label={t('nav.group.later')} items={SECONDARY_NAV} league={league} activeId={activeId} />

      <div className="mt-auto border-t border-line px-3 py-3">
        <NavLink t={t} item={SETTINGS_NAV} active={activeId === 'settings'} available />
        <div className="mt-3 flex items-center gap-2 px-2 text-2xs text-navy-muted">
          <Icon name="calendar" className="h-3.5 w-3.5" />
          <span>
            {seasonLabel}
            <span className="block text-navy-soft">{dateLabel}</span>
          </span>
        </div>
      </div>
    </nav>
  );
}

function NavGroup({
  t, label, items, league, activeId,
}: { t: T; label: string; items: readonly NavItem[]; league: LeagueId; activeId: string }) {
  return (
    <div className="px-3 pb-2">
      <p className="px-2 pb-1.5 pt-2 text-2xs font-semibold uppercase tracking-wide text-navy-muted">{label}</p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <NavLink t={t} item={item} active={activeId === item.id} available={isAvailable(item, league)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NavLink({ t, item, active, available }: { t: T; item: NavItem; active: boolean; available: boolean }) {
  const base = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors';
  if (!available) {
    return (
      <span className={`${base} cursor-default text-navy-muted/60`} aria-disabled="true">
        <Icon name={item.icon} />
        <span className="flex-1 text-left">{t(item.labelKey)}</span>
        <span className="text-2xs text-navy-muted/70">{t('nav.soon')}</span>
      </span>
    );
  }
  return (
    <a
      href={`/${item.href.replace(/^\//, '')}`}
      aria-current={active ? 'page' : undefined}
      className={`${base} ${active ? 'bg-teal text-white' : 'text-navy-soft hover:bg-teal-rail hover:text-navy'}`}
    >
      <Icon name={item.icon} />
      <span className="flex-1 text-left font-medium">{t(item.labelKey)}</span>
    </a>
  );
}
