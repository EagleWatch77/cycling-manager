/**
 * MODEL E (EXPERIMENTAL, nothing in production). Mathematical proposal, all formulas in "points" (= expected attribute increments).
 * The production accumulator (threshold 12) is kept: progress += 12 x points; attribute += floor(progress / 12).
 *
 *  Physical week (attribute j, rider i, focus f):   pts_j = cP * w_j(f) * tau * pi * alpha(age) * rho * room_j(a_j, Cap_i)
 *      w_f = 1, three related attributes 0.45 / 0.30 / 0.15, the remaining attributes eps = 0.04
 *      tau = 0.6 + 0.8*Trainability/100, pi = 0.85 + 0.3*Professionalism/100, rho = 0.75 + 0.2*Recovery/100, alpha(age) = production ageFactor table
 *      Cap_i = 120 + 0.8*Potential (120..200). room: soft / hard personal ceiling, or 'none' (global production-like room + Potential as speed).
 *  Technical week (focus attribute k, share s):     pts_k = cT * s * tau * pi * ((1+alpha)/2) * rho * roomT(a_k),   roomT = clamp((200-a)/60, 0.1, 1)
 *  Race growth (Experience, Tactics) unchanged in principle: raw per stage -> accumulator (threshold 12) -> points = raw/12.
 *  Decline: Vitality-dependent (as in career3).
 */
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';
import { LEAGUES } from '@/lib/leagues';
import { ageFactor } from '@/lib/training/config';
import { IDX, NATTR, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX, TACT_W, TECH_W, STAGE_PERF } from '../career/params';
import { calendar, TOUR_WEEKS, kindsOf, stageSize, TACT_TYPE_W, TECH_FOCI } from '../career2/model2';
import { RTYPES, MAIN, RELATED, STRONG, WEAK, hu, hg, type Rider3, type Res3 } from './model3';

export type CapMode = 'soft' | 'hard' | 'none';
export type StratE = 'mix' | 'good' | 'avg' | 'poor';
export interface CfgE {
  capMode: CapMode; strat: StratE; techWeeks: number; cP: number; cT: number;
  seasons: number; startAge: number; expK: number; tactK: number; capNonPerf: number; ms: boolean; decline: boolean;
  up: number[]; down: number[]; rhoStage: number; seed: number; capBase: number; capSlope: number; wRel: number[];
}
export const DEFE: CfgE = {
  capMode: 'soft', strat: 'mix', techWeeks: 1, cP: 3.2, cT: 2.0, seasons: 18, startAge: 17, expK: 14, tactK: 9, capNonPerf: 200, ms: true, decline: true,
  up: [0.30, 0.25, 0.20, 0.15, 0], down: [0, 0.10, 0.10, 0.10, 0.15], rhoStage: 0.956, seed: 20261116, capBase: 120, capSlope: 1.0, wRel: [0.60, 0.45, 0.25],
};
export const W_REL = [0.45, 0.30, 0.15], W_EPS = 0.04;
const TH = 12;
const LOCAL: [number, number][] = [[140, 1], [150, 0.9], [160, 0.8], [170, 0.65], [180, 0.45], [190, 0.25], [200, 0]];
const localRoom = (a: number) => { if (a <= 140) return 1; for (let i = 0; i < LOCAL.length - 1; i++) { const [x0, y0] = LOCAL[i], [x1, y1] = LOCAL[i + 1]; if (a <= x1) return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0); } return 0; };
export const capOf = (po: number, c: Pick<CfgE, 'capBase' | 'capSlope'>) => c.capBase + c.capSlope * po;
/** Ceiling gap of an attribute below the rider's Cap: natural strengths of the archetype 0, neutral 20, natural weaknesses 45, all-rounder 15 everywhere. */
export const GAP = { strong: 0, neutral: 20, weak: 45, univ: 15 };
export const capGap = (t: string, j: number): number => { if (t === 'Univerzál') return GAP.univ; const S = (STRONG[t as keyof typeof STRONG] ?? []).map((k) => IDX[k as keyof typeof IDX]), W = (WEAK[t as keyof typeof WEAK] ?? []).map((k) => IDX[k as keyof typeof IDX]); return S.includes(j) ? GAP.strong : W.includes(j) ? GAP.weak : GAP.neutral; };
export const roomE = (mode: CapMode, a: number, cap: number): number => {
  if (a >= 200) return 0;
  if (mode === 'soft') return 1 / (1 + Math.exp((a - (cap - 10)) / 7));
  if (mode === 'hard') return Math.max(0, Math.min(1, (cap - a) / 30));
  return localRoom(a);
};
export const roomT = (a: number) => Math.max(0.1, Math.min(1, (200 - a) / 60));
export const tauE = (tr: number) => 0.6 + 0.8 * tr / 100;
export const piE = (pr: number) => 0.85 + 0.3 * pr / 100;
export const rhoE = (rec: number) => 0.75 + 0.2 * rec / 100;
export const alphaT = (age: number) => (1 + ageFactor(age)) / 2;
const PRIORITY = (t: string, a0: ArrayLike<number>): number[] => {
  const key = (k: string) => IDX[k as keyof typeof IDX];
  if (t === 'Univerzál') return [...PERF_IDX].sort((x, y) => a0[y] - a0[x]);
  const main = MAIN[t as keyof typeof MAIN]; const list = [main, ...STRONG[t as keyof typeof STRONG], ...(RELATED[main] ?? [])].map(key);
  const out: number[] = []; for (const i of list) if (!out.includes(i)) out.push(i); for (const i of [...PERF_IDX].sort((x, y) => a0[y] - a0[x])) if (!out.includes(i)) out.push(i); return out;
};

export function runCareerE(pop: readonly Rider3[], cfg: CfgE): Res3 {
  const n = pop.length, S = cfg.seasons, seed = cfg.seed;
  const res: Res3 = { cfg: cfg as any, n, S, snaps: new Int16Array(n * (S + 1) * NATTR), league: new Int8Array(n * S), stages: new Int32Array(n), stagesBySeason: new Int16Array(n * S), firstExp200: new Int16Array(n).fill(-1),
    strat: new Int8Array(n), arch: new Int8Array(n), hidden: new Float32Array(n * 5), activity: new Float32Array(n), stretch: new Float32Array(n).fill(1) };
  const A = new Float64Array(n * NATTR), prog = new Float64Array(n * NATTR), dprog = new Float64Array(n * NATTR), L = new Int8Array(n), score = new Float64Array(n), cnt = new Int32Array(n);
  const prio: number[][] = [];
  pop.forEach((p, i) => { A.set(p.attrs, i * NATTR); res.arch[i] = p.arch; res.activity[i] = p.activity; for (let k = 0; k < 5; k++) res.hidden[i * 5 + k] = p.hidden[k];
    const st = cfg.strat === 'mix' ? p.strat : cfg.strat === 'good' ? 0 : cfg.strat === 'avg' ? 1 : 2; res.strat[i] = st; prio.push(PRIORITY(RTYPES[p.arch], p.attrs)); });
  const credit = (ri: number, i: number, raw: number, cap: number, maxGain = Infinity) => { const k = ri * NATTR + i; const p = prog[k] + raw; let g = Math.floor((p + 1e-9) / TH); g = Math.min(g, Math.max(0, cap - A[k]), maxGain); A[k] += g; prog[k] = Math.max(0, p - g * TH); };
  const taper = (v: number) => Math.max(0, Math.min(1, (cfg.capNonPerf - v) / 15));
  for (let s = 1; s <= S; s++) {
    const age = cfg.startAge + s - 1;
    for (let ri = 0; ri < n; ri++) { res.snaps.set(A.subarray(ri * NATTR, ri * NATTR + NATTR), (ri * (S + 1) + s - 1) * NATTR); res.league[ri * S + s - 1] = L[ri]; score[ri] = 0; cnt[ri] = 0; }
    for (let ri = 0; ri < n; ri++) {
      const p = pop[ri], base = ri * NATTR, t = RTYPES[p.arch], st = res.strat[ri];
      const po = p.hidden[0], tr = p.hidden[1], pr = p.hidden[2], rec = p.hidden[3], vit = p.hidden[4];
      const cap0 = capOf(po, cfg), tau = tauE(tr), pi = piE(pr), rho = rhoE(rec), al = ageFactor(age);
      const spd = cfg.capMode === 'none' ? 0.5 + po / 100 : 1;
      if (cfg.decline) { const onset = 29 + Math.floor((vit - 1) / 25); if (age >= onset) { const loss = 0.8 + 0.4 * (age - onset); for (const i of PERF_IDX) { const f = i === IDX.sprint || i === IDX.acceleration ? 1.4 : i === IDX.endurance ? 0.7 : 1; const k = base + i; dprog[k] += loss * f; const g = Math.floor(dprog[k]); if (g > 0) { A[k] = Math.max(20, A[k] - g); dprog[k] -= g; } } } }
      const lg = LEAGUES[L[ri]], cal = calendar('code', lg), tw = TOUR_WEEKS[cal.tours];
      const msWeek = cfg.ms && s % 2 === 0 && L[ri] >= 2 ? 6 : -1;
      const tw5 = TACT_TYPE_W[t], techFoci = TECH_FOCI[t];
      // season-level choices of the manager
      const pr_ = prio[ri];
      let focus = pr_[0];
      const techPlan = st === 0 && age <= 31 ? cfg.techWeeks : 0; // good manager spends techWeeks per season on technique (1-2 attributes)
      let stagesThisSeason = 0, planIdx = 0, techDone = 0;
      for (let w = 1; w <= 10; w++) {
        const isTour = tw.includes(w) && hu(ri, s * 20 + w, 21, seed) < p.activity;
        if (isTour || w === msWeek) {
          const list = isTour ? kindsOf(w, cal.stages) : [{ km: 150, kind: 'hilly' as const }];
          for (const sg of list) {
            stagesThisSeason++; res.stages[ri]++;
            const size = isTour ? stageSize(sg.km, sg.kind) : 1.0;
            credit(ri, EXP_IDX, cfg.expK * size * taper(A[base + EXP_IDX]), cfg.capNonPerf);
            const tws = TACT_W[sg.kind];
            for (let j = 0; j < 5; j++) { const wt = tw5[j] * tws[j]; if (wt > 0) credit(ri, TACT_IDX[j], cfg.tactK * wt * size * cfg.rhoStage * tau * al * taper(A[base + TACT_IDX[j]]), cfg.capNonPerf); }
            const pk = STAGE_PERF[sg.kind]; let ps = 0; for (const k of pk) ps += A[base + IDX[k]]; ps /= pk.length;
            let ts = 0, tsw = 0; for (let j = 0; j < 5; j++) { ts += tws[j] * A[base + TACT_IDX[j]]; tsw += tws[j]; } ts = tsw > 0 ? ts / tsw : ps;
            const tcw = TECH_W[sg.kind]; let cs = 0, csw = 0; for (let j = 0; j < 6; j++) { cs += tcw[j] * A[base + TECH_IDX[j]]; csw += tcw[j]; } cs = csw > 0 ? cs / csw : ps;
            score[ri] += 0.78 * ps + 0.10 * ts + 0.07 * cs + 0.05 * A[base + EXP_IDX] + 7 * hg(ri, s * 100 + w * 7 + stagesThisSeason, 31, seed); cnt[ri]++;
          }
          continue;
        }
        if (w === 1) continue;
        planIdx++;
        // ---- technical week (manager decision: techPlan weeks per season, first free weeks)
        if (techDone < techPlan) {
          techDone++;
          // 1-2 attributes: odd seasons both weeks on the first focus, even seasons the 2nd week on the second focus
          const k1 = TECH_IDX[techFoci[0]], k2 = TECH_IDX[techFoci[1]]; const two = s % 2 === 0 && techDone === 2;
          const kk = two ? k2 : k1;
          credit(ri, kk, TH * cfg.cT * tau * pi * alphaT(age) * rho * roomT(A[base + kk]), cfg.capNonPerf, 4);
          continue;
        }
        // ---- physical week
        if (st === 2) focus = PERF_IDX[Math.floor(hu(ri, s * 20 + w, 13, seed) * 7)];
        else if (st === 0) { focus = pr_[0]; for (const c of pr_) { if (roomE(cfg.capMode, A[base + c], cap0 - capGap(t, c)) >= 0.25) { focus = c; break; } } } // adaptive: leave a saturated attribute
        else focus = pr_[0]; // average manager: always the archetype main attribute
        const rel = (RELATED[SKILL_ATTRIBUTES[focus]] ?? []).map((k) => IDX[k as keyof typeof IDX]);
        for (const j of PERF_IDX) {
          const wgt = j === focus ? 1 : j === rel[0] ? cfg.wRel[0] : j === rel[1] ? cfg.wRel[1] : j === rel[2] ? cfg.wRel[2] : W_EPS;
          const pts = cfg.cP * spd * wgt * tau * pi * al * rho * roomE(cfg.capMode, A[base + j], cap0 - capGap(t, j));
          const k = base + j; const pp = prog[k] + TH * pts; const gg = Math.min(Math.floor((pp + 1e-9) / TH), Math.max(0, 200 - A[k])); A[k] += gg; prog[k] = Math.max(0, pp - gg * TH);
        }
      }
      res.stagesBySeason[ri * S + s - 1] = stagesThisSeason;
      score[ri] = cnt[ri] > 0 ? score[ri] / cnt[ri] : -999;
      if (A[base + EXP_IDX] >= 200 && res.firstExp200[ri] < 0) res.firstExp200[ri] = age;
      void planIdx;
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
  for (let ri = 0; ri < n; ri++) res.snaps.set(A.subarray(ri * NATTR, ri * NATTR + NATTR), (ri * (S + 1) + S) * NATTR);
  return res;
}
