/**
 * Zázemie V1 — pure cap math (league cap vs. Team Center-derived cap,
 * "always the lowest of the relevant limits" — item 3 of the request).
 * The actual security boundary is the DB (upgrade_facility(), see
 * supabase/schema.sql) — this only verifies the same arithmetic the UI
 * shows matches what that function would also enforce.
 * Run with: npx tsx src/lib/facilities/capMath.test.ts
 */
import { computeFacilityCaps } from './capMath';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// 1. Rookie (league cap 2), Team Center L1 -> other facilities capped at min(2, 1+1) = 2.
{
  const caps = computeFacilityCaps(2, 1);
  check('Rookie + TC L1: training cap = 2', caps.training === 2, `${caps.training}`);
  check('Rookie + TC L1: teamCenter cap = league cap (2)', caps.teamCenter === 2);
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

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
