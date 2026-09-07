import { POTENTIAL_MIN, POTENTIAL_MAX, ATTR_MIN, ATTR_MAX, type SkillAttribute } from '@/lib/rider/config';

/**
 * Training V1 — tunable numbers and the growth formula, kept separate from
 * persistence (repository.ts) and UI so the rules can be rebalanced without
 * touching either.
 *
 * IMPORTANT — data model gaps discovered while implementing this (see the
 * PR/report): the requested formula references a `professionalism` rider
 * stat that did not exist before this feature (added in lib/rider/config.ts,
 * same convention as potential/trainability). The requested Performance
 * focus list included "Časovka" (time trial), but there is no `timeTrial`
 * entry in `SkillAttribute` — only 15 real engine skills exist, and time
 * trial is not one of them (it only appears as a Tour-level difficulty and
 * as a rider archetype id elsewhere). Per the instruction not to invent
 * attributes the data model doesn't have, the Performance focus list here is
 * the 6 real attributes that exist — the same six the Rider page already
 * calls "Performance" (group.performance).
 */

export type TrainingIntensity = 'light' | 'normal' | 'hard';
/**
 * 'technical' is kept only so a pre-existing DB row (week_type check
 * constraint allows it) still reads back without a type error. The
 * "technical week" feature — training Tactics/Technique directly — has been
 * retired: those two families now grow only through race processing (see
 * SECONDARY_ATTRIBUTE below, which is otherwise unaffected), never through a
 * plan a player creates here. Nothing in the app ever writes 'technical'
 * anymore — see saveTrainingPlan in lib/training/repository.ts.
 */
export type WeekType = 'performance' | 'technical';

/** The 6 real Performance-group skills a Rider can pick as a training focus. The only focus family plannable from the Training page. */
export const PERFORMANCE_FOCUS: readonly SkillAttribute[] = [
  'climbing', 'hills', 'flat', 'sprint', 'endurance', 'acceleration',
];

export const INTENSITY_MULTIPLIER: Record<TrainingIntensity, number> = {
  light: 1.0,
  normal: 1.5,
  hard: 2.0,
};

/** A secondary skill trains alongside the chosen focus, at ~35% of the primary gain. */
export const SECONDARY_ATTRIBUTE: Partial<Record<SkillAttribute, SkillAttribute>> = {
  // Given examples.
  climbing: 'endurance',
  sprint: 'acceleration',
  // Same reasoning applied to the rest of the Performance set.
  hills: 'climbing',
  flat: 'endurance',
  endurance: 'energyManagement',
  acceleration: 'sprint',
  // Technical set: paired within the same tactics/technique family.
  positioning: 'packRiding',
  attackTiming: 'acceleration',
  energyManagement: 'endurance',
  descending: 'cornering',
  bikeHandling: 'cornering',
  cornering: 'bikeHandling',
  packRiding: 'positioning',
  roughSurface: 'bikeHandling',
};

export const SECONDARY_GAIN_SHARE = 0.35;

/** Baseline weekly growth before any multiplier. Not specified by the brief; smallest clean assumption. */
export const BASE_TRAINING = 3;

/**
 * Condition cost of a training week, by intensity. Not specified anywhere in
 * the codebase before Training V1 (no formula existed); smallest clean
 * assumption, kept here — the one place to rebalance — rather than inline in
 * the processing engine. energy/fatigue are the two condition fields a
 * week of training plausibly touches; form/fitness/morale are left alone
 * since nothing in the brief relates them to training.
 */
export const ENERGY_COST: Record<TrainingIntensity, number> = { light: 5, normal: 10, hard: 15 };
export const FATIGUE_GAIN: Record<TrainingIntensity, number> = { light: 5, normal: 10, hard: 18 };

export function trainabilityFactor(trainability: number): number {
  return 0.5 + trainability / 200;
}

export function professionalismFactor(professionalism: number): number {
  return 0.8 + professionalism / 500;
}

/** 17–19 → 1.30 … 35+ → 0.30, exactly the bands given in the brief. */
export function ageFactor(age: number): number {
  if (age <= 19) return 1.30;
  if (age <= 22) return 1.20;
  if (age <= 25) return 1.10;
  if (age <= 28) return 1.00;
  if (age <= 31) return 0.80;
  if (age <= 34) return 0.55;
  return 0.30;
}

/**
 * `potential` is persisted on a 55–95 "development rating" scale (see
 * POTENTIAL_MIN/MAX in lib/rider/config.ts) — a different scale from the
 * 100–160 attribute values it's meant to cap. No existing code related the
 * two before Training V1. This rescales potential onto the attribute range
 * to get an implied ceiling, so "room to grow" is meaningful; flagged as an
 * assumption in the report, not something the codebase already defined.
 */
export function potentialCeiling(potential: number): number {
  const t = (potential - POTENTIAL_MIN) / (POTENTIAL_MAX - POTENTIAL_MIN);
  return ATTR_MIN + t * (ATTR_MAX - ATTR_MIN);
}

/** Growth slows as a Rider closes in on their (hidden) Potential ceiling. Smallest clean assumption: linear over a 40-point room. */
export function potentialRoomFactor(currentValue: number, potential: number): number {
  const room = Math.max(0, potentialCeiling(potential) - currentValue);
  return Math.max(0.1, Math.min(1, room / 40));
}
