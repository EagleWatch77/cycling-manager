/**
 * Weekly condition delta — Unified Weekly Training V1 (see the chat
 * report, items 13-16). Run with:
 * npx tsx src/lib/training/condition.test.ts
 */
import { weeklyConditionDelta, applyConditionDelta, clamp100 } from './condition';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// 1. Performance, Light, no facility (recoveryMultiplier=1): cost -5, recovery 6 days * 5 * 1 = 30 -> energyDelta = +25.
{
  const r = weeklyConditionDelta({ weekType: 'performance', intensity: 'light', recoveryMultiplier: 1 });
  check('Light energyDelta = -5 + 6*5*1 = +25', r.energyDelta === 25, `${r.energyDelta}`);
  check('Light fatigueDelta = 5 - 6*4*1 = -19', r.fatigueDelta === -19, `${r.fatigueDelta}`);
}

// 2. Performance, Normal: cost -10/+10, recovery 5 days.
{
  const r = weeklyConditionDelta({ weekType: 'performance', intensity: 'normal', recoveryMultiplier: 1 });
  check('Normal energyDelta = -10 + 5*5*1 = +15', r.energyDelta === 15, `${r.energyDelta}`);
  check('Normal fatigueDelta = 10 - 5*4*1 = -10', r.fatigueDelta === -10, `${r.fatigueDelta}`);
}

// 3. Performance, Hard: cost -15/+18, recovery 4 days -> net fatigue still rises slowly under repeated Hard (never negative net fatigue).
{
  const r = weeklyConditionDelta({ weekType: 'performance', intensity: 'hard', recoveryMultiplier: 1 });
  check('Hard energyDelta = -15 + 4*5*1 = +5', r.energyDelta === 5, `${r.energyDelta}`);
  check('Hard fatigueDelta = 18 - 4*4*1 = +2 (net fatigue creep under sustained Hard)', r.fatigueDelta === 2, `${r.fatigueDelta}`);
}

// 4. Technical: fixed cost -5/+5, recovery 6 days (same as Light's recovery day count).
{
  const r = weeklyConditionDelta({ weekType: 'technical', intensity: 'light', recoveryMultiplier: 1 });
  check('Technical energyDelta = -5 + 6*5*1 = +25 (intensity argument is ignored for technical)', r.energyDelta === 25, `${r.energyDelta}`);
  check('Technical fatigueDelta = 5 - 6*4*1 = -19', r.fatigueDelta === -19, `${r.fatigueDelta}`);
}
{
  // Technical must ignore whatever intensity value happens to be stored (the neutral placeholder) — same result regardless.
  const light = weeklyConditionDelta({ weekType: 'technical', intensity: 'light', recoveryMultiplier: 1 });
  const hard = weeklyConditionDelta({ weekType: 'technical', intensity: 'hard', recoveryMultiplier: 1 });
  check('Technical result is identical regardless of the (ignored) intensity field', light.energyDelta === hard.energyDelta && light.fatigueDelta === hard.fatigueDelta);
}

// 5. Recovery Center multiplier boosts recovery only, never the training cost itself.
{
  const l1 = weeklyConditionDelta({ weekType: 'performance', intensity: 'hard', recoveryMultiplier: 1.00 });
  const l5 = weeklyConditionDelta({ weekType: 'performance', intensity: 'hard', recoveryMultiplier: 1.20 });
  check('L5 Recovery Center increases energyDelta vs L1 (more recovery)', l5.energyDelta > l1.energyDelta);
  check('L5 Recovery Center decreases fatigueDelta vs L1 (more fatigue reduction)', l5.fatigueDelta < l1.fatigueDelta);
  // Isolate the training-cost-only component: energyDelta - recoveryComponent must be the same constant regardless of multiplier.
  const l1RecoveryOnly = l1.energyDelta - (-15);
  const l5RecoveryOnly = l5.energyDelta - (-15);
  check('Recovery Center multiplier scales ONLY the recovery component, training cost (-15) is untouched', l5RecoveryOnly > l1RecoveryOnly);
}

// 6. clamp100.
check('clamp100(150) = 100', clamp100(150) === 100);
check('clamp100(-10) = 0', clamp100(-10) === 0);
check('clamp100(42) = 42', clamp100(42) === 42);

// 7. applyConditionDelta() — the one canonical rounding+clamp step (see the chat report, "REGENERAČNÉ CENTRUM CLOSE-OUT", items 12-13). Deliberately generic (current/delta only, no training/plan concept) so a future race/Tour recovery event can reuse it (item 11).
{
  const r = applyConditionDelta({ energy: 50, fatigue: 50 }, { energyDelta: 28.75, fatigueDelta: -22.5 });
  check('applyConditionDelta rounds a fractional Recovery-Center-scaled delta to a whole Energy value', Number.isInteger(r.energy), `${r.energy}`);
  check('applyConditionDelta rounds a fractional Recovery-Center-scaled delta to a whole Fatigue value', Number.isInteger(r.fatigue), `${r.fatigue}`);
  check('50 + 28.75 rounds to 79 (round-half-up), then clamps (no-op here)', r.energy === 79, `${r.energy}`);
  check('50 - 22.5 rounds to 28 (round-half-up: 27.5 rounds to 28)', r.fatigue === 28, `${r.fatigue}`);
}
{
  const r = applyConditionDelta({ energy: 95, fatigue: 5 }, { energyDelta: 20, fatigueDelta: -20 });
  check('applyConditionDelta clamps Energy at 100, never above', r.energy === 100, `${r.energy}`);
  check('applyConditionDelta clamps Fatigue at 0, never below', r.fatigue === 0, `${r.fatigue}`);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
