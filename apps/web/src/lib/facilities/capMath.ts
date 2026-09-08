import type { FacilityId, FacilityLevel } from './config';

/**
 * Pure cap math — no I/O, so it's directly unit-testable (see
 * capMath.test.ts) independently of Supabase/admin-session plumbing.
 * Mirrors upgrade_facility()'s SQL exactly (see supabase/schema.sql):
 * "always the lowest of the relevant limits" (item 3 of the request) —
 * every facility except Team Center is capped at min(leagueCap,
 * teamCenterLevel + 1); Team Center itself is only ever league-capped.
 */
export function computeFacilityCaps(leagueCap: FacilityLevel, teamCenterLevel: FacilityLevel): Record<FacilityId, FacilityLevel> {
  const teamCenterDerived = Math.min(5, teamCenterLevel + 1) as FacilityLevel;
  const otherCap = Math.min(leagueCap, teamCenterDerived) as FacilityLevel;

  return {
    training: otherCap,
    recovery: otherCap,
    scouting: otherCap,
    technical: otherCap,
    teamCenter: leagueCap,
  };
}

/**
 * storedLevel vs. effectiveLevel: a player's real progression (storedLevel,
 * the DB column — upgrade_facility() only ever increases it, never
 * decreases it, see supabase/schema.sql) is never erased by a league drop.
 * effectiveLevel is what actually applies right now — the lower of what
 * was built and what the current cap allows. Building L3 in Amateur, then
 * dropping to Rookie (cap 1), makes bonuses apply as L1 only; getting back
 * to Amateur re-activates L2 (or whatever the cap allows) automatically,
 * with nothing to re-purchase.
 */
export function effectiveFacilityLevel(storedLevel: FacilityLevel, cap: FacilityLevel): FacilityLevel {
  return Math.min(storedLevel, cap) as FacilityLevel;
}
