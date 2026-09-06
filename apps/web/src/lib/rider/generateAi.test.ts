/**
 * AI Rider Generator V1 — bounds, variety, archetype mix, quality target.
 * Run with: npx tsx src/lib/rider/generateAi.test.ts
 */
import {
  SKILL_ATTRIBUTES, ATTR_MIN, ATTR_MAX, AGE_MIN, AGE_MAX, STARTER_CONDITION,
  POTENTIAL_MIN, POTENTIAL_MAX, TRAINABILITY_MIN, TRAINABILITY_MAX,
} from './config';
import { generateAiRider } from './generateAi';
import { AI_GENERATOR_VERSION, ARCHETYPE_PLAN, archetypeForSlot, aiFillersNeeded, MINIMUM_RACE_FIELD } from './aiConfig';

/** Deterministic RNG so this file's own checks are reproducible. mulberry32. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

// 1. The 19-slot plan matches the requested distribution.
{
  const counts: Record<string, number> = {};
  for (const id of ARCHETYPE_PLAN) counts[id] = (counts[id] ?? 0) + 1;
  const rouleurTt = (counts.rouleur ?? 0) + (counts.timeTrial ?? 0);
  check('19 slots total', ARCHETYPE_PLAN.length === 19, `${ARCHETYPE_PLAN.length}`);
  check('4 sprinters', counts.sprinter === 4, `${counts.sprinter}`);
  check('4 puncheurs', counts.puncheur === 4, `${counts.puncheur}`);
  check('4 climbers', counts.climber === 4, `${counts.climber}`);
  check('3 rouleur/TT', rouleurTt === 3, `${rouleurTt}`);
  check('4 all-rounders', counts.allrounder === 4, `${counts.allrounder}`);
}

// 2. aiFillersNeeded(1) === 19 for the first solo test.
check('aiFillersNeeded(1 real rider) === 19', aiFillersNeeded(1) === 19, `${aiFillersNeeded(1)}`);
check('aiFillersNeeded(20+) === 0', aiFillersNeeded(20) === 0 && aiFillersNeeded(25) === 0);
check('MINIMUM_RACE_FIELD is 20', MINIMUM_RACE_FIELD === 20);

// 3. Generate the first 19-rider test peloton and validate it end to end.
const peloton = Array.from({ length: 19 }, (_, i) => generateAiRider(rng(1000 + i), archetypeForSlot(i)));

{
  let ok = true, why = '';
  for (const r of peloton) {
    if (r.age < AGE_MIN || r.age > AGE_MAX) { ok = false; why = `age ${r.age}`; break; }
    for (const a of SKILL_ATTRIBUTES) {
      const v = r.attributes[a];
      if (v < ATTR_MIN || v > ATTR_MAX || !Number.isInteger(v)) { ok = false; why = `${a}=${v}`; break; }
    }
    if (r.potential < POTENTIAL_MIN || r.potential > POTENTIAL_MAX) { ok = false; why = `potential ${r.potential}`; break; }
    if (r.trainability < TRAINABILITY_MIN || r.trainability > TRAINABILITY_MAX) { ok = false; why = `trainability ${r.trainability}`; break; }
    if (!ok) break;
  }
  check('all 19 riders within attribute/age/potential/trainability bounds', ok, why);
}

{
  const r = peloton[0];
  const keys = Object.keys(r.attributes).sort();
  const want = [...SKILL_ATTRIBUTES].sort();
  check('exactly the 15 engine attributes present', JSON.stringify(keys) === JSON.stringify(want), keys.join(','));
}

{
  const c = peloton[0].condition;
  check('initial condition is E100 Form50 Fit60 Mor70',
    c.energy === 100 && c.form === 50 && c.fitness === 60 && c.morale === 70,
    JSON.stringify(c));
  check('condition has no fields beyond what Starter Rider V1 already uses',
    JSON.stringify(Object.keys(c).sort()) === JSON.stringify(Object.keys(STARTER_CONDITION).sort()));
}

{
  const names = new Set(peloton.map((r) => r.firstName + r.surname));
  check('19 riders are not all identical', names.size > 1, `distinct names ${names.size}`);
  const sigs = new Set(peloton.map((r) => SKILL_ATTRIBUTES.map((a) => r.attributes[a]).join(',')));
  check('19 riders do not all share identical stats', sigs.size > 1, `distinct stat lines ${sigs.size}`);
}

check('generatorVersion is rookie-ai-v1', peloton.every((r) => r.generatorVersion === AI_GENERATOR_VERSION));

{
  const counts: Record<string, number> = {};
  for (const r of peloton) counts[r.archetype] = (counts[r.archetype] ?? 0) + 1;
  check('generated peloton archetype mix matches the plan',
    counts.sprinter === 4 && counts.puncheur === 4 && counts.climber === 4 &&
    (counts.rouleur ?? 0) + (counts.timeTrial ?? 0) === 3 && counts.allrounder === 4,
    JSON.stringify(counts));
}

// 4. Quality target: mean attribute across many riders is ~130 (Starter Rider V1 parity).
{
  let sum = 0, n = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const r = generateAiRider(rng(seed), archetypeForSlot(seed));
    for (const a of SKILL_ATTRIBUTES) { sum += r.attributes[a]; n++; }
  }
  const mean = sum / n;
  check('mean attribute across 1000 AI riders is ~130 (127..133)', mean > 127 && mean < 133, `mean ${mean.toFixed(1)}`);
}

// 5. Determinism: same seed + shape -> identical rider.
{
  const a = generateAiRider(rng(555), 'climber');
  const b = generateAiRider(rng(555), 'climber');
  check('same seed+shape -> identical rider', JSON.stringify(a) === JSON.stringify(b));
}

console.log('\n  --- 19-rider preview peloton ---');
for (const r of peloton) {
  const values = SKILL_ATTRIBUTES.map((a) => r.attributes[a]);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  console.log(
    `  ${r.archetype.padEnd(10)} ${(r.firstName + ' ' + r.surname).padEnd(22)} ` +
    `${r.countryIso2}  age ${r.age}  mean ${mean.toFixed(1)}  min ${min}  max ${max}`,
  );
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
