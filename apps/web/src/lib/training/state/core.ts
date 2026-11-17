import { STATE_CONFIG as C, type StateRider } from './config';

/**
 * Rider State model 1.0 - pure maths, no I/O. The authoritative copy runs in SQL (migration 20261117_03: rider_state_catch_up_internal());
 * this file is its unit-tested mirror (state.parity.cli.ts proves they agree). Days are integers counted from the calendar anchor (a Monday),
 * so day % 7 == 6 is a Sunday = the last day of a game week.
 *
 * ONE chronological loop per rider day: (1) loads of that day (stage events, then the weekly training plan on the week's last day),
 * (2) the day's regeneration, (3) on a week's last day the weekly Fitness + Form evaluation. Regeneration is NEVER added in bulk before the
 * training; a rider who was offline for N days passes through exactly the same loop. Calling it again for the same day changes nothing
 * (the caller persists `lastDay`).
 */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const dailyRegen = (r: StateRider): StateRider => ({
  ...r,
  energy: Math.min(100, r.energy + (C.regen.energyBase + C.regen.energySlope * r.recovery) * r.recoveryCoef),
  fatigue: Math.max(0, r.fatigue - (C.regen.fatigueBase + C.regen.fatigueSlope * r.recovery) * r.recoveryCoef),
});

/** A load is given in BASE units (what a reference rider would pay); the rider's own coefficients scale it. */
export const applyLoad = (r: StateRider, energy: number, fatigue: number): StateRider => ({
  ...r,
  energy: Math.max(0, r.energy - energy * r.energyEff),
  fatigue: Math.min(100, r.fatigue + fatigue * r.fatigueRes),
});

export const trainingLoad = (units: number) => ({ energy: units * C.training.energyPerUnit, fatigue: units * C.training.fatiguePerUnit });

export const declineOnset = (vitality: number) => C.fitness.onsetBase + Math.floor((vitality - 1) / C.fitness.onsetVitalityStep);

export function ageGrowthFactor(age: number): number {
  const f = C.fitness;
  return f.ageFloor + f.ageSpan / (1 + Math.exp((age - f.ageMid) / f.ageWidth));
}
export const growthFactorOfFitness = (k: number) => Math.min(((100 - k) / 20) ** 2, C.fitness.growthFactorMax);
export function developmentFactor(r: Pick<StateRider, 'trainability' | 'professionalism'>): number {
  const f = C.fitness;
  return clamp(1 + f.trainabilityWeight * (r.trainability - 50) / 50 + f.professionalismWeight * (r.professionalism - 50) / 50, f.gMin, f.gMax);
}

/** Weekly stimulus after the overload cut. `load` = training units + race units of the week. */
export function weeklyStimulus(load: number, energyEnd: number, fatigueEnd: number): number {
  const s = C.stimulus;
  const raw = 1 - Math.exp(-load / s.satLoad);
  const o = Math.max(clamp((fatigueEnd - s.overloadFatigueFrom) / s.overloadFatigueSpan, 0, 1), clamp((s.overloadEnergyBelow - energyEnd) / s.overloadEnergyBelow, 0, 1));
  return raw * (1 - s.overloadCut * o);
}

/** Fitness (Kondicia) after one week. Never capped: growth falls with ((100-K)/20)^2 and is exactly 0 at 100. */
export function fitnessWeek(r: StateRider, stimulus: number): number {
  const f = C.fitness, k = r.fitness;
  const onset = declineOnset(r.vitality);
  const growth = f.growthBase * stimulus * growthFactorOfFitness(k) * ageGrowthFactor(r.age) * developmentFactor(r) * (f.vitalityBase + f.vitalitySlope * r.vitality / 100);
  const retention = Math.max(f.rebuildRetentionMin, 1 / (1 + f.rebuildAgePenalty * Math.max(0, r.age - onset)));
  const regain = Math.min(Math.max(0, r.fitnessPeak - k), f.rebuildRate * Math.max(0, r.fitnessPeak - k) * stimulus * retention);
  const inactive = f.inactiveLoss * Math.max(0, 1 - stimulus / f.inactiveBelow);
  const ageLoss = r.age >= onset ? f.ageLossBase * (r.age - onset + 1) * (1 - f.ageLossRelief * Math.min(1, stimulus)) : 0;
  const overload = f.overloadLoss * Math.max(clamp((r.fatigue - C.stimulus.overloadFatigueFrom) / C.stimulus.overloadFatigueSpan, 0, 1), clamp((C.stimulus.overloadEnergyBelow - r.energy) / C.stimulus.overloadEnergyBelow, 0, 1));
  return clamp(k + growth + regain - inactive - ageLoss - overload, 0, 100);
}

/** Preparedness 0..100 from the stimuli of the last three weeks (newest first); missing = rider has no history that far back. */
export function preparedness(stimuli: readonly (number | null)[]): number {
  return 100 * C.form.prepWeights.reduce((s, w, i) => s + w * (stimuli[i] ?? C.form.prepNeutral), 0);
}

/** Form target and the smoothed new Form. Form is a VISIBLE SUMMARY only - see contract.ts for how it is kept out of the race maths. */
export function formWeek(r: StateRider, prep: number): { target: number; form: number } {
  const w = C.form;
  const raw = w.wFitness * r.fitness + w.wEnergy * r.energy + w.wLowFatigue * (100 - r.fatigue) + w.wPrep * prep;
  const target = 100 * Math.pow(clamp(raw, 0, 100) / 100, w.gamma);
  return { target, form: clamp(r.form + w.smoothing * (target - r.form), 0, 100) };
}

export interface LoadEvent { day: number; energy: number; fatigue: number; raceUnits: number }
export interface DayInputs {
  /** training units per plan, keyed by the plan's last day (week end); a missing key = no plan that week */
  plans: ReadonlyMap<number, number>;
  events: readonly LoadEvent[];
}
export interface WeekRecord { weekEndDay: number; trainingUnits: number; raceUnits: number; stimulus: number; energyEnd: number; fatigueEnd: number; fitnessEnd: number; formEnd: number }

export function catchUp(start: StateRider, lastDay: number, throughDay: number, inp: DayInputs, history: Map<number, number> = new Map()): { rider: StateRider; lastDay: number; weeks: WeekRecord[] } {
  let r = start; const weeks: WeekRecord[] = [];
  const stop = Math.min(throughDay, lastDay + C.maxCatchUpDays);
  for (let day = lastDay + 1; day <= stop; day++) {
    for (const e of inp.events) if (e.day === day) r = applyLoad(r, e.energy, e.fatigue);
    const weekEnd = day % 7 === 6;
    const units = weekEnd ? inp.plans.get(day) : undefined;
    if (units !== undefined) { const l = trainingLoad(units); r = applyLoad(r, l.energy, l.fatigue); }
    r = dailyRegen(r);
    if (weekEnd) {
      const raceUnits = inp.events.filter((e) => e.day > day - 7 && e.day <= day).reduce((s, e) => s + e.raceUnits, 0);
      const trainingUnits = units ?? 0;
      const stim = weeklyStimulus(trainingUnits + raceUnits, r.energy, r.fatigue);
      const fit = fitnessWeek(r, stim);
      const rr = { ...r, fitness: fit, fitnessPeak: Math.max(r.fitnessPeak, fit) };
      history.set(day, stim);
      const prep = preparedness([stim, history.get(day - 7) ?? null, history.get(day - 14) ?? null]);
      const form = formWeek(rr, prep).form;
      r = { ...rr, form };
      weeks.push({ weekEndDay: day, trainingUnits, raceUnits, stimulus: stim, energyEnd: r.energy, fatigueEnd: r.fatigue, fitnessEnd: fit, formEnd: form });
    }
  }
  return { rider: r, lastDay: stop, weeks };
}

/** Deterministic individual coefficients from three uniform numbers in [0,1) (SQL feeds them from md5(rider id)). Bell-shaped (mean of two uniforms). */
export function coefficientsFromUniforms(u: readonly number[]): { energyEff: number; fatigueRes: number; recoveryCoef: number } {
  const c = C.coef; const bell = (a: number, b: number) => (a + b) / 2;
  return {
    energyEff: c.energyEffMin + (c.energyEffMax - c.energyEffMin) * bell(u[0], u[1]),
    fatigueRes: c.fatigueResMin + (c.fatigueResMax - c.fatigueResMin) * bell(u[2], u[3]),
    recoveryCoef: c.recoveryMin + (c.recoveryMax - c.recoveryMin) * bell(u[4], u[5]),
  };
}
