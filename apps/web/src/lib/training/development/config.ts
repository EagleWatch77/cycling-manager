import { PERFORMANCE_FOCUS } from '../config';
import { SHAPES, type SkillAttribute } from '@/lib/rider/config';

/**
 * TRAINING 1.0 + RIDER DEVELOPMENT (model V2) — every tunable number in ONE place.
 *
 * Source: simulation model F4 (candidate B), frozen as "training 1.0" by the owner. Nothing here is re-optimised.
 * The pure functions in ./core.ts are the single calculation; the database function that applies a processed week
 * (supabase/migrations/20261117_01_development_model_v2.sql) mirrors it by hand and is checked against it by
 * supabase/tests/development_v2.test.sh (reference values come from this TypeScript, like the V1 SQL tests).
 *
 * SWITCH: TRAINING_MODEL_VERSION is the TypeScript-side description of the active model. Production behaviour is decided
 * by the database switch public.development_model_settings.enabled (default FALSE) — see the migration. 'v1' = the old
 * focus + intensity training (lib/training/growth.ts), nothing here is used by live game code until the switch is on.
 */
export const TRAINING_MODEL_VERSION: 'v1' | 'v2' = 'v1';

export type TrainingMode = 'basic' | 'full';
export type EfficiencyTable = 'production' | 'strict';

export interface HiddenTraits { potential: number; trainability: number; professionalism: number; recovery: number; vitality: number }

/** Plan ids 0..6 = the seven approved plans; also the index of the rider's natural shape (SHAPE_OF_PLAN). */
export interface TrainingPlanDef { id: number; name: string; phys: readonly SkillAttribute[]; tech: readonly SkillAttribute[] }
export const PLANS: readonly TrainingPlanDef[] = [
  { id: 0, name: 'Vrchár', phys: ['climbing', 'endurance', 'hills'], tech: ['descending', 'cornering'] },
  { id: 1, name: 'Šprintér', phys: ['sprint', 'acceleration', 'flat'], tech: ['packRiding', 'bikeHandling'] },
  { id: 2, name: 'Časovkár', phys: ['timeTrial', 'flat', 'endurance'], tech: ['cornering', 'bikeHandling'] },
  { id: 3, name: 'Puncheur', phys: ['hills', 'acceleration', 'climbing'], tech: ['cornering', 'descending'] },
  { id: 4, name: 'Klasikár', phys: ['flat', 'endurance', 'hills'], tech: ['roughSurface', 'wetHandling'] },
  { id: 5, name: 'Únikár', phys: ['endurance', 'flat', 'acceleration'], tech: ['descending', 'bikeHandling'] },
  { id: 6, name: 'Univerzál', phys: ['endurance', 'hills', 'flat'], tech: ['packRiding', 'bikeHandling'] },
];
/** Production generation shape (lib/rider/config.ts SHAPES) that belongs to each plan id. */
export const SHAPE_OF_PLAN = ['climber', 'sprinter', 'timeTrial', 'puncheur', 'classics', 'rouleur', 'allrounder'] as const;
export const ALLROUNDER_PLAN = 6;

export interface DevelopmentConfig {
  /** accumulator: progress needed for one whole attribute point (same as TRAINING_GAIN_THRESHOLD) */
  threshold: number;
  /** visible maximum of every trainable attribute */
  maxAttribute: number;
  cPhys: number; cTech: number;
  /** share of the ACTIVE training capacity that goes to performance (the rest is technique): 80/20 */
  physShare: number;
  /** basic = 75 % training / 25 % regeneration, full = 100 % training */
  modeCapacity: Record<TrainingMode, number>;
  coefPhys: readonly number[]; coefOther: number; coefTech: readonly number[];
  /** hard weekly limit on technique points per attribute */
  techWeeklyMax: number;
  /** G = clamp(1 + wTr x (Trainability-50)/50 + wPr x (Professionalism-50)/50, gMin, gMax). Potential is NOT a multiplier. */
  wTrainability: number; wProfessionalism: number; gMin: number; gMax: number;
  /** Potential = soft long-term cap: capBase + capSlope x 100 x (Potential/100)^capExp  (candidate B: 80 + 125 x (P/100)^2) */
  capBase: number; capSlope: number; capExp: number;
  /** logistic soft cap: room = 1/(1+exp((a-(cap-gap-softOffset))/softWidth)) */
  softOffset: number; softWidth: number;
  /** distance of the soft cap below the Potential cap: plan/strong attribute 0, shape-weak, other; Univerzál */
  gapStrong: number; gapWeak: number; gapOther: number; gapAllrounder: number;
  /** individual aptitude profile: ceiling of a performance attribute moves by aptPhysSpread x aptitude (-1..1); technique has its own soft ceiling techCapBase + techCapSpread x aptitude (only for riders WITH a profile) */
  aptPhysSpread: number; techCapBase: number; techCapSpread: number;
  /** technique room: clamp((maxAttribute - a)/roomTechSpan, roomTechMin, 1) */
  roomTechSpan: number; roomTechMin: number;
  efficiencyTable: EfficiencyTable;
  /** energy per week: cost, fatigue gain and recovery days; recovery day +5 Energy / -4 Fatigue x recovery multiplier */
  energy: Record<TrainingMode, { cost: number; fatigue: number; recoveryDays: number }>;
  recoveryDayEnergy: number; recoveryDayFatigue: number;
  /** Recovery -> multiplier recBase + recSlope x Recovery/100 (narrow: 0.75..1.25) */
  recBase: number; recSlope: number;
  seasonStartEnergy: number; seasonStartFatigue: number;
  /** decline: onset age = declineBase + floor((Vitality-1)/declineStep); yearly loss = lossBase + lossPerYear x (age - onset) */
  declineBase: number; declineStep: number; lossBase: number; lossPerYear: number; declineFloor: number;
  declineFactor: Partial<Record<SkillAttribute, number>>;
  /** condition is stored as integers (production rounds); tests switch it off to compare raw maths with the simulation */
  roundCondition: boolean;
}

export const DEV_CONFIG: DevelopmentConfig = {
  threshold: 12, maxAttribute: 200,
  cPhys: 1.8, cTech: 6.5, physShare: 0.8,
  modeCapacity: { basic: 0.75, full: 1 },
  coefPhys: [1.15, 0.95, 0.75], coefOther: 0.35, coefTech: [0.85, 0.45],
  techWeeklyMax: 4,
  wTrainability: 0.30, wProfessionalism: 0.15, gMin: 0.6, gMax: 1.5,
  capBase: 80, capSlope: 1.25, capExp: 2,
  softOffset: 10, softWidth: 7,
  gapStrong: 0, gapWeak: 45, gapOther: 20, gapAllrounder: 10,
  aptPhysSpread: 30, techCapBase: 160, techCapSpread: 40,
  roomTechSpan: 60, roomTechMin: 0.1,
  efficiencyTable: 'strict',
  energy: { full: { cost: 15, fatigue: 18, recoveryDays: 4 }, basic: { cost: 10, fatigue: 10, recoveryDays: 5 } },
  recoveryDayEnergy: 5, recoveryDayFatigue: 4,
  recBase: 0.75, recSlope: 0.5,
  seasonStartEnergy: 50, seasonStartFatigue: 50,
  declineBase: 29, declineStep: 25, lossBase: 0.8, lossPerYear: 0.4, declineFloor: 20,
  declineFactor: { sprint: 1.4, acceleration: 1.4, endurance: 0.7 },
  roundCondition: true,
};

export interface DevRider {
  age: number;
  /** plan id of the rider's natural shape (0..6) — only used for the soft-cap gaps */
  shape: number;
  attrs: Record<SkillAttribute, number>;
  /** accumulator progress per attribute (the weekly accumulator table) */
  progress: Partial<Record<SkillAttribute, number>>;
  /** fractional ageing progress per attribute carried between seasons */
  decline: Partial<Record<SkillAttribute, number>>;
  energy: number; fatigue: number;
  hidden: HiddenTraits;
  /** internal profile of individual aptitudes (13 values -1..1, stable for the whole career, never shown to the player); undefined = neutral legacy rider */
  aptitude?: Partial<Record<SkillAttribute, number>>;
}

export const PHYSICAL: readonly SkillAttribute[] = PERFORMANCE_FOCUS;
export const productionShape = (planId: number) => SHAPES.find((s) => s.id === SHAPE_OF_PLAN[planId])!;
