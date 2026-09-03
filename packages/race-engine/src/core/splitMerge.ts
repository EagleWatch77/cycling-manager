import { BalanceConfig } from '../config/balance.js';
import { ContactState, Group, RiderState } from '../types/domain.js';

/* ------------------------------------------------------------------ */
/* Drop model — spec §09                                               */
/* ------------------------------------------------------------------ */

/**
 * Seconds lost per km by a rider who has lost contact.
 * `deficit` is a POSITIVE number of EP points below Required Performance.
 *
 * Applies ONLY while ContactState === LOSING_CONTACT. Once the rider becomes
 * a separate group entity, Group Pace takes over and this is never applied.
 */
export function dropLossSecPerKm(
  deficit: number,
  balance: BalanceConfig,
): number {
  if (deficit <= 0) return 0;
  return balance.DROP_LOSS_COEF * Math.pow(deficit, balance.DROP_LOSS_EXP);
}

/* ------------------------------------------------------------------ */
/* Gap states — spec §08                                               */
/* ------------------------------------------------------------------ */

export enum GapState {
  MERGE = 'MERGE',
  CLOSING = 'CLOSING',
  DETACHED = 'DETACHED',
  SEPARATE = 'SEPARATE',
}

export function gapState(gapSec: number, balance: BalanceConfig): GapState {
  const g = Math.abs(gapSec);
  if (g <= balance.GAP_MERGE_MAX) return GapState.MERGE;
  if (g <= 7) return GapState.CLOSING;
  if (g < balance.GAP_SEPARATE_MIN) return GapState.DETACHED;
  return GapState.SEPARATE;
}

/* ------------------------------------------------------------------ */
/* Handover state machine — Rev B §7 (approved)                        */
/* ------------------------------------------------------------------ */

export interface HandoverDecision {
  readonly next: ContactState;
  /** True when the drop model may be applied this tick. */
  readonly applyDropModel: boolean;
  /** True when Group Pace governs this rider's time this tick. */
  readonly applyGroupPace: boolean;
  readonly becameSeparate: boolean;
}

/**
 * Exactly one of applyDropModel / applyGroupPace is true in every tick.
 * That mutual exclusion is the whole point of the handover rule.
 */
export function advanceContactState(params: {
  current: ContactState;
  struggle: number;
  detachedGapSec: number;
  balance: BalanceConfig;
}): HandoverDecision {
  const { current, struggle, detachedGapSec, balance } = params;

  if (current === ContactState.SEPARATE) {
    return {
      next: ContactState.SEPARATE,
      applyDropModel: false,
      applyGroupPace: true,
      becameSeparate: false,
    };
  }

  if (current === ContactState.LOSING_CONTACT) {
    if (detachedGapSec >= balance.GAP_SEPARATE_MIN) {
      return {
        next: ContactState.SEPARATE,
        applyDropModel: false,
        applyGroupPace: true,
        becameSeparate: true,
      };
    }
    return {
      next: ContactState.LOSING_CONTACT,
      applyDropModel: true,
      applyGroupPace: false,
      becameSeparate: false,
    };
  }

  // IN_GROUP
  if (struggle >= balance.STRUGGLE_SPLIT) {
    return {
      next: ContactState.LOSING_CONTACT,
      applyDropModel: true,
      applyGroupPace: false,
      becameSeparate: false,
    };
  }

  return {
    next: ContactState.IN_GROUP,
    applyDropModel: false,
    applyGroupPace: true,
    becameSeparate: false,
  };
}

/* ------------------------------------------------------------------ */
/* Merge                                                               */
/* ------------------------------------------------------------------ */

/**
 * Merge `behind` into `ahead`. The merged entity keeps the FASTER group's
 * clock, i.e. the smaller elapsed time at the same course position.
 */
export function mergeGroups(ahead: Group, behind: Group): void {
  ahead.riderIds = [...ahead.riderIds, ...behind.riderIds];
  ahead.timeSec = Math.min(ahead.timeSec, behind.timeSec);
  behind.riderIds = [];
  behind.active = false;
}

/** Gap in seconds between two groups at the same course position. */
export function gapSec(lead: Group, chase: Group): number {
  return chase.timeSec - lead.timeSec;
}

/** Reassign a rider's group membership. */
export function moveRider(
  rider: RiderState,
  from: Group,
  to: Group,
): void {
  from.riderIds = from.riderIds.filter((id) => id !== rider.id);
  if (!to.riderIds.includes(rider.id)) to.riderIds.push(rider.id);
  rider.groupId = to.id;
}
