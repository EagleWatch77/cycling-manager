/**
 * Training V1 growth formula — sanity checks against the brief's own numbers.
 * Run with: npx tsx src/lib/training/growth.test.ts
 */
import { calculateGrowth } from './growth';
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

// 4. Secondary gain is ~35% of primary.
{
  const r = calculateGrowth({
    focus: 'climbing', intensity: 'hard', currentValue: 120,
    trainability: 75, professionalism: 75, age: 20, potential: 75,
  });
  check('climbing has an endurance secondary', r.secondaryAttr === 'endurance', r.secondaryAttr);
  check('secondary gain is close to 35% of primary', r.secondaryAttr !== undefined
    && Math.abs((r.secondaryGain ?? 0) - r.primaryGain * 0.35) <= 1,
    `primary ${r.primaryGain} secondary ${r.secondaryGain}`);
  check('primary gain is a positive integer', Number.isInteger(r.primaryGain) && r.primaryGain > 0, `${r.primaryGain}`);
}

// 5. Hard intensity always yields more than Light, all else equal.
// (High trainability/professionalism/room here so the gap survives rounding.)
{
  const base = { focus: 'sprint' as const, currentValue: 100, trainability: 95, professionalism: 95, age: 24, potential: 95 };
  const light = calculateGrowth({ ...base, intensity: 'light' });
  const hard = calculateGrowth({ ...base, intensity: 'hard' });
  check('hard > light gain', hard.primaryGain > light.primaryGain, `light ${light.primaryGain} hard ${hard.primaryGain}`);
}

// 6. Growth shrinks as a rider closes in on their potential ceiling.
{
  const base = { focus: 'flat' as const, intensity: 'normal' as const, trainability: 75, professionalism: 75, age: 24, potential: 60 };
  const farFromCeiling = calculateGrowth({ ...base, currentValue: 100 });
  const nearCeiling = calculateGrowth({ ...base, currentValue: 159 });
  check('less room -> smaller (or equal) gain', nearCeiling.primaryGain <= farFromCeiling.primaryGain,
    `far ${farFromCeiling.primaryGain} near ${nearCeiling.primaryGain}`);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
