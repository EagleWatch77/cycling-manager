/**
 * MODEL F (EXPERIMENTAL, nothing in production). Numeric calibration of the NEW training system: 7 specialisation plans, 2 modes (Basic 75/25, Full 100/0),
 * real energy/fatigue state, additive hidden-trait modifiers. Accumulator threshold 12 kept (progress += 12 x points; +1 attribute per 12).
 *
 *  weekly points of attribute j:   pts_j = coef_j(plan) x cScale x modeShare x eff(F) x G(hidden) x alpha(age) x room_j
 *      coef: 3 main physical 1.15/0.95/0.75, 4 others `gen` (0.20/0.35/0.50), main technique 0.85, second technique 0.45
 *      G = clamp(1 + wTr*zTr + wPr*zPr + wPo*zPo, gMin, gMax), z = (hidden-50)/50   (ADDITIVE, so effects are not multiplied into very weak growth)
 *  energy:  fatigue F (0 fresh .. 100). Week: F <- F*(1-q) + load*loadMul ;  q = qBase*recMod (+ qBasic in Basic mode);  eff(F) = clamp(1 - kF*max(0, F-F0), effMin, 1)
 *  Race stage adds raceLoad x size fatigue, and reduces the stage-result index by kRace*max(0,F-F0r).
 */
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';
import { LEAGUES } from '@/lib/leagues';
import { ageFactor } from '@/lib/training/config';
import { IDX, NATTR, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX, TACT_W, TECH_W, STAGE_PERF } from '../career/params';
import { calendar, TOUR_WEEKS, kindsOf, stageSize, TACT_TYPE_W } from '../career2/model2';
import { RTYPES, STRONG, WEAK, hu, hg, type Rider3, type Res3 } from './model3';
import { capGap, roomE, roomT, tauE, type CapMode } from './modelE';

/** 7 plans (EXP assumption: one per main physical attribute; main triple = main + the two most related; technique pair by plan). TECH_IDX order: descending, bikeHandling, cornering, packRiding, wetHandling, roughSurface. */
export interface Plan { name: string; phys: number[]; tech: number[] }
const P = (name: string, ph: (keyof typeof IDX)[], te: number[]): Plan => ({ name, phys: ph.map((k) => IDX[k]), tech: te.map((i) => TECH_IDX[i]) });
export const PLANS: Plan[] = [
  P('Stúpanie', ['climbing', 'endurance', 'hills'], [0, 2]),
  P('Kopce/Puncheur', ['hills', 'acceleration', 'climbing'], [2, 1]),
  P('Rovina', ['flat', 'timeTrial', 'endurance'], [5, 3]),
  P('Šprint', ['sprint', 'acceleration', 'flat'], [3, 1]),
  P('Časovka', ['timeTrial', 'endurance', 'flat'], [1, 2]),
  P('Vytrvalosť/Univerzál', ['endurance', 'timeTrial', 'climbing'], [0, 3]),
  P('Akcelerácia', ['acceleration', 'sprint', 'hills'], [1, 2]),
];
const PLAN_OF_MAIN: Record<number, number> = { [IDX.climbing]: 0, [IDX.hills]: 1, [IDX.flat]: 2, [IDX.sprint]: 3, [IDX.timeTrial]: 4, [IDX.endurance]: 5, [IDX.acceleration]: 6 };
/** natural plan by rider type (type -> plan index); `neigh` = two neighbouring plans used by the strategic rotation */
const NAT: Record<string, number> = { 'Vrchár': 0, 'Puncheur': 1, 'Rovinár': 2, 'Šprintér': 3, 'Časovkár': 4, 'Univerzál': 5 };
const NEIGH: Record<number, number[]> = { 0: [5, 1], 1: [6, 0], 2: [4, 5], 3: [6, 2], 4: [2, 5], 5: [0, 4], 6: [3, 1] };

export type PlanStrat = 'fixed' | 'rotate' | 'adaptive' | 'random';
export type ModeStrat = 'full' | 'basic' | 'smart' | 'tourBasic' | 'randomMode';
export interface CfgF {
  plan: PlanStrat; mode: ModeStrat; smartF: number; seasons: number; startAge: number; seed: number; capMode: CapMode; capBase: number; capSlope: number;
  cScale: number; techScale: number; gen: number; coefP: number[]; coefT: number[];
  wTr: number; wPr: number; wPo: number; gMin: number; gMax: number; potSpeed: number;
  qBase: number; qBasic: number; load100: number; loadBasic: number; kF: number; F0: number; effMin: number; raceLoad: number; kRace: number; F0r: number; offSeason: number; overF: number; overEff: number;
  expK: number; tactK: number; capNonPerf: number; ms: boolean; decline: boolean; up: number[]; down: number[]; rhoStage: number;
  forceHidden?: Partial<Record<'po' | 'tr' | 'pr' | 'rec' | 'vit', number>>; // for controlled comparisons: override hidden traits
}
export const DEFF: CfgF = {
  plan: 'fixed', mode: 'smart', smartF: 25, seasons: 18, startAge: 17, seed: 20261116, capMode: 'soft', capBase: 120, capSlope: 1.0,
  cScale: 1, techScale: 1, gen: 0.35, coefP: [1.15, 0.95, 0.75], coefT: [0.85, 0.45],
  wTr: 0.30, wPr: 0.15, wPo: 0.10, gMin: 0.6, gMax: 1.5, potSpeed: 0,
  qBase: 0.50, qBasic: 0.18, load100: 14, loadBasic: 10.5, kF: 0.020, F0: 15, effMin: 0.35, raceLoad: 7, kRace: 0.15, F0r: 25, offSeason: 0.25, overF: 80, overEff: 0.6,
  expK: 14, tactK: 12, capNonPerf: 200, ms: true, decline: true, up: [0.30, 0.25, 0.20, 0.15, 0], down: [0, 0.10, 0.10, 0.10, 0.15], rhoStage: 0.956,
};
const TH = 12;
export const gMod = (c: CfgF, tr: number, pr: number, po: number) => Math.max(c.gMin, Math.min(c.gMax, 1 + c.wTr * (tr - 50) / 50 + c.wPr * (pr - 50) / 50 + c.wPo * (po - 50) / 50 + c.potSpeed * (po - 50) / 50));
export const recMod = (rec: number) => 0.75 + 0.5 * rec / 100;
export const effF = (c: CfgF, F: number) => { let e = Math.max(c.effMin, Math.min(1, 1 - c.kF * Math.max(0, F - c.F0))); if (F > c.overF) e *= c.overEff; return e; };

export interface ResF extends Res3 { fatigueMean: Float32Array; fatigueAfterTour: Float32Array; basicShare: Float32Array; planSeasons: Int8Array }
export function runCareerF(pop: readonly Rider3[], cfg: CfgF): ResF {
  const n = pop.length, S = cfg.seasons, seed = cfg.seed;
  const res = { cfg: cfg as any, n, S, snaps: new Int16Array(n * (S + 1) * NATTR), league: new Int8Array(n * S), stages: new Int32Array(n), stagesBySeason: new Int16Array(n * S), firstExp200: new Int16Array(n).fill(-1),
    strat: new Int8Array(n), arch: new Int8Array(n), hidden: new Float32Array(n * 5), activity: new Float32Array(n), stretch: new Float32Array(n).fill(1),
    fatigueMean: new Float32Array(n), fatigueAfterTour: new Float32Array(n), basicShare: new Float32Array(n), planSeasons: new Int8Array(n * S) } as ResF;
  const A = new Float64Array(n * NATTR), prog = new Float64Array(n * NATTR), dprog = new Float64Array(n * NATTR), L = new Int8Array(n), score = new Float64Array(n), cnt = new Int32Array(n), Fat = new Float64Array(n);
  const fSum = new Float64Array(n), fN = new Int32Array(n), tSum = new Float64Array(n), tN = new Int32Array(n), bN = new Int32Array(n), wN = new Int32Array(n);
  const hid = new Float64Array(n * 5);
  pop.forEach((p, i) => { A.set(p.attrs, i * NATTR); res.arch[i] = p.arch; res.activity[i] = p.activity; res.strat[i] = p.strat; for (let k = 0; k < 5; k++) { const v = cfg.forceHidden ? [cfg.forceHidden.po, cfg.forceHidden.tr, cfg.forceHidden.pr, cfg.forceHidden.rec, cfg.forceHidden.vit][k] ?? p.hidden[k] : p.hidden[k]; hid[i * 5 + k] = v; res.hidden[i * 5 + k] = v; } });
  const credit = (ri: number, i: number, raw: number, cap: number, maxGain = Infinity) => { const k = ri * NATTR + i; const p = prog[k] + raw; let g = Math.floor((p + 1e-9) / TH); g = Math.min(g, Math.max(0, cap - A[k]), maxGain); A[k] += g; prog[k] = Math.max(0, p - g * TH); };
  const taper = (v: number) => Math.max(0, Math.min(1, (cfg.capNonPerf - v) / 15));
  const rotPlan = (ri: number, s: number, nat: number) => (s % 3 === 0 ? NEIGH[nat][0] : s % 3 === 2 && s > 4 ? NEIGH[nat][1] : nat);
  for (let s = 1; s <= S; s++) {
    const age = cfg.startAge + s - 1;
    for (let ri = 0; ri < n; ri++) { res.snaps.set(A.subarray(ri * NATTR, ri * NATTR + NATTR), (ri * (S + 1) + s - 1) * NATTR); res.league[ri * S + s - 1] = L[ri]; score[ri] = 0; cnt[ri] = 0; }
    for (let ri = 0; ri < n; ri++) {
      const p = pop[ri], base = ri * NATTR, t = RTYPES[p.arch];
      const po = hid[ri * 5], tr = hid[ri * 5 + 1], pr = hid[ri * 5 + 2], rec = hid[ri * 5 + 3], vit = hid[ri * 5 + 4];
      const G = gMod(cfg, tr, pr, po), al = ageFactor(age), alT = (1 + al) / 2, rm = recMod(rec), loadMul = 1.15 - 0.3 * vit / 100, cap0 = cfg.capBase + cfg.capSlope * po;
      Fat[ri] *= cfg.offSeason;
      if (cfg.decline) { const onset = 29 + Math.floor((vit - 1) / 25); if (age >= onset) { const loss = 0.8 + 0.4 * (age - onset); for (const i of PERF_IDX) { const f = i === IDX.sprint || i === IDX.acceleration ? 1.4 : i === IDX.endurance ? 0.7 : 1; const k = base + i; dprog[k] += loss * f; const g = Math.floor(dprog[k]); if (g > 0) { A[k] = Math.max(20, A[k] - g); dprog[k] -= g; } } } }
      const lg = LEAGUES[L[ri]], cal = calendar('code', lg), tw = TOUR_WEEKS[cal.tours];
      const msWeek = cfg.ms && s % 2 === 0 && L[ri] >= 2 ? 6 : -1;
      const tw5 = TACT_TYPE_W[t], nat = NAT[t];
      let planIdx = nat; if (cfg.plan === 'rotate') planIdx = rotPlan(ri, s, nat);
      res.planSeasons[ri * S + s - 1] = planIdx;
      let stages = 0, weeksSinceTour = 9;
      for (let w = 1; w <= 10; w++) {
        const isTour = tw.includes(w) && hu(ri, s * 20 + w, 21, seed) < p.activity;
        if (isTour || w === msWeek) {
          const list = isTour ? kindsOf(w, cal.stages) : [{ km: 150, kind: 'hilly' as const }];
          Fat[ri] *= (1 - 0.25 * rm * 0.5); // light recovery during a race week
          for (const sg of list) {
            stages++; res.stages[ri]++;
            const size = isTour ? stageSize(sg.km, sg.kind) : 1.0;
            Fat[ri] += cfg.raceLoad * size * loadMul;
            credit(ri, EXP_IDX, cfg.expK * size * taper(A[base + EXP_IDX]), cfg.capNonPerf);
            const tws = TACT_W[sg.kind];
            for (let j = 0; j < 5; j++) { const wt = tw5[j] * tws[j]; if (wt > 0) credit(ri, TACT_IDX[j], cfg.tactK * wt * size * cfg.rhoStage * tauE(tr) * al * taper(A[base + TACT_IDX[j]]), cfg.capNonPerf); }
            const pk = STAGE_PERF[sg.kind]; let ps = 0; for (const k of pk) ps += A[base + IDX[k]]; ps /= pk.length;
            let ts = 0, tsw = 0; for (let j = 0; j < 5; j++) { ts += tws[j] * A[base + TACT_IDX[j]]; tsw += tws[j]; } ts = tsw > 0 ? ts / tsw : ps;
            const tcw = TECH_W[sg.kind]; let cs = 0, csw = 0; for (let j = 0; j < 6; j++) { cs += tcw[j] * A[base + TECH_IDX[j]]; csw += tcw[j]; } cs = csw > 0 ? cs / csw : ps;
            score[ri] += 0.78 * ps + 0.10 * ts + 0.07 * cs + 0.05 * A[base + EXP_IDX] - cfg.kRace * Math.max(0, Fat[ri] - cfg.F0r) + 7 * hg(ri, s * 100 + w * 7 + stages, 31, seed); cnt[ri]++;
          }
          if (isTour) { tSum[ri] += Fat[ri]; tN[ri]++; }
          weeksSinceTour = 0; continue;
        }
        if (w === 1) { weeksSinceTour++; continue; }
        // ---- training week: choose mode and plan
        let basic = false;
        if (cfg.mode === 'basic') basic = true;
        else if (cfg.mode === 'smart') basic = Fat[ri] > cfg.smartF;
        else if (cfg.mode === 'tourBasic') basic = weeksSinceTour < 2;
        else if (cfg.mode === 'randomMode') basic = hu(ri, s * 20 + w, 41, seed) < 0.5;
        let pl = planIdx;
        if (cfg.plan === 'random') pl = Math.floor(hu(ri, s * 20 + w, 13, seed) * 7);
        else if (cfg.plan === 'adaptive') { const own = PLANS[nat].phys; let best = nat, bs = -1; for (const c of [nat, ...NEIGH[nat]]) { const pp = PLANS[c].phys; const sc = roomE(cfg.capMode, A[base + pp[0]], cap0 - capGap(t, pp[0])) * 1.0 + roomE(cfg.capMode, A[base + pp[1]], cap0 - capGap(t, pp[1])) * 0.5 + (c === nat ? 0.25 : 0); void own; if (sc > bs) { bs = sc; best = c; } } pl = best; }
        const plan = PLANS[pl], share = basic ? 0.75 : 1.0, eff = effF(cfg, Fat[ri]);
        const q = Math.min(0.9, cfg.qBase * rm + (basic ? cfg.qBasic : 0));
        fSum[ri] += Fat[ri]; fN[ri]++; wN[ri]++; if (basic) bN[ri]++;
        for (const j of PERF_IDX) {
          const rank = plan.phys.indexOf(j); const coef = rank >= 0 ? cfg.coefP[rank] : cfg.gen;
          const pts = coef * cfg.cScale * share * eff * G * al * roomE(cfg.capMode, A[base + j], cap0 - capGap(t, j));
          const k = base + j; const pp = prog[k] + TH * pts; const gg = Math.min(Math.floor((pp + 1e-9) / TH), Math.max(0, 200 - A[k])); A[k] += gg; prog[k] = Math.max(0, pp - gg * TH);
        }
        for (let r = 0; r < 2; r++) { const kk = plan.tech[r]; credit(ri, kk, TH * cfg.coefT[r] * cfg.techScale * share * eff * G * alT * roomT(A[base + kk]), cfg.capNonPerf, 4); }
        Fat[ri] = Fat[ri] * (1 - q) + (basic ? cfg.loadBasic : cfg.load100) * loadMul;
        weeksSinceTour++;
      }
      res.stagesBySeason[ri * S + s - 1] = stages;
      score[ri] = cnt[ri] > 0 ? score[ri] / cnt[ri] : -999;
      if (A[base + EXP_IDX] >= 200 && res.firstExp200[ri] < 0) res.firstExp200[ri] = age;
    }
    const next = Int8Array.from(L);
    for (let l = 0; l < 5; l++) {
      const idx: number[] = []; for (let i = 0; i < n; i++) if (L[i] === l) idx.push(i);
      idx.sort((x, y) => score[y] - score[x]);
      const nu = l < 4 ? Math.floor(idx.length * cfg.up[l]) : 0, nd = l > 0 ? Math.floor(idx.length * cfg.down[l]) : 0;
      for (let k = 0; k < nu; k++) if (score[idx[k]] > -999) next[idx[k]] = l + 1;
      for (let k = 0; k < nd; k++) next[idx[idx.length - 1 - k]] = l - 1;
    }
    L.set(next);
  }
  for (let ri = 0; ri < n; ri++) { res.snaps.set(A.subarray(ri * NATTR, ri * NATTR + NATTR), (ri * (S + 1) + S) * NATTR); res.fatigueMean[ri] = fN[ri] ? fSum[ri] / fN[ri] : 0; res.fatigueAfterTour[ri] = tN[ri] ? tSum[ri] / tN[ri] : 0; res.basicShare[ri] = wN[ri] ? bN[ri] / wN[ri] : 0; }
  void SKILL_ATTRIBUTES; void STRONG; void WEAK; void PLAN_OF_MAIN;
  return res;
}
