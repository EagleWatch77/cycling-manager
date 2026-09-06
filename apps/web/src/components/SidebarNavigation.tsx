import type { T } from '@/i18n/config';
import type { LeagueId } from '@/lib/leagues';
import { PRIMARY_NAV, SECONDARY_NAV, SETTINGS_NAV, isAvailable, type NavItem } from '@/lib/navigation';
import { Logo } from './public/Logo';
import { Icon } from './ui/Icon';

/**
 * Left rail. Fully data-driven: sections come from `navigation.ts` and their
 * per-league availability from `isAvailable()`, so no league logic lives here.
 */
export function SidebarNavigation({
  t, league, activeId, seasonLabel, weekLabel, dateLabel,
}: {
  t: T;
  league: LeagueId;
  activeId: string;
  seasonLabel: string;
  weekLabel: string;
  dateLabel: string;
}) {
  return (
    <nav className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-line bg-card">
      {/* Top: logo — fixed, never scrolls or shrinks. */}
      <div className="flex shrink-0 items-center px-4 py-4">
        <Logo className="h-auto w-full" width={150} priority />
      </div>

      {/* Middle: navigation groups — the only part that scrolls if content ever outgrows the viewport. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavGroup t={t} label={t('nav.group.core')} items={PRIMARY_NAV} league={league} activeId={activeId} />
        <NavGroup t={t} label={t('nav.group.later')} items={SECONDARY_NAV} league={league} activeId={activeId} />
      </div>

      {/* Bottom: settings + season info — fixed, always fully visible. */}
      <div className="shrink-0 border-t border-line bg-card px-3 py-3">
        <NavLink t={t} item={SETTINGS_NAV} active={activeId === 'settings'} available />
        <div className="mt-3 flex items-center gap-2 px-2 text-2xs text-navy-soft">
          <Icon name="calendar" className="h-3.5 w-3.5 shrink-0" />
          <span>
            {seasonLabel} · {weekLabel}
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
      <span className={`${base} cursor-default text-navy-muted`} aria-disabled="true">
        <Icon name={item.icon} />
        <span className="flex-1 text-left">{t(item.labelKey)}</span>
        <span className="rounded bg-line px-1.5 py-0.5 text-2xs font-medium text-navy-soft">{t('nav.soon')}</span>
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
