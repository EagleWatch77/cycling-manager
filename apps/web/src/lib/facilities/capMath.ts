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
