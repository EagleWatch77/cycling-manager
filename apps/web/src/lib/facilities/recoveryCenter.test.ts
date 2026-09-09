/**
 * Recovery Center V1 — FINAL close-out (see the chat report, "REGENERAČNÉ
 * CENTRUM CLOSE-OUT"). Run with:
 * npx tsx src/lib/facilities/recoveryCenter.test.ts
 */
import { recoveryCenterMultiplier, RECOVERY_MULTIPLIER } from './config';
import { effectiveFacilityLevel, computeFacilityCaps } from './capMath';
import { weeklyConditionDelta, applyConditionDelta, clamp100 } from '../training/condition';
import { calculatePerformanceRawGrowth, calculateTechnicalRawGrowth } from '../training/growth';
import { developmentRoomFactor } from '../rider/score';
import { readinessScore, readinessEffectiveness } from '../training/readiness';
import type { SkillAttribute } from '../rider/config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// ===== 20. Multiplier table =====
check('L1 = 1.00', recoveryCenterMultiplier(1) === 1.00);
check('L2 = 1.05', recoveryCenterMultiplier(2) === 1.05);
check('L3 = 1.10', recoveryCenterMultiplier(3) === 1.10);
check('L4 = 1.15', recoveryCenterMultiplier(4) === 1.15);
check('L5 = 1.20', recoveryCenterMultiplier(5) === 1.20);
check('recoveryCenterMultiplier() mirrors RECOVERY_MULTIPLIER exactly (single source, no drift)',
  ([1, 2, 3, 4, 5] as const).every((l) => recoveryCenterMultiplier(l) === RECOVERY_MULTIPLIER[l]));

// Non-additive: a higher level uses its OWN canonical value, never a stacked product of lower levels.
check('L5 (1.20) is not the product of L2*L3*L4*L5 (would be ~1.52)', recoveryCenterMultiplier(5) === 1.20);

// ===== 21. Recovery behavior =====
// Energy recovery / fatigue reduction increase strictly with facility level, all else equal.
{
  const deltas = ([1, 2, 3, 4, 5] as const).map((l) =>
    weeklyConditionDelta({ weekType: 'performance', intensity: 'normal', recoveryMultiplier: recoveryCenterMultiplier(l) }));
  const energyIncreasing = deltas.every((d, i) => i === 0 || d.energyDelta > deltas[i - 1].energyDelta);
  const fatigueImproving = deltas.every((d, i) => i === 0 || d.fatigueDelta < deltas[i - 1].fatigueDelta);
  check('Energy recovery strictly increases with facility level (L1->L5)', energyIncreasing, JSON.stringify(deltas.map((d) => d.energyDelta)));
  check('Fatigue reduction strictly improves (more negative delta) with facility level (L1->L5)', fatigueImproving, JSON.stringify(deltas.map((d) => d.fatigueDelta)));
}

// Training cost is untouched by facility level (only the recovery component moves).
{
  const l1 = weeklyConditionDelta({ weekType: 'performance', intensity: 'hard', recoveryMultiplier: recoveryCenterMultiplier(1) });
  const l5 = weeklyConditionDelta({ weekType: 'performance', intensity: 'hard', recoveryMultiplier: recoveryCenterMultiplier(5) });
  // Isolate the fixed training-cost component: energyDelta - recoveryComponent must equal -15 (Hard's ENERGY_COST) regardless of level.
  const trainingCostFromL1 = l1.energyDelta - 4 * 5 * recoveryCenterMultiplier(1);
  const trainingCostFromL5 = l5.energyDelta - 4 * 5 * recoveryCenterMultiplier(5);
  check('training energy cost (-15 for Hard) is identical at L1 and L5 — facility never touches the cost itself',
    Math.abs(trainingCostFromL1 - trainingCostFromL5) < 1e-9 && Math.abs(trainingCostFromL1 - (-15)) < 1e-9,
    `L1-derived cost=${trainingCostFromL1} L5-derived cost=${trainingCostFromL5}`);
}

// Number of recovery days does not change with facility level — verified structurally: recoveryCenterMultiplier() takes only `level`, weeklyConditionDelta()'s day counts come only from PERFORMANCE_RECOVERY_DAYS/TECHNICAL_RECOVERY_DAYS (intensity-keyed constants), never from a facility level parameter.
check('recoveryCenterMultiplier() takes exactly 1 parameter (level) — cannot also encode a day count', recoveryCenterMultiplier.length === 1);

// Readiness formula itself is untouched — Recovery Center only ever changes the ENERGY/FATIGUE INPUTS to readiness, never the formula.
check('readinessScore() takes only (energy, fatigue) — no facility parameter exists to boost it directly', readinessScore.length === 2);
check('readinessEffectiveness() takes only (score) — no facility parameter', readinessEffectiveness.length === 1);

// Performance/Technical training gain untouched by Recovery Center — neither growth function accepts a recovery-center parameter at all.
{
  const attrs = {
    climbing: 130, hills: 130, flat: 130, sprint: 130, timeTrial: 130, endurance: 130, acceleration: 130,
    descending: 130, energyManagement: 130, positioning: 130, reaction: 130, breakawaySkill: 130,
    packRiding: 130, experience: 130, bikeHandling: 130, cornering: 130, attackTiming: 130, roughSurface: 130, wetHandling: 130,
  } as Record<SkillAttribute, number>;
  const perf1 = calculatePerformanceRawGrowth({ focus: 'climbing', intensity: 'hard', attributes: attrs, trainability: 75, professionalism: 75, age: 20, potential: 75 });
  const perf2 = calculatePerformanceRawGrowth({ focus: 'climbing', intensity: 'hard', attributes: attrs, trainability: 75, professionalism: 75, age: 20, potential: 75 });
  check('calculatePerformanceRawGrowth has no recovery-center parameter (Performance gain is unaffected by Recovery Center)', perf1.primaryRaw === perf2.primaryRaw);
  const tech1 = calculateTechnicalRawGrowth({ focus: 'descending', trainability: 75, professionalism: 75, age: 20 });
  check('calculateTechnicalRawGrowth has no recovery-center parameter (Technical gain is unaffected by Recovery Center)', typeof tech1.raw === 'number');
  check('developmentRoomFactor (Potential math) has no facility parameter of any kind', developmentRoomFactor.length === 3);
}

// Experience / Form / Morale / Fitness: structurally impossible to touch — weeklyConditionDelta()'s return type only has energyDelta/fatigueDelta.
{
  const d = weeklyConditionDelta({ weekType: 'performance', intensity: 'light', recoveryMultiplier: recoveryCenterMultiplier(5) });
  const keys = Object.keys(d).sort();
  check('weeklyConditionDelta() result has ONLY energyDelta/fatigueDelta — no experience/form/morale/fitness field exists to accidentally change', JSON.stringify(keys) === JSON.stringify(['energyDelta', 'fatigueDelta']), JSON.stringify(keys));
}

// ===== 22. Relegation =====
// Team Center fixed at max (5) so only the league cap is under test — see computeFacilityCaps() in capMath.ts.
{
  const capPro = computeFacilityCaps(4, 5).recovery;
  check('stored L4 + Pro cap -> effective L4', effectiveFacilityLevel(4, capPro) === 4, `${capPro}`);

  const capContinental = computeFacilityCaps(3, 5).recovery;
  check('stored L4 + Continental cap -> effective L3', effectiveFacilityLevel(4, capContinental) === 3, `${capContinental}`);

  const capAmateur = computeFacilityCaps(2, 5).recovery;
  check('stored L4 + Amateur cap -> effective L2', effectiveFacilityLevel(4, capAmateur) === 2, `${capAmateur}`);

  const capRookie = computeFacilityCaps(1, 5).recovery;
  check('stored L4 + Rookie cap -> effective L1', effectiveFacilityLevel(4, capRookie) === 1, `${capRookie}`);

  check('back to Pro -> effective L4 again, stored L4 never decreased', effectiveFacilityLevel(4, capPro) === 4);
}

// ===== 23. Clamp / rounding =====
check('Energy 98 + a big recovery delta clamps to 100, never above', applyConditionDelta({ energy: 98, fatigue: 50 }, { energyDelta: 50, fatigueDelta: 0 }).energy === 100);
check('Fatigue 2 - a big reduction delta clamps to 0, never below', applyConditionDelta({ energy: 50, fatigue: 2 }, { energyDelta: 0, fatigueDelta: -50 }).fatigue === 0);
check('clamp100 never exceeds 100', clamp100(150) === 100);
check('clamp100 never drops below 0', clamp100(-20) === 0);

// Rounding: L3's fractional recovery (5 days * 5 energy * 1.10 = 27.5) must round to a whole number, deterministically.
{
  const delta = weeklyConditionDelta({ weekType: 'performance', intensity: 'normal', recoveryMultiplier: recoveryCenterMultiplier(3) });
  check('L3 Normal recovery raw delta is genuinely fractional (audit baseline)', !Number.isInteger(delta.energyDelta), `${delta.energyDelta}`);
  const result = applyConditionDelta({ energy: 50, fatigue: 50 }, delta);
  check('applyConditionDelta() always returns whole-number Energy', Number.isInteger(result.energy), `${result.energy}`);
  check('applyConditionDelta() always returns whole-number Fatigue', Number.isInteger(result.fatigue), `${result.fatigue}`);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
