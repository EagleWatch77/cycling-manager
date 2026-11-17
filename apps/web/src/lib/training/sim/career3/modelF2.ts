/**
 * MODEL F2 (EXPERIMENTAL, nothing in production). Corrections of model F (C-075):
 *  1) SHARED training capacity: each training week has capacity 1 (Full) or 0.75 (Basic; the other 0.25 is regeneration).
 *     The active capacity is split physical `sp` / technical `1-sp` (75/25, 80/20, 85/15). Points per week:
 *        physical_j = coefP_j(plan) x cPhys x a x sp   x eff x G x alpha(age) x room_j
 *        technical_k = coefT_k(plan) x cTech x a x (1-sp) x eff x G x (1+alpha)/2 x roomT_k          (a = 1 or 0.75)
 *     cPhys = 2.5, cTech = 7.5 are "per FULL capacity" coefficients, so the 80/20 split gives exactly the absolute increments of model F (2.0 x / 1.5 x raw).
 *  2) Energy / Fatigue use the PRODUCTION model: Energy, Fatigue 0..100, readiness = (Energy + (100 - Fatigue)) / 2 -> effectiveness 1.00/.95/.85/.70/.50 (PROD),
 *     weekly deltas of production intensities: Full = 'hard' (cost 15, fatigue +18, 4 recovery days), Basic = 'normal' (cost 10, fatigue +10, 5 recovery days),
 *     recovery day +5 Energy / -4 Fatigue x recovery multiplier (PROD). Race (Tour stage) load and race-week recovery are EXP (production has no race-recovery event yet).
 *  3) Accumulator at the attribute cap: stored progress is DISCARDED at 200 (`accBug: true` reproduces model F, where it kept growing without limit).
 *  7 plans = the 7 production generation shapes (lib/rider/config.ts SHAPES): Vrchar(climber) Sprinter Casovkar(timeTrial) Puncheur Klasikar(classics) Unikar(rouleur) Univerzal(allrounder).
 */
import { LEAGUES } from '@/lib/leagues';
import { ageFactor } from '@/lib/training/config';
import { IDX, NATTR, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX, TACT_W, TECH_W, STAGE_PERF } from '../career/params';
import { calendar, TOUR_WEEKS, kindsOf, stageSize } from '../career2/model2';
import { mulberry32 } from '../rng';
import { hu, hg, type Rider3 } from './model3';
import { roomE, roomT, tauE, type CapMode } from './modelE';

export const NAMES2 = ['Vrchár', 'Šprintér', 'Časovkár', 'Puncheur', 'Klasikár', 'Únikár', 'Univerzál'] as const;
type K = keyof typeof IDX;
/** Shape definitions copied from production SHAPES (strong/weak by attribute group). */
export interface ShapeDef { name: string; shape: string; sPhys: K[]; wPhys: K[]; sTact: K[]; sTech: K[] }
export const SHAPES2: ShapeDef[] = [
  { name: 'Vrchár', shape: 'climber', sPhys: ['climbing', 'hills', 'acceleration'], wPhys: ['flat', 'sprint'], sTact: [], sTech: [] },
  { name: 'Šprintér', shape: 'sprinter', sPhys: ['sprint', 'flat', 'acceleration'], wPhys: ['climbing', 'hills'], sTact: [], sTech: [] },
  { name: 'Časovkár', shape: 'timeTrial', sPhys: ['timeTrial', 'flat', 'endurance'], wPhys: ['climbing', 'sprint'], sTact: ['energyManagement'], sTech: [] },
  { name: 'Puncheur', shape: 'puncheur', sPhys: ['hills', 'acceleration'], wPhys: ['flat', 'endurance'], sTact: ['attackTiming', 'reaction'], sTech: [] },
  { name: 'Klasikár', shape: 'classics', sPhys: [], wPhys: ['climbing', 'sprint'], sTact: ['positioning'], sTech: ['roughSurface', 'packRiding', 'bikeHandling', 'wetHandling'] },
  { name: 'Únikár', shape: 'rouleur', sPhys: ['flat', 'endurance'], wPhys: ['climbing', 'hills'], sTact: ['positioning', 'breakawaySkill'], sTech: [] },
  { name: 'Univerzál', shape: 'allrounder', sPhys: ['endurance'], wPhys: [], sTact: ['positioning'], sTech: [] },
];
/** Tactical type weights (order positioning, attackTiming, reaction, energyManagement, breakawaySkill); EXP. */
export const TACT_TYPE_W2: number[][] = [[0.4, 1.0, 0.4, 0.8, 0.3], [1.0, 0.5, 0.9, 0.3, 0.2], [0.5, 0.2, 0.3, 1.0, 0.8], [0.5, 0.9, 1.0, 0.4, 0.6], [1.0, 0.4, 0.6, 0.5, 0.4], [0.7, 0.3, 0.5, 0.8, 1.0], [0.6, 0.6, 0.6, 0.6, 0.6]];
/** PLANS: 3 physical (ordered: coefficient 1st/2nd/3rd) + 2 technical (TECH order: descending, bikeHandling, cornering, packRiding, wetHandling, roughSurface). */
export interface Plan { name: string; phys: number[]; tech: number[]; neigh: number[]; src: string }
const ph = (a: K[]) => a.map((k) => IDX[k]);
export const PLANS2: Plan[] = [
  { name: 'Vrchár', phys: ph(['climbing', 'hills', 'acceleration']), tech: [TECH_IDX[0], TECH_IDX[2]], neigh: [3, 6], src: 'fyzika: strong shape climber (PROD); technika: návrh' },
  { name: 'Šprintér', phys: ph(['sprint', 'flat', 'acceleration']), tech: [TECH_IDX[3], TECH_IDX[1]], neigh: [3, 4], src: 'fyzika: strong shape sprinter (PROD); technika: návrh' },
  { name: 'Časovkár', phys: ph(['timeTrial', 'flat', 'endurance']), tech: [TECH_IDX[1], TECH_IDX[2]], neigh: [5, 6], src: 'fyzika: strong shape timeTrial (PROD); technika: návrh' },
  { name: 'Puncheur', phys: ph(['hills', 'acceleration', 'climbing']), tech: [TECH_IDX[2], TECH_IDX[1]], neigh: [0, 1], src: 'fyzika: strong hills, acceleration (PROD) + climbing (mapa RELATED); technika: návrh' },
  { name: 'Klasikár', phys: ph(['flat', 'hills', 'endurance']), tech: [TECH_IDX[5], TECH_IDX[3]], neigh: [5, 6], src: 'technika: strong shape classics (PROD, roughSurface, packRiding); fyzika: návrh' },
  { name: 'Únikár', phys: ph(['endurance', 'flat', 'timeTrial']), tech: [TECH_IDX[0], TECH_IDX[1]], neigh: [2, 4], src: 'fyzika: strong shape rouleur flat, endurance (PROD) + timeTrial (RELATED); technika: návrh' },
  { name: 'Univerzál', phys: ph(['endurance', 'flat', 'climbing']), tech: [TECH_IDX[3], TECH_IDX[1]], neigh: [0, 2], src: 'fyzika: strong shape allrounder endurance (PROD) + flat, climbing (návrh); technika: návrh' },
];
/** MODEL F4: EXACT plans from the task (order of physical attributes matters: coefficient 1.15 / 0.95 / 0.75). TECH_IDX order: descending, bikeHandling, cornering, packRiding, wetHandling, roughSurface. */
export const PLANS4: Plan[] = [
  { name: 'Vrchár', phys: ph(['climbing', 'endurance', 'hills']), tech: [TECH_IDX[0], TECH_IDX[2]], neigh: [3, 6], src: 'F4 zadanie' },
  { name: 'Šprintér', phys: ph(['sprint', 'acceleration', 'flat']), tech: [TECH_IDX[3], TECH_IDX[1]], neigh: [3, 4], src: 'F4 zadanie' },
  { name: 'Časovkár', phys: ph(['timeTrial', 'flat', 'endurance']), tech: [TECH_IDX[2], TECH_IDX[1]], neigh: [5, 6], src: 'F4 zadanie' },
  { name: 'Puncheur', phys: ph(['hills', 'acceleration', 'climbing']), tech: [TECH_IDX[2], TECH_IDX[0]], neigh: [0, 1], src: 'F4 zadanie' },
  { name: 'Klasikár', phys: ph(['flat', 'endurance', 'hills']), tech: [TECH_IDX[5], TECH_IDX[4]], neigh: [5, 6], src: 'F4 zadanie' },
  { name: 'Únikár', phys: ph(['endurance', 'flat', 'acceleration']), tech: [TECH_IDX[0], TECH_IDX[1]], neigh: [2, 4], src: 'F4 zadanie' },
  { name: 'Univerzál', phys: ph(['endurance', 'hills', 'flat']), tech: [TECH_IDX[3], TECH_IDX[1]], neigh: [0, 2], src: 'F4 zadanie' },
];
/** the plan with the smallest overlap of physical (then technical) attributes with the natural plan = "unsuitable plan" for the manager-quality test */
export const badPlanOf = (plans: Plan[], arch: number): number => { let best = -1, bs = 1e9; plans.forEach((p, k) => { if (k === arch) return; const ov = p.phys.filter((x) => plans[arch].phys.includes(x)).length * 10 + p.tech.filter((x) => plans[arch].tech.includes(x)).length; if (ov < bs) { bs = ov; best = k; } }); return best; };
const SH_STRONG = SHAPES2.map((s) => s.sPhys.map((k) => IDX[k])), SH_WEAK = SHAPES2.map((s) => s.wPhys.map((k) => IDX[k]));
/** F4 gap: attribute in the natural plan or a shape strength -> 0; shape weakness -> 45; else 20; Univerzal ug everywhere */
export const gapPlan = (plans: Plan[], arch: number, j: number, ug: number): number => (arch === 6 ? ug : plans[arch].phys.includes(j) || SH_STRONG[arch].includes(j) ? 0 : SH_WEAK[arch].includes(j) ? 45 : 20);
export const gap2 = (arch: number, j: number, ug = 15): number => (arch === 6 ? ug : SH_STRONG[arch].includes(j) ? 0 : SH_WEAK[arch].includes(j) ? 45 : 20);

/** ---------- start population: 7 production shapes, uniform; start OVR forced into [70, 80] with mean ~75 for the CHOSEN V formula ---------- */
export const ovrW = (x: ArrayLike<number>, w: number): number => {
  const p = PERF_IDX.map((i) => x[i]).sort((a, b) => b - a), t3 = (p[0] + p[1] + p[2]) / 3, m7 = p.reduce((a, b) => a + b, 0) / 7;
  return Math.max(1, Math.min(200, Math.round(0.6 * (w * t3 + (1 - w) * m7) + 0.15 * Math.max(...TACT_IDX.map((i) => x[i])) + 0.10 * Math.max(...TECH_IDX.map((i) => x[i])) + 0.15 * x[EXP_IDX])));
};
const gauss = (r: () => number) => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / 0.7071; };
const clampI = (v: number) => Math.max(1, Math.min(200, Math.round(v)));
function candidate(r: () => number, mu: number, off: number[]): Rider3 {
  const arch = Math.floor(r() * 7), sd = SHAPES2[arch]; const L = mu + off[arch] + 5 * gauss(r), delta = arch === 6 ? 0 : 8 + 17 * r();
  const a = new Float64Array(NATTR);
  const keyOf = (i: number) => (Object.keys(IDX) as K[]).find((k) => IDX[k] === i)!;
  for (const i of PERF_IDX) { const k = keyOf(i); a[i] = clampI(L + (sd.sPhys.includes(k) ? delta : 0) - (sd.wPhys.includes(k) ? 0.7 * delta : 0) + 3 * gauss(r)); }
  for (const i of TACT_IDX) a[i] = clampI(L - 10 + (sd.sTact.includes(keyOf(i)) ? 8 : 0) + 4 * gauss(r));
  for (const i of TECH_IDX) a[i] = clampI(L - 10 + (sd.sTech.includes(keyOf(i)) ? 8 : 0) + 4 * gauss(r));
  a[EXP_IDX] = clampI(15 + 30 * r());
  const hid = new Float64Array(5); for (let k = 0; k < 5; k++) hid[k] = Math.max(1, Math.min(100, Math.round(50 + 20 * gauss(r))));
  const us = r(), strat = us < 0.5 ? 0 : us < 0.85 ? 1 : 2, ua = r(), activity = ua < 0.15 ? 0.5 : ua < 0.40 ? 0.75 : 1;
  return { arch, attrs: a, hidden: hid, strat, activity };
}
export interface PopInfo { n: number; mu: number; w: number; candidates: number; mean: number; sd: number; min: number; max: number; shareIn: number; archShare: number[]; archMean: number[] }
export function makePop2(n: number, seed: number, w: number, lo = 70, hi = 80, target = 75): { pop: Rider3[]; info: PopInfo } {
  const gen = (mu: number, off: number[], count: number) => { const r = mulberry32(seed), out: Rider3[] = []; let tried = 0; while (out.length < count) { const c = candidate(r, mu, off); tried++; const o = ovrW(c.attrs, w); if (o >= lo && o <= hi) out.push(c); } return { out, tried }; };
  const off = Array(7).fill(0); let mu = 75;
  for (let round = 0; round < 5; round++) {
    let a = 40, b = 110;
    for (let it = 0; it < 18; it++) { const mid = (a + b) / 2; const { out } = gen(mid, off, 2500); const m = out.reduce((s, x) => s + ovrW(x.attrs, w), 0) / out.length; if (m < target) a = mid; else b = mid; }
    mu = (a + b) / 2; const { out } = gen(mu, off, 6000);
    // equalise the start OVR of the 7 shapes (a shape must not start stronger or weaker than the others; EXP design choice of the start population)
    for (let k = 0; k < 7; k++) { const g = out.filter((x) => x.arch === k); const m = g.reduce((s, x) => s + ovrW(x.attrs, w), 0) / Math.max(1, g.length); off[k] -= 0.8 * (m - target); }
  }
  const { out, tried } = gen(mu, off, n); const ov = out.map((x) => ovrW(x.attrs, w)), mean = ov.reduce((s, x) => s + x, 0) / n;
  const archShare = Array.from({ length: 7 }, (_, k) => out.filter((x) => x.arch === k).length / n), archMean = Array.from({ length: 7 }, (_, k) => { const g = out.filter((x) => x.arch === k); return g.reduce((s, x) => s + ovrW(x.attrs, w), 0) / Math.max(1, g.length); });
  return { pop: out, info: { n, mu, w, candidates: tried, mean, sd: Math.sqrt(ov.reduce((s, x) => s + (x - mean) ** 2, 0) / n), min: Math.min(...ov), max: Math.max(...ov), shareIn: ov.filter((x) => x >= lo && x <= hi).length / n, archShare, archMean } };
}

/** ---------- configuration ---------- */
export type ModePolicy = 'full' | 'basic' | 'advisor' | 'calendar' | 'random' | 'f1smart';
export type PlanPolicy = 'fixed' | 'rotate' | 'adaptive' | 'random' | 'youthUniv' | 'bad' | 'avg';
export type EffTable = 'prod' | 'steep';
export type SplitPolicy = 'fixed' | 'youngTech' | 'youngPerf';
export interface CfgF2 {
  plan: PlanPolicy; forcePlan: number; mode: ModePolicy; advMin: number; split: number; splitPolicy: SplitPolicy; tours: 0 | 3 | 4; univDyn: boolean;
  budget: 'shared' | 'free'; energy: 'prod' | 'f1'; accBug: boolean; effTable: EffTable;
  seasons: number; startAge: number; seed: number; capMode: CapMode; capBase: number; capSlope: number;
  cPhys: number; cTech: number; gen: number; coefP: number[]; coefT: number[];
  wTr: number; wPr: number; wPo: number; gMin: number; gMax: number;
  raceE: number; raceF: number; raceRecDays: number; raceLoadMul: number; offE: number; kRace: number; recFac: number;
  qBase: number; qBasic: number; load100: number; loadBasic: number; kF: number; F0: number; effMin: number; offSeason: number; overF: number; overEff: number; f1RaceLoad: number;
  expK: number; tactK: number; capNonPerf: number; ms: boolean; decline: boolean; up: number[]; down: number[]; rhoStage: number;
  capExp: number; plans: Plan[]; gapMode: 'shape' | 'plan'; univGap: number; univPlan: 'std' | 'even'; tours4From: number; recMap: 'narrow' | 'wide';
  forceHidden?: Partial<Record<'po' | 'tr' | 'pr' | 'rec' | 'vit', number>>;
}
export const DEF2: CfgF2 = {
  plan: 'fixed', forcePlan: -1, mode: 'advisor', advMin: 60, split: 0.8, splitPolicy: 'fixed', tours: 3, univDyn: false, budget: 'shared', energy: 'prod', accBug: false, effTable: 'prod',
  seasons: 18, startAge: 17, seed: 20261116, capMode: 'soft', capBase: 130, capSlope: 1.0, cPhys: 1.8, cTech: 6.5, gen: 0.35, coefP: [1.15, 0.95, 0.75], coefT: [0.85, 0.45],
  wTr: 0.30, wPr: 0.15, wPo: 0.10, gMin: 0.6, gMax: 1.5, raceE: 7, raceF: 8, raceRecDays: 2, raceLoadMul: 1, offE: 50, kRace: 0.15, recFac: 1,
  qBase: 0.50, qBasic: 0.18, load100: 14, loadBasic: 10.5, kF: 0.020, F0: 15, effMin: 0.35, offSeason: 0.25, overF: 80, overEff: 0.6, f1RaceLoad: 7,
  expK: 14, tactK: 12, capNonPerf: 200, ms: true, decline: true, up: [0.30, 0.25, 0.20, 0.15, 0], down: [0, 0.10, 0.10, 0.10, 0.15], rhoStage: 0.956,
  capExp: 1, plans: PLANS2, gapMode: 'shape', univGap: 15, univPlan: 'std', tours4From: 99, recMap: 'narrow',
};
/** MODEL F3: Potential is NOT a training multiplier any more (wPo 0): it only sets the soft long-term cap (capBase + capSlope x Potential). Trainability sets the speed (wTr). */
export const DEF3: CfgF2 = { ...DEF2, wPo: 0 };
/** MODEL F4 defaults: exact plans, gaps follow the plan, Univerzal gap 10, Potential only as cap. */
export const DEF4: CfgF2 = { ...DEF3, plans: PLANS4, gapMode: 'plan', univGap: 10 };
/** Model F (C-075) behaviour on the F2 population: free technique (no capacity split), F energy, accumulator without limit at the cap. */
export const F1LIKE: Partial<CfgF2> = { budget: 'free', energy: 'f1', accBug: true, mode: 'f1smart', cPhys: 2.0, cTech: 1.5 };
const TH = 12;
const EVEN = (1.15 + 0.95 + 0.75 + 4 * 0.35) / 7;
export const gMod2 = (c: CfgF2, tr: number, pr: number, po: number) => Math.max(c.gMin, Math.min(c.gMax, 1 + c.wTr * (tr - 50) / 50 + c.wPr * (pr - 50) / 50 + c.wPo * (po - 50) / 50));
export const recMod2 = (rec: number, m: 'narrow' | 'wide' = 'narrow') => (m === 'wide' ? 0.6 + 0.8 * rec / 100 : 0.75 + 0.5 * rec / 100);
/** PROD readiness (lib/training/readiness.ts) */
export const readiness = (E: number, Fa: number) => (E + (100 - Fa)) / 2;
export const readEff = (s: number, t: EffTable = 'prod') => (t === 'prod' ? (s >= 80 ? 1.0 : s >= 60 ? 0.95 : s >= 40 ? 0.85 : s >= 20 ? 0.70 : 0.50) : (s >= 80 ? 1.0 : s >= 60 ? 0.90 : s >= 40 ? 0.70 : s >= 20 ? 0.45 : 0.25)); /* 'steep' = EXP proposal */
export const effF1 = (c: CfgF2, F: number) => { let e = Math.max(c.effMin, Math.min(1, 1 - c.kF * Math.max(0, F - c.F0))); if (F > c.overF) e *= c.overEff; return e; };
/** physical attribute order for a plan (Univerzál may be dynamic: endurance + the two currently weakest of the other attributes) */
function physOf(cfg: CfgF2, plan: number, a: Float64Array, base: number): number[] {
  if (plan === 6 && cfg.univDyn) { const rest = PERF_IDX.filter((k) => k !== IDX.endurance).sort((x, y) => a[base + x] - a[base + y]); return [IDX.endurance, rest[0], rest[1]]; }
  return cfg.plans[plan].phys;
}

export const gapF = (cfg: CfgF2, arch: number, j: number): number => (cfg.gapMode === 'plan' ? gapPlan(cfg.plans, arch, j, cfg.univGap) : gap2(arch, j, cfg.univGap));
export interface ResF2 {
  cfg: CfgF2; n: number; S: number; snaps: Int16Array; league: Int8Array; stages: Int32Array; firstExp200: Int16Array; arch: Int8Array; hidden: Float32Array; activity: Float32Array; strat: Int8Array;
  first200: Int8Array; n200: Int8Array; banked: Float32Array; maxProg: Float32Array; readMean: Float32Array; readAfterTour: Float32Array; readTourStart: Float32Array; basicShare: Float32Array; effMean: Float32Array; weeksTrain: Float32Array; low60: Float32Array; low40: Float32Array;
}
export const snap2 = (r: ResF2, ri: number, si: number) => r.snaps.subarray((ri * (r.S + 1) + si) * NATTR, (ri * (r.S + 1) + si + 1) * NATTR);

export function runCareerF2(pop: readonly Rider3[], cfg: CfgF2): ResF2 {
  const n = pop.length, S = cfg.seasons, seed = cfg.seed;
  const res: ResF2 = { cfg, n, S, snaps: new Int16Array(n * (S + 1) * NATTR), league: new Int8Array(n * S), stages: new Int32Array(n), firstExp200: new Int16Array(n).fill(-1), arch: new Int8Array(n), hidden: new Float32Array(n * 5), activity: new Float32Array(n), strat: new Int8Array(n),
    first200: new Int8Array(n).fill(-1), n200: new Int8Array(n), banked: new Float32Array(n), maxProg: new Float32Array(n), readMean: new Float32Array(n), readAfterTour: new Float32Array(n), readTourStart: new Float32Array(n), basicShare: new Float32Array(n), effMean: new Float32Array(n), weeksTrain: new Float32Array(n), low60: new Float32Array(n), low40: new Float32Array(n) };
  const A = new Float64Array(n * NATTR), prog = new Float64Array(n * NATTR), dprog = new Float64Array(n * NATTR), L = new Int8Array(n), score = new Float64Array(n), cnt = new Int32Array(n);
  const En = new Float64Array(n).fill(100), Fa = new Float64Array(n), Fat1 = new Float64Array(n), hid = new Float64Array(n * 5);
  const l60 = new Int32Array(n), l40 = new Int32Array(n), tsS = new Float64Array(n), tsN = new Int32Array(n), rS = new Float64Array(n), rN = new Int32Array(n), tS = new Float64Array(n), tN = new Int32Array(n), bN = new Int32Array(n), wN = new Int32Array(n), eS = new Float64Array(n);
  pop.forEach((p, i) => { A.set(p.attrs, i * NATTR); res.arch[i] = p.arch; res.activity[i] = p.activity; res.strat[i] = p.strat; for (let k = 0; k < 5; k++) { const fh = cfg.forceHidden ? [cfg.forceHidden.po, cfg.forceHidden.tr, cfg.forceHidden.pr, cfg.forceHidden.rec, cfg.forceHidden.vit][k] : undefined; hid[i * 5 + k] = fh ?? p.hidden[k]; res.hidden[i * 5 + k] = hid[i * 5 + k]; } });
  /** accumulator: points -> attribute. Fixed version discards progress at the cap (accBug keeps it growing, as in model F). */
  const credit = (ri: number, i: number, raw: number, cap: number, maxGain = Infinity) => {
    const k = ri * NATTR + i; const p = prog[k] + raw; let g = Math.floor((p + 1e-9) / TH); g = Math.min(g, Math.max(0, cap - A[k]), maxGain); A[k] += g; prog[k] = Math.max(0, p - g * TH);
    if (!cfg.accBug && A[k] >= cap) prog[k] = 0;
    if (prog[k] > res.maxProg[ri]) res.maxProg[ri] = prog[k];
  };
  const taper = (v: number) => Math.max(0, Math.min(1, (cfg.capNonPerf - v) / 15));
  for (let s = 1; s <= S; s++) {
    const age = cfg.startAge + s - 1;
    for (let ri = 0; ri < n; ri++) { res.snaps.set(A.subarray(ri * NATTR, ri * NATTR + NATTR), (ri * (S + 1) + s - 1) * NATTR); res.league[ri * S + s - 1] = L[ri]; score[ri] = 0; cnt[ri] = 0; }
    for (let ri = 0; ri < n; ri++) {
      const p = pop[ri], base = ri * NATTR, arch = p.arch;
      const po = hid[ri * 5], tr = hid[ri * 5 + 1], pr = hid[ri * 5 + 2], rec = hid[ri * 5 + 3], vit = hid[ri * 5 + 4];
      const G = gMod2(cfg, tr, pr, po), al = ageFactor(age), alT = (1 + al) / 2, rm = recMod2(rec, cfg.recMap) * cfg.recFac, loadMul = 1.15 - 0.3 * vit / 100, cap0 = cfg.capBase + (cfg.capExp === 1 ? cfg.capSlope * po : cfg.capSlope * 100 * Math.pow(po / 100, cfg.capExp));
      En[ri] = Math.min(100, En[ri] + cfg.offE); Fa[ri] = Math.max(0, Fa[ri] - cfg.offE); Fat1[ri] *= cfg.offSeason;
      if (cfg.decline) {
        const onset = 29 + Math.floor((vit - 1) / 25);
        if (age >= onset) { const loss = 0.8 + 0.4 * (age - onset); for (const i of PERF_IDX) { const f = i === IDX.sprint || i === IDX.acceleration ? 1.4 : i === IDX.endurance ? 0.7 : 1; const k = base + i; res.banked[ri] += Math.floor(prog[k] / TH); dprog[k] += loss * f; const g = Math.floor(dprog[k]); if (g > 0) { A[k] = Math.max(20, A[k] - g); dprog[k] -= g; } } }
      }
      const lg = LEAGUES[L[ri]], cal = calendar('code', lg), tw = TOUR_WEEKS[L[ri] >= cfg.tours4From ? 4 : (cfg.tours || cal.tours)];
      const msWeek = cfg.ms && s % 2 === 0 && L[ri] >= 2 ? 6 : -1;
      const tw5 = TACT_TYPE_W2[arch];
      let planIdx = arch;
      if (cfg.forcePlan >= 0) planIdx = cfg.forcePlan;
      else if (cfg.plan === 'rotate') planIdx = s % 3 === 0 ? cfg.plans[arch].neigh[0] : s % 3 === 2 && s > 4 ? cfg.plans[arch].neigh[1] : arch;
      else if (cfg.plan === 'youthUniv') planIdx = s <= 3 ? 6 : arch;
      else if (cfg.plan === 'bad') planIdx = badPlanOf(cfg.plans, arch);
      else if (cfg.plan === 'avg') planIdx = hu(ri, s, 77, seed) < 0.70 ? arch : (arch + 1 + Math.floor(hu(ri, s, 78, seed) * 6)) % 7;
      let stages = 0, sinceTour = 9;
      for (let w = 1; w <= 10; w++) {
        const isTour = tw.includes(w) && hu(ri, s * 20 + w, 21, seed) < p.activity;
        if (isTour || w === msWeek) {
          const list = isTour ? kindsOf(w, cal.stages) : [{ km: 150, kind: 'hilly' as const }];
          if (isTour) { tsS[ri] += cfg.energy === 'prod' ? readiness(En[ri], Fa[ri]) : 100 - Fat1[ri]; tsN[ri]++; const R0 = cfg.energy === 'prod' ? readiness(En[ri], Fa[ri]) : 100 - Fat1[ri]; if (R0 < 60) l60[ri]++; if (R0 < 40) l40[ri]++; }
          for (const sg of list) {
            stages++; res.stages[ri]++;
            const size = isTour ? stageSize(sg.km, sg.kind) : 1.0;
            if (cfg.energy === 'prod') { En[ri] = Math.max(0, En[ri] - cfg.raceE * size * cfg.raceLoadMul * loadMul); Fa[ri] = Math.min(100, Fa[ri] + cfg.raceF * size * cfg.raceLoadMul * loadMul); } else Fat1[ri] += cfg.f1RaceLoad * size * loadMul;
            credit(ri, EXP_IDX, cfg.expK * size * taper(A[base + EXP_IDX]), cfg.capNonPerf);
            const tws = TACT_W[sg.kind];
            for (let j = 0; j < 5; j++) { const wt = tw5[j] * tws[j]; if (wt > 0) credit(ri, TACT_IDX[j], cfg.tactK * wt * size * cfg.rhoStage * tauE(tr) * al * taper(A[base + TACT_IDX[j]]), cfg.capNonPerf); }
            const pk = STAGE_PERF[sg.kind]; let ps = 0; for (const k of pk) ps += A[base + IDX[k]]; ps /= pk.length;
            let ts = 0, tsw = 0; for (let j = 0; j < 5; j++) { ts += tws[j] * A[base + TACT_IDX[j]]; tsw += tws[j]; } ts = tsw > 0 ? ts / tsw : ps;
            const tcw = TECH_W[sg.kind]; let cs = 0, csw = 0; for (let j = 0; j < 6; j++) { cs += tcw[j] * A[base + TECH_IDX[j]]; csw += tcw[j]; } cs = csw > 0 ? cs / csw : ps;
            const pen = cfg.energy === 'prod' ? cfg.kRace * Math.max(0, 80 - readiness(En[ri], Fa[ri])) : cfg.kRace * Math.max(0, Fat1[ri] - 25);
            score[ri] += 0.78 * ps + 0.10 * ts + 0.07 * cs + 0.05 * A[base + EXP_IDX] - pen + 7 * hg(ri, s * 100 + w * 7 + stages, 31, seed); cnt[ri]++;
          }
          if (cfg.energy === 'prod') { En[ri] = Math.min(100, En[ri] + cfg.raceRecDays * 5 * rm); Fa[ri] = Math.max(0, Fa[ri] - cfg.raceRecDays * 4 * rm); } else Fat1[ri] *= (1 - 0.125 * rm);
          if (isTour) { tS[ri] += cfg.energy === 'prod' ? readiness(En[ri], Fa[ri]) : 100 - Fat1[ri]; tN[ri]++; }
          sinceTour = 0; continue;
        }
        if (w === 1) { sinceTour++; continue; }
        // ---- training week (manager decisions: plan, mode, split). A recommendation is computed from the visible state only.
        const R = cfg.energy === 'prod' ? readiness(En[ri], Fa[ri]) : 100 - Fat1[ri];
        let basic = false;
        switch (cfg.mode) {
          case 'basic': basic = true; break;
          case 'advisor': basic = R < cfg.advMin; break;
          case 'calendar': basic = sinceTour < 2; break;
          case 'random': basic = hu(ri, s * 20 + w, 41, seed) < 0.5; break;
          case 'f1smart': basic = Fat1[ri] > 25; break;
          default: basic = false;
        }
        let pl = planIdx;
        if (cfg.forcePlan < 0 && cfg.plan === 'random') pl = Math.floor(hu(ri, s * 20 + w, 13, seed) * 7);
        else if (cfg.forcePlan < 0 && cfg.plan === 'adaptive') { let best = arch, bs = -1; for (const c of [arch, ...cfg.plans[arch].neigh]) { const pp = cfg.plans[c].phys; const sc = roomE(cfg.capMode, A[base + pp[0]], cap0 - gapF(cfg, arch, pp[0])) + 0.5 * roomE(cfg.capMode, A[base + pp[1]], cap0 - gapF(cfg, arch, pp[1])) + (c === arch ? 0.25 : 0); if (sc > bs) { bs = sc; best = c; } } pl = best; }
        const plan = cfg.plans[pl], phys = physOf(cfg, pl, A, base);
        const a = basic ? 0.75 : 1.0;
        let sp = cfg.split; if (cfg.splitPolicy === 'youngTech') sp = age <= 22 ? 0.75 : 0.85; else if (cfg.splitPolicy === 'youngPerf') sp = age <= 22 ? 0.85 : 0.75;
        const eff = cfg.energy === 'prod' ? readEff(R, cfg.effTable) : effF1(cfg, Fat1[ri]);
        rS[ri] += R; rN[ri]++; eS[ri] += eff; wN[ri]++; if (basic) bN[ri]++;
        const shP = cfg.budget === 'shared' ? sp : 1, shT = cfg.budget === 'shared' ? 1 - sp : 1;
        for (const j of PERF_IDX) {
          const rank = phys.indexOf(j); const coef = pl === 6 && cfg.univPlan === 'even' ? EVEN : rank >= 0 ? cfg.coefP[rank] : cfg.gen;
          const pts = coef * cfg.cPhys * a * shP * eff * G * al * roomE(cfg.capMode, A[base + j], cap0 - gapF(cfg, arch, j));
          credit(ri, j, TH * pts, 200);
        }
        for (let r = 0; r < 2; r++) { const kk = plan.tech[r]; credit(ri, kk, TH * cfg.coefT[r] * cfg.cTech * a * shT * eff * G * alT * roomT(A[base + kk]), cfg.capNonPerf, 4); }
        // state update
        if (cfg.energy === 'prod') {
          if (basic) { En[ri] = Math.max(0, Math.min(100, En[ri] - 10 + 5 * 5 * rm)); Fa[ri] = Math.max(0, Math.min(100, Fa[ri] + 10 - 5 * 4 * rm)); }
          else { En[ri] = Math.max(0, Math.min(100, En[ri] - 15 + 4 * 5 * rm)); Fa[ri] = Math.max(0, Math.min(100, Fa[ri] + 18 - 4 * 4 * rm)); }
        } else { const q = Math.min(0.9, cfg.qBase * rm + (basic ? cfg.qBasic : 0)); Fat1[ri] = Fat1[ri] * (1 - q) + (basic ? cfg.loadBasic : cfg.load100) * loadMul; }
        if (res.first200[ri] < 0) for (const j of PERF_IDX) if (A[base + j] >= 200) { res.first200[ri] = age; break; }
        sinceTour++;
      }
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
  for (let ri = 0; ri < n; ri++) { res.snaps.set(A.subarray(ri * NATTR, ri * NATTR + NATTR), (ri * (S + 1) + S) * NATTR); res.readMean[ri] = rN[ri] ? rS[ri] / rN[ri] : 0; res.readTourStart[ri] = tsN[ri] ? tsS[ri] / tsN[ri] : 0; res.readAfterTour[ri] = tN[ri] ? tS[ri] / tN[ri] : 0; res.basicShare[ri] = wN[ri] ? bN[ri] / wN[ri] : 0; res.effMean[ri] = wN[ri] ? eS[ri] / wN[ri] : 0; res.weeksTrain[ri] = wN[ri] / S; res.low60[ri] = tsN[ri] ? l60[ri] / tsN[ri] : 0; res.low40[ri] = tsN[ri] ? l40[ri] / tsN[ri] : 0; let c = 0; for (const j of PERF_IDX) if (A[ri * NATTR + j] >= 200) c++; res.n200[ri] = c; }
  void TECH_W;
  return res;
}
