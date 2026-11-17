/** Part 4 — OVR formula test on 10 000 profiles. Run: tsx --tsconfig tsconfig.json src/lib/training/sim/career2/ovr.cli.ts */
import { writeFileSync, mkdirSync } from 'node:fs';
import { populationA, ARCHS } from './popA';
import { ovrCurrent, ovrProposed, physV } from './ovr2';
import { PERF_IDX } from '../career/params';
import { dist, sorted, percentile } from '../stats';

const SEED = 20261116, N = 10000;
const pop = populationA(N, SEED);
const oc = pop.map((p) => ovrCurrent(p.attrs)), on = pop.map((p) => ovrProposed(p.attrs)), v = pop.map((p) => physV(p.attrs));
const mean7 = pop.map((p) => PERF_IDX.reduce((s, i) => s + p.attrs[i], 0) / 7);
const OVR_T = [180, 185, 190, 195], V_T = [185, 188, 190];
const cnt = (a: ArrayLike<number>, t: number, idx?: number[]) => { let c = 0, n = 0; for (let i = 0; i < a.length; i++) { if (idx && !idx.includes(i)) continue; n++; if (a[i] >= t) c++; } return { c, n }; };
const byArch: Record<string, number[]> = {}; for (const a of ARCHS) byArch[a] = pop.map((p, i) => (p.arch === a ? i : -1)).filter((i) => i >= 0);
const sub = (a: ArrayLike<number>, idx: number[]) => idx.map((i) => a[i]);
const row = (a: ArrayLike<number>, idx?: number[]) => { const x = idx ? sub(a, idx) : Array.from(a); const d = dist(x); return { n: x.length, median: d.median, p90: d.p90, p99: d.p99, max: d.max, mean: d.mean,
  ge: OVR_T.map((t) => cnt(a, t, idx)) , vge: V_T.map((t) => cnt(v, t, idx)) }; };
const out: any = { meta: { seed: SEED, n: N }, all: { current: row(oc), proposed: row(on), V: row(v) }, arch: {} as any, delta: {} as any };
for (const a of ARCHS) { out.arch[a] = { current: row(oc, byArch[a]), proposed: row(on, byArch[a]), V: row(v, byArch[a]) }; }
// specialist vs all-rounder with equal Performance mean: matched pairs by level (±1 mean7) — mean OVR difference
const uni = byArch['Univerzál'];
for (const a of ARCHS) {
  if (a === 'Univerzál') continue;
  let sd = 0, sc = 0, n = 0, sV = 0, spread = 0;
  for (const i of byArch[a]) {
    // nearest all-rounder by mean7 and similar T/Te/S ignored (statistical comparison of the formulas only)
    let best = -1, bd = 1e9; for (const j of uni) { const d = Math.abs(mean7[j] - mean7[i]); if (d < bd) { bd = d; best = j; } }
    if (bd > 1.0) continue; n++; sd += on[i] - on[best]; sc += oc[i] - oc[best]; sV += v[i] - v[best];
    spread += 0;
  }
  out.delta[a] = { pairs: n, current: sc / n, proposed: sd / n, V: sV / n };
}
// rank agreement: share of the top 5 % by current OVR that remain in the top 5 % by proposed, per archetype in top 5 % by each formula
const top = (a: ArrayLike<number>, p: number) => { const s = sorted(a); const t = percentile(s, 100 - p); return Array.from(a).map((x) => x >= t); };
for (const p of [5, 1]) {
  const tc = top(oc, p), tn = top(on, p);
  const share = (t: boolean[]) => Object.fromEntries(ARCHS.map((a) => [a, byArch[a].filter((i) => t[i]).length / Math.max(1, t.filter(Boolean).length)]));
  out[`top${p}`] = { current: share(tc), proposed: share(tn), overlap: t_overlap(tc, tn) };
}
function t_overlap(a: boolean[], b: boolean[]) { let both = 0, na = 0; for (let i = 0; i < a.length; i++) { if (a[i]) { na++; if (b[i]) both++; } } return both / na; }
// ratio of the 7-attribute spread: proposed OVR minus current OVR by (V − mean7) bucket
out.vgap = ARCHS.map((a) => ({ arch: a, meanVminusMean7: sub(v, byArch[a]).reduce((s, x, k) => s + x - mean7[byArch[a][k]], 0) / byArch[a].length }));
// control example
out.control = { V: 190, T: 170, Te: 175, S: 200, ovr: Math.round(0.6 * 190 + 0.15 * 170 + 0.10 * 175 + 0.15 * 200) };
mkdirSync(new URL('../../../../../../../docs/audit-ovr-career', import.meta.url), { recursive: true });
writeFileSync(new URL('../../../../../../../docs/audit-ovr-career/ovr_results.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.all, null, 0).slice(0, 1500));
console.log(out.control, out.delta);
