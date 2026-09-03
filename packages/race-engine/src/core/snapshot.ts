import { Terrain, ALL_TERRAINS } from '../types/terrain.js';
import { RiderSnapshot } from '../types/domain.js';
import { BalanceConfig } from '../config/balance.js';
import { baseSegmentSkill } from '../config/segmentSkills.js';

/* ------------------------------------------------------------------ */
/* Deterministic RNG — mulberry32. Same seed => same stream, always.   */
/* ------------------------------------------------------------------ */

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [-amplitude, +amplitude]. */
  symmetric(amplitude: number): number {
    return (this.next() * 2 - 1) * amplitude;
  }

  fork(tag: number): Rng {
    return new Rng((this.state ^ Math.imul(tag, 0x9e3779b1)) >>> 0);
  }
}

/* ------------------------------------------------------------------ */
/* Energy penalty curve — spec §03. Interpolated, not stepped.         */
/* ------------------------------------------------------------------ */

const ENERGY_PENALTY_POINTS: readonly [number, number][] = [
  [0, -0.2],
  [19, -0.13],
  [39, -0.08],
  [59, -0.04],
  [79, -0.01],
  [100, 0],
];

export function energyPenalty(energy: number): number {
  const e = energy < 0 ? 0 : energy > 100 ? 100 : energy;
  for (let i = 1; i < ENERGY_PENALTY_POINTS.length; i++) {
    const [x0, y0] = ENERGY_PENALTY_POINTS[i - 1];
    const [x1, y1] = ENERGY_PENALTY_POINTS[i];
    if (e <= x1) {
      const t = x1 === x0 ? 0 : (e - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* NeutralEP and P_ref — Rev C §C1.                                    */
/* ------------------------------------------------------------------ */

/**
 * NeutralEP for one rider on one terrain.
 *
 * INCLUDED : BaseSegmentSkill(terrain), Condition, Energy at STAGE START,
 *            Setup(terrain), Weather(stage)
 * EXCLUDED : stage approach, chase intensity, breakaway effort, attack burst,
 *            TeamContext, SmallVariance
 *
 * Energy uses the rider's actual stage-start value (approved for the initial
 * implementation; do not switch to a fixed Energy 100 unless benchmarks show
 * a need).
 */
export function neutralEP(rider: RiderSnapshot, terrain: Terrain): number {
  return (
    baseSegmentSkill(rider.attributes, terrain) *
    rider.condition *
    (1 + energyPenalty(rider.startEnergy)) *
    rider.setup *
    rider.weather
  );
}

export type PRefByTerrain = Readonly<Record<Terrain, number>>;

/**
 * Immutable stage-start normalization snapshot.
 *
 * One P_ref per terrain type. Computed once from the starting field and never
 * recomputed: DNF, drops and group changes do not affect it.
 */
export interface StageSnapshot {
  readonly stageId: string;
  readonly seed: number;
  readonly balanceVersion: string;
  readonly engineVersion: string;
  readonly riders: readonly RiderSnapshot[];
  readonly fieldSize: number;
  readonly pRef: PRefByTerrain;
  /**
   * Frozen copy of the ENTIRE balance config used for this stage.
   *
   * The version string alone is not enough to replay a historical stage once
   * balance values change, so the values themselves travel with the snapshot.
   * `replaySnapshot` uses this, and `simulateStage` refuses to run with a
   * config whose version does not match.
   */
  readonly balance: BalanceConfig;
}

export const ENGINE_VERSION = 'race-engine-0.1.0';

export function buildStageSnapshot(params: {
  stageId: string;
  seed: number;
  riders: readonly RiderSnapshot[];
  balance: BalanceConfig;
}): StageSnapshot {
  const { stageId, seed, riders, balance } = params;

  if (riders.length === 0) {
    throw new Error('buildStageSnapshot: empty starting field');
  }

  const pRef = {} as Record<Terrain, number>;
  for (const terrain of ALL_TERRAINS) {
    let sum = 0;
    for (const rider of riders) sum += neutralEP(rider, terrain);
    pRef[terrain] = sum / riders.length;
  }

  return Object.freeze({
    stageId,
    seed,
    balanceVersion: balance.version,
    engineVersion: ENGINE_VERSION,
    riders: Object.freeze([...riders]),
    fieldSize: riders.length,
    pRef: Object.freeze(pRef),
    balance: Object.freeze({ ...balance }),
  });
}
