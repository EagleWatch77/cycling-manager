/**
 * Scouting Dept V1 — deterministic potential estimate. Verifies the two
 * hard requirements: stable per rider across "reloads" (repeated calls),
 * and that only a SegmentLevel (1-5) ever comes out — never a raw number
 * that could leak truePotential.
 * Run with: npx tsx src/lib/facilities/scouting.test.ts
 */
import { estimatePotentialStars } from './scouting';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// 1. Deterministic: same rider + same level, called repeatedly ("refresh"), never changes.
{
  const riderId = 'rider-abc-123';
  const results = Array.from({ length: 20 }, () => estimatePotentialStars(riderId, 75, 3));
  check('20 repeated calls all return the identical star rating', results.every((r) => r === results[0]), `${results.join(',')}`);
}

// 2. Different riders (different seeds) can land on different estimates — not a constant function.
{
  const ids = ['rider-1', 'rider-2', 'rider-3', 'rider-4', 'rider-5', 'rider-6', 'rider-7', 'rider-8'];
  const stars = ids.map((id) => estimatePotentialStars(id, 75, 1)); // L1 = widest window, most likely to vary
  const distinct = new Set(stars).size;
  check('varies across different riders at low scouting accuracy', distinct > 1, `${stars.join(',')}`);
}

// 3. Higher scouting level (smaller error window) should on average land closer to the true star band
// than L1 — checked via the window shrinking, not via leaking the raw perturbed value (item 6).
{
  const truePotential = 75; // roughly mid-range
  let matchesAtL1 = 0, matchesAtL5 = 0;
  const trueStarsAtTruth = estimatePotentialStars('reference-seed-for-true-band', truePotential, 5); // L5 window (±3) as a close-enough proxy for "true band"
  for (let i = 0; i < 50; i++) {
    const id = `sample-rider-${i}`;
    if (estimatePotentialStars(id, truePotential, 1) === trueStarsAtTruth) matchesAtL1++;
    if (estimatePotentialStars(id, truePotential, 5) === trueStarsAtTruth) matchesAtL5++;
  }
  check('L5 (narrow window) matches the true band at least as often as L1 (wide window)', matchesAtL5 >= matchesAtL1, `L1 ${matchesAtL1}/50 L5 ${matchesAtL5}/50`);
}

// 4. Output type is always a SegmentLevel (1-5 integer) — structurally impossible to leak a raw potential number.
{
  const r = estimatePotentialStars('rider-xyz', 88, 2);
  check('output is an integer between 1 and 5', Number.isInteger(r) && r >= 1 && r <= 5, `${r}`);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
