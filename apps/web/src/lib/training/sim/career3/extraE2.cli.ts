/** Does the OVR formula reward concentrated training? strategy x V-weights (E-soft, 10 000 careers). */
import { writeFileSync } from 'node:fs';
import { makePop, calibratedMu, snap } from './model3';
import { runCareerE, DEFE } from './modelE';
import { dist } from '../stats';
import { PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX } from '../career/params';
const SEED = 20261116, pop = makePop(10000, SEED, calibratedMu(SEED));
const top3 = (x: ArrayLike<number>) => PERF_IDX.map((k) => x[k]).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3, mean7 = (x: ArrayLike<number>) => PERF_IDX.reduce((s, k) => s + x[k], 0) / 7;
const ovrW = (x: ArrayLike<number>, w: number) => Math.min(200, Math.round(0.6 * (w * top3(x) + (1 - w) * mean7(x)) + 0.15 * Math.max(...TACT_IDX.map((k) => x[k])) + 0.10 * Math.max(...TECH_IDX.map((k) => x[k])) + 0.15 * x[EXP_IDX]));
const out: any = {};
for (const [nm, st, tw] of [['dobrý (1 tech. týždeň)', 'good', 1], ['priemerný', 'avg', 0], ['zlý (náhodný)', 'poor', 0]] as const) {
  const r = runCareerE(pop, { ...DEFE, strat: st, techWeeks: tw }); const x30 = Array.from({ length: r.n }, (_, i) => snap(r, i, 13));
  out[nm] = Object.fromEntries([0.6, 0.75, 0.85].map((w) => { const d = dist(x30.map((x) => ovrW(x, w))); return [`V ${Math.round(w * 100)}/${Math.round((1 - w) * 100)}`, { median: d.median, p90: d.p90, p99: d.p99, max: d.max }]; }));
  console.log(nm, JSON.stringify(out[nm]));
}
writeFileSync(new URL('../../../../../../../docs/audit-ovr-career/careerE_extra2.json', import.meta.url), JSON.stringify(out, null, 1));
