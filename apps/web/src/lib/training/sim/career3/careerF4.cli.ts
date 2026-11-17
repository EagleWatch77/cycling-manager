/** Model F4 runner: `tsx careerF4.cli.ts <seed> <part> [capBase capSlope dist table]` -> docs/audit-ovr-career/careerF4_<part>_<seed>[_args].json (numbers from really executed runs). */
import { writeFileSync } from 'node:fs';
import { PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX, IDX } from '../career/params';
import { makePop2, runCareerF2, DEF4, PLANS4, NAMES2, snap2, ovrW, TACT_TYPE_W2, type CfgF2, type ResF2 } from './modelF2';
import { dist } from '../stats';
import { mulberry32 } from '../rng';
import type { Rider3 } from './model3';

const SEED = Number(process.argv[2] ?? 20261116), PART = process.argv[3] ?? 'caps', N = 10000;
const ARGS = process.argv.slice(4);
const ES = Number(ARGS[4] ?? 1); // scale of the assumed growth of Experience and Tactics from races (expK 14, tactK 12)
const EXPK = 14 * ES, TACTK = 12 * ES;
const CEXP = Number(ARGS[5] ?? 1); // exponent of the Potential->cap curve (1 = linear)
const LG = ['Rookie', 'Amateur', 'Continental', 'Pro', 'Elite'], TH = [140, 150, 160, 170, 180, 190];
const pct = (a: ArrayLike<number>, t: number) => { let c = 0; for (let i = 0; i < a.length; i++) if (a[i] >= t) c++; return a.length ? (100 * c) / a.length : 0; };
const mean = (a: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };
const D = (a: number[]) => { if (!a.length) return null; const d = dist(a); return { median: d.median, p5: d.p5, p25: d.p25, p75: d.p75, p90: d.p90, p99: d.p99, max: d.max, mean: d.mean }; };
const PH_NAMES = ['climbing', 'hills', 'flat', 'sprint', 'timeTrial', 'endurance', 'acceleration'] as const;
const TE_NAMES = ['descending', 'bikeHandling', 'cornering', 'packRiding', 'wetHandling', 'roughSurface'] as const;
const t3 = (x: ArrayLike<number>) => PERF_IDX.map((k) => x[k]).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3;
const m7 = (x: ArrayLike<number>) => PERF_IDX.reduce((s, k) => s + x[k], 0) / 7;
const bestT = (x: ArrayLike<number>) => Math.max(...TACT_IDX.map((k) => x[k])), bestTe = (x: ArrayLike<number>) => Math.max(...TECH_IDX.map((k) => x[k]));
const gauss = (r: () => number) => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / 0.7071; };
const cl = (v: number) => Math.max(1, Math.min(100, Math.round(v)));

/** hidden-trait distributions: same start attributes, new hidden values (Potential, Trainability, Professionalism, Regeneration, Vitality) */
export type HidKind = 'n20' | 'n15' | 'n15r' | 'beta';
function rehidden(pop: Rider3[], kind: HidKind): Rider3[] {
  if (kind === 'n20') return pop;
  return pop.map((p, i) => {
    const r = mulberry32(991 + 7 * i), h = new Float64Array(5);
    const beta23 = () => { const u = [r(), r(), r(), r()].sort((a, b) => a - b); return u[1]; };
    for (let k = 0; k < 5; k++) {
      if (kind === 'n15') h[k] = cl(50 + 15 * gauss(r));
      else if (kind === 'n15r') h[k] = k < 2 ? cl(45 + 15 * gauss(r)) : cl(50 + 15 * gauss(r));
      else h[k] = k < 2 ? cl(100 * beta23()) : cl(50 + 15 * gauss(r));
    }
    return { ...p, hidden: h };
  });
}
const basePop = makePop2(N, SEED, 0.6);
// F3 recommendation kept as F4 working rule: one leading tactical type for the all-rounder (EXP)
TACT_TYPE_W2[6] = [1.0, 0.6, 0.6, 0.6, 0.6];

const classes: [string, (po: number, tr: number) => boolean][] = [
  ['Pot ≤ 30', (po) => po <= 30], ['Pot 31–45', (po) => po > 30 && po <= 45], ['Pot 46–55', (po) => po > 45 && po <= 55], ['Pot 56–70', (po) => po > 55 && po <= 70], ['Pot 71–85', (po) => po > 70 && po <= 85], ['Pot ≥ 86', (po) => po >= 86],
  ['Pot ≥ 80 a Trén ≥ 80', (po, tr) => po >= 80 && tr >= 80], ['Pot ≥ 90', (po) => po >= 90], ['Pot ≥ 90 a Trén ≥ 85', (po, tr) => po >= 90 && tr >= 85], ['Pot ≤ 30 a Trén ≥ 80', (po, tr) => po <= 30 && tr >= 80], ['Trén ≤ 30', (_p, tr) => tr <= 30], ['Trén ≥ 80', (_p, tr) => tr >= 80],
];

function summ(r: ResF2, w = 0.6) {
  const n = r.n, S = r.S, ages = Array.from({ length: S + 1 }, (_, i) => 17 + i);
  const ovr: Float64Array[] = ages.map((_, si) => Float64Array.from({ length: n }, (__, i) => ovrW(snap2(r, i, si), w)));
  const frozen = Float64Array.from({ length: n }, (_, i) => { const x = snap2(r, i, 0); return x[EXP_IDX]; });
  const tact0 = Float64Array.from({ length: n }, (_, i) => bestT(snap2(r, i, 0)));
  const curve = ages.map((age, si) => {
    const xs = Array.from({ length: n }, (_, i) => snap2(r, i, si)), o = Array.from(ovr[si]);
    const V = (x: ArrayLike<number>) => w * t3(x) + (1 - w) * m7(x);
    const core = xs.map((x) => 0.6 * V(x) + 0.10 * bestTe(x)), expp = xs.map((x) => 0.15 * bestT(x) + 0.15 * x[EXP_IDX]);
    const fz = xs.map((x, i) => Math.round(0.6 * V(x) + 0.10 * bestTe(x) + 0.15 * tact0[i] + 0.15 * frozen[i]));
    return { age, ovr: D(o), share: Object.fromEntries(TH.map((t) => [t, pct(o, t)])),
      phys: PH_NAMES.map((nm) => mean(xs.map((x) => x[IDX[nm]]))), tech: TE_NAMES.map((nm, k) => mean(xs.map((x) => x[TECH_IDX[k]]))),
      top3: mean(xs.map(t3)), m7: mean(xs.map(m7)), tact: mean(xs.map(bestT)), exp: mean(xs.map((x) => x[EXP_IDX])), techBest: mean(xs.map(bestTe)),
      core: mean(core), expPart: mean(expp), frozenMedian: dist(fz).median, frozenP90: dist(fz).p90, frozenGe160: pct(fz, 160), coreMedian: dist(core).median, coreP90: dist(core).p90 };
  });
  const pk = Array.from({ length: n }, (_, i) => { let m = 0, a = 17; for (let s = 0; s <= S; s++) { const o = ovr[s][i]; if (o > m) { m = o; a = 17 + s; } } return [m, a]; });
  const pkv = pk.map((x) => x[0]), pka = pk.map((x) => x[1]);
  const lg = (age: number) => Array.from({ length: n }, (_, i) => r.league[i * S + Math.min(age - 17, S - 1)]);
  const slice = (age: number) => {
    const si = age - 17, o = Array.from(ovr[si]), L = lg(age);
    return { age,
      byArch: NAMES2.map((nm, k) => { const g = o.filter((_, i) => r.arch[i] === k); return { arch: nm, n: g.length, median: D(g)!.median, p90: D(g)!.p90, ge160: pct(g, 160), ge170: pct(g, 170), ge180: pct(g, 180) }; }),
      byLeague: LG.map((nm, l) => { const g = o.filter((_, i) => L[i] === l); return { league: nm, n: g.length, d: D(g), share: Object.fromEntries(TH.map((t) => [t, pct(g, t)])) }; }) };
  };
  const po = (i: number) => r.hidden[i * 5], tr = (i: number) => r.hidden[i * 5 + 1];
  const byClass = classes.map(([nm, f]) => { const idx = Array.from({ length: n }, (_, i) => i).filter((i) => f(po(i), tr(i))); const v = idx.map((i) => pkv[i]), a30 = idx.map((i) => ovr[13][i]);
    return { cls: nm, n: idx.length, shareOfPop: (100 * idx.length) / n, peak: D(v), age30: D(a30), peakGe: Object.fromEntries(TH.map((t) => [t, pct(v, t)])), peakLt160: v.length ? 100 - pct(v, 160) : null, peakAge: D(idx.map((i) => pka[i])) }; });
  const pro: number[] = []; for (let a = 20; a <= 33; a++) for (let i = 0; i < n; i++) if (r.league[i * S + (a - 17)] === 3) pro.push(ovr[a - 17][i]);
  const proPool = { n: pro.length, median: dist(pro).median, p90: dist(pro).p90, share: Object.fromEntries([150, 160, 170, 180, 190].map((t) => [t, pct(pro, t)])) };
  const f200 = Array.from(r.first200).filter((x) => x > 0);
  const hid = { poGe80: pct(Array.from({ length: n }, (_, i) => po(i)), 80), poGe90: pct(Array.from({ length: n }, (_, i) => po(i)), 90), poLe30: 100 - pct(Array.from({ length: n }, (_, i) => po(i)), 31), poMean: mean(Array.from({ length: n }, (_, i) => po(i))), trMean: mean(Array.from({ length: n }, (_, i) => tr(i))), bothGe80: (100 * Array.from({ length: n }, (_, i) => i).filter((i) => po(i) >= 80 && tr(i) >= 80).length) / n };
  return { curve, peak: { share: Object.fromEntries(TH.map((t) => [t, pct(pkv, t)])), never: { lt140: 100 - pct(pkv, 140), lt150: 100 - pct(pkv, 150), lt160: 100 - pct(pkv, 160) }, value: D(pkv), age: D(pka) },
    slices: [25, 30, 33].map(slice), byClass, proPool, hid, cap200: { share: (100 * f200.length) / n, medianAge: f200.length ? dist(f200).median : null },
    energy: { readTourStart: D(Array.from(r.readTourStart))!.median, low60: 100 * mean(Array.from(r.low60)), basicShare: D(Array.from(r.basicShare))!.median, eff: D(Array.from(r.effMean))!.median } };
}
const out: any = { seed: SEED, part: PART, args: ARGS, runs: {}, pops: {} };
const startStat = (pop: Rider3[]) => Object.fromEntries([0.6, 0.75, 0.8].map((w) => { const o = pop.map((p) => ovrW(p.attrs, w)); const d = dist(o); return [w, { mean: d.mean, min: Math.min(...o), max: Math.max(...o), median: d.median, ge80: pct(o, 81) }]; }));
const keep: Record<string, ResF2> = {};
function run(name: string, c: Partial<CfgF2>, hk: HidKind = 'n20', retain = false, w = 0.6): ResF2 {
  const t0 = Date.now(); const pop = rehidden(basePop.pop, hk);
  const r = runCareerF2(pop, { ...DEF4, seed: SEED, ...c }); const s = summ(r, w); out.runs[name] = { hk, cfg: { capBase: r.cfg.capBase, capSlope: r.cfg.capSlope, effTable: r.cfg.effTable, cPhys: r.cfg.cPhys, cTech: r.cfg.cTech, mode: r.cfg.mode, plan: r.cfg.plan, advMin: r.cfg.advMin, expK: r.cfg.expK, tactK: r.cfg.tactK }, ...s };
  if (retain) keep[name] = r; const a = s.curve[13];
  console.log(SEED, name, `${((Date.now() - t0) / 1000).toFixed(0)}s`, 'age30', a.ovr!.median, a.ovr!.p90, a.ovr!.p99, a.ovr!.max, '160+', a.share[160].toFixed(1), 'peak170+', s.peak.share[170].toFixed(1), 'peak180+', s.peak.share[180].toFixed(1), 'peak190+', s.peak.share[190].toFixed(2));
  return r;
}
const CAPS: [string, number, number, number][] = [['130 + Pot (F3)', 130, 1.0, 1], ['110 + Pot', 110, 1.0, 1], ['100 + 1,2×Pot', 100, 1.2, 1], ['strmá A: 90 + 125×(Pot/100)²', 90, 1.25, 2], ['strmá B: 100 + 110×(Pot/100)^1,5', 100, 1.1, 1.5]];
const HK: HidKind[] = ['n20', 'n15', 'n15r', 'beta'];
const MG: [string, Partial<CfgF2>][] = [['zlý', { plan: 'bad', mode: 'full' }], ['priemerný', { plan: 'avg', mode: 'advisor', advMin: 40 }], ['dobrý', { plan: 'fixed', mode: 'advisor', advMin: 70 }]];

if (PART === 'caps') {
  for (const hk of HK) for (const [nm, cb, cs, ce] of CAPS) for (const [mn, mc] of [MG[1], MG[2]]) run(`${nm} / ${hk} / ${mn}`, { capBase: cb, capSlope: cs, capExp: ce, expK: EXPK, tactK: TACTK, ...mc }, hk);
} else if (PART === 'mgmt' || PART === 'final') {
  const cb = Number(ARGS[0] ?? 110), cs = Number(ARGS[1] ?? 1), hk = (ARGS[2] ?? 'n20') as HidKind, tb = (ARGS[3] ?? 'prod') as 'prod' | 'steep';
  const cap = { capBase: cb, capSlope: cs, capExp: CEXP, effTable: tb, expK: EXPK, tactK: TACTK };
  for (const [nm, c] of MG) run(`manažér ${nm}`, { ...cap, ...c }, hk, true);
  // ---- talent selection on the same riders: noisy estimate of (Pot + Trén)/2, manager picks the top 10 %
  const pop = rehidden(basePop.pop, hk), rr = mulberry32(5150);
  const est = (sigma: number) => pop.map((p) => (p.hidden[0] + p.hidden[1]) / 2 + sigma * gauss(rr));
  const sel: any = {};
  const ests: Record<string, number[]> = { 'náhodný výber': pop.map(() => rr()), 'skaut (chyba σ 25)': est(25), 'dobrý skaut (σ 12)': est(12), 'dokonalá znalosť (horná hranica)': pop.map((p) => (p.hidden[0] + p.hidden[1]) / 2) };
  for (const [sn, e] of Object.entries(ests)) {
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => e[b] - e[a]).slice(0, 1000);
    sel[sn] = { meanPot: mean(order.map((i) => pop[i].hidden[0])), meanTr: mean(order.map((i) => pop[i].hidden[1])) };
    for (const [mn] of MG) {
      const r = keep[`manažér ${mn}`], pkv = order.map((i) => { let m = 0; for (let s = 0; s <= r.S; s++) m = Math.max(m, ovrW(snap2(r, i, s), 0.6)); return m; }), a30 = order.map((i) => ovrW(snap2(r, i, 13), 0.6));
      sel[sn][mn] = { peak: D(pkv), age30: D(a30), peakGe: Object.fromEntries(TH.map((t) => [t, pct(pkv, t)])) };
    }
  }
  out.selection = sel;
  // ---- teams: 50 managers per Pro sub-league, k riders each, riders of ages 20..33 that are in the Pro league in their own cohort run
  const teams: any = {};
  const rt = mulberry32(8080);
  const poolOf = (r: ResF2) => { const e: { i: number; o: number }[] = []; for (let a = 20; a <= 33; a++) for (let i = 0; i < r.n; i++) if (r.league[i * r.S + (a - 17)] === 3) e.push({ i, o: ovrW(snap2(r, i, a - 17), 0.6) }); return e; };
  const pools: Record<string, { i: number; o: number }[]> = Object.fromEntries(MG.map(([mn]) => [mn, poolOf(keep[`manažér ${mn}`])]));
  const talentEst = (i: number, sigma: number) => (pop[i].hidden[0] + pop[i].hidden[1]) / 2 + sigma * gauss(rt);
  const draw = (mn: string, k: number, scoutSigma: number | null) => { const p = pools[mn]; if (scoutSigma === null) return Array.from({ length: k }, () => p[Math.floor(rt() * p.length)].o); const cand = Array.from({ length: 5 * k }, () => p[Math.floor(rt() * p.length)]); cand.sort((a, b) => talentEst(b.i, scoutSigma) - talentEst(a.i, scoutSigma)); return cand.slice(0, k).map((x) => x.o); };
  const scen: [string, (m: number) => { mn: string; sc: number | null }][] = [
    ['všetci priemerní, náhodní jazdci', () => ({ mn: 'priemerný', sc: null })],
    ['mix 25 % zlí / 50 % priemerní / 25 % dobrí, náhodní jazdci', (m) => ({ mn: m < 12 ? 'zlý' : m < 37 ? 'priemerný' : 'dobrý', sc: null })],
    ['mix manažérov, všetci s výberom podľa skautingu (σ 25)', (m) => ({ mn: m < 12 ? 'zlý' : m < 37 ? 'priemerný' : 'dobrý', sc: 25 })],
    ['všetci dobrí s dobrým skautingom (σ 12) – horná hranica', () => ({ mn: 'dobrý', sc: 12 })],
  ];
  const TT = [150, 160, 170, 180, 190];
  for (const [sn, f] of scen) for (const k of [5, 10, 15]) {
    const acc = TT.map(() => [] as number[]), best: number[] = [];
    for (let L = 0; L < 400; L++) { const cnt = TT.map(() => 0); for (let m = 0; m < 50; m++) { const { mn, sc } = f(m); const team = draw(mn, k, sc); const b = Math.max(...team); best.push(b); TT.forEach((t, j) => { if (b >= t) cnt[j]++; }); } cnt.forEach((c, j) => acc[j].push(c)); }
    teams[`${sn} / ${k} jazdcov`] = { scenario: sn, k, managersWith: Object.fromEntries(TT.map((t, j) => [t, { mean: mean(acc[j]), p10: dist(acc[j]).p5, p90: dist(acc[j]).p90 }])), bestRiderMedian: dist(best).median, bestRiderP90: dist(best).p90 };
  }
  out.teams = teams; out.poolStats = Object.fromEntries(MG.map(([mn]) => [mn, { n: pools[mn].length, share: Object.fromEntries(TH.map((t) => [t, pct(pools[mn].map((x) => x.o), t)])), median: D(pools[mn].map((x) => x.o))!.median }]));
  out.pops = { start: startStat(basePop.pop) };
  if (PART === 'final') {
    // V-formula comparison on the SAME population (careers do not depend on V; only the displayed OVR does)
    const r = keep['manažér dobrý']; const vv: any = {};
    for (const w of [0.6, 0.75, 0.8]) { const o30 = Array.from({ length: N }, (_, i) => ovrW(snap2(r, i, 13), w)), pk = Array.from({ length: N }, (_, i) => { let m = 0; for (let s = 0; s <= r.S; s++) m = Math.max(m, ovrW(snap2(r, i, s), w)); return m; }); vv[w] = { start: startStat(basePop.pop)[w], age30: D(o30), peakGe: Object.fromEntries(TH.map((t) => [t, pct(pk, t)])) }; }
    out.vFormula = vv;
  }
} else if (PART === 'probe') {
  const cb = Number(ARGS[0] ?? 110), cs = Number(ARGS[1] ?? 1), hk = (ARGS[2] ?? 'n20') as HidKind, tb = (ARGS[3] ?? 'prod') as 'prod' | 'steep';
  const cap = { capBase: cb, capSlope: cs, capExp: CEXP, effTable: tb, expK: EXPK, tactK: TACTK };
  const ra = run('probe priemerný', { ...cap, ...MG[1][1] }, hk, true), rg = run('probe dobrý', { ...cap, ...MG[2][1] }, hk, true);
  const poolShare = (r: ResF2) => { const o: number[] = []; for (let a = 20; a <= 33; a++) for (let i = 0; i < r.n; i++) if (r.league[i * r.S + (a - 17)] === 3) o.push(ovrW(snap2(r, i, a - 17), 0.6)); return { n: o.length, median: dist(o).median, p160: pct(o, 160), p170: pct(o, 170), p180: pct(o, 180) }; };
  const cls = (nm: string, rn: string) => out.runs[rn].byClass.find((x: any) => x.cls === nm);
  const e = cls('Pot ≥ 80 a Trén ≥ 80', 'probe dobrý'), x = cls('Pot ≥ 86', 'probe dobrý'), wk = cls('Pot ≤ 30', 'probe dobrý'), av = cls('Pot 46–55', 'probe dobrý');
  console.log('PROBE', JSON.stringify({ args: ARGS, avgPro: poolShare(ra), goodPro: poolShare(rg), peakAvgMgr: out.runs['probe priemerný'].peak.share, peakGoodMgr: out.runs['probe dobrý'].peak.share, expTop: { n: e.n, ge170: e.peakGe[170], ge180: e.peakGe[180], ge190: e.peakGe[190], med: e.peak.median }, pot86: { n: x.n, ge170: x.peakGe[170], ge180: x.peakGe[180], ge190: x.peakGe[190], med: x.peak.median }, weak: { n: wk.n, lt160: wk.peakLt160, med: wk.peak.median }, avg: { med: av.peak.median, lt160: av.peakLt160 } }));
} else if (PART === 'sens') {
  const cb = Number(ARGS[0] ?? 110), cs = Number(ARGS[1] ?? 1), hk = (ARGS[2] ?? 'n20') as HidKind, tb = (ARGS[3] ?? 'prod') as 'prod' | 'steep';
  const cap = { capBase: cb, capSlope: cs, capExp: CEXP, effTable: tb, mode: 'advisor' as const, advMin: 70 };
  const E0 = EXPK, T0 = TACTK;
  for (const [sc, lab] of [[0, '0'], [0.5, '0,5'], [1, '1'], [1.5, '1,5']] as const) run(`skúsenosti a taktika ×${lab}`, { ...cap, expK: E0 * sc, tactK: T0 * sc }, hk);
  for (const [sc, lab] of [[0.5, '0,5'], [1.5, '1,5']] as const) { run(`iba skúsenosti ×${lab}`, { ...cap, expK: E0 * sc }, hk); run(`iba taktika ×${lab}`, { ...cap, tactK: T0 * sc }, hk); }
} else if (PART === 'eff') {
  const cb = Number(ARGS[0] ?? 110), cs = Number(ARGS[1] ?? 1), hk = (ARGS[2] ?? 'n20') as HidKind;
  for (const tb of ['prod', 'steep'] as const) for (const [nm, c] of [['plnohodnotný', { mode: 'full' }], ['základný', { mode: 'basic' }], ['odporúčanie 60', { mode: 'advisor', advMin: 60 }], ['odporúčanie 70', { mode: 'advisor', advMin: 70 }], ['odporúčanie 80', { mode: 'advisor', advMin: 80 }]] as [string, Partial<CfgF2>][]) run(`tabuľka ${tb} / ${nm}`, { capBase: cb, capSlope: cs, capExp: CEXP, effTable: tb, expK: EXPK, tactK: TACTK, ...c }, hk);
  for (const tb of ['prod', 'steep'] as const) for (const rec of [20, 50, 80]) for (const [nm, c] of [['plnohodnotný', { mode: 'full' }], ['odporúčanie 70', { mode: 'advisor', advMin: 70 }]] as [string, Partial<CfgF2>][]) run(`tabuľka ${tb} / Reg ${rec} / ${nm}`, { capBase: cb, capSlope: cs, capExp: CEXP, effTable: tb, expK: EXPK, tactK: TACTK, forceHidden: { rec }, ...c }, hk);
}
writeFileSync(new URL(`../../../../../../../docs/audit-ovr-career/careerF4_${PART}_${SEED}${ARGS.length ? '_' + ARGS.join('_') : ''}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.log('done', SEED, PART);
void PLANS4;
