/**
 * Starter Rider Generator V1 — all tunable numbers live here so a new Rookie
 * rider can be rebalanced without touching the generator logic.
 *
 * The 15 skills are exactly the ones the Race Engine reads. Nothing is added
 * that the engine does not know about. They are declared locally (not imported
 * from the engine) so the web app keeps its build independent of that package.
 */

export const GENERATOR_VERSION = 'starter-v1';

export type SkillAttribute =
  | 'climbing' | 'hills' | 'flat' | 'sprint' | 'endurance'
  | 'descending' | 'acceleration' | 'energyManagement' | 'positioning'
  | 'packRiding' | 'experience' | 'bikeHandling' | 'cornering'
  | 'attackTiming' | 'roughSurface';

/** The 15 engine skill attributes we generate, in display order. */
export const SKILL_ATTRIBUTES: readonly SkillAttribute[] = [
  'climbing', 'hills', 'flat', 'sprint', 'endurance',
  'descending', 'acceleration', 'energyManagement', 'positioning',
  'packRiding', 'experience', 'bikeHandling', 'cornering',
  'attackTiming', 'roughSurface',
];

/** Rookie starter quality (decision: 130 ± 5, per-attribute noise ± 3). */
export const ROOKIE_BASE = 130;
export const ROOKIE_BASE_SPREAD = 5;
export const ATTR_NOISE = 3;

/** How far a shape lifts a strength / pulls a weakness from base. */
export const STRONG_BONUS = 10;
export const WEAK_PENALTY = 10;

/** Safety clamp so noise can never produce absurd values. */
export const ATTR_MIN = 100;
export const ATTR_MAX = 160;

export const AGE_MIN = 18;
export const AGE_MAX = 22;

/** Hidden, persisted, no race effect yet. */
export const POTENTIAL_MIN = 55;
export const POTENTIAL_MAX = 95;
export const TRAINABILITY_MIN = 55;
export const TRAINABILITY_MAX = 95;

export const STARTER_CONDITION = {
  energy: 100,
  fatigue: 0,
  form: 50,
  fitness: 60,
  morale: 70,
} as const;

/**
 * Seven generation shapes. `strong` attributes get +STRONG_BONUS, `weak` get
 * -WEAK_PENALTY, everything else sits near base. A shape is only a template for
 * the numbers; it is never persisted as a class. The rider's archetype is later
 * inferred from the numbers by inferArchetype().
 */
export interface Shape {
  id: string;
  strong: SkillAttribute[];
  weak: SkillAttribute[];
}

export const SHAPES: readonly Shape[] = [
  { id: 'allrounder', strong: ['endurance', 'positioning', 'experience'], weak: [] },
  { id: 'rouleur', strong: ['flat', 'endurance', 'positioning'], weak: ['climbing', 'hills'] },
  { id: 'climber', strong: ['climbing', 'hills', 'acceleration'], weak: ['flat', 'sprint'] },
  { id: 'puncheur', strong: ['hills', 'acceleration', 'attackTiming'], weak: ['flat', 'endurance'] },
  { id: 'sprinter', strong: ['sprint', 'flat', 'acceleration'], weak: ['climbing', 'hills'] },
  { id: 'timeTrial', strong: ['flat', 'endurance', 'energyManagement'], weak: ['climbing', 'sprint'] },
  { id: 'classics', strong: ['roughSurface', 'packRiding', 'bikeHandling', 'positioning'], weak: ['climbing', 'sprint'] },
];
