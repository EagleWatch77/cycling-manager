/** Model E extras: scarcity sweep (does the training decision matter?) and "legend path" scenario. -> careerE_extra.json */
import { writeFileSync } from 'node:fs';
import { makePop, calibratedMu, snap, metrics3, RTYPES, STRONG, type Res3 } from './model3';
import { runCareerE, DEFE, type CfgE } from './modelE';
import { dist } from '../stats';
import { IDX, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX } from '../career/params';
const SEED = 20261116, mu = calibratedMu(SEED), full = makePop(10000, SEED, mu);
const pct = (a: number[], t: number) => (100 * a.filter((x) => x >= t).length) / a.length;
const top3 = (x: ArrayLike<number>) => PERF_IDX.map((k) => x[k]).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3, mean7 = (x: ArrayLike<number>) => PERF_IDX.reduce((s, k) => s + x[k], 0) / 7;
const ovrW = (x: ArrayLike<number>, w: number) => Math.min(200, Math.round(0.6 * (w * top3(x) + (1 - w) * mean7(x)) + 0.15 * Math.max(...TACT_IDX.map((k) => x[k])) + 0.10 * Math.max(...TECH_IDX.map((k) => x[k])) + 0.15 * x[EXP_IDX]));
const peaks = (r: Res3, f: (x: ArrayLike<number>) => number) => Array.from({ length: r.n }, (_, i) => { let m = 0; for (let s = 0; s <= r.S; s++) m = Math.max(m, f(snap(r, i, s))); return m; });
const disc = (r: Res3, x30: ArrayLike<number>[]) => { const v: number[] = []; for (let i = 0; i < r.n; i++) { const t = RTYPES[r.arch[i]]; if (t === 'Univerzál') continue; const ks = STRONG[t]; v.push(ks.reduce((s, k) => s + x30[i][IDX[k as keyof typeof IDX]], 0) / ks.length); } return dist(v); };
const out: any = { scarcity: {}, legend: {} };
const sub = full.slice(0, 3000);
for (const cP of [2.0, 2.6, 3.2, 4.0]) for (const st of ['good', 'avg', 'poor'] as const) {
  const r = runCareerE(sub, { ...DEFE, cP, strat: st, techWeeks: st === 'good' ? 1 : 0 }); const x30 = Array.from({ length: r.n }, (_, i) => snap(r, i, 13)); const o = dist(x30.map((x) => metrics3(x).ovr)); const d = disc(r, x30);
  out.scarcity[`cP ${cP} / ${st}`] = { ovrMedian: o.median, ovrP90: o.p90, ovrP99: o.p99, top3: dist(x30.map(top3)).median, mean7: dist(x30.map(mean7)).median, discMedian: d.median, discP10: d.p5, discP90: d.p95 };
  console.log(cP, st, o.median, dist(x30.map(top3)).median, d.median);
}
const sc: [string, Partial<CfgE>][] = [['základ E-soft (mix)', {}], ['cesta k legende: dobrý, 2 tech. týždne, cT 3,0, taktika 12', { strat: 'good', techWeeks: 2, cT: 3.0, tactK: 12 }], ['cesta k legende + 3 tech. týždne', { strat: 'good', techWeeks: 3, cT: 3.0, tactK: 12 }]];
for (const [nm, c] of sc) {
  const r = runCareerE(full, { ...DEFE, ...c }); const res: any = {};
  for (const [wn, w] of [['V 60/40', 0.6], ['V 75/25', 0.75], ['V 85/15', 0.85]] as const) { const pk = peaks(r, (x) => ovrW(x, w)); res[wn] = Object.fromEntries([160, 165, 170, 175, 180, 185, 190, 195].map((t) => [t, pct(pk, t)])); res[wn].max = Math.max(...pk); }
  const pkIdx = peaks(r, (x) => ovrW(x, 0.6)); const best = pkIdx.indexOf(Math.max(...pkIdx)); const x = snap(r, best, 13);
  const x30 = Array.from({ length: r.n }, (_, i) => snap(r, i, 13)); const o = dist(x30.map((y) => metrics3(y).ovr));
  res.age30 = { median: o.median, p90: o.p90, p99: o.p99, max: o.max }; res.tech = { median: dist(x30.map((y) => Math.max(...TECH_IDX.map((k) => y[k])))).median, p90: dist(x30.map((y) => Math.max(...TECH_IDX.map((k) => y[k])))).p95 }; res.tact = dist(x30.map((y) => Math.max(...TACT_IDX.map((k) => y[k])))).median;
  res.bestRider = { arch: RTYPES[r.arch[best]], hidden: Array.from({ length: 5 }, (_, k) => r.hidden[best * 5 + k]), perf: PERF_IDX.map((k) => x[k]), T: Math.max(...TACT_IDX.map((k) => x[k])), Te: Math.max(...TECH_IDX.map((k) => x[k])), S: x[EXP_IDX], ovr60: ovrW(x, 0.6) };
  out.legend[nm] = res; console.log(nm, JSON.stringify(res['V 60/40']), res.age30);
}
// baseline peaks incl. 165/175 for E-soft mix
writeFileSync(new URL('../../../../../../../docs/audit-ovr-career/careerE_extra.json', import.meta.url), JSON.stringify(out, null, 1));
