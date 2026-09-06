/**
 * AI / Test Rider Generator V1 — field-size rules and the archetype mix used
 * to fill a Rookie test peloton. Kept separate from config.ts (Starter Rider
 * V1 tuning) so the two generators can be rebalanced independently.
 */

export const AI_GENERATOR_VERSION = 'rookie-ai-v1';

/** Long-term race field rule (V1 only implements admin/test generation against it). */
export const MINIMUM_RACE_FIELD = 20;
export const MAXIMUM_RACE_FIELD = 50;

/** AI fillers needed so a race field reaches the minimum, given N real registered riders. */
export function aiFillersNeeded(realRegisteredRiders: number): number {
  return Math.max(0, MINIMUM_RACE_FIELD - realRegisteredRiders);
}

/**
 * The archetype mix for the first test peloton (19 slots): 4 sprinters,
 * 4 puncheurs, 4 climbers, 3 rouleur/TT, 4 all-rounders. Shape ids match
 * config.ts SHAPES. Cycled via archetypeForSlot() when more or fewer than
 * 19 AI riders are needed, so the ratio stays roughly the same without any
 * code change as the pool grows.
 */
export const ARCHETYPE_PLAN: readonly string[] = [
  'sprinter', 'sprinter', 'sprinter', 'sprinter',
  'puncheur', 'puncheur', 'puncheur', 'puncheur',
  'climber', 'climber', 'climber', 'climber',
  'rouleur', 'rouleur', 'timeTrial',
  'allrounder', 'allrounder', 'allrounder', 'allrounder',
];

export function archetypeForSlot(index: number): string {
  return ARCHETYPE_PLAN[index % ARCHETYPE_PLAN.length];
}
