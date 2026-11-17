/**
 * Career simulation 2 — 17..35 years, league path, per-league calendar, EXPERIMENTAL growth rules for Tactics / Experience.
 * WEEKLY resolution (the earlier daily-condition model is replaced by constant readiness effectiveness; see RHO, calibrated against
 * the verified numbers of docs/TRAINING_CAREER_SIMULATION.md). Everything marked EXP is a proposal, not production and not approved.
 * Nothing here touches a database.
 */
import { SKILL_ATTRIBUTES, PERFORMANCE_MAX, type SkillAttribute } from '@/lib/rider/config';
import { TOURS } from '@/data/tours';
import { LEAGUES, visibleStageCount, type LeagueId } from '@/lib/leagues';
import { SESSION_COUNT, TECHNICAL_BASE, TRAINING_GAIN_THRESHOLD, trainabilityFactor, professionalismFactor, ageFactor, BASE_TRAINING } from '@/lib/training/config';
import type { SimRider } from '../population';
import { performanceWeekRaw } from '../career/engine';
import { IDX, NATTR, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX, TACT_W, TOUR_ID_BY_WEEK } from '../career/params';
import type { StageKind } from '../career/params';
import { ovrCurrent, ovrProposed, physV } from './ovr2';

export const TH = TRAINING_GAIN_THRESHOLD;
export type PathId = 'fast' | 'std' | 'slow' | 'rookie';
/** EXP assumption: seasons spent in each league (promotion counts / rules are NOT approved; OVR never drives promotion). */
export const PATHS: Record<PathId, number[]> = { fast: [1, 2, 3, 3], std: [2, 3, 4, 4], slow: [4, 5, 5, 5], rookie: [99] };
export const leagueAt = (path: PathId, season: number): LeagueId => {
  let s = season; const P = PATHS[path];
  for (let i = 0; i < P.length; i++) { if (s <= P[i]) return LEAGUES[i]; s -= P[i]; }
  return path === 'rookie' ? 'rookie' : LEAGUES[Math.min(P.length, LEAGUES.length - 1)];
};
export type CalId = 'code' | 'o026';
/** Calendar: tours per season and stages per tour. 'code' = lib/leagues.ts as is (3 tours everywhere, stages 3/4/5/5/5) + working draft Elite 4 tours x 5 stages; 'o026' = stage counts 3/4/4/4/5 (stated in O-026). */
export function calendar(cal: CalId, league: LeagueId): { tours: number; stages: number } {
  const stagesCode = visibleStageCount(league);
  const st = cal === 'code' ? stagesCode : ({ rookie: 3, amateur: 4, continental: 4, pro: 4, elite: 5 } as const)[league];
  return { tours: league === 'elite' ? 4 : 3, stages: st };
}
export const TOUR_WEEKS: Record<number, number[]> = { 3: [2, 5, 7], 4: [2, 5, 7, 9] };
const TT_NAMES = new Set(['Koruna severu', 'Časovka Obzor']);
/** Stage kinds of a tour week (first `stages` of the 5 master stages); real data/tours.ts content. */
export const kindsOf = (week: number, stages: number): { km: number; kind: StageKind }[] => {
  const tour = TOURS.find((t) => t.id === TOUR_ID_BY_WEEK[week])!;
  return tour.masterStages.slice(0, stages).map((s) => ({ km: s.distanceKm, kind: (TT_NAMES.has(s.name) ? 'tt' : s.difficulty) as StageKind }));
};
export const stageSize = (km: number, kind: StageKind) => (kind === 'tt' ? 0.6 : Math.max(0.3, Math.min(1.2, km / 150)));

export type Strategy = 'perf' | 'perfTech' | 'hard';
export interface Cfg {
  strategy: Strategy; path: PathId; cal: CalId; seasons: number; startAge: number;
  /** EXP multiplier of BASE_TRAINING (calibration sensitivity; 1 = production). */
  perfMult: number;
  /** EXP: cap of Tactics / Technique / Experience (production 160, brief 200). */
  capNonPerf: number;
  /** EXP growth coefficients (raw per stage into threshold-12 accumulators). 0 = no race growth (production). */
  expK: number; tactK: number;
  /** MS: every second season in week 6 (one single-day stage, no training that week), participation assumed for everybody. */
  ms: boolean;
  decline: boolean;
  /** readiness effectiveness constants (see calibration) */
  rhoNormal: number; rhoHard: number; rhoStage: number;
}
export const DEFAULT: Cfg = { strategy: 'perf', path: 'std', cal: 'code', seasons: 19, startAge: 17, perfMult: 1, capNonPerf: 160, expK: 0, tactK: 0, ms: false, decline: false, rhoNormal: 0.8, rhoHard: 0.6, rhoStage: 0.956 };

/** Rider type from the START attributes (dominant Performance attribute). */
export type RType = 'Vrchár' | 'Šprintér' | 'Časovkár' | 'Puncheur' | 'Rovinár' | 'Univerzál';
export const RTYPES: RType[] = ['Vrchár', 'Šprintér', 'Časovkár', 'Puncheur', 'Rovinár', 'Univerzál'];
export function typeOf(a: ArrayLike<number>): RType {
  let top = PERF_IDX[0], sum = 0; for (const i of PERF_IDX) { sum += a[i]; if (a[i] > a[top]) top = i; }
  if (a[top] - sum / 7 < 8) return 'Univerzál';
  if (top === IDX.climbing) return 'Vrchár'; if (top === IDX.sprint) return 'Šprintér'; if (top === IDX.timeTrial) return 'Časovkár';
  if (top === IDX.hills || top === IDX.acceleration) return 'Puncheur'; return 'Rovinár';
}
/** EXP: tactical weights of a type (order = TACT_IDX: positioning, attackTiming, reaction, energyManagement, breakawaySkill). Fixed per rider: no random dominant attribute, not equal for all five. */
export const TACT_TYPE_W: Record<RType, number[]> = {
  'Vrchár': [0.4, 1.0, 0.4, 0.8, 0.3], 'Šprintér': [1.0, 0.5, 0.9, 0.3, 0.2], 'Časovkár': [0.5, 0.2, 0.3, 1.0, 0.8],
  'Puncheur': [0.5, 0.9, 1.0, 0.4, 0.6], 'Rovinár': [0.7, 0.3, 0.5, 0.8, 1.0], 'Univerzál': [0.6, 0.6, 0.6, 0.6, 0.6],
};
/** Technique foci used by the technical-training strategy (two attributes alternated), by type (order of TECH_IDX: descending, bikeHandling, cornering, packRiding, wetHandling, roughSurface). */
export const TECH_FOCI: Record<RType, number[]> = {
  'Vrchár': [0, 2], 'Šprintér': [3, 1], 'Časovkár': [1, 2], 'Puncheur': [2, 1], 'Rovinár': [5, 3], 'Univerzál': [0, 3],
};
const ageDecline = (age: number) => (age >= 37 ? 3 : age >= 34 ? 2 : age >= 31 ? 1 : 0);

export interface Snap { age: number; attrs: Float64Array }
export interface Res {
  cfg: Cfg; n: number; ages: number[]; snaps: Float64Array; // [rider][ageIdx][attr]
  types: RType[]; firstExp200Age: Int16Array; stagesRidden: Int32Array; trainWeeks: Int32Array; techWeeks: Int32Array;
}
export function runCareer2(pop: readonly SimRider[], cfg: Cfg): Res {
  const n = pop.length, S = cfg.seasons;
  const ages = Array.from({ length: S + 1 }, (_, i) => cfg.startAge + i); // snapshot i = state BEFORE the season in which the rider is ages[i] (i = S: after the last season)
  const res: Res = { cfg, n, ages, snaps: new Float64Array(n * (S + 1) * NATTR), types: [], firstExp200Age: new Int16Array(n).fill(-1), stagesRidden: new Int32Array(n), trainWeeks: new Int32Array(n), techWeeks: new Int32Array(n) };
  const a = new Float64Array(NATTR), prog = new Float64Array(NATTR);
  const PERF_SET = new Set(PERF_IDX);
  for (let ri = 0; ri < n; ri++) {
    const src = pop[ri];
    for (let i = 0; i < NATTR; i++) { a[i] = src.attrs[SKILL_ATTRIBUTES[i]]; prog[i] = 0; }
    const tr = src.hidden.trainability, pr = src.hidden.professionalism, po = src.hidden.potential;
    const type = typeOf(a); res.types.push(type);
    let focus = PERF_IDX[0]; for (const i of PERF_IDX) if (a[i] > a[focus]) focus = i;
    const startOverall = PERF_IDX.reduce((s, i) => s + a[i], 0) / 7;
    const tw = TACT_TYPE_W[type], techFoci = TECH_FOCI[type];
    const trF = trainabilityFactor(tr), prF = professionalismFactor(pr);
    const save = (s: number) => { res.snaps.set(a, (ri * (S + 1) + s) * NATTR); };
    save(0);
    let techToggle = 0, cyc = 0;
    const perfCredit = (i: number, raw: number) => { const p = prog[i] + raw; const g = Math.min(Math.floor((p + 1e-9) / TH), Math.max(0, PERFORMANCE_MAX - a[i])); a[i] += g; prog[i] = Math.max(0, p - g * TH); };
    const credit = (i: number, raw: number, maxGain = Infinity) => { const p = prog[i] + raw; let g = Math.floor((p + 1e-9) / TH); g = Math.min(g, Math.max(0, cfg.capNonPerf - a[i]), maxGain); a[i] += g; prog[i] = Math.max(0, p - g * TH); };
    for (let s = 1; s <= S; s++) {
      const age = cfg.startAge + s - 1;
      if (cfg.decline && s > 1) { const d = ageDecline(age); if (d > 0) for (const i of PERF_IDX) a[i] = Math.max(100, a[i] - d); }
      const league = leagueAt(cfg.path, s), cal = calendar(cfg.cal, league);
      const tourWeeks = TOUR_WEEKS[cal.tours];
      const msWeek = cfg.ms && s % 2 === 0 ? 6 : -1;
      for (let w = 1; w <= 10; w++) {
        const isTour = tourWeeks.includes(w);
        if (isTour) {
          for (const st of kindsOf(w, cal.stages)) {
            res.stagesRidden[ri]++;
            const size = stageSize(st.km, st.kind);
            if (cfg.expK > 0) credit(EXP_IDX, cfg.expK * size * Math.max(0, Math.min(1, (cfg.capNonPerf - a[EXP_IDX]) / 15)));
            if (cfg.tactK > 0) for (let j = 0; j < 5; j++) { const wt = tw[j] * TACT_W[st.kind][j]; if (wt > 0) credit(TACT_IDX[j], cfg.tactK * wt * size * cfg.rhoStage * trF * ageFactor(age) * Math.max(0, Math.min(1, (cfg.capNonPerf - a[TACT_IDX[j]]) / 15))); }
          }
          continue;
        }
        if (w === msWeek) { // one single-day mixed race, no training that week (EXP)
          res.stagesRidden[ri]++;
          if (cfg.expK > 0) credit(EXP_IDX, cfg.expK * 1.0 * Math.max(0, Math.min(1, (cfg.capNonPerf - a[EXP_IDX]) / 15)));
          if (cfg.tactK > 0) for (let j = 0; j < 5; j++) { const wt = tw[j] * 0.8; credit(TACT_IDX[j], cfg.tactK * wt * cfg.rhoStage * trF * ageFactor(age) * Math.max(0, Math.min(1, (cfg.capNonPerf - a[TACT_IDX[j]]) / 15))); }
          continue;
        }
        if (w === 1) continue; // preparation week: plan of week 1 does not exist (PROD)
        // ---- planned training week (production formulas; constant readiness) ----
        const technical = cfg.strategy === 'perfTech' && cyc % 3 === 2; cyc++;
        res.trainWeeks[ri]++;
        if (technical) {
          res.techWeeks[ri]++;
          const idx = TECH_IDX[techFoci[techToggle++ % 2]];
          credit(idx, TECHNICAL_BASE * trF * prF * ageFactor(age) * cfg.rhoNormal, 1);
        } else {
          const intensity = cfg.strategy === 'hard' ? 'hard' : 'normal';
          const g = performanceWeekRaw({ att: a, focus, intensity, tr, pr, po, poRaw: po, age, facility: cfg.perfMult, model: 'existing', startOverall });
          const rho = intensity === 'hard' ? cfg.rhoHard : cfg.rhoNormal;
          perfCredit(focus, g.primary * rho);
          if (g.secIdx >= 0 && g.secondary > 0 && PERF_SET.has(g.secIdx)) perfCredit(g.secIdx, g.secondary * rho);
        }
      }
      if (res.firstExp200Age[ri] < 0 && a[EXP_IDX] >= 200) res.firstExp200Age[ri] = age;
      save(s);
    }
  }
  return res;
}
export const view = (r: Res, ri: number, si: number): Float64Array => r.snaps.subarray((ri * (r.ages.length) + si) * NATTR, (ri * r.ages.length + si + 1) * NATTR);
export const metricsOf = (x: ArrayLike<number>) => ({ ovrCur: ovrCurrent(x), ovrNew: ovrProposed(x), V: physV(x), mean7: PERF_IDX.reduce((s, i) => s + x[i], 0) / 7, T: Math.max(...TACT_IDX.map((i) => x[i])), Te: Math.max(...TECH_IDX.map((i) => x[i])), S: x[EXP_IDX] });
void BASE_TRAINING; void SESSION_COUNT;
