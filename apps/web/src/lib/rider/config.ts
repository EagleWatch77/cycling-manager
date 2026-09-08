/**
 * Starter Rider Generator V1 — all tunable numbers live here so a new Rookie
 * rider can be rebalanced without touching the generator logic.
 *
 * These 19 skills are the canonical game-design attribute set (Performance 7
 * + Tactics 5 + Technique 6 + experience). They are declared locally (not
 * imported from the engine) so the web app keeps its build independent of
 * that package.
 *
 * `timeTrial` and `reaction` also exist in packages/race-engine's own
 * `AttributeKey` type (17 members there) — this union now includes both, so
 * a rider generated here carries real values for every key the engine's
 * type already expects. `breakawaySkill` and `wetHandling` are new canonical
 * rider skills that do NOT exist in the engine's `AttributeKey` yet; wiring
 * them into the engine's actual simulation math (segment/pace/attack weight
 * tables) is a separate, engine-side change this migration does not make —
 * see the chat report. `breakawaySkill` is a persisted rider ability and is
 * unrelated to `BreakawayEffort` (an in-race tactical command enum defined
 * in the engine's balance config) — the two must never be confused.
 */

export const GENERATOR_VERSION = 'starter-v1';

export type SkillAttribute =
  | 'climbing' | 'hills' | 'flat' | 'sprint' | 'timeTrial' | 'endurance'
  | 'descending' | 'acceleration' | 'energyManagement' | 'positioning'
  | 'reaction' | 'breakawaySkill'
  | 'packRiding' | 'experience' | 'bikeHandling' | 'cornering'
  | 'attackTiming' | 'roughSurface' | 'wetHandling';

/** The 19 canonical skill attributes we generate, in display order. */
export const SKILL_ATTRIBUTES: readonly SkillAttribute[] = [
  'climbing', 'hills', 'flat', 'sprint', 'timeTrial', 'endurance',
  'descending', 'acceleration', 'energyManagement', 'positioning',
  'reaction', 'breakawaySkill',
  'packRiding', 'experience', 'bikeHandling', 'cornering',
  'attackTiming', 'roughSurface', 'wetHandling',
];

/** Rookie starter quality (decision: 130 ± 5, per-attribute noise ± 3). */
export const ROOKIE_BASE = 130;
export const ROOKIE_BASE_SPREAD = 5;
export const ATTR_NOISE = 3;

/** How far a shape lifts a strength / pulls a weakness from base. */
export const STRONG_BONUS = 10;
export const WEAK_PENALTY = 10;

/**
 * Safety clamp so noise can never produce absurd values — this is the
 * scale used at STARTER GENERATION for all 19 attributes (never changed,
 * see the chat report: the generator must keep producing newcomers in
 * today's range) and remains the CAREER scale for Tactics/Technique/
 * experience forever (they do not get the new Performance ceiling below).
 */
export const ATTR_MIN = 100;
export const ATTR_MAX = 160;

/**
 * Career scale for the 7 canonical Performance attributes ONLY (climbing,
 * hills, flat, sprint, timeTrial, endurance, acceleration) — see
 * lib/training/config.ts's PERFORMANCE_FOCUS for the canonical list.
 * PERFORMANCE_MIN equals ATTR_MIN (starting floor is unchanged);
 * PERFORMANCE_MAX=200 is a CAREER ceiling a rider can grow into through
 * training over time — the starter generator still clamps newcomers to
 * ATTR_MAX=160 above, never generates a rider anywhere near 200. Enforced
 * authoritatively in process_training_plan() (supabase/schema.sql); this
 * constant is the TS-side reference other Performance-scale-aware code
 * (score normalization, UI bars/radar) reads.
 */
export const PERFORMANCE_MIN = ATTR_MIN;
export const PERFORMANCE_MAX = 200;

/**
 * Canonical Tactics/Technique attribute groupings — centralizes what used
 * to be duplicated ad hoc as local TACTICS_KEYS/TECHNIQUE_KEYS arrays in
 * app/rider/page.tsx, app/rider/training/page.tsx, and
 * app/transfers/[id]/page.tsx (all three had to be kept in sync by hand).
 * Also the canonical input to lib/rider/score.ts's riderOverall().
 */
export const TACTICS_ATTRIBUTES: readonly SkillAttribute[] = [
  'positioning', 'attackTiming', 'reaction', 'energyManagement', 'breakawaySkill',
];
export const TECHNIQUE_ATTRIBUTES: readonly SkillAttribute[] = [
  'descending', 'bikeHandling', 'cornering', 'packRiding', 'wetHandling', 'roughSurface',
];

export const AGE_MIN = 18;
export const AGE_MAX = 22;

/** Hidden, persisted, no race effect yet. */
export const POTENTIAL_MIN = 55;
export const POTENTIAL_MAX = 95;
export const TRAINABILITY_MIN = 55;
export const TRAINABILITY_MAX = 95;
/**
 * Added for Training V1 (previously did not exist on the rider model at
 * all). Same convention as potential/trainability: hidden dev-facing
 * rating, same 55–95 scale, generated once with the rider.
 */
export const PROFESSIONALISM_MIN = 55;
export const PROFESSIONALISM_MAX = 95;
export const RECOVERY_MIN = 55;
export const RECOVERY_MAX = 95;

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

/**
 * The 4 newly-introduced attributes (timeTrial, reaction, breakawaySkill,
 * wetHandling) are each given a bonus on exactly one thematically-fitting
 * existing shape, following the same strong-list convention already used
 * for every other attribute here — no new shapes, no invented penalties:
 *  - timeTrial      -> the 'timeTrial' shape itself (obvious fit)
 *  - reaction        -> 'puncheur' (attack/counter-attack oriented rider)
 *  - breakawaySkill -> 'rouleur' (classic breakaway-specialist archetype)
 *  - wetHandling    -> 'classics' (cobbles/bad-weather specialist)
 */
export const SHAPES: readonly Shape[] = [
  { id: 'allrounder', strong: ['endurance', 'positioning', 'experience'], weak: [] },
  { id: 'rouleur', strong: ['flat', 'endurance', 'positioning', 'breakawaySkill'], weak: ['climbing', 'hills'] },
  { id: 'climber', strong: ['climbing', 'hills', 'acceleration'], weak: ['flat', 'sprint'] },
  { id: 'puncheur', strong: ['hills', 'acceleration', 'attackTiming', 'reaction'], weak: ['flat', 'endurance'] },
  { id: 'sprinter', strong: ['sprint', 'flat', 'acceleration'], weak: ['climbing', 'hills'] },
  { id: 'timeTrial', strong: ['flat', 'endurance', 'energyManagement', 'timeTrial'], weak: ['climbing', 'sprint'] },
  { id: 'classics', strong: ['roughSurface', 'packRiding', 'bikeHandling', 'positioning', 'wetHandling'], weak: ['climbing', 'sprint'] },
];
