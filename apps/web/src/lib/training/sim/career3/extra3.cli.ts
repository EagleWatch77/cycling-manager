/** Extra: what training strength would be needed + decomposition of OVR growth. */
import { writeFileSync } from 'node:fs';
import { makePop, calibratedMu, runCareer3, DEF3, snap, metrics3, type Cfg3, type Res3 } from './model3';
import { dist } from '../stats';
import { PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX } from '../career/params';
const SEED = 20261116, mu = calibratedMu(SEED), pop = makePop(3000, SEED, mu);
const pct = (a: number[], t: number) => (100 * a.filter((x) => x >= t).length) / a.length;
function decomp(r: Res3, age: number) {
  const si = age - r.cfg.startAge; let dV = 0, dT = 0, dTe = 0, dS = 0, dP = 0; const top3 = (x: ArrayLike<number>) => PERF_IDX.map((i) => x[i]).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  for (let i = 0; i < r.n; i++) { const a = snap(r, i, 0), b = snap(r, i, si); const m0 = metrics3(a), m1 = metrics3(b); dV += m1.V - m0.V; dS += b[EXP_IDX] - a[EXP_IDX]; dT += Math.max(...TACT_IDX.map((k) => b[k])) - Math.max(...TACT_IDX.map((k) => a[k])); dTe += Math.max(...TECH_IDX.map((k) => b[k])) - Math.max(...TECH_IDX.map((k) => a[k])); dP += top3(b) - top3(a); }
  const n = r.n; return { dV: dV / n, dTop3: dP / n, dT: dT / n, dTe: dTe / n, dS: dS / n, ovrFromV: (0.6 * dV) / n, ovrFromT: (0.15 * dT) / n, ovrFromTe: (0.1 * dTe) / n, ovrFromS: (0.15 * dS) / n };
}
const out: any = { sweep: {}, decomp: {} };
const cfgs: Record<string, Cfg3> = {};
for (const m of [15, 25, 40, 60]) cfgs[`B ×${m}`] = { ...DEF3, variant: 'B', mult: m };
for (const m of [25, 40, 60]) cfgs[`C ×${m}`] = { ...DEF3, variant: 'C', mult: m };
for (const m of [25, 40]) cfgs[`D ×${m}`] = { ...DEF3, variant: 'D', mult: m };
cfgs['A ×1'] = { ...DEF3, variant: 'A', mult: 1 }; cfgs['B ×3'] = { ...DEF3, variant: 'B', mult: 3 }; cfgs['B ×10'] = { ...DEF3, variant: 'B', mult: 10 };
for (const [nm, c] of Object.entries(cfgs)) {
  const r = runCareer3(pop, c); const ov = (age: number) => Array.from({ length: r.n }, (_, i) => metrics3(snap(r, i, age - 17)).ovr);
  const peaks = Array.from({ length: r.n }, (_, i) => { let m = 0; for (let s = 0; s <= r.S; s++) m = Math.max(m, metrics3(snap(r, i, s)).ovr); return m; });
  const o30 = ov(30), d = dist(o30), V30 = Array.from({ length: r.n }, (_, i) => metrics3(snap(r, i, 13)).V);
  out.sweep[nm] = { med30: d.median, p90: d.p90, p99: d.p99, max: d.max, ge150: pct(o30, 150), ge170: pct(o30, 170), ge180: pct(o30, 180), ge190: pct(o30, 190), peakGe170: pct(peaks, 170), peakGe190: pct(peaks, 190), Vmax: dist(V30).max, Vp99: dist(V30).p99, V190: pct(V30, 190) };
  if (['A ×1', 'B ×3', 'B ×10', 'B ×25'].includes(nm)) out.decomp[nm] = { at25: decomp(r, 25), at30: decomp(r, 30), at35: decomp(r, 35) };
  console.log(nm, JSON.stringify(out.sweep[nm]));
}
writeFileSync(new URL('../../../../../../../docs/audit-ovr-career/career3_extra.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.decomp, null, 0));
