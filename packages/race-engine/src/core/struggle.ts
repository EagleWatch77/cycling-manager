import { PaceMember } from './groupPace.js';
import { WorkMode } from '../types/domain.js';
import { Terrain } from '../types/terrain.js';
import { draftingEnergyMultiplier } from '../config/balance.js';

/**
 * Struggle meter — spec §07.
 *
 * The gain/recovery tables below ARE specified and are implemented verbatim.
 * What is NOT specified is how `RequiredPerformance(G)` is derived. See
 * DesignGapError below.
 */

/** Raised when the engine reaches a rule the specification does not define. */
export class DesignGapError extends Error {
  readonly gapId: string;
  readonly question: string;

  constructor(gapId: string, question: string) {
    super(`[DESIGN GAP ${gapId}] ${question}`);
    this.name = 'DesignGapError';
    this.gapId = gapId;
    this.question = question;
  }
}

/* ------------------------------------------------------------------ */
/* Spec §07 tables + canonical dead zone                               */
/* ------------------------------------------------------------------ */

/**
 * Canonical Struggle dead zone.
 *
 * Spec §07 tabulates "0 alebo lepšie" and then "-1 az -3", leaving the band
 * (0, 1) uncovered. Ratified reading: that band is inert in BOTH directions.
 *
 *   0 <= deficit   < 1 EP  ->  0 Struggle gain
 *   0 <= advantage < 1 EP  ->  0 Struggle recovery
 */
export const STRUGGLE_DEAD_ZONE_EP = 1;

/**
 * Struggle gained per km for a rider whose Effective Performance is below
 * the group's Required Performance. `deficit` is a POSITIVE number of EP
 * points below Required.
 */
export function struggleGainPerKm(deficit: number): number {
  // CANONICAL DEAD ZONE: 0 <= deficit < 1 EP -> no gain.
  // Existing spec bands start at exactly 1 EP.
  if (deficit < STRUGGLE_DEAD_ZONE_EP) return 0;
  if (deficit <= 3) return 4;
  if (deficit <= 6) return 10;
  if (deficit <= 10) return 18;
  if (deficit <= 15) return 28;
  return 40;
}

/**
 * Struggle recovered per km for a rider above Required Performance.
 * `advantage` is a POSITIVE number of EP points above Required.
 * Returned as a positive magnitude; callers subtract it.
 */
export function struggleRecoveryPerKm(advantage: number): number {
  // CANONICAL DEAD ZONE: 0 <= advantage < 1 EP -> no recovery.
  if (advantage < STRUGGLE_DEAD_ZONE_EP) return 0;
  if (advantage < 5) return 4;
  if (advantage < 10) return 8;
  return 12;
}

/** Net struggle delta per km. Positive = accumulating, negative = recovering. */
export function struggleDeltaPerKm(
  effectivePerformance: number,
  requiredPerformance: number,
): number {
  const diff = effectivePerformance - requiredPerformance;
  if (diff < 0) return struggleGainPerKm(-diff);
  return -struggleRecoveryPerKm(diff);
}

/* ------------------------------------------------------------------ */
/* RequiredPerformance — NOT SPECIFIED                                 */
/* ------------------------------------------------------------------ */

export interface RequiredPerformanceContext {
  readonly members: readonly PaceMember[];
  readonly mode: WorkMode;
  readonly terrain: Terrain;
  readonly pRef: number;
  readonly fieldSize: number;
  /** Result of the Group Pace computation for this group, this tick. */
  readonly pacePower: number;
  readonly paceEP: number;
  readonly workFactor: number;
  readonly sizeFactor: number;
}

export type RequiredPerformancePort = (
  ctx: RequiredPerformanceContext,
) => number;

export const REQUIRED_PERFORMANCE_GAP_ID = 'RP-01';

/**
 * Default port. Deliberately throws.
 *
 * Kept so that a caller who forgets to supply a port fails loudly instead of
 * silently getting a guess. Production callers use
 * CANONICAL_REQUIRED_PERFORMANCE below.
 */
export const UNSPECIFIED_REQUIRED_PERFORMANCE: RequiredPerformancePort = () => {
  throw new DesignGapError(
    REQUIRED_PERFORMANCE_GAP_ID,
    'RequiredPerformance(G) port was not supplied. Use ' +
      'CANONICAL_REQUIRED_PERFORMANCE unless you are deliberately testing ' +
      'an alternative rule.',
  );
};

/**
 * CANONICAL RULE — RP-01, CLOSED.
 *
 *     RequiredPerformance(G) = PaceEP(G)
 *
 * RequiredPerformance is the group's sustainable pace-QUALITY threshold and
 * is shared by every rider currently attached to the group.
 *
 * MUST NOT be included:
 *   WorkFactor, ChaseWork, EscapeWork, SizeFactor, descent speed modifier.
 * Those affect group SPEED and/or Energy. They never directly raise the
 * Struggle threshold.
 *
 * Consequence in CHASE mode: PaceEP = P_ref + (WorkerEP - P_ref) * workerShare.
 * Worker QUALITY and worker COUNT move it. Chase INTENSITY does not appear,
 * so changing intensity while the worker set is unchanged leaves
 * RequiredPerformance untouched. Guarded by T48/T49.
 */
export const CANONICAL_REQUIRED_PERFORMANCE: RequiredPerformancePort = (ctx) =>
  ctx.paceEP;

/* ------------------------------------------------------------------ */
/* EXPERIMENTAL holding threshold — RP-01 reopened                     */
/* ------------------------------------------------------------------ */

/**
 * HoldingFactor = 1 - K * (1 - DraftEnergyMultiplier(groupSize))
 *
 * K is RATIFIED at 0.40 for V1 (TC-01E). The parameterised form is retained so
 * that a later integrated benchmark can re-test it, not because it is open.
 *
 * Reuses the existing §10 drafting table rather than introducing a new curve.
 * A big bunch drafts better, so it is easier to hold: the threshold sits
 * further below the group's pace quality. A solo rider drafts nothing, so
 * HoldingFactor is exactly 1 and the threshold equals PaceEP.
 *
 */
export function holdingFactor(k: number, groupSize: number): number {
  return 1 - k * (1 - draftingEnergyMultiplier(groupSize));
}

/**
 * V1 holding threshold, RATIFIED at BALANCE_V1.HOLDING_K = 0.40 (TC-01E):
 *     RequiredPerformance(G) = PaceEP(G) * HoldingFactor(K, |G|)
 *
 * Excludes WorkFactor, SizeFactor and the descent modifier exactly as the
 * closed-then-reopened RP-01 rule required.
 */
export function experimentalHoldingThreshold(k: number): RequiredPerformancePort {
  return (ctx) => ctx.paceEP * holdingFactor(k, ctx.members.length);
}

/** deficit_i = RequiredPerformance(G) - EffectivePerformance_i */
export function deficit(
  requiredPerformance: number,
  effectivePerformance: number,
): number {
  return requiredPerformance - effectivePerformance;
}

/** True when Struggle-dependent simulation can run. */
export function isRequiredPerformanceSpecified(
  port: RequiredPerformancePort,
): boolean {
  return port !== UNSPECIFIED_REQUIRED_PERFORMANCE;
}
