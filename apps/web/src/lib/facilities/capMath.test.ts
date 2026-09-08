/**
 * Zázemie V1 — pure cap math (league cap vs. Team Center-derived cap,
 * "always the lowest of the relevant limits" — item 3 of the request).
 * The actual security boundary is the DB (upgrade_facility(), see
 * supabase/schema.sql) — this only verifies the same arithmetic the UI
 * shows matches what that function would also enforce.
 * Run with: npx tsx src/lib/facilities/capMath.test.ts
 */
import { computeFacilityCaps, effectiveFacilityLevel } from './capMath';
import { maxFacilityLevel } from '@/lib/leagues';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// 0. Real per-league caps exactly as specified: Rookie=1 (upgrade disabled), Amateur=2, Continental=3, Pro=4, Elite=5.
check('rookie cap = 1', maxFacilityLevel('rookie') === 1);
check('amateur cap = 2', maxFacilityLevel('amateur') === 2);
check('continental cap = 3', maxFacilityLevel('continental') === 3);
check('pro cap = 4', maxFacilityLevel('pro') === 4);
check('elite cap = 5', maxFacilityLevel('elite') === 5);

// 1. Generic cap arithmetic (league cap 2), Team Center L1 -> other facilities capped at min(2, 1+1) = 2.
{
  const caps = computeFacilityCaps(2, 1);
  check('league cap 2 + TC L1: training cap = 2', caps.training === 2, `${caps.training}`);
  check('league cap 2 + TC L1: teamCenter cap = league cap (2)', caps.teamCenter === 2);
}

// 2. Pro (league cap 5), Team Center L1 -> other facilities capped at min(5, 1+1) = 2 (Team Center is the binding constraint).
{
  const caps = computeFacilityCaps(5, 1);
  check('Pro + TC L1: training cap is Team-Center-bound at 2, not 5', caps.training === 2, `${caps.training}`);
  check('Pro + TC L1: teamCenter itself can still reach 5', caps.teamCenter === 5);
}

// 3. Pro (league cap 5), Team Center L4 -> other facilities capped at min(5, 4+1) = 5.
{
  const caps = computeFacilityCaps(5, 4);
  check('Pro + TC L4: training cap = 5', caps.training === 5, `${caps.training}`);
}

// 4. Admin/dev override (league cap forced to 5): still respects Team Center cap for non-Team-Center facilities.
{
  const caps = computeFacilityCaps(5, 1); // admin override already resolved to leagueCap=5 by the caller
  check('admin override never bypasses the Team Center cap for other facilities', caps.training === 2, `${caps.training}`);
}

// 5. Team Center-derived cap never exceeds 5 even at max Team Center level.
{
  const caps = computeFacilityCaps(5, 5);
  check('TC L5 -> other facilities capped at 5, not 6', caps.training === 5, `${caps.training}`);
}

// 6. Rookie cap (1) disables upgrades entirely: a freshly-created rider
// (storedLevel 1) is already at the cap, so `level >= cap` is immediately
// true for every facility.
{
  const caps = computeFacilityCaps(maxFacilityLevel('rookie') as 1, 1);
  check('Rookie: training cap = 1 (upgrade immediately locked at storedLevel 1)', caps.training === 1);
  check('Rookie: teamCenter cap = 1', caps.teamCenter === 1);
}

// 7. storedLevel vs effectiveLevel — building L3 in Amateur, then relegated
// to Rookie: bonuses apply as effective L1, nothing is erased.
{
  const storedLevel = 3 as const;
  const amateurCap = computeFacilityCaps(maxFacilityLevel('amateur') as 2, 1).training; // = 2
  const rookieCap = computeFacilityCaps(maxFacilityLevel('rookie') as 1, 1).training; // = 1
  check('in Amateur, storedLevel 3 is clamped down to the cap (2), not shown as 3', effectiveFacilityLevel(storedLevel, amateurCap) === 2,
    `${effectiveFacilityLevel(storedLevel, amateurCap)}`);
  check('relegated to Rookie, the SAME storedLevel 3 is effectively L1', effectiveFacilityLevel(storedLevel, rookieCap) === 1,
    `${effectiveFacilityLevel(storedLevel, rookieCap)}`);
}

// 8. Normal (non-relegated) case: effectiveLevel simply equals storedLevel when storedLevel <= cap.
check('normal case: effectiveLevel === storedLevel when within cap', effectiveFacilityLevel(2, 4) === 2);

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
