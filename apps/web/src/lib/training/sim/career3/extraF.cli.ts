/** Model F extra: global scale sweep + the user's raw coefficients with the three general-growth values -> careerF_extra.json */
import { writeFileSync } from 'node:fs';
import { makePop, calibratedMu, snap } from './model3';
import { PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX } from '../career/params';
import { runCareerF, DEFF, type CfgF } from './modelF';
import { dist } from '../stats';
const N = 10000, SEED = 20261116, pop = makePop(N, SEED, calibratedMu(SEED));
const t3 = (x: ArrayLike<number>) => PERF_IDX.map((k) => x[k]).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3, m7 = (x: ArrayLike<number>) => PERF_IDX.reduce((s, k) => s + x[k], 0) / 7;
const ovw = (x: ArrayLike<number>, w: number) => Math.min(200, Math.round(0.6 * (w * t3(x) + (1 - w) * m7(x)) + 0.15 * Math.max(...TACT_IDX.map((k) => x[k])) + 0.10 * Math.max(...TECH_IDX.map((k) => x[k])) + 0.15 * x[EXP_IDX]));
const pct = (a: number[], t: number) => (100 * a.filter((v) => v >= t).length) / a.length;
function go(c: Partial<CfgF>) {
  const r = runCareerF(pop, { ...DEFF, tactK: 12, ...c }); const o: any = {};
  for (const age of [30, 33]) { const xs = Array.from({ length: N }, (_, i) => snap(r, i, age - 17)); o[age] = {}; for (const w of [0.6, 0.75, 0.8]) { const v = xs.map((x) => ovw(x, w)), d = dist(v); o[age][w] = { median: d.median, p90: d.p90, p99: d.p99, max: d.max, ge170: pct(v, 170), ge180: pct(v, 180), ge190: pct(v, 190) }; } o[age].top3 = dist(xs.map(t3)).mean; o[age].m7 = dist(xs.map(m7)).mean; }
  return o;
}
const out: any = { scale: {}, rawGen: {} };
for (const cs of [1.5, 1.8, 2.0, 2.2, 2.5]) { out.scale[cs] = go({ cScale: cs, capBase: 130, techScale: 1.5 }); console.log('scale', cs, JSON.stringify(out.scale[cs][30][0.6])); }
for (const g of [0.2, 0.35, 0.5]) { out.rawGen[g] = go({ gen: g, capBase: 120 }); console.log('raw gen', g, JSON.stringify(out.rawGen[g][30][0.6])); }
writeFileSync(new URL('../../../../../../../docs/audit-ovr-career/careerF_extra.json', import.meta.url), JSON.stringify(out, null, 1));
