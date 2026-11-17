import type { StateRider } from './config';

/**
 * Integration contract for the future Race Engine (nothing here simulates a race).
 *
 * 1. INPUT - the engine reports what a stage cost as BASE load (a reference rider's cost; the rider's own energyEff / fatigueRes scale it):
 *      record_rider_stage_load(rider, at, energy_base, fatigue_base, race_units, source_key)   (SQL, trusted callers only; idempotent per source_key)
 *    `at` is the EXACT time of the load (e.g. the end of the stage). The state catch-up applies it at that instant, in chronological order together with
 *    the regeneration (credited for the real elapsed time) and the week ends; it is applied exactly once.
 * 2. FRESHNESS - before it reads a rider's state the engine calls rider_state_catch_up_internal(rider, stage_start_time) for every entrant, so even a rider whose
 *    owner never logged in starts the stage with the exact Energy and Fatigue of that moment (the stage's own load is recorded with the time it ends).
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

/**
 * RACE PROGRESS (interface only - no distribution is implemented and no race results are produced here).
 *
 * Attribute progress earned in a race is NOT split by the rider's last training plan. The Race Engine will report what a rider did in a stage and a
 * separate, later-tuned distribution (BALANCE_PLACEHOLDER) will turn it into attribute points. Until then nothing calls this: the type only fixes the
 * shape of the hand-over so the Engine and the web app can be built independently.
 *   - `stageKey`  : idempotency key (the same stage is never credited twice)
 *   - `points`    : race progress per attribute in the SAME unit as training progress (fractional points, before the 200 cap); the Engine decides how
 *                   it is composed (tactics are trained by racing); the web side only applies it with the same room / cap rules as training.
 * XP stays race-bound and is reported separately from `points`.
 */
export interface RaceProgressReport {
  riderId: string;
  stageKey: string;
  at: string;                                   // ISO instant the stage ended
  points: Partial<Record<string, number>>;      // attribute key -> fractional progress points (>= 0)
  experienceGain: number;                       // XP from this stage (>= 0)
}
/** Not implemented on purpose: returns null until the distribution is designed. Never fabricate a result. */
export const distributeRaceProgress = (_report: RaceProgressReport): null => null;
