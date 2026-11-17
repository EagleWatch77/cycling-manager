import type { StateRider } from './config';

/**
 * Integration contract for the future Race Engine (nothing here simulates a race).
 *
 * 1. INPUT - the engine reports what a stage cost as BASE load (a reference rider's cost; the rider's own energyEff / fatigueRes scale it):
 *      record_rider_stage_load(rider, day, energy_base, fatigue_base, race_units, source_key)   (SQL, trusted callers only; idempotent per source_key)
 *    The state catch-up applies it on that day BEFORE the day's regeneration, in chronological order together with training and regeneration.
 * 2. FRESHNESS - before it reads a rider's state the engine calls rider_state_catch_up_internal(rider, now) for every entrant, so even a rider whose
 *    owner never logged in starts with the correct Energy and Fatigue.
 * 3. NO DOUBLE COUNTING - Form is a displayed SUMMARY of Fitness, Energy, Fatigue and 3-week preparedness; it is NOT an input of the race maths.
 *    The engine uses these separate, non-overlapping modifiers (performanceInputs): Energy and Fatigue (direct, per stage), Fitness (long-term physical
 *    level) and a SMALL preparedness effect. Morale touches only the five tactical attributes (+-2 %) and never OVR or the physical attributes.
 */
export interface PerformanceInputs {
  energy: number; fatigue: number; fitness: number;
  /** 3-week preparedness 0..100: may carry a small separate effect */
  preparedness: number;
  morale: number;
}
export const performanceInputs = (r: StateRider, preparednessValue: number): PerformanceInputs =>
  ({ energy: r.energy, fatigue: r.fatigue, fitness: r.fitness, preparedness: preparednessValue, morale: r.morale });
/** The one thing that must not be in PerformanceInputs. */
export const EXCLUDED_FROM_RACE_MATHS = ['form', 'ovr'] as const;
