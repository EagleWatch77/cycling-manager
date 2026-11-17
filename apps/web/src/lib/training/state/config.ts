/**
 * Rider State model 1.0 (Energy / Fatigue / Form / Fitness / Morale) - configuration.
 * EVERY number below is a tunable working value (BALANCE_PLACEHOLDER) taken from the owner's brief (2026-11-17) or chosen to satisfy its qualitative
 * rules; none is final. The SQL twin (migration 20261117_03) keeps the same numbers in rider_state_config().
 */
export const STATE_CONFIG = {
  /** individual coefficient ranges (hidden, generated once from the rider id, never changed, copied on transfer) */
  coef: { energyEffMin: 0.70, energyEffMax: 1.30, fatigueResMin: 0.70, fatigueResMax: 1.30, recoveryMin: 0.90, recoveryMax: 1.10 },
  /** daily regeneration: gain = (base + slope x Recovery) x individual recovery coefficient */
  regen: { energyBase: 9, energySlope: 0.04, fatigueBase: 6, fatigueSlope: 0.04 },
  /**
   * weekly training plan load. A V2 plan (seven plans) is spread over its SESSIONS at their exact times (Tuesday/Thursday/Saturday for Full,
   * Tuesday/Friday for Basic, 12:00 UTC), each session carrying an equal part of the weekly load (Full 30 E / 22 F in 3 parts, Basic 18 E / 13.2 F in 2),
   * scaled by the rider's individual coefficients at every session. The number of sessions never changes the weekly total or the weekly progress.
   * Legacy V1 plans (no plan id) keep the old behaviour: the whole load once at the week end. No recovery days inside any more.
   */
  training: { energyPerUnit: 30, fatiguePerUnit: 22, unitsFull: 1.0, unitsBasic: 0.6, unitsV1Hard: 1.0, unitsV1Normal: 0.7, unitsV1Light: 0.4, unitsV1Technical: 0.4,
    /** weekday index 0 = Monday ... 6 = Sunday (UTC game calendar) */
    sessionDays: { full: [1, 3, 5], basic: [1, 4] }, sessionHourUtc: 12 },
  /** reference stage load of the brief (-16 / +11); Race Engine supplies the real values per stage via the load-event interface */
  stageReference: { energy: 16, fatigue: 11, raceUnits: 0.25 },
  /** weekly stimulus: s = 1 - exp(-L / satLoad), L = training units + race units; overload (high Fatigue / low Energy at week end) cuts it */
  stimulus: { satLoad: 1.0, overloadFatigueFrom: 60, overloadFatigueSpan: 40, overloadEnergyBelow: 25, overloadCut: 0.6 },
  fitness: {
    growthBase: 0.30,
    /** ((100 - K) / 20)^2, bounded so a very low value cannot explode */
    growthFactorMax: 4,
    ageMid: 24, ageWidth: 2.5, ageFloor: 0.35, ageSpan: 1.15,
    vitalityBase: 0.85, vitalitySlope: 0.30,
    trainabilityWeight: 0.30, professionalismWeight: 0.15, gMin: 0.6, gMax: 1.5,
    /** regaining a previously reached level is easier than a new personal best: share of the gap to the historical peak regained per week at full stimulus */
    rebuildRate: 0.12, rebuildAgePenalty: 0.15, rebuildRetentionMin: 0.3,
    inactiveBelow: 0.30, inactiveLoss: 0.6,
    ageLossBase: 0.05, ageLossRelief: 0.5,
    overloadLoss: 0.5,
    onsetBase: 29, onsetVitalityStep: 25,
  },
  form: {
    wFitness: 0.35, wEnergy: 0.20, wLowFatigue: 0.20, wPrep: 0.25,
    /** preparedness: last three weeks, newest first; weeks before the rider's history exists count as neutral */
    prepWeights: [0.5, 0.3, 0.2], prepNeutral: 0.45,
    /** 100 x (raw/100)^gamma keeps 95+ rare although rested riders collect the Energy / low-Fatigue points */
    gamma: 1.2,
    smoothing: 0.5,
  },
  maxCatchUpItems: 4000,
} as const;

export interface StateRider {
  age: number; vitality: number; trainability: number; professionalism: number; recovery: number;
  energyEff: number; fatigueRes: number; recoveryCoef: number;
  energy: number; fatigue: number; form: number; fitness: number; fitnessPeak: number; morale: number;
}

/** First day of the game calendar (a Monday); day index 0. Mirrors lib/calendar/season.ts SEASON_ONE_START. */
import { SEASON_ONE_START } from '@/lib/calendar/season';
export const CALENDAR_ANCHOR: string = SEASON_ONE_START;
