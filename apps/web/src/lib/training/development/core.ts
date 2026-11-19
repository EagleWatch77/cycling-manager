import { PHYSICAL, TECHNICAL, PLANS, DEV_CONFIG, progressShares, ALLROUNDER_PLAN, productionShape, type DevRider, type DevelopmentConfig, type EfficiencyTable, type TrainingMode } from './config';
import { ageFactor } from '../config';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';

/**
 * Shared calculation of weekly training and ageing (model V2 / training 1.0). Pure functions, no I/O.
 * See ./config.ts for every constant. The database function apply_training_plan_v2 mirrors this by hand.
 */
const zeroAttrs = () => Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, 0])) as Record<SkillAttribute, number>;
export const readinessOf = (energy: number, fatigue: number) => (energy + (100 - fatigue)) / 2;

export function efficiencyOf(score: number, table: EfficiencyTable): number {
  if (table === 'production') return score >= 80 ? 1 : score >= 60 ? 0.95 : score >= 40 ? 0.85 : score >= 20 ? 0.7 : 0.5;
  return score >= 80 ? 1 : score >= 60 ? 0.9 : score >= 40 ? 0.7 : score >= 20 ? 0.45 : 0.25;
}

/** Potential -> soft long-term cap of the performance attributes (no OVR limit anywhere). */
export const softCap = (potential: number, cfg: DevelopmentConfig = DEV_CONFIG) =>
  cfg.capBase + cfg.capSlope * 100 * Math.pow(potential / 100, cfg.capExp);

/** Cap of one attribute: plan/strong attributes reach the full Potential cap, shape-weak ones stay lower. */
export function attributeGap(shape: number, attr: SkillAttribute, cfg: DevelopmentConfig = DEV_CONFIG): number {
  if (shape === ALLROUNDER_PLAN) return cfg.gapAllrounder;
  const sh = productionShape(shape);
  if (PLANS[shape].phys.includes(attr) || (sh.strong as readonly string[]).includes(attr)) return cfg.gapStrong;
  if ((sh.weak as readonly string[]).includes(attr)) return cfg.gapWeak;
  return cfg.gapOther;
}

/** Ceiling of one performance attribute of this rider: Potential cap - plan gap + individual aptitude. */
export function effectiveCap(r: Pick<DevRider, 'hidden' | 'shape' | 'aptitude'>, attr: SkillAttribute, cfg: DevelopmentConfig = DEV_CONFIG): number {
  return softCap(r.hidden.potential, cfg) - attributeGap(r.shape, attr, cfg) + cfg.aptPhysSpread * (r.aptitude?.[attr] ?? 0);
}
/** Soft ceiling of a technique attribute; Infinity for a rider without a profile (old behaviour). */
export function techCapOf(r: Pick<DevRider, 'aptitude'>, attr: SkillAttribute, cfg: DevelopmentConfig = DEV_CONFIG): number {
  const t = r.aptitude?.[attr];
  return t === undefined ? Infinity : cfg.techCapBase + cfg.techCapSpread * t;
}

/** Youth floor of the physical room factor (O5): constant up to `youthFloorFullUntil`, then linear to 0 at `youthFloorZeroAt`. Mirrors public.dev_phys_room() in SQL. */
export const youthRoomFloor = (age: number, cfg: DevelopmentConfig = DEV_CONFIG) =>
  age <= cfg.youthFloorFullUntil ? cfg.youthRoomFloor
    : age >= cfg.youthFloorZeroAt ? 0
      : cfg.youthRoomFloor * (cfg.youthFloorZeroAt - age) / (cfg.youthFloorZeroAt - cfg.youthFloorFullUntil);

/** Physical room: the normal soft-cap value, but never below the youth floor when an age is given; the hard maximum always wins (room 0). */
export const roomPhys = (a: number, cap: number, cfg: DevelopmentConfig = DEV_CONFIG, age?: number) => {
  if (a >= cfg.maxAttribute) return 0;
  const normal = 1 / (1 + Math.exp((a - (cap - cfg.softOffset)) / cfg.softWidth));
  return age === undefined ? normal : Math.max(normal, youthRoomFloor(age, cfg));
};
export const roomTech = (a: number, cfg: DevelopmentConfig = DEV_CONFIG, cap = Infinity) => {
  const lin = Math.max(cfg.roomTechMin, Math.min(1, (cfg.maxAttribute - a) / cfg.roomTechSpan));
  return Number.isFinite(cap) ? (a >= cfg.maxAttribute ? 0 : lin * (1 / (1 + Math.exp((a - (cap - cfg.softOffset)) / cfg.softWidth)))) : lin;
};
export const recoveryMultiplier = (recovery: number, cfg: DevelopmentConfig = DEV_CONFIG) => cfg.recBase + cfg.recSlope * recovery / 100;

/** Trainability + Professionalism -> speed/efficiency factor G (Potential does not take part). */
export function trainingFactor(r: Pick<DevRider, 'hidden'>, cfg: DevelopmentConfig = DEV_CONFIG) {
  const G = Math.max(cfg.gMin, Math.min(cfg.gMax, 1 + cfg.wTrainability * (r.hidden.trainability - 50) / 50 + cfg.wProfessionalism * (r.hidden.professionalism - 50) / 50));
  return { G };
}

/** Accumulator: raw progress -> whole points; never above `cap`; progress is discarded at the cap; `maxGain` limits the gain of one call. */
export function accumulate(progress: number, raw: number, threshold: number, cap: number, attr: number, maxGain = Infinity) {
  const p = progress + raw;
  const gain = Math.min(Math.floor((p + 1e-9) / threshold), Math.max(0, cap - attr), maxGain);
  const a = attr + gain;
  return { gain, attr: a, progress: a >= cap ? 0 : Math.max(0, p - gain * threshold) };
}

export interface WeeklySetting { planId: number; mode: TrainingMode }
export interface WeeklyResult {
  rider: DevRider;
  /** unrounded raw progress added this week (before the accumulator) */
  rawProgress: Record<SkillAttribute, number>;
  /** whole points applied this week */
  gains: Record<SkillAttribute, number>;
  readiness: number; efficiency: number;
  /** false for a week without a saved plan: nothing at all is processed */
  processed: boolean;
}

export interface WeeklyContext {
  /** Training Center multiplier of the existing facility system (physical part only); default 1 */
  facilityMultiplier?: number;
  /** Recovery Center multiplier of the existing facility system; default 1 */
  recoveryFacility?: number;
  /** average readiness measured just before the week's training sessions (Rider State loop); default = the rider's current Energy/Fatigue */
  readiness?: number;
}

/**
 * One processed training week. `setting === null` = the manager did not set a plan for this week: no progress and
 * no condition change (the game rule: training must be set for every available week).
 */
export function weeklyTraining(rider: DevRider, setting: WeeklySetting | null, cfg: DevelopmentConfig = DEV_CONFIG, ctx: WeeklyContext = {}): WeeklyResult {
  if (setting === null) return { rider, rawProgress: zeroAttrs(), gains: zeroAttrs(), readiness: readinessOf(rider.energy, rider.fatigue), efficiency: 0, processed: false };
  const plan = PLANS[setting.planId];
  const a = cfg.modeCapacity[setting.mode];
  const R = ctx.readiness ?? readinessOf(rider.energy, rider.fatigue);
  const eff = efficiencyOf(R, cfg.efficiencyTable);
  const { G } = trainingFactor(rider, cfg);
  const al = ageFactor(rider.age), alT = (1 + al) / 2;
  const attrs = { ...rider.attrs }, progress = { ...rider.progress };
  const rawProgress = zeroAttrs(), gains = zeroAttrs();

  const share = progressShares(setting.planId, cfg);
  const budget = cfg.weeklyBudget * a;                       // ONE budget for the whole week, whatever the plan
  for (const j of PHYSICAL) {
    const room = roomPhys(attrs[j], effectiveCap(rider, j, cfg), cfg, rider.age);
    const raw = budget * share[j] * eff * G * al * room * (ctx.facilityMultiplier ?? 1);
    rawProgress[j] = raw;
    const r = accumulate(progress[j] ?? 0, raw, cfg.threshold, cfg.maxAttribute, attrs[j]);
    attrs[j] = r.attr; progress[j] = r.progress; gains[j] = r.gain;
  }
  for (const k of TECHNICAL) {
    const raw = budget * share[k] * eff * G * alT * roomTech(attrs[k], cfg, techCapOf(rider, k, cfg));
    rawProgress[k] = raw;
    const r = accumulate(progress[k] ?? 0, raw, cfg.threshold, cfg.maxAttribute, attrs[k], cfg.techWeeklyMax);
    attrs[k] = r.attr; progress[k] = r.progress; gains[k] = r.gain;
  }

  const e = cfg.energy[setting.mode], rm = recoveryMultiplier(rider.hidden.recovery, cfg) * (ctx.recoveryFacility ?? 1);
  const fin = (v: number) => { const x = cfg.roundCondition ? Math.round(v) : v; return Math.max(0, Math.min(100, x)); };
  const energy = fin(rider.energy - e.cost + e.recoveryDays * cfg.recoveryDayEnergy * rm);
  const fatigue = fin(rider.fatigue + e.fatigue - e.recoveryDays * cfg.recoveryDayFatigue * rm);
  return { rider: { ...rider, attrs, progress, energy, fatigue }, rawProgress, gains, readiness: R, efficiency: eff, processed: true };
}

export const declineOnset = (vitality: number, cfg: DevelopmentConfig = DEV_CONFIG) => cfg.declineBase + Math.floor((vitality - 1) / cfg.declineStep);

/** Start of a season: new age, offseason recovery, then Vitality-driven decline of the physical attributes. */
export function seasonStart(rider: DevRider, newAge: number, cfg: DevelopmentConfig = DEV_CONFIG): DevRider {
  const attrs = { ...rider.attrs }, decline = { ...rider.decline };
  const energy = Math.min(100, rider.energy + cfg.seasonStartEnergy), fatigue = Math.max(0, rider.fatigue - cfg.seasonStartFatigue);
  const onset = declineOnset(rider.hidden.vitality, cfg);
  if (newAge >= onset) {
    const loss = cfg.lossBase + cfg.lossPerYear * (newAge - onset);
    for (const j of PHYSICAL) {
      let d = (decline[j] ?? 0) + loss * (cfg.declineFactor[j] ?? 1);
      const g = Math.floor(d);
      if (g > 0) { attrs[j] = Math.max(cfg.declineFloor, attrs[j] - g); d -= g; }
      decline[j] = d;
    }
  }
  return { ...rider, age: newAge, attrs, decline, energy, fatigue };
}
