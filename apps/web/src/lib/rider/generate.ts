import {
  SKILL_ATTRIBUTES, SHAPES, GENERATOR_VERSION,
  ROOKIE_BASE, ROOKIE_BASE_SPREAD, ATTR_NOISE, ATTR_MIN, ATTR_MAX,
  AGE_MIN, AGE_MAX, STRONG_BONUS, WEAK_PENALTY, STARTER_CONDITION,
  POTENTIAL_MIN, POTENTIAL_MAX, TRAINABILITY_MIN, TRAINABILITY_MAX,
  PROFESSIONALISM_MIN, PROFESSIONALISM_MAX, RECOVERY_MIN, RECOVERY_MAX,
  type SkillAttribute,
} from './config';
import {
  type Rng, clamp, round, intBetween, noise, pickWeighted, COUNTRIES, FIRST, SUR,
} from './shared';

/**
 * Starter Rider Generator V1.
 *
 * A pure function: give it a random source and it returns one plausible young
 * Rookie. No I/O, no Supabase, no engine import — the caller persists the
 * result. Deterministic for a given RNG, which is what the tests rely on.
 */

export interface GeneratedRider {
  firstName: string;
  surname: string;
  countryName: string;
  countryIso2: string;
  age: number;
  attributes: Record<SkillAttribute, number>;
  condition: typeof STARTER_CONDITION;
  /** Inferred from the numbers, shown to the player. Never a stored class. */
  inferredArchetype: string;
  /** Hidden, persisted, no race effect yet. */
  potential: number;
  trainability: number;
  /** Training V1: how much a Rider's own discipline vs. natural recovery help training gains. */
  professionalism: number;
  recovery: number;
  generatorVersion: string;
}

/**
 * Infer the archetype from the final attributes: whichever shape's strong set
 * scores highest above the rider's own mean wins; if none stands out it is an
 * all-rounder.
 */
function inferArchetype(attrs: Record<SkillAttribute, number>): string {
  const mean = SKILL_ATTRIBUTES.reduce((s, a) => s + attrs[a], 0) / SKILL_ATTRIBUTES.length;
  let best = 'allrounder';
  let bestEdge = 2.0; // must clear this margin to not be an all-rounder
  for (const shape of SHAPES) {
    if (shape.strong.length === 0) continue;
    const edge = shape.strong.reduce((s, a) => s + (attrs[a] - mean), 0) / shape.strong.length;
    if (edge > bestEdge) {
      bestEdge = edge;
      best = shape.id;
    }
  }
  return best;
}

export function generateStarterRider(rng: Rng): GeneratedRider {
  // Identity.
  const country = pickWeighted(rng, COUNTRIES, (c) => c.weight);
  const firstList = FIRST[country.iso2] ?? FIRST['SK'];
  const surList = SUR[country.iso2] ?? SUR['SK'];
  const firstName = firstList[Math.floor(rng() * firstList.length)];
  const surname = surList[Math.floor(rng() * surList.length)];
  const age = intBetween(rng, AGE_MIN, AGE_MAX);

  // Quality: one field-level base for the rider, then per-attribute shaping.
  const base = ROOKIE_BASE + noise(rng, ROOKIE_BASE_SPREAD);
  const shape = SHAPES[Math.floor(rng() * SHAPES.length)];

  const attributes = {} as Record<SkillAttribute, number>;
  for (const attr of SKILL_ATTRIBUTES) {
    let v = base;
    if (shape.strong.includes(attr)) v += STRONG_BONUS;
    if (shape.weak.includes(attr)) v -= WEAK_PENALTY;
    v += noise(rng, ATTR_NOISE);
    attributes[attr] = round(clamp(v, ATTR_MIN, ATTR_MAX));
  }

  return {
    firstName,
    surname,
    countryName: country.name,
    countryIso2: country.iso2,
    age,
    attributes,
    condition: { ...STARTER_CONDITION },
    inferredArchetype: inferArchetype(attributes),
    potential: intBetween(rng, POTENTIAL_MIN, POTENTIAL_MAX),
    trainability: intBetween(rng, TRAINABILITY_MIN, TRAINABILITY_MAX),
    professionalism: intBetween(rng, PROFESSIONALISM_MIN, PROFESSIONALISM_MAX),
    recovery: intBetween(rng, RECOVERY_MIN, RECOVERY_MAX),
    generatorVersion: GENERATOR_VERSION,
  };
}
