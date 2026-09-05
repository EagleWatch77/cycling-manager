/**
 * Starter Rider Generator V1 — bounds, variety, determinism.
 * Run with: npx tsx src/lib/rider/generate.test.ts
 */
import {
  SKILL_ATTRIBUTES, ATTR_MIN, ATTR_MAX, AGE_MIN, AGE_MAX,
  STARTER_CONDITION, GENERATOR_VERSION,
  POTENTIAL_MIN, POTENTIAL_MAX, TRAINABILITY_MIN, TRAINABILITY_MAX,
} from './config';
import { generateStarterRider } from './generate';

/** Deterministic RNG so tests are reproducible. mulberry32. */
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

// 1. Bounds across many riders.
{
  let ok = true, why = '';
  for (let seed = 1; seed <= 3000; seed++) {
    const r = generateStarterRider(rng(seed));
    if (r.age < AGE_MIN || r.age > AGE_MAX) { ok = false; why = `age ${r.age}`; break; }
    for (const a of SKILL_ATTRIBUTES) {
      const v = r.attributes[a];
      if (v < ATTR_MIN || v > ATTR_MAX || !Number.isInteger(v)) { ok = false; why = `${a}=${v}`; break; }
    }
    if (r.potential < POTENTIAL_MIN || r.potential > POTENTIAL_MAX) { ok = false; why = `potential ${r.potential}`; break; }
    if (r.trainability < TRAINABILITY_MIN || r.trainability > TRAINABILITY_MAX) { ok = false; why = `trainability ${r.trainability}`; break; }
    if (!ok) break;
  }
  check('all attributes, age, potential, trainability within bounds (3000 riders)', ok, why);
}

// 2. Exactly the 15 engine attributes, nothing more, nothing less.
{
  const r = generateStarterRider(rng(42));
  const keys = Object.keys(r.attributes).sort();
  const want = [...SKILL_ATTRIBUTES].sort();
  check('exactly the 15 engine attributes present', JSON.stringify(keys) === JSON.stringify(want),
    keys.join(','));
}

// 3. Fixed starter condition.
{
  const r = generateStarterRider(rng(7));
  const c = r.condition;
  check('starter condition is fixed (E100 F0 Form50 Fit60 Mor70)',
    c.energy === STARTER_CONDITION.energy && c.fatigue === 0 && c.form === 50 &&
    c.fitness === 60 && c.morale === 70);
}

// 4. Non-identical generation: different seeds give different riders.
{
  const sig = (seed: number) => {
    const r = generateStarterRider(rng(seed));
    return r.firstName + r.surname + SKILL_ATTRIBUTES.map((a) => r.attributes[a]).join(',');
  };
  const set = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) set.add(sig(seed));
  check('200 seeds produce >190 distinct riders', set.size > 190, `distinct ${set.size}`);
}

// 5. Determinism: same seed, same rider.
{
  const a = generateStarterRider(rng(123));
  const b = generateStarterRider(rng(123));
  check('same seed -> identical rider', JSON.stringify(a) === JSON.stringify(b));
}

// 6. Quality sits near the Rookie base, not wildly off.
{
  let sum = 0, n = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const r = generateStarterRider(rng(seed));
    for (const a of SKILL_ATTRIBUTES) { sum += r.attributes[a]; n++; }
  }
  const mean = sum / n;
  check('mean attribute across 1000 riders is ~130 (127..133)', mean > 127 && mean < 133, `mean ${mean.toFixed(1)}`);
}

// 7. generatorVersion is stamped.
{
  const r = generateStarterRider(rng(1));
  check('generatorVersion is starter-v1', r.generatorVersion === GENERATOR_VERSION);
}

// 8. inferredArchetype is one of the known shapes.
{
  const ids = new Set(['allrounder','rouleur','climber','puncheur','sprinter','timeTrial','classics']);
  let ok = true;
  for (let seed = 1; seed <= 500; seed++) {
    if (!ids.has(generateStarterRider(rng(seed)).inferredArchetype)) { ok = false; break; }
  }
  check('inferred archetype always a known shape', ok);
}

console.log(`\n  ${pass}/${pass+fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
