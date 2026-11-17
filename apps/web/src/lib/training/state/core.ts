import { STATE_CONFIG as C, type StateRider } from './config';

/**
 * Rider State model 1.0 - pure maths, no I/O. The authoritative copy runs in SQL (migration 20261117_03: rider_state_catch_up_internal());
 * this file is its unit-tested mirror (state.parity.cli.ts proves they agree). Days are integers counted from the calendar anchor (a Monday),
 * so day % 7 == 6 is a Sunday = the last day of a game week.
 *
 * ONE chronological pass (see catchUp): regeneration is credited continuously for the real elapsed time between the exact instants of loads and week
 * ends, never in bulk before the training. A rider who was offline passes through exactly the same loop. Calling it again for the same instant changes
 * nothing (the caller persists `lastAt`).
 */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Continuous regeneration: the daily reference gain (e.g. +11 Energy per 24 h) is credited in proportion to the REAL elapsed seconds.
 * Regeneration is monotone, so clamping at 100 / 0 after any number of partial steps gives the same result as one big step.
 */
export const SECONDS_PER_DAY = 86400;
export const regen = (r: StateRider, seconds: number): StateRider => {
  const share = seconds / SECONDS_PER_DAY;
  return {
    ...r,
    energy: Math.min(100, r.energy + (C.regen.energyBase + C.regen.energySlope * r.recovery) * r.recoveryCoef * share),
    fatigue: Math.max(0, r.fatigue - (C.regen.fatigueBase + C.regen.fatigueSlope * r.recovery) * r.recoveryCoef * share),
  };
};
/** one full day of regeneration (the reference values of the brief) */
export const dailyRegen = (r: StateRider): StateRider => regen(r, SECONDS_PER_DAY);

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

/** A load with its exact time. `at` = seconds since the calendar anchor (Monday 00:00 UTC of season 1). `id` identifies it so it is applied exactly once. */
export interface LoadEvent { id: number; at: number; energy: number; fatigue: number; raceUnits: number }
/**
 * Plan of one game week: a plain number = LEGACY plan (V1), its units are applied once at the week end;
 * an object = V2 plan, its units are applied in equal parts at the SESSIONS (`days`: 0 = Monday .. 6 = Sunday, at sessionHourUtc).
 */
export type PlanLoad = number | { units: number; days: readonly number[] };
export interface DayInputs {
  /** plans keyed by the zero-based GLOBAL week index (season 1 week 1 = 0); a missing key = no plan that week */
  plans: ReadonlyMap<number, PlanLoad>;
  events: readonly LoadEvent[];
}
export interface WeekRecord { week: number; trainingUnits: number; raceUnits: number; stimulus: number; energyEnd: number; fatigueEnd: number; fitnessEnd: number; formEnd: number;
  /** sessions processed and the average readiness measured just before them (null = none); the weekly training progress uses this average */
  sessionsDone: number; readinessAvg: number | null }
export const WEEK_SECONDS = 7 * SECONDS_PER_DAY;
/** the instant a game week ends (= the next Monday 00:00 UTC) */
export const weekEnd = (week: number) => (week + 1) * WEEK_SECONDS;
/** the sessions of a V2 plan: seconds since the anchor */
export const sessionTimes = (week: number, days: readonly number[]) => days.map((d) => week * WEEK_SECONDS + d * SECONDS_PER_DAY + C.training.sessionHourUtc * 3600);
export const sessionDaysOf = (mode: 'full' | 'basic'): readonly number[] => C.training.sessionDays[mode];

/**
 * Brings a rider from `lastAt` to `now` (seconds since the anchor). ONE chronological pass over the NEXT item in time:
 *   - the end of a game week (a legacy plan's load, then Fitness + Form are evaluated), or
 *   - a stage / other load event with its exact time, or
 *   - a training SESSION of a V2 plan (readiness is measured just before it, then its part of the weekly load is applied).
 * Between items the rider regenerates for exactly the elapsed time. At equal times: week end, then event, then session. A load that was reported late
 * (at <= the cursor) is applied at the cursor. `applied` holds the ids of events already applied and `sessions` the sessions already done per week
 * (both mutated); a session at or before `lastAt` counts as done (a plan can only be saved before its first session, so nothing is skipped by mistake).
 */
export function catchUp(start: StateRider, lastAt: number, now: number, inp: DayInputs, history: Map<number, number> = new Map(), applied: Set<number> = new Set(),
  sessions: Map<number, { n: number; sum: number }> = new Map(), credited: Map<number, number> = new Map()): { rider: StateRider; lastAt: number; weeks: WeekRecord[] } {
  let r = start, cursor = lastAt, sessFloor = lastAt; const weeks: WeekRecord[] = [];
  if (now <= lastAt) return { rider: r, lastAt, weeks };
  let complete = false;
  for (let guard = 0; guard < C.maxCatchUpItems; guard++) {
    const week = Math.floor(cursor / WEEK_SECONDS);           // the week the cursor is in; its end is the next boundary
    const boundary = weekEnd(week);
    let next: LoadEvent | undefined;
    for (const e of inp.events) if (!applied.has(e.id) && e.at <= now && (!next || e.at < next.at || (e.at === next.at && e.id < next.id))) next = e;
    const evTime = next ? Math.max(next.at, cursor) : Infinity;
    const plan = inp.plans.get(week);
    let sessT = Infinity, sessN = 0;
    if (typeof plan === 'object') { sessN = plan.days.length; for (const t of sessionTimes(week, plan.days)) if (t > sessFloor && t <= now) { sessT = Math.max(t, cursor); break; } }
    const takeBoundary = boundary <= now && boundary <= evTime && boundary <= sessT;
    const takeEvent = !takeBoundary && next !== undefined && evTime <= sessT;
    const takeSession = !takeBoundary && !takeEvent && sessT !== Infinity;
    if (!takeBoundary && !takeEvent && !takeSession) { complete = true; break; }
    const t = takeBoundary ? boundary : takeEvent ? evTime : sessT;
    r = regen(r, t - cursor); cursor = t;
    if (takeBoundary) {
      const done = sessions.get(week);
      const units = plan === undefined ? 0 : typeof plan === 'number' ? plan : plan.units * (done?.n ?? 0) / sessN;
      if (typeof plan === 'number' && units > 0) { const l = trainingLoad(units); r = applyLoad(r, l.energy, l.fatigue); }
      // A stage's race units are counted in the week they were CREDITED: normally its own week; a stage reported after its week was already evaluated is
      // credited to the open week in which it is applied (the closed week is never re-evaluated). Each event is counted exactly once.
      const raceUnits = inp.events.filter((e) => { const c = credited.get(e.id) ?? e.at; return applied.has(e.id) && c >= week * WEEK_SECONDS && c < boundary; }).reduce((s, e) => s + e.raceUnits, 0);
      const stim = weeklyStimulus(units + raceUnits, r.energy, r.fatigue);
      const fit = fitnessWeek(r, stim);
      const rr = { ...r, fitness: fit, fitnessPeak: Math.max(r.fitnessPeak, fit) };
      history.set(week, stim);
      const prep = preparedness([stim, history.get(week - 1) ?? null, history.get(week - 2) ?? null]);
      const form = formWeek(rr, prep).form;
      r = { ...rr, form };
      weeks.push({ week, trainingUnits: units, raceUnits, stimulus: stim, energyEnd: r.energy, fatigueEnd: r.fatigue, fitnessEnd: fit, formEnd: form,
        sessionsDone: done?.n ?? 0, readinessAvg: done && done.n > 0 ? done.sum / done.n : null });
    } else if (takeEvent && next) { r = applyLoad(r, next.energy, next.fatigue); applied.add(next.id); credited.set(next.id, t);
    } else if (takeSession && typeof plan === 'object') {
      const d = sessions.get(week) ?? { n: 0, sum: 0 };
      sessions.set(week, { n: d.n + 1, sum: d.sum + (r.energy + (100 - r.fatigue)) / 2 });   // readiness BEFORE the session
      const l = trainingLoad(plan.units / sessN); r = applyLoad(r, l.energy, l.fatigue);
      sessFloor = t;
    }
  }
  // A very long offline period can exceed one pass: then the state is saved at the cursor (nothing is skipped) and the next call continues from there.
  if (!complete) return { rider: r, lastAt: cursor, weeks };
  r = regen(r, now - cursor);
  return { rider: r, lastAt: now, weeks };
}

export function coefficientsFromUniforms(u: readonly number[]): { energyEff: number; fatigueRes: number; recoveryCoef: number } {
  const c = C.coef; const bell = (a: number, b: number) => (a + b) / 2;
  return {
    energyEff: c.energyEffMin + (c.energyEffMax - c.energyEffMin) * bell(u[0], u[1]),
    fatigueRes: c.fatigueResMin + (c.fatigueResMax - c.fatigueResMin) * bell(u[2], u[3]),
    recoveryCoef: c.recoveryMin + (c.recoveryMax - c.recoveryMin) * bell(u[4], u[5]),
  };
}
