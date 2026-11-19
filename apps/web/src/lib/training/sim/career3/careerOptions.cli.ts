/**
 * Low-Potential growth options (owner request 2026-11-19): `tsx careerOptions.cli.ts [seed] [expScale]`.
 * Same riders, approved Potential bands, manager "dobrý"; compares cap/gap options by Potential class.
 * Results with expScale 1.0 and 1.5 are ALWAYS reported separately (1.5 is an experimental, not approved assumption).
 */
import { makePop2, runCareerF2, DEF4, TACT_TYPE_W2, snap2, ovrW } from './modelF2';
import { mulberry32 } from '../rng';
import { PERF_IDX } from '../career/params';
import { POTENTIAL_BANDS } from '@/lib/rider/config';
import type { Rider3 } from './model3';

const SEED = Number(process.argv[2] ?? 20261116), ES = Number(process.argv[3] ?? 1.0), N = 10000;
TACT_TYPE_W2[6] = [1.0, 0.6, 0.6, 0.6, 0.6];
const bandPot = (r: () => number) => { const u = r() * 100; let a = 0; for (const b of POTENTIAL_BANDS) { a += b.share; if (u < a) return b.min + Math.floor(r() * (b.max - b.min + 1)); } return 100; };
const pop: Rider3[] = makePop2(N, SEED, 0.6).pop.map((p, i) => { const r = mulberry32(4242 + 13 * i); const h = Float64Array.from(p.hidden); h[0] = bandPot(r); return { ...p, hidden: h }; });
const pct = (a: ArrayLike<number>, t: number) => { let c = 0; for (let i = 0; i < a.length; i++) if (a[i] >= t) c++; return a.length ? (100 * c) / a.length : 0; };
const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0);
const p90 = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.9)] : 0);

interface Opt { name: string; capFn: (p: number) => number; gapScale?: (p: number) => number; floor?: (age: number) => number }
const cap = (b: number, s: number) => (p: number) => Math.min(230, b + s * (p / 100) ** 2 * 100) ; // hard maximum 200 is applied by the model itself
/** youth floor: the room factor is at least 0.30 up to age 21, then falls linearly to 0 at age 26 */
const youth = (age: number) => (age <= 21 ? 0.30 : age >= 26 ? 0 : 0.30 * (26 - age) / 5);
const youth2 = (age: number) => (age <= 22 ? 0.5 : age >= 28 ? 0 : 0.5 * (28 - age) / 6);
export const OPTIONS: Opt[] = [
  { name: 'S0 dnes: 80 + 125·P²', capFn: cap(80, 1.25) },
  { name: 'S1 výber majiteľa: 80 + 150·P²', capFn: cap(80, 1.5) },
  { name: 'O1 vyššia základňa: 100 + 100·P²', capFn: cap(100, 1.0) },
  { name: 'O3 medzery menšie pri nízkom P: 80 + 150·P², medzery ×(0,35 + 0,65·min(1, P/60))', capFn: cap(80, 1.5), gapScale: (p) => 0.35 + 0.65 * Math.min(1, p / 60) },
  { name: 'O4 základňa + medzery: 90 + 150·P², medzery ×(0,5 + 0,5·min(1, P/60))', capFn: cap(90, 1.5), gapScale: (p) => 0.5 + 0.5 * Math.min(1, p / 60) },
  { name: 'O5 mladícka podlaha rastu: 80 + 150·P² + podlaha priestoru 0,30 do 21 r. (→ 0 do 26 r.)', capFn: cap(80, 1.5), floor: youth },
  { name: 'O5b silnejšia podlaha: 80 + 150·P² + podlaha 0,50 do 22 r. (→ 0 do 28 r.)', capFn: cap(80, 1.5), floor: youth2 },
  { name: 'O6 podlaha 0,30 + menšie medzery pri nízkom P', capFn: cap(80, 1.5), floor: youth, gapScale: (p) => 0.35 + 0.65 * Math.min(1, p / 60) },
];
const CLASSES: [string, (p: number) => boolean][] = [['slabý 1–39', (p) => p <= 39], ['priemerný 40–59', (p) => p >= 40 && p <= 59], ['dobrý 60–74', (p) => p >= 60 && p <= 74], ['veľmi dobrý 75–87', (p) => p >= 75 && p <= 87], ['elitný 88+', (p) => p >= 88]];
const only = process.argv[4] ? Number(process.argv[4]) : -1;
console.log(`seed ${SEED}, rast Skúseností/Taktiky ×${ES}, dobrý manažér; tabuľky: medián OVR vo veku 17 → 21 → 25 → 30 | medián kariérneho maxima OVR (p90) | medián V (priemer 7 výkonnostných atribútov) 17 → 21 → 25 → 30 | podiel; medián kariérneho maxima (p90) | podiel max ≥160`);
OPTIONS.forEach((o, oi) => {
  if (only >= 0 && oi !== only) return;
  const r = runCareerF2(pop, { ...DEF4, seed: SEED, effTable: 'steep', expK: 14 * ES, tactK: 12 * ES, plan: 'fixed', mode: 'advisor', advMin: 70, capFn: o.capFn, gapScale: o.gapScale, youthRoomFloor: o.floor });
  const ovrAt = (i: number, si: number) => ovrW(snap2(r, i, si), 0.6);
  const vAt = (i: number, si: number) => PERF_IDX.reduce((t, j) => t + snap2(r, i, si)[j], 0) / PERF_IDX.length;
  const pk = Float64Array.from({ length: N }, (_, i) => { let m = 0; for (let s = 0; s <= r.S; s++) m = Math.max(m, ovrAt(i, s)); return m; });
  console.log(`\n## ${o.name}   | všetci: ≥150 ${pct(pk, 150).toFixed(1)} % ≥160 ${pct(pk, 160).toFixed(1)} % ≥170 ${pct(pk, 170).toFixed(1)} % ≥180 ${pct(pk, 180).toFixed(1)} % ≥190 ${pct(pk, 190).toFixed(2)} % ≥200 ${pct(pk, 200).toFixed(2)} %; max ${Math.max(...pk).toFixed(0)}`);
  for (const [cn, f] of CLASSES) {
    const idx = Array.from({ length: N }, (_, i) => i).filter((i) => f(pop[i].hidden[0]));
    const at = (si: number) => med(idx.map((i) => ovrAt(i, si))).toFixed(0);
    const peaks = idx.map((i) => pk[i]);
    const vv = (si: number) => med(idx.map((i) => vAt(i, si))).toFixed(0);
    console.log(`  ${cn.padEnd(18)} n=${String(idx.length).padStart(4)} | ${at(0)} → ${at(4)} → ${at(8)} → ${at(13)} | max ${med(peaks).toFixed(0)} (p90 ${p90(peaks).toFixed(0)}) | V ${vv(0)} → ${vv(4)} → ${vv(8)} → ${vv(13)} | ≥160 ${pct(peaks, 160).toFixed(1)} % ≥180 ${pct(peaks, 180).toFixed(1)} %`);
  }
});
