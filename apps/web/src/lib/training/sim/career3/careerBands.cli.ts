/** Potential bands check (owner proposal 2026-11-19): `tsx careerBands.cli.ts [seed] [expScale]`. Compares N(50;20) (model F4/B) with the proposed bands, same riders, same config B (cap 80 + 125 x (Pot/100)^2). */
import { makePop2, runCareerF2, DEF4, TACT_TYPE_W2, snap2, ovrW } from './modelF2';
import { mulberry32 } from '../rng';
import type { Rider3 } from './model3';

const SEED = Number(process.argv[2] ?? 20261116), ES = Number(process.argv[3] ?? 1.5), N = 10000;
TACT_TYPE_W2[6] = [1.0, 0.6, 0.6, 0.6, 0.6];
const gauss = (r: () => number) => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / 0.7071; };
const cl = (v: number) => Math.max(1, Math.min(100, Math.round(v)));
import { POTENTIAL_BANDS } from '@/lib/rider/config';
export function bandPotential(u: number, r: () => number): number {
  let acc = 0;
  for (const b of POTENTIAL_BANDS) { acc += b.share; if (u * 100 < acc) return b.min + Math.floor(r() * (b.max - b.min + 1)); }
  return 100;
}
const pct = (a: ArrayLike<number>, t: number) => { let c = 0; for (let i = 0; i < a.length; i++) if (a[i] >= t) c++; return (100 * c) / a.length; };
const base = makePop2(N, SEED, 0.6).pop;
const withBands = (pop: Rider3[]): Rider3[] => pop.map((p, i) => { const r = mulberry32(4242 + 13 * i); const h = Float64Array.from(p.hidden); h[0] = bandPotential(r(), r); return { ...p, hidden: h }; });
const dists: [string, Rider3[]][] = [['N(50;20) (model)', base], ['pásma (návrh)', withBands(base)]];
const MG: [string, any][] = [['priemerný manažér', { plan: 'avg', mode: 'advisor', advMin: 40 }], ['dobrý manažér', { plan: 'fixed', mode: 'advisor', advMin: 70 }]];
/** cap candidates: [label, capBase, capSlope, capExp] (hard maximum 200 stays) */
const CAPS: [string, number, number, number][] = [
  ['B (dnes): 80 + 125 x (Pot/100)^2', 80, 1.25, 2], ['A: 90 + 125 x (Pot/100)^2', 90, 1.25, 2], ['C: 80 + 150 x (Pot/100)^2', 80, 1.5, 2],
  ['D: 80 + 125 x (Pot/100)^1.5', 80, 1.25, 1.5], ['E: 85 + 140 x (Pot/100)^2', 85, 1.4, 2],
];
const only = process.argv[4] ? Number(process.argv[4]) : -1;
CAPS.forEach(([cn, cb, cs, ce], ci) => {
  if (only >= 0 && only !== ci) return;
  const cap = (pot: number) => Math.min(200, cb + cs * 100 * (pot / 100) ** ce);
  for (const [dn, pop] of dists) {
    if (ci > 0 && dn.startsWith('N(')) continue;
    const po = pop.map((p) => p.hidden[0]);
    console.log(`\n== ${cn} | ${dn}: mean cap ${(po.reduce((s, p) => s + cap(p), 0) / N).toFixed(0)}; cap at Pot 20/50/75/90/100 = ${[20, 50, 75, 90, 100].map((x) => cap(x).toFixed(0)).join('/')}`);
    for (const [mn, mc] of MG) {
      const r = runCareerF2(pop, { ...DEF4, seed: SEED, capBase: cb, capSlope: cs, capExp: ce, effTable: 'steep', expK: 14 * ES, tactK: 12 * ES, ...mc });
      const pk = Float64Array.from({ length: N }, (_, i) => { let m = 0; for (let s = 0; s <= r.S; s++) m = Math.max(m, ovrW(snap2(r, i, s), 0.6)); return m; });
      const med = [...pk].sort((a, b) => a - b)[N >> 1];
      console.log(`  ${mn}: max-OVR median ${med.toFixed(0)} | >=150 ${pct(pk, 150).toFixed(1)} % | >=160 ${pct(pk, 160).toFixed(1)} % | >=170 ${pct(pk, 170).toFixed(1)} % | >=180 ${pct(pk, 180).toFixed(1)} % | >=190 ${pct(pk, 190).toFixed(2)} % | >=200 ${pct(pk, 200).toFixed(2)} % | max ${Math.max(...pk).toFixed(0)}`);
    }
  }
});
