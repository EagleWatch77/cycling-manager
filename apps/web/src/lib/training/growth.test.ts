/**
 * Training V1 raw growth formula — sanity checks against the brief's own
 * numbers. Since Training Progress Accumulator V1 (see the chat report),
 * calculateRawGrowth() returns UNROUNDED progress — converting that into a
 * whole attribute gain is accumulator.ts's job (see accumulator.test.ts),
 * not this file's.
 *
 * Development Model V2 (see the chat report): calculateRawGrowth() now
 * takes the FULL attribute set (not just one currentValue) so it can
 * derive overallPerformance — see score.test.ts for the dedicated
 * developmentRoomFactor()/overallPerformance() tests; this file only
 * checks that growth.ts wires them in correctly.
 * Run with: npx tsx src/lib/training/growth.test.ts
 */
import { calculateRawGrowth } from './growth';
import { ageFactor, trainabilityFactor, professionalismFactor, INTENSITY_MULTIPLIER } from './config';
import type { SkillAttribute } from '@/lib/rider/config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

/** A full 19-key attribute record, every key defaulted, with overrides for specific keys. */
function makeAttrs(base: number, overrides: Partial<Record<SkillAttribute, number>> = {}): Record<SkillAttribute, number> {
  const keys: SkillAttribute[] = [
    'climbing', 'hills', 'flat', 'sprint', 'timeTrial', 'endurance', 'descending', 'acceleration',
    'energyManagement', 'positioning', 'reaction', 'breakawaySkill', 'packRiding', 'experience',
    'bikeHandling', 'cornering', 'attackTiming', 'roughSurface', 'wetHandling',
  ];
  const attrs = {} as Record<SkillAttribute, number>;
  for (const k of keys) attrs[k] = overrides[k] ?? base;
  return attrs;
}

// 1. Intensity multipliers exactly as specified.
check('Light = 1.0', INTENSITY_MULTIPLIER.light === 1.0);
check('Normal = 1.5', INTENSITY_MULTIPLIER.normal === 1.5);
check('Hard = 2.0', INTENSITY_MULTIPLIER.hard === 2.0);

// 2. Age factor bands exactly as specified.
check('17-19 -> 1.30', ageFactor(17) === 1.30 && ageFactor(19) === 1.30);
check('20-22 -> 1.20', ageFactor(20) === 1.20 && ageFactor(22) === 1.20);
check('23-25 -> 1.10', ageFactor(23) === 1.10 && ageFactor(25) === 1.10);
check('26-28 -> 1.00', ageFactor(26) === 1.00 && ageFactor(28) === 1.00);
check('29-31 -> 0.80', ageFactor(29) === 0.80 && ageFactor(31) === 0.80);
check('32-34 -> 0.55', ageFactor(32) === 0.55 && ageFactor(34) === 0.55);
check('35+ -> 0.30', ageFactor(35) === 0.30 && ageFactor(50) === 0.30);

// 3. Trainability / professionalism factor formulas exactly as specified.
check('trainabilityFactor(0) = 0.5', trainabilityFactor(0) === 0.5);
check('trainabilityFactor(100) = 1.0', trainabilityFactor(100) === 1.0);
check('professionalismFactor(0) = 0.8', professionalismFactor(0) === 0.8);
check('professionalismFactor(100) = 1.0', professionalismFactor(100) === 1.0);

// 4. Secondary raw is exactly 35% of primary raw when the secondary is ALSO a Performance attribute (climbing -> endurance, both Performance).
{
  const r = calculateRawGrowth({
    focus: 'climbing', intensity: 'hard', attributes: makeAttrs(120),
    trainability: 75, professionalism: 75, age: 20, potential: 75,
  });
  check('climbing has an endurance secondary', r.secondaryAttr === 'endurance', r.secondaryAttr);
  check('secondary raw is exactly 35% of primary raw (endurance is also Performance, same devFactor)', r.secondaryAttr !== undefined
    && Math.abs((r.secondaryRaw ?? 0) - r.primaryRaw * 0.35) < 1e-9,
    `primary ${r.primaryRaw} secondary ${r.secondaryRaw}`);
  check('primary raw is a positive number', r.primaryRaw > 0, `${r.primaryRaw}`);
  check('primary raw is NOT rounded to an integer (this is the whole point of the accumulator)', !Number.isInteger(r.primaryRaw) || r.primaryRaw === 0, `${r.primaryRaw}`);
}

// 4b. Weekly Training V1 is Performance-only (see chat report): timeTrial/endurance no longer map to energyManagement — every one of the 7 active (Performance-primary) focuses now has a Performance secondary too. See lib/training/secondaryMapping.test.ts for the full canonical-mapping canary.
{
  const r = calculateRawGrowth({
    focus: 'timeTrial', intensity: 'hard', attributes: makeAttrs(190), // near Performance ceiling
    trainability: 75, professionalism: 75, age: 20, potential: 55,
  });
  check('timeTrial has an endurance secondary (Performance-only mapping)', r.secondaryAttr === 'endurance', r.secondaryAttr);
  check('near the ceiling, the (now Performance) secondary raw is throttled just like a same-devFactor Performance pair — no longer exceeds 35% of primary raw',
    r.secondaryAttr !== undefined && (r.secondaryRaw ?? 0) <= r.primaryRaw * 0.35 + 1e-9,
    `primary ${r.primaryRaw} secondary ${r.secondaryRaw}`);
}

// 4c. The non-Performance-secondary code path (isPerformance === false, no devFactor throttling) is unreachable from real gameplay now (focus is validated against PERFORMANCE_FOCUS at save time — see repository.ts), but SECONDARY_ATTRIBUTE still keeps Tactics/Technique-keyed entries for a possible future focus, so the branch itself must keep working if called directly (e.g. breakawaySkill -> energyManagement, a Tactics pair).
{
  const r = calculateRawGrowth({
    focus: 'breakawaySkill', intensity: 'hard', attributes: makeAttrs(190),
    trainability: 75, professionalism: 75, age: 20, potential: 55,
  });
  check('breakawaySkill has an energyManagement secondary (vestigial, not reachable as a real focus today)', r.secondaryAttr === 'energyManagement', r.secondaryAttr);
  check('the non-Performance secondary still gets no development-room throttling (isPerformance branch still functions)',
    r.secondaryAttr !== undefined && (r.secondaryRaw ?? 0) > r.primaryRaw * 0.35,
    `primary ${r.primaryRaw} secondary ${r.secondaryRaw}`);
}

// 5. Hard intensity always yields more raw progress than Light, all else equal.
{
  const base = { focus: 'sprint' as const, attributes: makeAttrs(100), trainability: 95, professionalism: 95, age: 24, potential: 95 };
  const light = calculateRawGrowth({ ...base, intensity: 'light' });
  const hard = calculateRawGrowth({ ...base, intensity: 'hard' });
  check('hard > light raw', hard.primaryRaw > light.primaryRaw, `light ${light.primaryRaw} hard ${hard.primaryRaw}`);
}

// 6. Growth shrinks as a rider's OVERALL Performance level (not just the one trained attribute) rises.
{
  const focus: SkillAttribute = 'flat';
  const base = { focus, intensity: 'normal' as const, trainability: 75, professionalism: 75, age: 24, potential: 60 };
  const lowOverall = calculateRawGrowth({ ...base, attributes: makeAttrs(110, { [focus]: 110 }) });
  const highOverall = calculateRawGrowth({ ...base, attributes: makeAttrs(185, { [focus]: 185 }) });
  check('higher overall Performance -> smaller (or equal) raw', highOverall.primaryRaw <= lowOverall.primaryRaw,
    `low-overall ${lowOverall.primaryRaw} high-overall ${highOverall.primaryRaw}`);
}

// 6b. At the Performance ceiling (200), raw growth is exactly zero — no further accumulator progress.
{
  const r = calculateRawGrowth({
    focus: 'climbing', intensity: 'hard', attributes: makeAttrs(190, { climbing: 200 }),
    trainability: 95, professionalism: 95, age: 18, potential: 95,
  });
  check('primaryRaw is exactly 0 once the attribute is at PERFORMANCE_MAX (200)', r.primaryRaw === 0, `${r.primaryRaw}`);
}

// 7. Zázemie V1 — Training Center facilityMultiplier applies exactly once, to both primary AND secondary raw.
{
  const base = { focus: 'climbing' as const, intensity: 'hard' as const, attributes: makeAttrs(120), trainability: 75, professionalism: 75, age: 20, potential: 90 };
  const noBonus = calculateRawGrowth({ ...base });
  const l5Bonus = calculateRawGrowth({ ...base, facilityMultiplier: 1.12 });
  check('no facilityMultiplier behaves exactly as before (defaults to 1)', noBonus.primaryRaw === calculateRawGrowth({ ...base, facilityMultiplier: 1 }).primaryRaw);
  check('L5 Training Center (+12%) increases primary raw by exactly 12%', Math.abs(l5Bonus.primaryRaw - noBonus.primaryRaw * 1.12) < 1e-9,
    `no-bonus ${noBonus.primaryRaw} l5 ${l5Bonus.primaryRaw}`);
  check('L5 Training Center (+12%) increases secondary raw too, by the same 12%', Math.abs((l5Bonus.secondaryRaw ?? 0) - (noBonus.secondaryRaw ?? 0) * 1.12) < 1e-9);
}

// 8. Security audit canary (see the chat report): process_training_plan()'s
// SQL-side sanity ceiling (v_max_raw = 100) must stay generously above the
// real formula's own theoretical maximum.
{
  const theoreticalMax = calculateRawGrowth({
    focus: 'climbing', intensity: 'hard', attributes: makeAttrs(100),
    trainability: 95, professionalism: 95, age: 18, potential: 95,
    facilityMultiplier: 2.0,
  });
  check('theoretical max raw growth stays well under the SQL sanity ceiling (100)', theoreticalMax.primaryRaw < 50,
    `${theoreticalMax.primaryRaw}`);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
