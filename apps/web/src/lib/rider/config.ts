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
 * Player-facing DISPLAY scale (radar, bars, Skúsenosti stars): the full
 * 1–200 attribute scale (C-093). 20/200 reads as ~10 %, 100/200 as about
 * half, 200/200 as the full axis. Display only — the generators and the
 * OVR formula keep their own constants above.
 */
export const DISPLAY_SCALE = { min: 1, max: 200 } as const;

/** 0..1 position of an attribute value on the display scale (clamped). */
export function displayFraction(value: number): number {
  const f = (value - DISPLAY_SCALE.min) / (DISPLAY_SCALE.max - DISPLAY_SCALE.min);
  return Math.max(0, Math.min(1, f));
}

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
/**
 * Approved Potential distribution on the 1..100 scale (owner, 2026-11-19): probabilities, not quotas. Rare talent need not appear
 * among any given 100 riders. Potential stars follow these bands (the two top bands share the 5th star): 1-39 =1, 40-59 =2,
 * 60-74 =3, 75-87 =4, 88-100 =5. The V2 training model reads Potential on this 1..100 scale directly (soft cap 80 + 125 x (Pot/100)^2).
 */
export const POTENTIAL_BANDS = [
  { min: 1, max: 39, share: 35 }, { min: 40, max: 59, share: 45 }, { min: 60, max: 74, share: 14 },
  { min: 75, max: 87, share: 4.5 }, { min: 88, max: 94, share: 1.2 }, { min: 95, max: 100, share: 0.3 },
] as const;
/** First Potential value of the 2nd..5th star (mirrored by public.potential_to_stars() in SQL). */
export const POTENTIAL_STAR_STARTS = [40, 60, 75, 88] as const;

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
