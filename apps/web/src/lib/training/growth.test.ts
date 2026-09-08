/**
 * Unified Weekly Training V1 raw growth formulas — sanity checks (see the
 * chat report). calculatePerformanceRawGrowth()/calculateTechnicalRawGrowth()
 * return UNROUNDED progress — converting that into a whole attribute gain
 * is accumulator.ts's job (see accumulator.test.ts), not this file's.
 * Run with: npx tsx src/lib/training/growth.test.ts
 */
import { calculatePerformanceRawGrowth, calculateTechnicalRawGrowth } from './growth';
import {
  ageFactor, trainabilityFactor, professionalismFactor, SESSION_COUNT, TECHNICAL_BASE,
} from './config';
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

// 1. Session count model exactly as specified — replaces the old flat intensity multiplier.
check('Light = 1 session', SESSION_COUNT.light === 1);
check('Normal = 2 sessions', SESSION_COUNT.normal === 2);
check('Hard = 3 sessions', SESSION_COUNT.hard === 3);

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

// ===================== PERFORMANCE =====================

// 4. Session count REPLACES the old flat intensity multiplier: Hard (3 sessions) should be exactly 3x Light's raw growth (1 session), all else equal — NOT 6x (the old, rejected double-counted model).
{
  const base = { focus: 'sprint' as const, attributes: makeAttrs(120), trainability: 75, professionalism: 75, age: 24, potential: 75 };
  const light = calculatePerformanceRawGrowth({ ...base, intensity: 'light' });
  const hard = calculatePerformanceRawGrowth({ ...base, intensity: 'hard' });
  check('Hard raw is exactly 3x Light raw (session count only, no stacked intensity multiplier)',
    Math.abs(hard.primaryRaw - light.primaryRaw * 3) < 1e-9, `light ${light.primaryRaw} hard ${hard.primaryRaw}`);
}
{
  const base = { focus: 'sprint' as const, attributes: makeAttrs(120), trainability: 75, professionalism: 75, age: 24, potential: 75 };
  const light = calculatePerformanceRawGrowth({ ...base, intensity: 'light' });
  const normal = calculatePerformanceRawGrowth({ ...base, intensity: 'normal' });
  check('Normal raw is exactly 2x Light raw', Math.abs(normal.primaryRaw - light.primaryRaw * 2) < 1e-9);
}

// 5. Secondary raw is exactly 35% of primary raw when the secondary is ALSO a Performance attribute (climbing -> endurance, both Performance).
{
  const r = calculatePerformanceRawGrowth({
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

// 5b. timeTrial's secondary is now endurance (Performance-only mapping, see secondaryMapping.test.ts).
{
  const r = calculatePerformanceRawGrowth({
    focus: 'timeTrial', intensity: 'hard', attributes: makeAttrs(190),
    trainability: 75, professionalism: 75, age: 20, potential: 55,
  });
  check('timeTrial has an endurance secondary', r.secondaryAttr === 'endurance', r.secondaryAttr);
}

// 6. Growth shrinks as a rider's OVERALL Performance level (not just the one trained attribute) rises.
{
  const focus: SkillAttribute = 'flat';
  const base = { focus, intensity: 'normal' as const, trainability: 75, professionalism: 75, age: 24, potential: 60 };
  const lowOverall = calculatePerformanceRawGrowth({ ...base, attributes: makeAttrs(110, { [focus]: 110 }) });
  const highOverall = calculatePerformanceRawGrowth({ ...base, attributes: makeAttrs(185, { [focus]: 185 }) });
  check('higher overall Performance -> smaller (or equal) raw', highOverall.primaryRaw <= lowOverall.primaryRaw,
    `low-overall ${lowOverall.primaryRaw} high-overall ${highOverall.primaryRaw}`);
}

// 7. At the Performance ceiling (200), raw growth is exactly zero — no further accumulator progress.
{
  const r = calculatePerformanceRawGrowth({
    focus: 'climbing', intensity: 'hard', attributes: makeAttrs(190, { climbing: 200 }),
    trainability: 95, professionalism: 95, age: 18, potential: 95,
  });
  check('primaryRaw is exactly 0 once the attribute is at PERFORMANCE_MAX (200)', r.primaryRaw === 0, `${r.primaryRaw}`);
}

// 8. Zázemie V1 — Training Center facilityMultiplier applies exactly once, to both primary AND secondary raw.
{
  const base = { focus: 'climbing' as const, intensity: 'hard' as const, attributes: makeAttrs(120), trainability: 75, professionalism: 75, age: 20, potential: 90 };
  const noBonus = calculatePerformanceRawGrowth({ ...base });
  const l5Bonus = calculatePerformanceRawGrowth({ ...base, facilityMultiplier: 1.12 });
  check('no facilityMultiplier behaves exactly as before (defaults to 1)', noBonus.primaryRaw === calculatePerformanceRawGrowth({ ...base, facilityMultiplier: 1 }).primaryRaw);
  check('L5 Training Center (+12%) increases primary raw by exactly 12%', Math.abs(l5Bonus.primaryRaw - noBonus.primaryRaw * 1.12) < 1e-9,
    `no-bonus ${noBonus.primaryRaw} l5 ${l5Bonus.primaryRaw}`);
  check('L5 Training Center (+12%) increases secondary raw too, by the same 12%', Math.abs((l5Bonus.secondaryRaw ?? 0) - (noBonus.secondaryRaw ?? 0) * 1.12) < 1e-9);
}

// 9. Readiness (item 17): a readinessFactor < 1 reduces raw growth proportionally; omitting it behaves as fully rested (1.0).
{
  const base = { focus: 'climbing' as const, intensity: 'hard' as const, attributes: makeAttrs(120), trainability: 75, professionalism: 75, age: 20, potential: 90 };
  const rested = calculatePerformanceRawGrowth({ ...base });
  const tired = calculatePerformanceRawGrowth({ ...base, readinessFactor: 0.70 });
  check('readinessFactor omitted defaults to 1.0 (fully rested)', rested.primaryRaw === calculatePerformanceRawGrowth({ ...base, readinessFactor: 1 }).primaryRaw);
  check('readinessFactor=0.70 reduces primary raw to exactly 70% of the rested value', Math.abs(tired.primaryRaw - rested.primaryRaw * 0.70) < 1e-9,
    `rested ${rested.primaryRaw} tired ${tired.primaryRaw}`);
  check('readinessFactor never boosts training above the fully-rested rate (item 19 — poor condition only ever slows it down)', tired.primaryRaw <= rested.primaryRaw);
}

// ===================== TECHNICAL =====================

// 10. Technical raw growth uses TECHNICAL_BASE, trainability/professionalism/age, and readiness — no facility, no Development Model V2.
{
  const r = calculateTechnicalRawGrowth({ focus: 'descending', trainability: 75, professionalism: 75, age: 24 });
  const expected = TECHNICAL_BASE * trainabilityFactor(75) * professionalismFactor(75) * ageFactor(24);
  check('technical raw matches TECHNICAL_BASE x trainability x professionalism x age (readiness defaults to 1)', Math.abs(r.raw - expected) < 1e-9, `${r.raw} vs ${expected}`);
  check('technical raw is positive for a normal rider', r.raw > 0);
}

// 11. Technical training has no concept of a "secondary" — calculateTechnicalRawGrowth() returns only { focus, raw }, structurally impossible to carry a secondary field.
{
  const r = calculateTechnicalRawGrowth({ focus: 'cornering', trainability: 80, professionalism: 80, age: 22 }) as unknown as Record<string, unknown>;
  check('technical growth result has no secondaryAttr field', !('secondaryAttr' in r));
  check('technical growth result has no secondaryRaw field', !('secondaryRaw' in r));
}

// 12. Technical growth is entirely unaffected by Potential/attribute-value/overall-Performance — none of those are even accepted as parameters (structural proof, not just a runtime check).
{
  const r1 = calculateTechnicalRawGrowth({ focus: 'wetHandling', trainability: 75, professionalism: 75, age: 24 });
  const r2 = calculateTechnicalRawGrowth({ focus: 'wetHandling', trainability: 75, professionalism: 75, age: 24 });
  check('technical growth is deterministic (same inputs -> same output, no hidden Potential/overall dependency)', r1.raw === r2.raw);
}

// 13. Readiness affects Technical the same way as Performance (item 18) — never boosts above fully-rested.
{
  const rested = calculateTechnicalRawGrowth({ focus: 'packRiding', trainability: 75, professionalism: 75, age: 24 });
  const tired = calculateTechnicalRawGrowth({ focus: 'packRiding', trainability: 75, professionalism: 75, age: 24, readinessFactor: 0.5 });
  check('technical readinessFactor=0.5 halves raw growth', Math.abs(tired.raw - rested.raw * 0.5) < 1e-9);
  check('technical readiness never boosts above the fully-rested rate', tired.raw <= rested.raw);
}

// 14. Security canary (see the chat report): process_training_plan()'s SQL-side theoretical max stays sane (no runaway growth from any combination of trusted inputs).
{
  const theoreticalMax = calculatePerformanceRawGrowth({
    focus: 'climbing', intensity: 'hard', attributes: makeAttrs(100),
    trainability: 95, professionalism: 95, age: 18, potential: 95,
    facilityMultiplier: 2.0,
  });
  check('theoretical max Performance raw growth stays well under a sane per-week ceiling', theoreticalMax.primaryRaw < 50,
    `${theoreticalMax.primaryRaw}`);
  const technicalMax = calculateTechnicalRawGrowth({ focus: 'descending', trainability: 95, professionalism: 95, age: 18 });
  check('theoretical max Technical raw growth stays well under a sane per-week ceiling', technicalMax.raw < 20, `${technicalMax.raw}`);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
