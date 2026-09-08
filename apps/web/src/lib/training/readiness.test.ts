/**
 * Readiness V1 (see the chat report, item 17-19). Run with:
 * npx tsx src/lib/training/readiness.test.ts
 */
import { readinessScore, readinessEffectiveness, readinessLabel } from './readiness';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// 1. readinessScore formula: (energy + (100 - fatigue)) / 2.
check('full energy, zero fatigue -> score 100', readinessScore(100, 0) === 100);
check('zero energy, full fatigue -> score 0', readinessScore(0, 100) === 0);
check('energy=60, fatigue=40 -> score 60', readinessScore(60, 40) === 60);

// 2. Effectiveness bands exactly as specified.
check('80-100 -> 1.00', readinessEffectiveness(100) === 1.00 && readinessEffectiveness(80) === 1.00);
check('60-79 -> 0.95', readinessEffectiveness(79) === 0.95 && readinessEffectiveness(60) === 0.95);
check('40-59 -> 0.85', readinessEffectiveness(59) === 0.85 && readinessEffectiveness(40) === 0.85);
check('20-39 -> 0.70', readinessEffectiveness(39) === 0.70 && readinessEffectiveness(20) === 0.70);
check('0-19 -> 0.50', readinessEffectiveness(19) === 0.50 && readinessEffectiveness(0) === 0.50);

// 3. Effectiveness is monotonic non-decreasing with score.
{
  let ok = true;
  let prev = readinessEffectiveness(0);
  for (let s = 1; s <= 100; s++) {
    const cur = readinessEffectiveness(s);
    if (cur < prev) ok = false;
    prev = cur;
  }
  check('readinessEffectiveness never decreases as score rises', ok);
}

// 4. Labels match the effectiveness bands exactly (same thresholds).
check('label excellent at 80+', readinessLabel(100) === 'excellent' && readinessLabel(80) === 'excellent');
check('label good at 60-79', readinessLabel(79) === 'good' && readinessLabel(60) === 'good');
check('label reduced at 40-59', readinessLabel(59) === 'reduced' && readinessLabel(40) === 'reduced');
check('label poor at 20-39', readinessLabel(39) === 'poor' && readinessLabel(20) === 'poor');
check('label veryPoor at 0-19', readinessLabel(19) === 'veryPoor' && readinessLabel(0) === 'veryPoor');

// 5. Never above 1.00 (poor condition can only slow training, never speed it up — item 18/19).
{
  let ok = true;
  for (let s = -20; s <= 120; s++) {
    if (readinessEffectiveness(s) > 1.00) ok = false;
  }
  check('readinessEffectiveness is never above 1.00, even for out-of-range scores', ok);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
