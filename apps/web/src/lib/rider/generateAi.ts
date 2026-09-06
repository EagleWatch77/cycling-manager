import {
  SKILL_ATTRIBUTES, SHAPES,
  ROOKIE_BASE, ROOKIE_BASE_SPREAD, ATTR_NOISE, ATTR_MIN, ATTR_MAX,
  AGE_MIN, AGE_MAX, STRONG_BONUS, WEAK_PENALTY, STARTER_CONDITION,
  POTENTIAL_MIN, POTENTIAL_MAX, TRAINABILITY_MIN, TRAINABILITY_MAX,
  type SkillAttribute,
} from './config';
import { AI_GENERATOR_VERSION } from './aiConfig';
import {
  type Rng, clamp, round, intBetween, noise, pickWeighted, COUNTRIES, FIRST, SUR,
} from './shared';

/**
 * AI / Test Rider Generator V1.
 *
 * A pure function, same shape as generateStarterRider(): given an RNG and a
 * target archetype shape, it returns one plausible Rookie-quality AI rider.
 * No I/O, no Supabase — the caller persists the result with is_ai = true and
 * no player_id. Unlike the human starter generator, the shape is passed in
 * (not picked randomly) so the caller can control the peloton's archetype mix.
 */

export interface GeneratedAiRider {
  firstName: string;
  surname: string;
  countryName: string;
  countryIso2: string;
  age: number;
  attributes: Record<SkillAttribute, number>;
  condition: typeof STARTER_CONDITION;
  /** The generation shape used, e.g. 'sprinter'. Controls generation only — never a race-engine class. */
  archetype: string;
  /** Hidden, persisted, no race effect yet — same convention as Starter Rider V1. */
  potential: number;
  trainability: number;
  generatorVersion: string;
}

export function generateAiRider(rng: Rng, shapeId: string): GeneratedAiRider {
  const shape = SHAPES.find((s) => s.id === shapeId) ?? SHAPES[0];

  const country = pickWeighted(rng, COUNTRIES, (c) => c.weight);
  const firstList = FIRST[country.iso2] ?? FIRST['SK'];
  const surList = SUR[country.iso2] ?? SUR['SK'];
  const firstName = firstList[Math.floor(rng() * firstList.length)];
  const surname = surList[Math.floor(rng() * surList.length)];
  const age = intBetween(rng, AGE_MIN, AGE_MAX);

  // Same quality target as Starter Rider V1: field-level base, per-attribute shaping.
  const base = ROOKIE_BASE + noise(rng, ROOKIE_BASE_SPREAD);

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
    archetype: shape.id,
    potential: intBetween(rng, POTENTIAL_MIN, POTENTIAL_MAX),
    trainability: intBetween(rng, TRAINABILITY_MIN, TRAINABILITY_MAX),
    generatorVersion: AI_GENERATOR_VERSION,
  };
}
