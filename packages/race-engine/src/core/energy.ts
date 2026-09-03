import { Terrain } from '../types/terrain.js';
import { WorkMode } from '../types/domain.js';
import {
  BASE_ROAD_ENERGY_PER_KM,
  TERRAIN_ENERGY_MULTIPLIER,
  STAGE_APPROACH,
  StageApproach,
  BREAKAWAY_EFFORT,
  CHASE_INTENSITY,
  BreakawayEffort,
  ChaseIntensity,
  draftingEnergyMultiplier,
} from '../config/balance.js';

/**
 * EN-01 — Energy consumption model.
 *
 *   energyBurn = tickKm
 *              * BASE_ROAD_ENERGY_PER_KM
 *              * draftingEnergyMultiplier(groupSize)
 *              * stageApproachEnergyMultiplier
 *              * workEnergyMultiplier
 *              * terrainEnergyMultiplier
 *              * weatherEnergyMultiplier
 *
 * Applied AFTER the tick has been resolved. The rider's Energy at the START
 * of the tick determines Effective Performance for that tick.
 *
 * Attack fixed costs (-5 / -8) are a separate mechanic and are not part of
 * this per-tick burn.
 */

/**
 * Work multiplier selection:
 *   NEUTRAL mode                -> 1.00
 *   ESCAPE mode (recognized)    -> rider's Breakaway Effort energy multiplier
 *   CHASE mode, actual worker   -> rider's Chase energy multiplier
 *   CHASE mode, passive rider   -> 1.00
 */
export function workEnergyMultiplier(params: {
  mode: WorkMode;
  breakawayEffort: BreakawayEffort;
  chaseIntensity: ChaseIntensity;
}): number {
  const { mode, breakawayEffort, chaseIntensity } = params;

  if (mode === WorkMode.ESCAPE) {
    return BREAKAWAY_EFFORT[breakawayEffort].energyMult;
  }
  if (mode === WorkMode.CHASE) {
    const chase = CHASE_INTENSITY[chaseIntensity];
    return chase.points > 0 ? chase.energyMult : 1.0;
  }
  return 1.0;
}

export function energyBurnForTick(params: {
  tickKm: number;
  groupSize: number;
  mode: WorkMode;
  terrain: Terrain;
  breakawayEffort: BreakawayEffort;
  chaseIntensity: ChaseIntensity;
  stageApproach?: StageApproach;
  weatherEnergyMultiplier?: number;
}): number {
  const {
    tickKm,
    groupSize,
    mode,
    terrain,
    breakawayEffort,
    chaseIntensity,
    stageApproach = StageApproach.NORMAL,
    weatherEnergyMultiplier = 1.0,
  } = params;

  return (
    tickKm *
    BASE_ROAD_ENERGY_PER_KM *
    draftingEnergyMultiplier(groupSize) *
    STAGE_APPROACH[stageApproach].energyMult *
    workEnergyMultiplier({ mode, breakawayEffort, chaseIntensity }) *
    TERRAIN_ENERGY_MULTIPLIER[terrain] *
    weatherEnergyMultiplier
  );
}

export function clampEnergy(energy: number): number {
  return energy < 0 ? 0 : energy > 100 ? 100 : energy;
}
