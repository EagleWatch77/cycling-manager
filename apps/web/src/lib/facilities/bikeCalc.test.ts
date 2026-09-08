/**
 * Bike Condition V1 — pure math (overall derivation, clamps, service quote
 * pricing with Technical Center discount, Tour wear from real static data).
 * Run with: npx tsx src/lib/facilities/bikeCalc.test.ts
 */
import { deriveOverall, clamp0to100, computeServiceQuote, computeTourWear } from './bikeCalc';
import type { Tour } from '@/data/tours';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// 1. Overall condition stays 0-100 and is the WEAKEST component, not an average.
check('overall is the min of the three, not an average', deriveOverall({ tires: 90, brakes: 40, drivetrain: 95 }) === 40);
check('clamp0to100 never exceeds 100', clamp0to100(150) === 100);
check('clamp0to100 never goes below 0', clamp0to100(-40) === 0);
check('clamp0to100 passes through in-range values', clamp0to100(63) === 63);

// 2. Service quote: price scales with missing condition, and repair discount reduces it.
{
  const full = computeServiceQuote({ tires: 100, brakes: 100, drivetrain: 100 }, 1);
  check('fully-conditioned bike has zero service price', full.discountedPrice === 0, `${full.discountedPrice}`);

  const worn = computeServiceQuote({ tires: 50, brakes: 100, drivetrain: 100 }, 1);
  check('worn tires produce a positive base price', worn.basePrice > 0, `${worn.basePrice}`);
  check('at L1 (0% discount), discounted price equals base price', worn.discountedPrice === worn.basePrice);

  const wornDiscounted = computeServiceQuote({ tires: 50, brakes: 100, drivetrain: 100 }, 5);
  check('Technical Center L5 (-20%) reduces the price', wornDiscounted.discountedPrice < worn.basePrice, `${wornDiscounted.discountedPrice} vs ${worn.basePrice}`);
  check('L5 discount is exactly 20% off base', wornDiscounted.discountedPrice === Math.round(worn.basePrice * 0.8), `${wornDiscounted.discountedPrice}`);

  const tiresItem = worn.items.find((i) => i.component === 'tires')!;
  check('a component below 75% is flagged recommended', tiresItem.recommended === true);
  const brakesItem = worn.items.find((i) => i.component === 'brakes')!;
  check('a full component is not flagged recommended', brakesItem.recommended === false);
}

// 3. Tour wear uses only real static fields (distanceKm, per-stage difficulty) — never invented weather/gravel data.
{
  const flatTour: Tour = {
    id: 't1', name: 'Flat Test Tour', cardImage: '', heroImage: '',
    difficulty: 'flat', difficultyRating: 1, prestige: 1, suitableFor: [], jerseys: [],
    masterStages: [{ number: 1, name: 'S1', distanceKm: 100, difficulty: 'flat' }],
  };
  const mountainTour: Tour = {
    ...flatTour, id: 't2', name: 'Mountain Test Tour',
    masterStages: [{ number: 1, name: 'S1', distanceKm: 100, difficulty: 'mountain' }],
  };
  const flatWear = computeTourWear(flatTour);
  const mountainWear = computeTourWear(mountainTour);
  check('mountain stages wear brakes more than flat stages of equal distance', mountainWear.brakes > flatWear.brakes,
    `flat ${flatWear.brakes} mountain ${mountainWear.brakes}`);
  check('tire/drivetrain wear is positive for any real distance', flatWear.tires > 0 && flatWear.drivetrain > 0);

  const zeroDistanceTour: Tour = { ...flatTour, id: 't3', masterStages: [] };
  const zeroWear = computeTourWear(zeroDistanceTour);
  check('zero-distance tour produces zero wear (no invented baseline)', zeroWear.tires === 0 && zeroWear.brakes === 0 && zeroWear.drivetrain === 0);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
