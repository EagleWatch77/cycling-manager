import { Terrain } from '../types/terrain.js';
import {
  Fraction,
  ChasePoints,
  frac,
  chasePoints,
  percentToFraction,
  percentToChasePoints,
} from '../types/units.js';

/**
 * Versioned balance configuration.
 *
 * Snapshotted immutably at stage start together with the seed and the rider
 * set. Changing any value here MUST bump `version`.
 */
export interface BalanceConfig {
  readonly version: string;

  /** Group Pace / Gap Evolution — V10.2 Rev B §3. Four constants. */
  readonly GROUP_PACE_EXP: number;
  readonly GROUP_SIZE_COEF: Fraction;
  readonly CHASE_MAX: Fraction;
  readonly CHASE_SAT: ChasePoints;

  /** Safety rail, not a balance knob. Rev B §4.9 (R4). */
  readonly GROUP_SPEED_MIN: number;
  readonly GROUP_SPEED_MAX: number;

  /** Simulation tick, in km. V10.5. */
  readonly TICK_KM: number;

  /** Drop model, spec §9: lossSecPerKm = COEF * deficit ^ EXP. */
  readonly DROP_LOSS_COEF: number;
  readonly DROP_LOSS_EXP: number;

  /** Gap state thresholds in seconds, spec §8. */
  readonly GAP_MERGE_MAX: number;
  readonly GAP_SEPARATE_MIN: number;

  /** Struggle split threshold, spec §7. */
  readonly STRUGGLE_SPLIT: number;

  /** EN-01 base road Energy burn per km, before all multipliers. */
  readonly BASE_ROAD_ENERGY_PER_KM: number;

  /**
   * Holding-threshold constant. **RATIFIED for V1 (TC-01E).**
   *
   *     RequiredPerformance(G) = PaceEP(G) * (1 - K * (1 - draftMult(|G|)))
   *
   * Evidence at K = 0.40 on a same-league field (7 archetype shapes x quality
   * offsets -5 / -2.5 / 0 / +2.5 / +5):
   *   FLAT      34 of 35 stay in the main group
   *   HILLY     moderate additional selection (3 splits, 32 of 35)
   *   MOUNTAIN  clearly stronger selection (6 splits, 29 of 35)
   *   terrain and archetype ordering correct on every terrain
   *   lowering K worsens FLAT and HILLY without improving the tail gap
   *
   * Do NOT sweep or tune this again unless a later integrated race benchmark
   * exposes a regression.
   */
  readonly HOLDING_K: number;

  /**
   * AF-01 attack / response balance. Versioned so historical stage snapshots
   * stay reproducible after future balance changes. Values are IDENTICAL to
   * the pre-versioning ones; only their home changed.
   */
  readonly ATTACK_BURST_SEC: number;
  readonly RECOVERY_SEC: number;
  readonly REACTION_MAX_DELAY_SEC: number;
  readonly ATTACK_NORMAL_BURST: Fraction;
  readonly ATTACK_NORMAL_RECOVERY_TAX: Fraction;
  readonly ATTACK_NORMAL_ENERGY: number;
  readonly ATTACK_ALL_OUT_BURST: Fraction;
  readonly ATTACK_ALL_OUT_RECOVERY_TAX: Fraction;
  readonly ATTACK_ALL_OUT_ENERGY: number;
  readonly RESPONSE_NORMAL_BURST: Fraction;
  readonly RESPONSE_NORMAL_ENERGY: number;
  readonly RESPONSE_HIGH_BURST: Fraction;
  readonly RESPONSE_HIGH_ENERGY: number;
}

export const BALANCE_V1: BalanceConfig = Object.freeze({
  version: 'balance-1.1.0-af01',

  GROUP_PACE_EXP: 1.2,
  GROUP_SIZE_COEF: frac(0.006),
  CHASE_MAX: frac(0.09),
  CHASE_SAT: chasePoints(22),

  GROUP_SPEED_MIN: 0.6,
  GROUP_SPEED_MAX: 1.25,

  TICK_KM: 0.2,

  DROP_LOSS_COEF: 0.18,
  DROP_LOSS_EXP: 1.35,

  GAP_MERGE_MAX: 2,
  GAP_SEPARATE_MIN: 16,

  STRUGGLE_SPLIT: 100,

  BASE_ROAD_ENERGY_PER_KM: 0.2125,

  ATTACK_BURST_SEC: 45,
  RECOVERY_SEC: 90,
  REACTION_MAX_DELAY_SEC: 30, // accepted working V1 value

  ATTACK_NORMAL_BURST: percentToFraction(6),
  ATTACK_NORMAL_RECOVERY_TAX: percentToFraction(-2),
  ATTACK_NORMAL_ENERGY: 5,
  ATTACK_ALL_OUT_BURST: percentToFraction(10),
  ATTACK_ALL_OUT_RECOVERY_TAX: percentToFraction(-4),
  ATTACK_ALL_OUT_ENERGY: 8,
  RESPONSE_NORMAL_BURST: percentToFraction(3),
  RESPONSE_NORMAL_ENERGY: 2,
  RESPONSE_HIGH_BURST: percentToFraction(5),
  RESPONSE_HIGH_ENERGY: 4,

  HOLDING_K: 0.4, // RATIFIED V1 — see TC01E_REPORT.md
});

/* ------------------------------------------------------------------ */
/* Spec §11 — Breakaway Effort.  Percent in spec -> Fraction.          */
/* ------------------------------------------------------------------ */

export enum BreakawayEffort {
  SAVE = 'SAVE',
  NORMAL = 'NORMAL',
  WORK = 'WORK',
  HARD = 'HARD',
  ALL_OUT = 'ALL_OUT',
}

export const BREAKAWAY_EFFORT: Readonly<
  Record<BreakawayEffort, { work: Fraction; energyMult: number }>
> = Object.freeze({
  [BreakawayEffort.SAVE]: { work: percentToFraction(-2), energyMult: 0.9 },
  [BreakawayEffort.NORMAL]: { work: percentToFraction(0), energyMult: 1.0 },
  [BreakawayEffort.WORK]: { work: percentToFraction(2), energyMult: 1.08 },
  [BreakawayEffort.HARD]: { work: percentToFraction(4), energyMult: 1.18 },
  [BreakawayEffort.ALL_OUT]: { work: percentToFraction(7), energyMult: 1.3 },
});

/* ------------------------------------------------------------------ */
/* Spec §12 — Chase intensity.  Percent in spec -> RAW ChasePoints.    */
/* NOTE: no division by 100 here. See units.ts conversion trap note.   */
/* ------------------------------------------------------------------ */

export enum ChaseIntensity {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  ALL_OUT = 'ALL_OUT',
}

export const CHASE_INTENSITY: Readonly<
  Record<ChaseIntensity, { points: ChasePoints; energyMult: number }>
> = Object.freeze({
  [ChaseIntensity.NONE]: { points: percentToChasePoints(0), energyMult: 1.0 },
  [ChaseIntensity.LOW]: { points: percentToChasePoints(1), energyMult: 1.05 },
  [ChaseIntensity.MEDIUM]: { points: percentToChasePoints(3), energyMult: 1.1 },
  [ChaseIntensity.HIGH]: { points: percentToChasePoints(5), energyMult: 1.18 },
  [ChaseIntensity.ALL_OUT]: { points: percentToChasePoints(8), energyMult: 1.3 },
});

/* ------------------------------------------------------------------ */
/* EN-01 — Energy consumption model                                    */
/* ------------------------------------------------------------------ */

/**
 * Base road Energy burn per km, before every multiplier.
 * Calibrated against spec §20 whole-stage totals.
 */
export const BASE_ROAD_ENERGY_PER_KM = 0.2125;

/**
 * Terrain Energy multipliers. Only DESCENT differs from 1.00 so far;
 * gradient-dependent multipliers for the road terrains are NOT yet specified
 * and are deliberately not invented.
 */
export const TERRAIN_ENERGY_MULTIPLIER: Readonly<Record<Terrain, number>> =
  Object.freeze({
    [Terrain.FLAT]: 1.0,
    [Terrain.HILLY]: 1.0,
    [Terrain.MOUNTAIN]: 1.0,
    [Terrain.CLASSICS]: 1.0,
    [Terrain.DESCENT]: 0.35,
  });

/** Spec §05 — Stage approach. */
export enum StageApproach {
  SAFE = 'SAFE',
  CONSERVATIVE = 'CONSERVATIVE',
  NORMAL = 'NORMAL',
  AGGRESSIVE = 'AGGRESSIVE',
  ALL_OUT = 'ALL_OUT',
}

/**
 * NOTE: the `performance` column is recorded but NOT yet wired into
 * Effective Performance. Only `energyMult` is used by EN-01. Wiring the
 * performance side would move PaceEP and therefore every balance number, so
 * it is deferred rather than slipped in. See DESIGN_GAPS.md.
 */
export const STAGE_APPROACH: Readonly<
  Record<StageApproach, { performance: Fraction; energyMult: number; fatigueMult: number }>
> = Object.freeze({
  [StageApproach.SAFE]: { performance: percentToFraction(-2), energyMult: 0.85, fatigueMult: 0.85 },
  [StageApproach.CONSERVATIVE]: { performance: percentToFraction(-1), energyMult: 0.92, fatigueMult: 0.92 },
  [StageApproach.NORMAL]: { performance: percentToFraction(0), energyMult: 1.0, fatigueMult: 1.0 },
  [StageApproach.AGGRESSIVE]: { performance: percentToFraction(2.5), energyMult: 1.2, fatigueMult: 1.15 },
  [StageApproach.ALL_OUT]: { performance: percentToFraction(5), energyMult: 1.4, fatigueMult: 1.3 },
});

/* ------------------------------------------------------------------ */
/* Spec §10 — Drafting energy multiplier by group size.                */
/* Affects Energy only, never pace.                                    */
/* ------------------------------------------------------------------ */

export function draftingEnergyMultiplier(groupSize: number): number {
  if (groupSize <= 1) return 1.0;
  if (groupSize === 2) return 0.96;
  if (groupSize <= 5) return 0.92;
  if (groupSize <= 10) return 0.88;
  if (groupSize <= 20) return 0.84;
  return 0.8;
}
