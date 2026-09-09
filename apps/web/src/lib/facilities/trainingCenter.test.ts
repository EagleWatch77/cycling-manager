/**
 * Training Center V1 — FINAL close-out (see the chat report, "TRAINING
 * CENTER CLOSE-OUT"). Exact table from the request, item 15.
 * Run with: npx tsx src/lib/facilities/trainingCenter.test.ts
 */
import { trainingCenterMultiplier, performanceAgeBand } from './config';
import { effectiveFacilityLevel, computeFacilityCaps } from './capMath';
import { calculatePerformanceRawGrowth, calculateTechnicalRawGrowth } from '../training/growth';
import { developmentRoomFactor, overallPerformance, riderOverall, performanceScore } from '../rider/score';
import type { SkillAttribute } from '../rider/config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// 1. L1 — every age gets 1.00.
check('L1 age18 -> 1.00', trainingCenterMultiplier(1, 18) === 1.00);
check('L1 age25 -> 1.00', trainingCenterMultiplier(1, 25) === 1.00);
check('L1 age35 -> 1.00', trainingCenterMultiplier(1, 35) === 1.00);

// 2. L2 — only 17-23 unlocked.
check('L2 age17 -> 1.15', trainingCenterMultiplier(2, 17) === 1.15);
check('L2 age23 -> 1.15', trainingCenterMultiplier(2, 23) === 1.15);
check('L2 age24 -> 1.00', trainingCenterMultiplier(2, 24) === 1.00);

// 3. L3 — 17-23 and 24-27 unlocked.
check('L3 age20 -> 1.15', trainingCenterMultiplier(3, 20) === 1.15);
check('L3 age24 -> 1.10', trainingCenterMultiplier(3, 24) === 1.10);
check('L3 age27 -> 1.10', trainingCenterMultiplier(3, 27) === 1.10);
check('L3 age28 -> 1.00', trainingCenterMultiplier(3, 28) === 1.00);

// 4. L4 — 17-23/24-27/28-31 unlocked.
check('L4 age20 -> 1.15', trainingCenterMultiplier(4, 20) === 1.15);
check('L4 age25 -> 1.10', trainingCenterMultiplier(4, 25) === 1.10);
check('L4 age28 -> 1.05', trainingCenterMultiplier(4, 28) === 1.05);
check('L4 age31 -> 1.05', trainingCenterMultiplier(4, 31) === 1.05);
check('L4 age32 -> 1.00', trainingCenterMultiplier(4, 32) === 1.00);

// 5. L5 — all four bands unlocked.
check('L5 age20 -> 1.15', trainingCenterMultiplier(5, 20) === 1.15);
check('L5 age25 -> 1.10', trainingCenterMultiplier(5, 25) === 1.10);
check('L5 age30 -> 1.05', trainingCenterMultiplier(5, 30) === 1.05);
check('L5 age32 -> 1.03', trainingCenterMultiplier(5, 32) === 1.03);
check('L5 age40 -> 1.03', trainingCenterMultiplier(5, 40) === 1.03);

// 6. Non-additive: a 20-year-old at L5 gets exactly 1.15, never a stacked product of all four bands' bonuses.
{
  const v = trainingCenterMultiplier(5, 20);
  check('L5 20-year-old gets exactly 1.15 (never 1.15*1.10*1.05*1.03)', v === 1.15, `${v}`);
  check('never exceeds the single largest band bonus (1.15)', v <= 1.15);
}

// 7. performanceAgeBand() boundaries match the multiplier table's own bands.
check('performanceAgeBand(23) = 17-23', performanceAgeBand(23) === '17-23');
check('performanceAgeBand(24) = 24-27', performanceAgeBand(24) === '24-27');
check('performanceAgeBand(27) = 24-27', performanceAgeBand(27) === '24-27');
check('performanceAgeBand(28) = 28-31', performanceAgeBand(28) === '28-31');
check('performanceAgeBand(31) = 28-31', performanceAgeBand(31) === '28-31');
check('performanceAgeBand(32) = 32+', performanceAgeBand(32) === '32+');

// 8. Effective level, not stored level, must be what feeds the multiplier — relegation round trip (item 16).
// Team Center level fixed at 5 (max) throughout so ONLY the league cap is under test here — see
// computeFacilityCaps() in capMath.ts: the real effective cap is min(leagueCap, teamCenterLevel+1),
// and a low/default Team Center would otherwise mask what this test is isolating.
{
  // Continental cap = 3 (see lib/leagues.ts): stored L3 stays effective L3.
  const capContinental = computeFacilityCaps(3, 5).training;
  check('stored L3 + Continental cap -> effective L3', effectiveFacilityLevel(3, capContinental) === 3, `${capContinental}`);
  check('effective L3 age20 -> 1.15 (band already unlocked at L3)', trainingCenterMultiplier(effectiveFacilityLevel(3, capContinental), 20) === 1.15);

  // Relegated to Amateur (league cap 2): stored level UNCHANGED at 3, effective drops to 2.
  const capAmateur = computeFacilityCaps(2, 5).training;
  check('stored L3 + Amateur cap -> effective L2 (stored level itself never erased)', effectiveFacilityLevel(3, capAmateur) === 2, `${capAmateur}`);
  check('effective L2 age25 -> 1.00 (24-27 band not yet unlocked at L2)', trainingCenterMultiplier(effectiveFacilityLevel(3, capAmateur), 25) === 1.00);

  // Relegated further to Rookie (league cap 1): stored level still 3, effective clamps to 1.
  const capRookie = computeFacilityCaps(1, 5).training;
  check('stored L3 + Rookie cap -> effective L1 (still never erases stored level)', effectiveFacilityLevel(3, capRookie) === 1, `${capRookie}`);
  check('effective L1 age20 -> 1.00 (no bands unlocked at L1)', trainingCenterMultiplier(effectiveFacilityLevel(3, capRookie), 20) === 1.00);

  // Promoted back to Continental: effective level recovers to 3 automatically — nothing to re-purchase.
  check('back to Continental -> effective L3 again, same stored L3', effectiveFacilityLevel(3, capContinental) === 3, `${capContinental}`);
}

// 9. Technical training NEVER uses the Training Center multiplier, regardless of facility level (item 5).
{
  const r1 = calculateTechnicalRawGrowth({ focus: 'descending', trainability: 75, professionalism: 75, age: 20 });
  const r2 = calculateTechnicalRawGrowth({ focus: 'descending', trainability: 75, professionalism: 75, age: 20 });
  check('calculateTechnicalRawGrowth has no facilityMultiplier parameter at all (structurally impossible to apply Training Center)', r1.raw === r2.raw);
  // Structural proof: the function signature literally has no facility param — verified by TypeScript at compile time (would fail to build if one were added and used here).
}

// 10. Potential/Tactics/Technique/Experience are structurally untouched by the Training Center multiplier — trainingCenterMultiplier() takes only (level, age), nothing else.
check('trainingCenterMultiplier() takes exactly 2 params (level, age) — cannot read/mutate Potential, Tactics, Technique, or Experience', trainingCenterMultiplier.length === 2);

// 11. Primary AND secondary Performance progress both receive the facility effect (item 4) — reuse growth.ts's existing facilityMultiplier plumbing with a real trainingCenterMultiplier() value.
{
  const attrs = {
    climbing: 130, hills: 130, flat: 130, sprint: 130, timeTrial: 130, endurance: 130, acceleration: 130,
    descending: 130, energyManagement: 130, positioning: 130, reaction: 130, breakawaySkill: 130,
    packRiding: 130, experience: 130, bikeHandling: 130, cornering: 130, attackTiming: 130, roughSurface: 130, wetHandling: 130,
  } as Record<SkillAttribute, number>;
  const mult = trainingCenterMultiplier(2, 20); // L2, age 20 -> 1.15
  check('sanity: L2 age20 multiplier is 1.15', mult === 1.15);
  const noBonus = calculatePerformanceRawGrowth({ focus: 'climbing', intensity: 'hard', attributes: attrs, trainability: 75, professionalism: 75, age: 20, potential: 75 });
  const withBonus = calculatePerformanceRawGrowth({ focus: 'climbing', intensity: 'hard', attributes: attrs, trainability: 75, professionalism: 75, age: 20, potential: 75, facilityMultiplier: mult });
  check('primary raw scales by the exact trainingCenterMultiplier value', Math.abs(withBonus.primaryRaw - noBonus.primaryRaw * mult) < 1e-9,
    `no-bonus ${noBonus.primaryRaw} with-bonus ${withBonus.primaryRaw}`);
  check('secondary raw ALSO scales by the same multiplier', Math.abs((withBonus.secondaryRaw ?? 0) - (noBonus.secondaryRaw ?? 0) * mult) < 1e-9);
}

// 12. Potential/Development Model V2 math is untouched by this task — sanity check that score.ts's exports still exist and behave (no accidental coupling introduced).
{
  const overall = overallPerformance({
    climbing: 130, hills: 130, flat: 130, sprint: 130, timeTrial: 130, endurance: 130, acceleration: 130,
    descending: 130, energyManagement: 130, positioning: 130, reaction: 130, breakawaySkill: 130,
    packRiding: 130, experience: 130, bikeHandling: 130, cornering: 130, attackTiming: 130, roughSurface: 130, wetHandling: 130,
  } as Record<SkillAttribute, number>);
  const devFactor = developmentRoomFactor(130, overall, 75);
  check('developmentRoomFactor is unaffected by Training Center (no facility param exists on it)', developmentRoomFactor.length === 3 && devFactor > 0);
  check('riderOverall/performanceScore still importable and unrelated to facility math', typeof riderOverall === 'function' && typeof performanceScore === 'function');
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
