/**
 * Training V1 raw growth formula — sanity checks against the brief's own
 * numbers. Since Training Progress Accumulator V1 (see the chat report),
 * calculateRawGrowth() returns UNROUNDED progress — converting that into a
 * whole attribute gain is accumulator.ts's job (see accumulator.test.ts),
 * not this file's.
 * Run with: npx tsx src/lib/training/growth.test.ts
 */
import { calculateRawGrowth } from './growth';
import { ageFactor, trainabilityFactor, professionalismFactor, INTENSITY_MULTIPLIER } from './config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
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

// 4. Secondary raw is exactly 35% of primary raw (SECONDARY_GAIN_SHARE), not merely "close" — no rounding happens in this file anymore.
{
  const r = calculateRawGrowth({
    focus: 'climbing', intensity: 'hard', currentValue: 120,
    trainability: 75, professionalism: 75, age: 20, potential: 75,
  });
  check('climbing has an endurance secondary', r.secondaryAttr === 'endurance', r.secondaryAttr);
  check('secondary raw is exactly 35% of primary raw', r.secondaryAttr !== undefined
    && Math.abs((r.secondaryRaw ?? 0) - r.primaryRaw * 0.35) < 1e-9,
    `primary ${r.primaryRaw} secondary ${r.secondaryRaw}`);
  check('primary raw is a positive number', r.primaryRaw > 0, `${r.primaryRaw}`);
  check('primary raw is NOT rounded to an integer (this is the whole point of the accumulator)', !Number.isInteger(r.primaryRaw) || r.primaryRaw === 0, `${r.primaryRaw}`);
}

// 5. Hard intensity always yields more raw progress than Light, all else equal.
{
  const base = { focus: 'sprint' as const, currentValue: 100, trainability: 95, professionalism: 95, age: 24, potential: 95 };
  const light = calculateRawGrowth({ ...base, intensity: 'light' });
  const hard = calculateRawGrowth({ ...base, intensity: 'hard' });
  check('hard > light raw', hard.primaryRaw > light.primaryRaw, `light ${light.primaryRaw} hard ${hard.primaryRaw}`);
}

// 6. Growth shrinks as a rider closes in on their potential ceiling.
{
  const base = { focus: 'flat' as const, intensity: 'normal' as const, trainability: 75, professionalism: 75, age: 24, potential: 60 };
  const farFromCeiling = calculateRawGrowth({ ...base, currentValue: 100 });
  const nearCeiling = calculateRawGrowth({ ...base, currentValue: 159 });
  check('less room -> smaller (or equal) raw', nearCeiling.primaryRaw <= farFromCeiling.primaryRaw,
    `far ${farFromCeiling.primaryRaw} near ${nearCeiling.primaryRaw}`);
}

// 7. Zázemie V1 — Training Center facilityMultiplier applies exactly once,
// to both primary AND secondary raw (both derive from the same `raw`).
{
  const base = { focus: 'climbing' as const, intensity: 'hard' as const, currentValue: 120, trainability: 75, professionalism: 75, age: 20, potential: 90 };
  const noBonus = calculateRawGrowth({ ...base });
  const l5Bonus = calculateRawGrowth({ ...base, facilityMultiplier: 1.12 });
  check('no facilityMultiplier behaves exactly as before (defaults to 1)', noBonus.primaryRaw === calculateRawGrowth({ ...base, facilityMultiplier: 1 }).primaryRaw);
  check('L5 Training Center (+12%) increases primary raw by exactly 12%', Math.abs(l5Bonus.primaryRaw - noBonus.primaryRaw * 1.12) < 1e-9,
    `no-bonus ${noBonus.primaryRaw} l5 ${l5Bonus.primaryRaw}`);
  check('L5 Training Center (+12%) increases secondary raw too, by the same 12%', Math.abs((l5Bonus.secondaryRaw ?? 0) - (noBonus.secondaryRaw ?? 0) * 1.12) < 1e-9);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
