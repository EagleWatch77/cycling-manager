import type { LeagueId } from './leagues';

export type NavItemId =
  | 'home' | 'rider' | 'races' | 'calendar' | 'rankings'
  | 'team' | 'scouting' | 'transfers' | 'staff' | 'finance' | 'facilities' | 'settings';

export interface NavItem {
  id: NavItemId;
  href: string;
  labelKey: string;
  icon: string;
  /** Leagues in which this section is available. Omitted means all leagues. */
  availableIn?: readonly LeagueId[];
}

const TEAM_LEAGUES = ['amateur', 'continental', 'pro', 'elite'] as const;

/**
 * Data-driven navigation so sections can be hidden or disabled per league or
 * per feature flag without touching the sidebar component.
 *
 * Rookie has no team system, so team-era sections are simply not available yet.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { id: 'home', href: '/dashboard', labelKey: 'nav.home', icon: 'home' },
  { id: 'rider', href: '/rider', labelKey: 'nav.rider', icon: 'rider' },
  { id: 'races', href: '/races', labelKey: 'nav.races', icon: 'flag' },
  { id: 'calendar', href: '/calendar', labelKey: 'nav.calendar', icon: 'calendar' },
  { id: 'rankings', href: '/rankings', labelKey: 'nav.rankings', icon: 'trophy' },
];

export const SECONDARY_NAV: readonly NavItem[] = [
  { id: 'team', href: '/team', labelKey: 'nav.team', icon: 'team', availableIn: TEAM_LEAGUES },
  { id: 'scouting', href: '/scouting', labelKey: 'nav.scouting', icon: 'search', availableIn: TEAM_LEAGUES },
  // Trh jazdcov (Transfer Market) — unlike the other team-era sections,
  // this is available from Rookie onward: a market to browse/sign riders
  // makes sense even before a player has a multi-rider team, and Rookie is
  // currently the only functional league, so gating this to TEAM_LEAGUES
  // would make the whole feature unreachable for every real player today.
  { id: 'transfers', href: '/transfers', labelKey: 'nav.transfers', icon: 'cart' },
  { id: 'staff', href: '/staff', labelKey: 'nav.staff', icon: 'staff', availableIn: TEAM_LEAGUES },
  { id: 'finance', href: '/finance', labelKey: 'nav.finance', icon: 'coin', availableIn: TEAM_LEAGUES },
  { id: 'facilities', href: '/facilities', labelKey: 'nav.facilities', icon: 'building', availableIn: TEAM_LEAGUES },
];

export const SETTINGS_NAV: NavItem =
  { id: 'settings', href: '/settings', labelKey: 'nav.settings', icon: 'cog' };

export function isAvailable(item: NavItem, league: LeagueId): boolean {
  return !item.availableIn || item.availableIn.includes(league);
}
