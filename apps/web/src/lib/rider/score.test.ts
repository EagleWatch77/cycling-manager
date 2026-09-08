/**
 * Development Model V2 + Rider Score foundation — see the chat report.
 * Run with: npx tsx src/lib/rider/score.test.ts
 */
import {
  localAttributeFactor, overallPerformance, overallPotentialFactor, developmentRoomFactor,
  normalizeScore, performanceScore, riderOverall, DEVELOPMENT_ROOM_FLOOR,
} from './score';
import { PERFORMANCE_MIN, PERFORMANCE_MAX, ATTR_MIN, ATTR_MAX, type SkillAttribute } from './config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

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

// =====================================================================
// DEVELOPMENT TESTS (item 29)
// =====================================================================

// Potential 55 is NOT a hard attribute ceiling: a low-potential rider can
// still train an attribute up past what the OLD potentialCeiling(55)=100
// would have implied — and even past 160, as long as overall is low.
check('potential=55 does not block training past the old implied ceiling (100)',
  developmentRoomFactor(120, 130, 55) > 0);
check('potential=55 rider CAN train an attribute above 160 (no such thing as a hard per-attribute cap below 200)',
  developmentRoomFactor(165, 145, 55) > 0, `${developmentRoomFactor(165, 145, 55)}`);

// Performance can reach 200, never exceed it.
check('localAttributeFactor(199) is still positive (not yet capped)', localAttributeFactor(199) > 0);
check('localAttributeFactor(200) is exactly 0 (hard cap)', localAttributeFactor(200) === 0);
check('localAttributeFactor(210) is still 0 (never negative headroom)', localAttributeFactor(210) === 0);
check('developmentRoomFactor at currentValue=200 is exactly 0, bypassing the floor', developmentRoomFactor(200, 200, 95) === 0);
check('PERFORMANCE_MAX is exactly 200', PERFORMANCE_MAX === 200);
check('PERFORMANCE_MIN equals ATTR_MIN (100) — starting floor unchanged', PERFORMANCE_MIN === ATTR_MIN);

// overall <= 140 -> Potential has zero effect on development.
{
  const lo = overallPotentialFactor(140, 55);
  const hi = overallPotentialFactor(140, 95);
  check('overall=140: Potential 55 vs 95 give IDENTICAL overallPotentialFactor (no effect yet)', lo === hi, `${lo} vs ${hi}`);
  check('overall=100 (well below 140): also identical', overallPotentialFactor(100, 55) === overallPotentialFactor(100, 95));
}

// High overall -> Potential starts to differentiate.
{
  const lo = overallPotentialFactor(180, 55);
  const hi = overallPotentialFactor(180, 95);
  check('overall=180: Potential 95 gives a HIGHER factor than Potential 55', hi > lo, `low-potential ${lo} high-potential ${hi}`);
}

// Potential 95 has a high-end advantage over Potential 55.
{
  const lo190 = overallPotentialFactor(190, 55);
  const hi190 = overallPotentialFactor(190, 95);
  check('overall=190: potential=95 clearly beats potential=55', hi190 > lo190 * 1.5, `${lo190} vs ${hi190}`);
}

// Specialist is not treated as a fully-developed elite generalist.
{
  // Specialist: climbing=180, rest ~125-145, overall ~140.
  const specialistAttrs = makeAttrs(135, { climbing: 180, hills: 130, flat: 140, sprint: 125, timeTrial: 145, endurance: 130, acceleration: 140 });
  const specialistOverall = overallPerformance(specialistAttrs);
  const specialistFactor = developmentRoomFactor(180, specialistOverall, 75);

  // Elite generalist: climbing=180, rest ~165-180, overall ~172+.
  const eliteAttrs = makeAttrs(172, { climbing: 180, hills: 168, flat: 175, sprint: 165, timeTrial: 178, endurance: 170, acceleration: 174 });
  const eliteOverall = overallPerformance(eliteAttrs);
  const eliteFactor = developmentRoomFactor(180, eliteOverall, 75);

  check('specialist overall stays well under 150 (not considered elite just for one high stat)', specialistOverall < 150, `${specialistOverall}`);
  check('elite generalist overall is well above 165', eliteOverall > 165, `${eliteOverall}`);
  check('specialist develops noticeably FASTER at the same trained value (180) than the true elite generalist',
    specialistFactor > eliteFactor * 1.3, `specialist ${specialistFactor} elite ${eliteFactor}`);
}

// developmentRoomFactor never drops below the floor while under the hard cap.
{
  let minSeen = 1;
  for (let overall = 100; overall < 200; overall += 5) {
    for (const potential of [55, 65, 75, 85, 95]) {
      const f = developmentRoomFactor(overall, overall, potential);
      minSeen = Math.min(minSeen, f);
    }
  }
  check(`developmentRoomFactor never drops below the floor (${DEVELOPMENT_ROOM_FLOOR}) while currentValue < 200`, minSeen >= DEVELOPMENT_ROOM_FLOOR, `min seen: ${minSeen}`);
}

// =====================================================================
// SCORE TESTS (item 30)
// =====================================================================

check('overallPerformance uses exactly the 7 Performance attributes (verified via a distinctive value only on those 7)',
  overallPerformance(makeAttrs(100, { climbing: 200, hills: 200, flat: 200, sprint: 200, timeTrial: 200, endurance: 200, acceleration: 200 })) === 200);

check('Potential never changes Performance Score (performanceScore has no potential parameter at all — structurally impossible)',
  performanceScore.length === 1, `arity=${performanceScore.length}`);

{
  const attrs = makeAttrs(150);
  // riderOverall has no potential/trainability/professionalism/condition parameter — structurally impossible for them to matter.
  check('riderOverall() takes only `attributes` — no Potential/Trainability/Professionalism/Condition parameter exists', riderOverall.length === 1, `arity=${riderOverall.length}`);
  const score1 = riderOverall(attrs);
  const score2 = riderOverall(attrs); // same attrs, called twice
  check('riderOverall is deterministic (same input -> same output)', score1 === score2);
}

check('Performance weight is 65% (verified: an all-100 rider except Performance=200 gets ~65 + small remainder)',
  (() => {
    const attrs = makeAttrs(100, { climbing: 200, hills: 200, flat: 200, sprint: 200, timeTrial: 200, endurance: 200, acceleration: 200 });
    // performance=100 (normalized), tactics/technique/experience=0 (at ATTR_MIN) -> overall = 100*0.65 = 65
    return riderOverall(attrs) === 65;
  })(), `${riderOverall(makeAttrs(100, { climbing: 200, hills: 200, flat: 200, sprint: 200, timeTrial: 200, endurance: 200, acceleration: 200 }))}`);

check('Tactics weight is 15% (verified: all attrs at ATTR_MIN except Tactics at ATTR_MAX)',
  (() => {
    const attrs = makeAttrs(ATTR_MIN, { positioning: ATTR_MAX, attackTiming: ATTR_MAX, reaction: ATTR_MAX, energyManagement: ATTR_MAX, breakawaySkill: ATTR_MAX });
    return riderOverall(attrs) === 15;
  })());

check('Technique weight is 15%',
  (() => {
    const attrs = makeAttrs(ATTR_MIN, { descending: ATTR_MAX, bikeHandling: ATTR_MAX, cornering: ATTR_MAX, packRiding: ATTR_MAX, wetHandling: ATTR_MAX, roughSurface: ATTR_MAX });
    return riderOverall(attrs) === 15;
  })());

check('Experience weight is 5%',
  (() => riderOverall(makeAttrs(ATTR_MIN, { experience: ATTR_MAX })) === 5)());

check('score stays within [0,100] for a maxed-everything rider', riderOverall(makeAttrs(ATTR_MAX, {
  climbing: PERFORMANCE_MAX, hills: PERFORMANCE_MAX, flat: PERFORMANCE_MAX, sprint: PERFORMANCE_MAX,
  timeTrial: PERFORMANCE_MAX, endurance: PERFORMANCE_MAX, acceleration: PERFORMANCE_MAX,
})) === 100);
check('score stays within [0,100] for a minimum-everything rider', riderOverall(makeAttrs(ATTR_MIN)) === 0);

check('normalizeScore clamps below range to 0', normalizeScore(50, 100, 200) === 0);
check('normalizeScore clamps above range to 100', normalizeScore(250, 100, 200) === 100);
check('normalizeScore midpoint is 50', normalizeScore(150, 100, 200) === 50);

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
