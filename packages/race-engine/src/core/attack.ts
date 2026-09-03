import { Fraction, frac } from '../types/units.js';
import { WorkMode } from '../types/domain.js';
import { BalanceConfig } from '../config/balance.js';

/**
 * AF-01 — Attack / Breakaway Formation.
 *
 * An attack is the drop model with the sign flipped. A rider between 0 and 16 s
 * AHEAD of his group is in a Provisional Attack Group (PAG): a shadow entity
 * that `resolveWorkMode` cannot see, so the validated Chase model is untouched
 * until materialisation.
 *
 * ACCEPTED WORKING V1 VALUES
 *  - Breakaway Effort is ACTIVE the moment a rider enters ATTACKING. It does
 *    not wait for the 16 s threshold. Without this the escape rate is provably
 *    zero (test A13).
 *  - Response costs: Normal +3 % / -2 Energy, High +5 % / -4 Energy. ACCEPTED.
 *  - REACTION_MAX_DELAY_SEC = 30. ACCEPTED. Reaction is not inert: latch rate
 *    is graded 60 % -> 100 % across the range (AF-01e).
 *  - All-out Attack has a valid tactical niche: it breaks responses that
 *    Normal cannot, at higher Energy cost and a heavier recovery tax.
 *
 * REQUIRED CORRECTION (applied)
 *  - A PAG is reabsorbed into its parent at `gapSec <= 0`, NOT at `<= 2 s`.
 *    A normal attack at Hard effort gains ~7.55 s/km, i.e. ~1.51 s in the first
 *    0.2 km tick, so a 2 s failure threshold would cancel every normal attack
 *    on its first tick. The 2 s threshold remains correct for PAG-to-PAG
 *    merging and for real Group-to-Group merging; it is NOT the failure
 *    threshold for an attack against its own parent.
 *
 * TIMING
 *  - Burst and recovery windows run on the PAG's OWN simulated elapsed time,
 *    never the parent's. Stored as remaining seconds and decremented by the
 *    PAG's own dt, which is also merge-safe.
 *
 * RESPONSE
 *  - One Response action produces exactly one response burst. A responder who
 *    fails to latch is NOT auto-refired; subsequent behaviour comes from Group
 *    Pace and Breakaway Effort, or a later explicit action.
 */

export enum AttackKind {
  NORMAL = 'NORMAL',
  ALL_OUT = 'ALL_OUT',
}

export enum ResponseKind {
  NONE = 'NONE',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
}

export interface EffortProfile {
  /** Performance bonus during the burst. */
  readonly burst: Fraction;
  /** Performance tax during recovery (negative). */
  readonly recoveryTax: Fraction;
  /** Fixed Energy cost charged once at launch. */
  readonly energyCost: number;
}

/** Spec §13. Attack +6 %/-5/-2 %; All-out +10 %/-8/-4 %. */
export function attackProfile(
  kind: AttackKind,
  b: BalanceConfig,
): EffortProfile {
  return kind === AttackKind.NORMAL
    ? {
        burst: b.ATTACK_NORMAL_BURST,
        recoveryTax: b.ATTACK_NORMAL_RECOVERY_TAX,
        energyCost: b.ATTACK_NORMAL_ENERGY,
      }
    : {
        burst: b.ATTACK_ALL_OUT_BURST,
        recoveryTax: b.ATTACK_ALL_OUT_RECOVERY_TAX,
        energyCost: b.ATTACK_ALL_OUT_ENERGY,
      };
}

/**
 * Spec §13 gives Response performance (+5 % / +3 %) and says reactions cost
 * Energy, but no number. -4 / -2 are the ACCEPTED working V1 values.
 */
export function responseProfile(
  kind: ResponseKind,
  b: BalanceConfig,
): EffortProfile {
  return kind === ResponseKind.HIGH
    ? { burst: b.RESPONSE_HIGH_BURST, recoveryTax: frac(0), energyCost: b.RESPONSE_HIGH_ENERGY }
    : { burst: b.RESPONSE_NORMAL_BURST, recoveryTax: frac(0), energyCost: b.RESPONSE_NORMAL_ENERGY };
}

/* All attack/response numbers now live in the versioned BalanceConfig so that
 * historical stage snapshots remain reproducible. Values are unchanged. */

/**
 * Deterministic reaction delay. Reaction 200 -> 0 s, Reaction 0 -> full delay.
 * The delay bites through the 2 s PAG-to-PAG merge cliff, not through its own
 * magnitude: at ~7.55 s/km and 42 km/h an attacker opens ~0.088 s of gap per
 * second of racing, so ~23 s of delay is needed to miss the latch.
 */
export function reactionDelaySec(reaction: number, b: BalanceConfig): number {
  const r = reaction < 0 ? 0 : reaction > 200 ? 200 : reaction;
  return b.REACTION_MAX_DELAY_SEC * (1 - r / 200);
}

/** Per-rider burst/recovery state, counted down on the PAG's own clock. */
export interface EffortWindow {
  burstRemainingSec: number;
  recoveryRemainingSec: number;
  readonly profile: EffortProfile;
}

export function newEffortWindow(
  profile: EffortProfile,
  withRecovery: boolean,
  b: BalanceConfig,
): EffortWindow {
  return {
    burstRemainingSec: b.ATTACK_BURST_SEC,
    recoveryRemainingSec: withRecovery ? b.RECOVERY_SEC : 0,
    profile,
  };
}

/** Current performance modifier, as a Fraction, for this rider this tick. */
export function effortModifier(w: EffortWindow | null): Fraction {
  if (!w) return frac(0);
  if (w.burstRemainingSec > 0) return w.profile.burst;
  if (w.recoveryRemainingSec > 0) return w.profile.recoveryTax;
  return frac(0);
}

/** Advance a window by the PAG's own elapsed seconds for this tick. */
export function advanceEffortWindow(w: EffortWindow, dtSec: number): void {
  if (w.burstRemainingSec > 0) {
    const used = Math.min(w.burstRemainingSec, dtSec);
    w.burstRemainingSec -= used;
    const left = dtSec - used;
    if (left > 0 && w.recoveryRemainingSec > 0) {
      w.recoveryRemainingSec = Math.max(0, w.recoveryRemainingSec - left);
    }
    return;
  }
  if (w.recoveryRemainingSec > 0) {
    w.recoveryRemainingSec = Math.max(0, w.recoveryRemainingSec - dtSec);
  }
}

export function windowExhausted(w: EffortWindow): boolean {
  return w.burstRemainingSec <= 0 && w.recoveryRemainingSec <= 0;
}

/**
 * Provisional Attack Group.
 *
 * Invisible to resolveWorkMode. Always evaluated in ESCAPE mode so that
 * Breakaway Effort is active from formation (ratified).
 */
export interface ProvisionalAttackGroup {
  readonly id: number;
  riderIds: string[];
  /** Seconds gained on the parent. Materialises at >= GAP_SEPARATE_MIN. */
  gapSec: number;
  /** The PAG's own simulated elapsed time. */
  timeSec: number;
  parentGroupId: number;
  active: boolean;
  /** Ticks this PAG has actually been advanced. */
  ticks: number;
  /**
   * Response only: the PAG this one is chasing. Interception is measured
   * against it so a strong responder latches instead of overshooting.
   */
  targetPagId?: number;
}

/** A rider who has declared a response and is waiting out his reaction delay. */
export interface PendingResponse {
  readonly riderId: string;
  readonly groupId: number;
  readonly kind: ResponseKind;
  /** Parent-clock seconds still to wait before the response burst starts. */
  remainingDelaySec: number;
  /** The PAG this Response is answering. Interception is measured against it. */
  readonly targetPagId: number;
  /**
   * AF-01e. True while this Response was created by an Attack that launched
   * AFTER the parent had already completed the current tick. Its delay must
   * not consume that past tick; the countdown begins next tick.
   */
  startsNextTick: boolean;
}

/**
 * AF-01e — target gap at the ACTUAL Response-start instant.
 *
 * A Response beginning part way through a tick must not be judged against the
 * target's gap at tick start: the target may have been inside the merge band
 * before the rider had even begun responding, which would guarantee a latch
 * for free.
 *
 *     elapsedFraction  = startOffsetSec / dtParent
 *     targetGapAtStart = before + elapsedFraction * (after - before)
 *
 * The responder starts the Response phase at parent-relative gap 0, so the
 * relative gap at the actual start is simply targetGapAtStart.
 */
export function interpolateTargetGap(
  targetGapBefore: number,
  targetGapAfter: number,
  startOffsetSec: number,
  dtParentSec: number,
): number {
  if (dtParentSec <= 0) return targetGapAfter;
  const e = Math.min(1, Math.max(0, startOffsetSec / dtParentSec));
  return targetGapBefore + e * (targetGapAfter - targetGapBefore);
}

/**
 * AF-01c — sub-tick response start.
 *
 * When the remaining Reaction delay expires INSIDE the current parent tick,
 * the rider stays with the parent for the first part of the tick and gets
 * Response movement only for the rest of it:
 *
 *     activeFraction = (dtParent - remainingDelaySec) / dtParent, clamped [0,1]
 *
 * Without this the delay resolves only at tick boundaries. A 0.2 km tick at
 * 42 km/h is 17.2 s, so REACTION_MAX_DELAY_SEC = 30 spans 1.7 ticks and the
 * whole Reaction range collapses into two timing states (AF1b).
 *
 * No new balance constant: the fraction is derived from the tick itself.
 */
export function responseActiveFraction(
  remainingDelaySec: number,
  dtParentSec: number,
): number {
  if (dtParentSec <= 0) return 0;
  const f = (dtParentSec - remainingDelaySec) / dtParentSec;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/**
 * AF-01c — response-target interception.
 *
 * A strong responder must not skip over its target just because a 0.2 km tick
 * moved it from behind to ahead. The relative gap is treated as a CONTINUOUS
 * interval across the tick: if that interval intersects the merge band, the
 * responder has reached the target and latches.
 *
 * `relGap` is target.gapSec - responder.gapSec, so positive means the
 * responder is still behind the target.
 */
export function interceptsTarget(
  relGapStart: number,
  relGapEnd: number,
  balance: BalanceConfig,
): boolean {
  const lo = Math.min(relGapStart, relGapEnd);
  const hi = Math.max(relGapStart, relGapEnd);
  return lo <= balance.GAP_MERGE_MAX && hi >= -balance.GAP_MERGE_MAX;
}

export const PAG_MODE = WorkMode.ESCAPE;

/**
 * Failure threshold for a PAG against its own parent.
 * NOT the 2 s merge threshold — see the module header.
 */
export function pagIsReabsorbed(pag: ProvisionalAttackGroup): boolean {
  // A PAG created this tick has not raced yet and its gap is still exactly 0.
  // Judging it before it has moved would cancel every attack on launch.
  return pag.ticks > 0 && pag.gapSec <= 0;
}

/** PAG-to-PAG merge uses the existing §8 threshold. */
export function pagsShouldMerge(
  a: ProvisionalAttackGroup,
  b: ProvisionalAttackGroup,
  balance: BalanceConfig,
): boolean {
  return Math.abs(a.gapSec - b.gapSec) <= balance.GAP_MERGE_MAX;
}

/** Materialisation into a recognized escape group. */
export function pagShouldMaterialise(
  pag: ProvisionalAttackGroup,
  balance: BalanceConfig,
): boolean {
  return pag.gapSec >= balance.GAP_SEPARATE_MIN;
}
