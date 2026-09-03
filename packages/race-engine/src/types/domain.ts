import { Terrain, Attributes } from './terrain.js';
import { BreakawayEffort, ChaseIntensity, StageApproach } from '../config/balance.js';
import { AttackKind, ResponseKind } from '../core/attack.js';

export type RiderId = string;
export type GroupId = number;

/** Tactical settings a player chooses before the stage. */
export interface RiderTactics {
  readonly breakawayEffort: BreakawayEffort;
  readonly chaseIntensity: ChaseIntensity;
  /** Energy side is used by EN-01; the performance side is not yet wired. */
  readonly stageApproach?: StageApproach;
  /** AF-01: launch an attack once the race reaches this km. */
  readonly attackAtKm?: number;
  readonly attackKind?: AttackKind;
  /** AF-01: how this rider answers an attack launched in his group. */
  readonly response?: ResponseKind;
}

/**
 * Immutable per-rider stage-start snapshot.
 *
 * `condition`, `setup` and `weather` are multiplicative scalars supplied by
 * the caller. The race-engine package deliberately does NOT compute them:
 * they belong to the rider/equipment/weather modules, which are outside this
 * milestone's scope. Keeping them as inputs also keeps the engine pure.
 */
export interface RiderSnapshot {
  readonly id: RiderId;
  readonly attributes: Attributes;
  /** Form x Fatigue composite, ~1.00. */
  readonly condition: number;
  /** Equipment scalar, ~1.00. */
  readonly setup: number;
  /** Stage weather scalar, ~1.00. */
  readonly weather: number;
  /** Energy 0-100 at stage start. */
  readonly startEnergy: number;
  readonly tactics: RiderTactics;
}

/** Mutable per-rider state during the stage. */
export interface RiderState {
  readonly id: RiderId;
  energy: number;
  fatigue: number;
  struggle: number;
  groupId: GroupId;
  /** Handover state machine — V10.2 Rev B §7. */
  contact: ContactState;
  /** Seconds lost while in LOSING_CONTACT, before becoming a separate entity. */
  detachedGapSec: number;
  finished: boolean;
  finishTimeSec: number | null;
  /** AF-01 */
  pagId: number | null;
  attackLaunched: boolean;
}

/**
 * Handover state machine (Rev B §7, approved).
 *
 * IN_GROUP        -> struggle < 100, rider rides on group time
 * LOSING_CONTACT  -> struggle >= 100, gap < 16 s
 *                    time loss from the DROP MODEL ONLY
 * SEPARATE        -> gap >= 16 s, rider belongs to a separate group entity
 *                    time loss from GROUP PACE ONLY
 *
 * The two mechanisms are never applied in the same tick.
 */
export enum ContactState {
  IN_GROUP = 'IN_GROUP',
  LOSING_CONTACT = 'LOSING_CONTACT',
  SEPARATE = 'SEPARATE',
  /** AF-01: in a Provisional Attack Group, 0 < gap < 16 s ahead. */
  ATTACKING = 'ATTACKING',
}

export interface Segment {
  readonly startKm: number;
  readonly lengthKm: number;
  readonly terrain: Terrain;
  /** Reference speed for this segment in km/h, from the stage template. */
  readonly referenceSpeedKmh: number;
  /**
   * DESCENT only: per-group speed modifier applied OUTSIDE PacePower, so that
   * descending differences stay a seconds-level effect (spec §15).
   * Range approximately -0.015 .. +0.015.
   */
  readonly descentModifierRange?: readonly [number, number];
  /**
   * Weather Energy multiplier for this segment. Spec §16 gives guidance
   * ("roughly +3-5 %") but no table, so this is caller-supplied and
   * defaults to 1.00. Not invented here.
   */
  readonly weatherEnergyMultiplier?: number;
}

export interface StageTemplate {
  readonly id: string;
  readonly segments: readonly Segment[];
}

/** A group entity on the road. Position and own clock; gaps are derived. */
export interface Group {
  readonly id: GroupId;
  riderIds: RiderId[];
  /** Course position in km. */
  posKm: number;
  /** Own elapsed time in seconds. */
  timeSec: number;
  active: boolean;
}

export enum WorkMode {
  ESCAPE = 'ESCAPE',
  CHASE = 'CHASE',
  NEUTRAL = 'NEUTRAL',
}
