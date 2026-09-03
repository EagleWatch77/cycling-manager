import {
  Fraction,
  ChasePoints,
  frac,
  chasePoints,
  clamp,
} from '../types/units.js';
import { WorkMode } from '../types/domain.js';
import {
  BalanceConfig,
  BREAKAWAY_EFFORT,
  CHASE_INTENSITY,
  BreakawayEffort,
  ChaseIntensity,
} from '../config/balance.js';

/**
 * V10.2 Group Pace / Gap Evolution — Rev B with Rev C amendments.
 *
 * Blocking rule 1: chase intensity and breakaway effort contribute ONLY to
 * group pace power and Energy cost. They never enter a rider's own Effective
 * Performance and never protect that rider from Struggle. Nothing in this
 * module writes to rider EP or struggle.
 */

/** One rider's contribution to its group's pace, for the current tick. */
export interface PaceMember {
  readonly id: string;
  /** Effective Performance WITHOUT chase / breakaway effort. */
  readonly ep: number;
  readonly breakawayEffort: BreakawayEffort;
  readonly chaseIntensity: ChaseIntensity;
}

export interface PaceInputs {
  readonly members: readonly PaceMember[];
  readonly mode: WorkMode;
  /** P_ref for the CURRENT SEGMENT'S terrain. Rev C §C1. */
  readonly pRef: number;
  /** Starting field size, immutable. */
  readonly fieldSize: number;
  readonly referenceSpeedKmh: number;
  readonly balance: BalanceConfig;
  /** DESCENT only: applied outside PacePower. Rev B §6 edge case 15. */
  readonly descentModifier?: number;
}

export interface PaceResult {
  readonly mode: WorkMode;
  readonly paceEP: number;
  readonly workerCount: number;
  readonly workerEP: number;
  readonly workerShare: number;
  readonly escapeWork: Fraction;
  readonly chaseInput: ChasePoints;
  readonly chaseWork: Fraction;
  readonly workFactor: Fraction;
  readonly sizeFactor: Fraction;
  readonly pacePower: number;
  readonly speedKmh: number;
  readonly clamped: boolean;
  readonly secPerKm: number;
}

/* ------------------------------------------------------------------ */
/* Work mode resolution — Rev B §2.2 (R3)                              */
/* ------------------------------------------------------------------ */

/**
 * A group is:
 *   CHASE    if a separate group entity exists ahead (gap >= 16 s)
 *   ESCAPE   if nothing ahead and a separate group entity exists behind
 *   NEUTRAL  otherwise
 *
 * NEUTRAL forces WorkFactor = 0. Breakaway effort is inert unless the rider
 * is in a recognized escape group.
 */
export function resolveWorkMode(params: {
  gapToGroupAheadSec: number | null;
  gapToGroupBehindSec: number | null;
  balance: BalanceConfig;
}): WorkMode {
  const { gapToGroupAheadSec, gapToGroupBehindSec, balance } = params;
  const sep = balance.GAP_SEPARATE_MIN;

  const hasAhead = gapToGroupAheadSec !== null && gapToGroupAheadSec >= sep;
  if (hasAhead) return WorkMode.CHASE;

  const hasBehind = gapToGroupBehindSec !== null && gapToGroupBehindSec >= sep;
  if (hasBehind) return WorkMode.ESCAPE;

  return WorkMode.NEUTRAL;
}

/* ------------------------------------------------------------------ */
/* Work factors — Rev B §2.5 (R1)                                      */
/* ------------------------------------------------------------------ */

/** EP-weighted MEAN of breakaway effort. Always bounded by the §11 table. */
export function escapeWork(members: readonly PaceMember[]): Fraction {
  let num = 0;
  let den = 0;
  for (const m of members) {
    num += BREAKAWAY_EFFORT[m.breakawayEffort].work * m.ep;
    den += m.ep;
  }
  return frac(den === 0 ? 0 : num / den);
}

/** EP-weighted SUM of chase intensity, in ChasePoints. */
export function chaseInput(
  members: readonly PaceMember[],
  pRef: number,
): ChasePoints {
  let total = 0;
  for (const m of members) {
    const pts = CHASE_INTENSITY[m.chaseIntensity].points;
    if (pts > 0) total += pts * (m.ep / pRef);
  }
  return chasePoints(total);
}

/** Saturating map ChasePoints -> Fraction. The only unit conversion. */
export function chaseWork(
  input: ChasePoints,
  balance: BalanceConfig,
): Fraction {
  return frac(
    balance.CHASE_MAX * (1 - Math.exp(-input / balance.CHASE_SAT)),
  );
}

/** Modest logarithmic aero handicap for groups smaller than the field. */
export function sizeFactor(
  groupSize: number,
  fieldSize: number,
  balance: BalanceConfig,
): Fraction {
  return frac(balance.GROUP_SIZE_COEF * Math.log(groupSize / fieldSize));
}

/* ------------------------------------------------------------------ */
/* PaceEP — Rev B §2.4 (R1)                                            */
/* ------------------------------------------------------------------ */

export function workers(members: readonly PaceMember[]): PaceMember[] {
  return members.filter((m) => CHASE_INTENSITY[m.chaseIntensity].points > 0);
}

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * PACE PURITY INVARIANT (Rev C §C2):
 * in CHASE mode with a non-empty worker set, the EP of passive riders does
 * NOT enter this function. Only pRef, worker EP, worker count and group size.
 */
export function paceEP(
  members: readonly PaceMember[],
  mode: WorkMode,
  pRef: number,
): { paceEP: number; workerEP: number; workerShare: number; workerCount: number } {
  const meanAll = mean(members.map((m) => m.ep));

  if (mode === WorkMode.ESCAPE || mode === WorkMode.NEUTRAL) {
    return { paceEP: meanAll, workerEP: meanAll, workerShare: 0, workerCount: 0 };
  }

  const w = workers(members);
  if (w.length === 0) {
    // No one is working: passive composition may LOWER the pace, never raise it.
    return {
      paceEP: Math.min(pRef, meanAll),
      workerEP: meanAll,
      workerShare: 0,
      workerCount: 0,
    };
  }

  const workerEP = mean(w.map((m) => m.ep));
  const workerShare = w.length / members.length;
  return {
    paceEP: pRef + (workerEP - pRef) * workerShare,
    workerEP,
    workerShare,
    workerCount: w.length,
  };
}

/* ------------------------------------------------------------------ */
/* Full pace computation                                               */
/* ------------------------------------------------------------------ */

export function computeGroupPace(inputs: PaceInputs): PaceResult {
  const {
    members,
    mode,
    pRef,
    fieldSize,
    referenceSpeedKmh,
    balance,
    descentModifier = 0,
  } = inputs;

  if (members.length === 0) {
    throw new Error('computeGroupPace: empty group');
  }
  if (!(pRef > 0)) {
    throw new Error(`computeGroupPace: invalid pRef ${pRef}`);
  }

  const pace = paceEP(members, mode, pRef);

  const eWork = mode === WorkMode.ESCAPE ? escapeWork(members) : frac(0);
  const cInput =
    mode === WorkMode.CHASE ? chaseInput(members, pRef) : chasePoints(0);
  const cWork = mode === WorkMode.CHASE ? chaseWork(cInput, balance) : frac(0);

  // NEUTRAL forces WorkFactor = 0 (R3).
  const workFactor: Fraction =
    mode === WorkMode.ESCAPE ? eWork : mode === WorkMode.CHASE ? cWork : frac(0);

  const sFactor = sizeFactor(members.length, fieldSize, balance);

  const pacePower = pace.paceEP * (1 + workFactor + sFactor);

  const rawSpeed =
    referenceSpeedKmh *
    Math.pow(pacePower / pRef, balance.GROUP_PACE_EXP) *
    (1 + descentModifier);

  const lo = balance.GROUP_SPEED_MIN * referenceSpeedKmh;
  const hi = balance.GROUP_SPEED_MAX * referenceSpeedKmh;
  const speedKmh = clamp(rawSpeed, lo, hi);

  return {
    mode,
    paceEP: pace.paceEP,
    workerCount: pace.workerCount,
    workerEP: pace.workerEP,
    workerShare: pace.workerShare,
    escapeWork: eWork,
    chaseInput: cInput,
    chaseWork: cWork,
    workFactor,
    sizeFactor: sFactor,
    pacePower,
    speedKmh,
    clamped: rawSpeed !== speedKmh,
    secPerKm: 3600 / speedKmh,
  };
}

/** Seconds the leading group gains on the chasing group per km. */
export function gapChangeSecPerKm(lead: PaceResult, chase: PaceResult): number {
  return chase.secPerKm - lead.secPerKm;
}
