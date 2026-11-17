/**
 * Career simulation 3 — EXPERIMENTAL. Start at OVR ~75 (Rookie, age 17) -> age 35, league ladder (performance-based promotion/relegation),
 * variants A-D of physical training, EXP race growth (Experience, Tactics), EXP decline with Vitality. Nothing here is production; no DB.
 * PROD pieces reused unchanged: performanceWeekRaw (production formula incl. ageFactor, development room), TECHNICAL_BASE, accumulator threshold 12,
 * 1 season = +1 age (process_season_aging), production calendar (lib/leagues.ts) incl. the working Elite proposal of 4 Tours.
 */
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';
import { LEAGUES } from '@/lib/leagues';
import { TECHNICAL_BASE, TRAINING_GAIN_THRESHOLD as TH, trainabilityFactor, professionalismFactor, ageFactor } from '@/lib/training/config';
import { mulberry32 } from '../rng';
import { performanceWeekRaw, } from '../career/engine';
import { mapHidden } from '../population';
import { IDX, NATTR, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX, TACT_W, TECH_W, STAGE_PERF } from '../career/params';
import { calendar, TOUR_WEEKS, kindsOf, stageSize, TACT_TYPE_W, TECH_FOCI, type RType, RTYPES } from '../career2/model2';
import { ovrProposed, ovrCurrent, physV } from '../career2/ovr2';

export { RTYPES };
export type Variant = 'A' | 'B' | 'C' | 'D';
export interface Cfg3 {
  variant: Variant; mult: number; techMult: number; seasons: number; startAge: number;
  expK: number; tactK: number; capNonPerf: number; ms: boolean; decline: boolean;
  up: number[]; down: number[]; rho: number; rhoStage: number; seed: number;
}
export const DEF3: Cfg3 = {
  variant: 'A', mult: 1, techMult: 1, seasons: 18, startAge: 17, expK: 14, tactK: 6, capNonPerf: 200, ms: true, decline: true,
  up: [0.30, 0.25, 0.20, 0.15, 0], down: [0, 0.10, 0.10, 0.10, 0.15], rho: 0.8, rhoStage: 0.956, seed: 20261116,
};
export const HID = ['potential', 'trainability', 'professionalism', 'recovery', 'vitality'] as const;
export const STRATS = ['dobrá', 'priemerná', 'slabá'] as const;
export const SHARE: Record<RType, number> = { 'Vrchár': 0.20, 'Šprintér': 0.15, 'Časovkár': 0.15, 'Univerzál': 0.25, 'Puncheur': 0.12, 'Rovinár': 0.13 };
export const STRONG: Record<RType, string[]> = { 'Vrchár': ['climbing', 'endurance'], 'Šprintér': ['sprint', 'acceleration'], 'Časovkár': ['timeTrial', 'flat'], 'Univerzál': [], 'Puncheur': ['hills', 'acceleration'], 'Rovinár': ['flat', 'endurance'] };
export const WEAK: Record<RType, string[]> = { 'Vrchár': ['sprint', 'timeTrial'], 'Šprintér': ['climbing', 'endurance'], 'Časovkár': ['hills', 'acceleration'], 'Univerzál': [], 'Puncheur': ['flat', 'timeTrial'], 'Rovinár': ['climbing', 'hills'] };
export const MAIN: Record<RType, string> = { 'Vrchár': 'climbing', 'Šprintér': 'sprint', 'Časovkár': 'timeTrial', 'Univerzál': 'endurance', 'Puncheur': 'hills', 'Rovinár': 'flat' };
/** Related attributes for variant C (after the main focus). */
export const RELATED: Record<string, string[]> = { climbing: ['endurance', 'hills', 'timeTrial'], hills: ['acceleration', 'climbing', 'flat'], flat: ['timeTrial', 'endurance', 'sprint'], sprint: ['acceleration', 'flat', 'hills'], timeTrial: ['endurance', 'flat', 'hills'], endurance: ['timeTrial', 'climbing', 'flat'], acceleration: ['sprint', 'hills', 'flat'] };
const gauss = (r: () => number) => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / 0.7071; };
const clampI = (v: number) => Math.max(1, Math.min(200, Math.round(v)));
export const hu = (a: number, b: number, c: number, seed: number) => mulberry32((Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663) ^ Math.imul(c + 3, 83492791) ^ seed) | 0)();
export const hg = (a: number, b: number, c: number, seed: number) => { const u1 = Math.max(1e-9, hu(a, b, c, seed)), u2 = hu(a, b, c + 100003, seed); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };

export interface Rider3 { arch: number; attrs: Float64Array; hidden: Float64Array; strat: number; activity: number }
/** Start population: mean OVR (proposed formula) ~75 by bisection on the level mean; archetype shapes, hidden 1-100 ~N(50,20), Experience 15-45. ASSUMPTION (no real data at this level). */
export function makePop(n: number, seed: number, mu: number): Rider3[] {
  const r = mulberry32(seed), out: Rider3[] = [];
  for (let id = 0; id < n; id++) {
    let u = r(), arch = 3; for (let k = 0; k < RTYPES.length; k++) { if (u < SHARE[RTYPES[k]]) { arch = k; break; } u -= SHARE[RTYPES[k]]; }
    const t = RTYPES[arch]; const L = mu + 5 * gauss(r), delta = t === 'Univerzál' ? 0 : 8 + 17 * r();
    const a = new Float64Array(NATTR);
    for (const k of PERF_IDX) { const key = SKILL_ATTRIBUTES[k]; a[k] = clampI(L + (STRONG[t].includes(key) ? delta : 0) - (WEAK[t].includes(key) ? 0.7 * delta : 0) + 3 * gauss(r)); }
    const favT = TACT_IDX[TACT_TYPE_W[t].indexOf(Math.max(...TACT_TYPE_W[t]))], favTe = TECH_IDX[TECH_FOCI[t][0]];
    for (const i of TACT_IDX) a[i] = clampI(L - 10 + (i === favT && t !== 'Univerzál' ? 8 : 0) + 4 * gauss(r));
    for (const i of TECH_IDX) a[i] = clampI(L - 10 + (i === favTe && t !== 'Univerzál' ? 8 : 0) + 4 * gauss(r));
    a[EXP_IDX] = clampI(15 + 30 * r());
    const hid = new Float64Array(5); for (let k = 0; k < 5; k++) hid[k] = Math.max(1, Math.min(100, Math.round(50 + 20 * gauss(r))));
    const us = r(), strat = us < 0.5 ? 0 : us < 0.85 ? 1 : 2, ua = r(), activity = ua < 0.15 ? 0.5 : ua < 0.40 ? 0.75 : 1;
    out.push({ arch, attrs: a, hidden: hid, strat, activity });
  }
  return out;
}
export function calibratedMu(seed: number, target = 75): number {
  let lo = 50, hi = 110;
  for (let it = 0; it < 18; it++) { const mid = (lo + hi) / 2; const p = makePop(3000, seed, mid); const m = p.reduce((s, x) => s + ovrProposed(x.attrs), 0) / p.length; if (m < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export interface Res3 {
  cfg: Cfg3; n: number; S: number; snaps: Int16Array; league: Int8Array; stages: Int32Array; stagesBySeason: Int16Array;
  firstExp200: Int16Array; strat: Int8Array; arch: Int8Array; hidden: Float32Array; activity: Float32Array; stretch: Float32Array;
}
export const snap = (r: Res3, ri: number, si: number) => r.snaps.subarray((ri * (r.S + 1) + si) * NATTR, (ri * (r.S + 1) + si + 1) * NATTR);

export function runCareer3(pop: readonly Rider3[], cfg: Cfg3): Res3 {
  const n = pop.length, S = cfg.seasons, seed = cfg.seed;
  const res: Res3 = { cfg, n, S, snaps: new Int16Array(n * (S + 1) * NATTR), league: new Int8Array(n * S), stages: new Int32Array(n), stagesBySeason: new Int16Array(n * S), firstExp200: new Int16Array(n).fill(-1),
    strat: new Int8Array(n), arch: new Int8Array(n), hidden: new Float32Array(n * 5), activity: new Float32Array(n), stretch: new Float32Array(n).fill(1) };
  const A = new Float64Array(n * NATTR), prog = new Float64Array(n * NATTR), dprog = new Float64Array(n * NATTR), L = new Int8Array(n), score = new Float64Array(n), cnt = new Int32Array(n);
  pop.forEach((p, i) => { A.set(p.attrs, i * NATTR); res.strat[i] = p.strat; res.arch[i] = p.arch; res.activity[i] = p.activity; for (let k = 0; k < 5; k++) res.hidden[i * 5 + k] = p.hidden[k]; });
  if (cfg.variant === 'D') { // hidden traits matter more: log-linear in the standardised hidden composite, rescaled to the SAME mean budget as B
    const hs = pop.map((p) => (0.4 * p.hidden[1] + 0.3 * p.hidden[2] + 0.3 * p.hidden[0]) / 100); const m = hs.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(hs.reduce((a, b) => a + (b - m) ** 2, 0) / n);
    const raw = hs.map((h) => Math.max(0.3, Math.min(3, Math.exp(0.45 * ((h - m) / sd))))); const mm = raw.reduce((a, b) => a + b, 0) / n; raw.forEach((v, i) => { res.stretch[i] = v / mm; });
  }
  const credit = (ri: number, i: number, raw: number, cap: number, maxGain = Infinity) => {
    const k = ri * NATTR + i; const p = prog[k] + raw; let g = Math.floor((p + 1e-9) / TH); g = Math.min(g, Math.max(0, cap - A[k]), maxGain); A[k] += g; prog[k] = Math.max(0, p - g * TH);
  };
  const taper = (v: number) => Math.max(0, Math.min(1, (cfg.capNonPerf - v) / 15));
  for (let s = 1; s <= S; s++) {
    const age = cfg.startAge + s - 1;
    for (let ri = 0; ri < n; ri++) { res.snaps.set(A.subarray(ri * NATTR, ri * NATTR + NATTR), (ri * (S + 1) + s - 1) * NATTR); res.league[ri * S + s - 1] = L[ri]; score[ri] = 0; cnt[ri] = 0; }
    for (let ri = 0; ri < n; ri++) {
      const p = pop[ri], base = ri * NATTR, t = RTYPES[p.arch];
      const tr = mapHidden(p.hidden[1], 'rescaled'), pr = mapHidden(p.hidden[2], 'rescaled'), po = mapHidden(p.hidden[0], 'rescaled');
      const trF = trainabilityFactor(tr), prF = professionalismFactor(pr);
      // --- EXP decline (Vitality shifts the onset 29..33), applied to the 7 Performance attributes at season start
      if (cfg.decline) {
        const onset = 29 + Math.floor((p.hidden[4] - 1) / 25);
        if (age >= onset) { const loss = 0.8 + 0.4 * (age - onset); for (const i of PERF_IDX) { const f = i === IDX.sprint || i === IDX.acceleration ? 1.4 : i === IDX.endurance ? 0.7 : 1; const k = base + i; dprog[k] += loss * f; const g = Math.floor(dprog[k]); if (g > 0) { A[k] = Math.max(20, A[k] - g); dprog[k] -= g; } } }
      }
      const lg = LEAGUES[L[ri]], cal = calendar('code', lg), tw = TOUR_WEEKS[cal.tours];
      const msWeek = cfg.ms && s % 2 === 0 && L[ri] >= 2 ? 6 : -1; // ASSUMPTION: MS starters = Continental+ riders
      // focus for this season
      let mainKey = MAIN[t]; let focus = IDX[mainKey as keyof typeof IDX];
      if (t === 'Univerzál') { focus = PERF_IDX[0]; for (const i of PERF_IDX) if (A[base + i] < A[base + focus]) focus = i; }
      if (p.strat === 1 && hu(ri, s, 11, seed) < 0.3) focus = PERF_IDX[Math.floor(hu(ri, s, 12, seed) * 7)];
      const tw5 = TACT_TYPE_W[t]; const techFoci = TECH_FOCI[t]; let techToggle = 0, cyc = 0, planIdx = 0;
      let stagesThisSeason = 0;
      for (let w = 1; w <= 10; w++) {
        const isTour = tw.includes(w) && hu(ri, s * 20 + w, 21, seed) < p.activity;
        if (isTour || w === msWeek) {
          const list = isTour ? kindsOf(w, cal.stages) : [{ km: 150, kind: 'hilly' as const }];
          for (const st of list) {
            stagesThisSeason++; res.stages[ri]++;
            const size = isTour ? stageSize(st.km, st.kind) : 1.0;
            credit(ri, EXP_IDX, cfg.expK * size * taper(A[base + EXP_IDX]), cfg.capNonPerf);
            const tws = TACT_W[st.kind];
            for (let j = 0; j < 5; j++) { const wt = tw5[j] * tws[j]; if (wt > 0) credit(ri, TACT_IDX[j], cfg.tactK * wt * size * cfg.rhoStage * trF * ageFactor(age) * taper(A[base + TACT_IDX[j]]), cfg.capNonPerf); }
            // stage result index (NOT OVR): attributes relevant to the stage kind, tactics/technique weighted by the stage, small experience term, daily luck
            const pk = STAGE_PERF[st.kind]; let ps = 0; for (const k of pk) ps += A[base + IDX[k]]; ps /= pk.length;
            let ts = 0, tsw = 0; for (let j = 0; j < 5; j++) { ts += tws[j] * A[base + TACT_IDX[j]]; tsw += tws[j]; } ts = tsw > 0 ? ts / tsw : ps;
            const tcw = TECH_W[st.kind]; let cs = 0, csw = 0; for (let j = 0; j < 6; j++) { cs += tcw[j] * A[base + TECH_IDX[j]]; csw += tcw[j]; } cs = csw > 0 ? cs / csw : ps;
            score[ri] += 0.78 * ps + 0.10 * ts + 0.07 * cs + 0.05 * A[base + EXP_IDX] + 7 * hg(ri, s * 100 + w * 7 + stagesThisSeason, 31, seed); cnt[ri]++;
          }
          continue;
        }
        if (w === 1) continue;
        // ---- training week (PROD formulas, constant readiness; EXP multipliers by variant)
        const good = p.strat === 0; const technical = good && cyc % 3 === 2; cyc++; planIdx++;
        if (technical) { const idx = TECH_IDX[techFoci[techToggle++ % 2]]; credit(ri, idx, TECHNICAL_BASE * cfg.techMult * trF * prF * ageFactor(age) * cfg.rho, cfg.capNonPerf, 1); continue; }
        const rho = cfg.rho + (cfg.variant === 'D' ? 0.1 * (p.hidden[3] - 50) / 50 : 0);
        const f = p.strat === 2 ? PERF_IDX[Math.floor(hu(ri, s * 20 + w, 13, seed) * 7)] : focus;
        const fac = cfg.mult * res.stretch[ri];
        const att = A.subarray(base, base + NATTR);
        const mk = (fi: number) => performanceWeekRaw({ att, focus: fi, intensity: 'normal', tr, pr, po, poRaw: po, age, facility: fac, model: 'existing' });
        const g = mk(f);
        const perfCredit = (i: number, raw: number) => { const k = base + i; const pp = prog[k] + raw; const gg = Math.min(Math.floor((pp + 1e-9) / TH), Math.max(0, 200 - A[k])); A[k] += gg; prog[k] = Math.max(0, pp - gg * TH); };
        if (cfg.variant === 'C') {
          perfCredit(f, g.primary * 0.60 * rho);
          const rel = RELATED[SKILL_ATTRIBUTES[f]] ?? []; for (const key of rel) { const j = IDX[key as keyof typeof IDX]; perfCredit(j, mk(j).primary * 0.25 * rho); }
        } else { perfCredit(f, g.primary * rho); if (g.secIdx >= 0 && g.secondary > 0) perfCredit(g.secIdx, g.secondary * rho); }
      }
      res.stagesBySeason[ri * S + s - 1] = stagesThisSeason;
      score[ri] = cnt[ri] > 0 ? score[ri] / cnt[ri] : -999;
      if (A[base + EXP_IDX] >= 200 && res.firstExp200[ri] < 0) res.firstExp200[ri] = age;
    }
    // ---- promotion / relegation by SPORT RESULT (season mean stage index), never by OVR. ASSUMPTION: counts are not approved (ZONE_RULES null).
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
export const metrics3 = (x: ArrayLike<number>) => ({ ovr: ovrProposed(x), ovrOld: ovrCurrent(x), V: physV(x), S: x[EXP_IDX] });
