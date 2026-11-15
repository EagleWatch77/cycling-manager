/**
 * Prints reference values from the TypeScript code as JSON, for
 * supabase/tests/training_security.test.sh to compare against the REAL
 * Postgres implementation (calendar, growth, condition, 1-5 estimates, starter
 * generator bounds). Not a test by itself and not imported by the app.
 *   npx tsx src/lib/training/dbParity.cli.ts
 */
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { calculatePerformanceRawGrowth } from './growth';
import { applyConditionDelta, weeklyConditionDelta } from './condition';
import { readinessEffectiveness, readinessScore } from './readiness';
import { scoreToLevel } from '@/lib/rider/development';
import { generateStarterRider } from '@/lib/rider/generate';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const dates = ['2026-08-10', '2026-08-17', '2026-08-23', '2026-08-24', '2026-10-25', '2026-10-26', '2026-11-01', '2026-11-02',
  '2026-11-15', '2026-12-31', '2027-01-03', '2027-01-04', '2027-03-14', '2027-03-15', '2027-06-01', '2028-02-29'];
const calendar = dates.map((d) => {
  const s = getCurrentSeasonInfo(new Date(`${d}T12:00:00Z`));
  return { at: `${d}T12:00:00Z`, season: s.seasonId, week: s.currentWeek };
});

const attrs = Object.fromEntries(SKILL_ATTRIBUTES.map((a) => [a, 130])) as Record<SkillAttribute, number>;
const raw = calculatePerformanceRawGrowth({
  focus: 'climbing', intensity: 'normal', attributes: attrs, trainability: 80, professionalism: 70, age: 20, potential: 80,
  readinessFactor: readinessEffectiveness(readinessScore(70, 30)),
});
const cond = applyConditionDelta({ energy: 70, fatigue: 30 }, weeklyConditionDelta({ weekType: 'performance', intensity: 'normal', recoveryMultiplier: 1 }));

const levels = Array.from({ length: 41 }, (_, i) => 55 + i).map((v) => ({ v, level: scoreToLevel(v, 55, 95) }));

const rng = mulberry32(12345);
let min = Infinity, max = -Infinity; const archetypes = new Set<string>();
let hidMin = Infinity, hidMax = -Infinity, ageMin = 99, ageMax = 0;
for (let i = 0; i < 20000; i++) {
  const r = generateStarterRider(rng);
  for (const a of SKILL_ATTRIBUTES) { min = Math.min(min, r.attributes[a]); max = Math.max(max, r.attributes[a]); }
  archetypes.add(r.inferredArchetype);
  for (const h of [r.potential, r.trainability, r.professionalism, r.recovery]) { hidMin = Math.min(hidMin, h); hidMax = Math.max(hidMax, h); }
  ageMin = Math.min(ageMin, r.age); ageMax = Math.max(ageMax, r.age);
}
const sample = generateStarterRider(mulberry32(777));
const starterPayload = {
  first_name: sample.firstName, surname: sample.surname, country_name: sample.countryName, country_iso2: sample.countryIso2,
  age: sample.age, attributes: sample.attributes, condition: sample.condition, inferred_archetype: sample.inferredArchetype,
  potential: sample.potential, trainability: sample.trainability, professionalism: sample.professionalism,
  recovery: sample.recovery, generator_version: sample.generatorVersion,
};

console.log(JSON.stringify({
  calendar, raw, cond, levels,
  generator: { min, max, archetypes: [...archetypes].sort(), hidMin, hidMax, ageMin, ageMax, keys: [...SKILL_ATTRIBUTES].sort() },
  starterPayload,
}));
