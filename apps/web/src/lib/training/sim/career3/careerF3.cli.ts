/** Model F3 runner: `tsx careerF3.cli.ts <seed> core|extra` -> docs/audit-ovr-career/careerF3_<part>_<seed>.json (all numbers from really executed runs). */
import { writeFileSync } from 'node:fs';
import { PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX } from '../career/params';
import { makePop2, runCareerF2, DEF3, DEF2, PLANS2, TACT_TYPE_W2, NAMES2, snap2, ovrW, type CfgF2, type ResF2, type PopInfo, type PlanPolicy } from './modelF2';
import { dist } from '../stats';
import { mulberry32 } from '../rng';
import type { Rider3 } from './model3';

const SEED = Number(process.argv[2] ?? 20261116), PART = process.argv[3] ?? 'core', N = 10000;
const LG = ['Rookie', 'Amateur', 'Continental', 'Pro', 'Elite'], TH = [150, 160, 170, 180, 185, 190, 195];
const pct = (a: ArrayLike<number>, t: number) => { let c = 0; for (let i = 0; i < a.length; i++) if (a[i] >= t) c++; return a.length ? (100 * c) / a.length : 0; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const D = (a: number[]) => { const d = dist(a); return { median: d.median, p75: d.p75, p90: d.p90, p99: d.p99, max: d.max, mean: d.mean }; };
const t3 = (x: ArrayLike<number>) => PERF_IDX.map((k) => x[k]).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3;
const m7 = (x: ArrayLike<number>) => PERF_IDX.reduce((s, k) => s + x[k], 0) / 7;
const bestT = (x: ArrayLike<number>) => Math.max(...TACT_IDX.map((k) => x[k])), bestTe = (x: ArrayLike<number>) => Math.max(...TECH_IDX.map((k) => x[k]));
const AGES = [20, 25, 28, 30, 33, 35], ATTR_AGES = [17, 20, 23, 25, 28, 30, 33, 35];

function atAge(r: ResF2, age: number, w: number) {
  const si = age - 17, xs = Array.from({ length: r.n }, (_, i) => snap2(r, i, si)), lg = Array.from({ length: r.n }, (_, i) => r.league[i * r.S + Math.min(si, r.S - 1)]);
  const ov = xs.map((x) => ovrW(x, w));
  return { age, ovr: D(ov), share: Object.fromEntries(TH.map((t) => [t, pct(ov, t)])),
    byLeague: LG.map((nm, l) => { const o = ov.filter((_, i) => lg[i] === l); return { league: nm, n: o.length, median: o.length ? dist(o).median : null, p90: o.length ? dist(o).p90 : null, max: o.length ? dist(o).max : null, share: Object.fromEntries(TH.map((t) => [t, o.length ? pct(o, t) : null])) }; }),
    byArch: NAMES2.map((nm, k) => { const o = ov.filter((_, i) => r.arch[i] === k); return { arch: nm, n: o.length, median: dist(o).median, p90: dist(o).p90, p99: dist(o).p99, max: dist(o).max, ge170: pct(o, 170), ge180: pct(o, 180), ge190: pct(o, 190), top3: mean(xs.filter((_, i) => r.arch[i] === k).map(t3)), m7: mean(xs.filter((_, i) => r.arch[i] === k).map(m7)) }; }) };
}
function attrs(r: ResF2, age: number) {
  const xs = Array.from({ length: r.n }, (_, i) => snap2(r, i, age - 17)), ri = Array.from({ length: r.n }, (_, i) => i);
  const pl = (i: number) => PLANS2[r.arch[i]];
  return { age, m7: mean(xs.map(m7)), top3: mean(xs.map(t3)), main1: mean(ri.map((i) => xs[i][pl(i).phys[0]])), main2: mean(ri.map((i) => xs[i][pl(i).phys[1]])), main3: mean(ri.map((i) => xs[i][pl(i).phys[2]])),
    others: mean(ri.map((i) => mean(PERF_IDX.filter((k) => !pl(i).phys.includes(k)).map((k) => xs[i][k])))), tech1: mean(ri.map((i) => xs[i][pl(i).tech[0]])), tech2: mean(ri.map((i) => xs[i][pl(i).tech[1]])), techBest: mean(xs.map(bestTe)), tactBest: mean(xs.map(bestT)), exp: mean(xs.map((x) => x[EXP_IDX])),
    n200: mean(xs.map((x) => PERF_IDX.filter((k) => x[k] >= 200).length)), any200: pct(xs.map((x) => (PERF_IDX.some((k) => x[k] >= 200) ? 1 : 0)), 1) };
}
function summ(r: ResF2, w: number) {
  const pk = Array.from({ length: r.n }, (_, i) => { let m = 0; for (let s = 0; s <= r.S; s++) m = Math.max(m, ovrW(snap2(r, i, s), w)); return m; });
  const f200 = Array.from(r.first200).filter((x) => x > 0), e200 = Array.from(r.firstExp200).filter((x) => x > 0);
  const banked = Array.from(r.banked), maxP = Array.from(r.maxProg);
  const curve = Array.from({ length: r.S + 1 }, (_, si) => { const o = Array.from({ length: r.n }, (_, i) => ovrW(snap2(r, i, si), w)), d = dist(o); return { age: 17 + si, median: d.median, p5: d.p5, p25: d.p25, p75: d.p75, p90: d.p90, p99: d.p99, ge170: pct(o, 170), ge180: pct(o, 180), ge190: pct(o, 190) }; });
  const comp = [25, 30, 33].map((age) => { const xs = Array.from({ length: r.n }, (_, i) => snap2(r, i, age - 17)); const V = mean(xs.map((x) => w * t3(x) + (1 - w) * m7(x))); return { age, V, tact: mean(xs.map(bestT)), tech: mean(xs.map(bestTe)), exp: mean(xs.map((x) => x[EXP_IDX])), ovrV: 0.6 * V, ovrTact: 0.15 * mean(xs.map(bestT)), ovrTech: 0.10 * mean(xs.map(bestTe)), ovrExp: 0.15 * mean(xs.map((x) => x[EXP_IDX])) }; });
  return { curve, comp, ages: AGES.map((a) => atAge(r, a, w)), attrs: ATTR_AGES.map((a) => attrs(r, a)), peak: { ...Object.fromEntries(TH.map((t) => [t, pct(pk, t)])), max: Math.max(...pk) },
    energy: { low60: 100 * mean(Array.from(r.low60)), low40: 100 * mean(Array.from(r.low40)), stages: mean(Array.from(r.stages)) / r.S, readMean: D(Array.from(r.readMean)).median, readTour: D(Array.from(r.readAfterTour)).median, readTourStart: D(Array.from(r.readTourStart)).median, basicShare: D(Array.from(r.basicShare)).median, eff: D(Array.from(r.effMean)).median, weeksTrain: D(Array.from(r.weeksTrain)).median },
    cap200: { share: (100 * f200.length) / r.n, medianAge: f200.length ? dist(f200).median : null, p10Age: f200.length ? dist(f200).p5 : null, byAge: Object.fromEntries([22, 25, 28, 30, 33, 35].map((a) => [a, (100 * f200.filter((x) => x <= a).length) / r.n])), bankedMean: mean(banked), bankedShare: pct(banked, 1), maxProgP99: dist(maxP).p99, maxProgMax: dist(maxP).max },
    exp200: { share: (100 * e200.length) / r.n, median: e200.length ? dist(e200).median : null } };
}
const out: any = { seed: SEED, part: PART, runs: {}, pops: {} };
const popCache: Record<string, ReturnType<typeof makePop2>> = {};
const getPop = (w: number) => (popCache[w] ??= makePop2(N, SEED, w));
/** start-profile transform: every rider gets a FLAT physical profile (all 7 attributes around their own mean), shifted up until the start OVR equals the original start OVR. No other change (hidden traits, tactics, technique, plan). */
function flatten(pop: Rider3[], w: number): Rider3[] {
  return pop.map((p, i) => {
    const o = ovrW(p.attrs, w), a = Float64Array.from(p.attrs), r = mulberry32(777 + i), m = PERF_IDX.reduce((s, k) => s + a[k], 0) / 7;
    const noise = PERF_IDX.map(() => Math.round(3 * (r() + r() + r() - 1.5) * 1.15));
    let sh = 0; const set = () => PERF_IDX.forEach((k, j) => { a[k] = Math.max(1, Math.min(200, Math.round(m + sh + noise[j]))); });
    set(); while (ovrW(a, w) < o && sh < 60) { sh++; set(); }
    return { ...p, attrs: a };
  });
}
function run(name: string, c: Partial<CfgF2>, w = 0.6, flat = false) {
  const t0 = Date.now(); const { pop, info } = getPop(w); out.pops[w] = info;
  const r = runCareerF2(flat ? flatten(pop, w) : pop, { ...DEF3, seed: SEED, ...c }); out.runs[name] = { w, flat, ...summ(r, w) }; const a = out.runs[name].ages[3];
  console.log(SEED, name, `${((Date.now() - t0) / 1000).toFixed(0)}s`, 'age30', a.ovr.median, a.ovr.p90, a.ovr.p99, a.ovr.max, 'read', out.runs[name].energy.readMean.toFixed(0), 'eff', out.runs[name].energy.eff.toFixed(2));
}
const LV = [20, 50, 80, 95];
if (PART === 'core') {
  run('F2 (Potenciál v G 0,10) 80/20', { wPo: 0.10 });
  run('F3 základ (Potenciál len strop)', {});
  run('F3 základ, 4 Tour (všetky ligy)', { tours: 4 });
  run('F3 V 75/25', {}, 0.75);
  run('F3 V 80/20', {}, 0.8);
  for (const m of ['full', 'basic', 'advisor'] as const) run(`F3 režim ${m}`, { mode: m });
} else if (PART === 'grid') {
  // 16 controlled combinations: same start attributes and seed; all other hidden traits fixed at 50
  for (const po of LV) for (const tr of LV) run(`Po ${po} / Tr ${tr}`, { forceHidden: { po, tr, pr: 50, rec: 50, vit: 50 } });
  for (const po of LV) for (const tr of [20, 95]) run(`F2-väzba Po ${po} / Tr ${tr}`, { wPo: 0.10, forceHidden: { po, tr, pr: 50, rec: 50, vit: 50 } });
  for (const wt of [0.5, 0.7]) for (const tr of [20, 50, 95]) run(`wTr ${wt} / Tr ${tr}`, { wTr: wt, forceHidden: { po: 50, tr, pr: 50, rec: 50, vit: 50 } });
  for (const [cb, cs] of [[130, 1.0], [110, 1.0], [100, 1.2], [120, 0.8], [90, 1.3]] as const) run(`strop ${cb} + ${cs}×Pot`, { capBase: cb, capSlope: cs });
  for (const rec of LV) run(`Regenerácia ${rec} (úzka mapa 0,75–1,25)`, { forceHidden: { po: 50, tr: 50, pr: 50, rec, vit: 50 }, mode: 'advisor' });
  for (const rec of LV) run(`Regenerácia ${rec} (široká mapa 0,6–1,4)`, { recMap: 'wide', forceHidden: { po: 50, tr: 50, pr: 50, rec, vit: 50 }, mode: 'advisor' });
} else if (PART === 'univ') {
  run('Univerzál: základ (strop −15, plán, V 60/40)', {});
  for (const g of [0, 10, 20]) run(`Univerzál: strop gap ${g}`, { univGap: g });
  run('Univerzál: rovnomerný plán (7 atribútov)', { univPlan: 'even' });
  run('Univerzál: dynamický plán', { univDyn: true });
  run('Univerzál: plochý štart všetkých, gap 15', {}, 0.6, true);
  run('Univerzál: plochý štart všetkých, gap 0', { univGap: 0 }, 0.6, true);
  for (const w of [0.75, 0.8, 0.4, 0]) { run(`Univerzál: V ${w}, gap 15`, {}, w); run(`Univerzál: V ${w}, gap 0`, { univGap: 0 }, w); }
  run('Univerzál: gap 0 + rovnomerný plán', { univGap: 0, univPlan: 'even' });
} else if (PART === 'univ2') {
  const W0 = TACT_TYPE_W2[6].slice();
  for (const g of [0, 5]) run(`Univerzál2: gap ${g}`, { univGap: g });
  TACT_TYPE_W2[6] = [1.0, 0.6, 0.6, 0.6, 0.6];
  for (const g of [0, 5, 15]) run(`Univerzál2: gap ${g} + taktika 1,0/0,6`, { univGap: g });
  run('Univerzál2: gap 5 + taktika, V 75/25', { univGap: 5 }, 0.75);
  TACT_TYPE_W2[6] = W0;
  run('Univerzál2: gap 5, V 75/25 (pôvodná taktika)', { univGap: 5 }, 0.75);
} else if (PART === 'univ3') {
  const W0 = TACT_TYPE_W2[6].slice();
  run('Kandidát: gap 15, pôvodná taktika (referencia)', {});
  TACT_TYPE_W2[6] = [1.0, 0.6, 0.6, 0.6, 0.6];
  run('Kandidát: gap 10 + taktika 1,0/0,6', { univGap: 10 });
  run('Kandidát: gap 10 + taktika, V 75/25', { univGap: 10 }, 0.75);
  run('Kandidát: gap 10 + taktika, V 80/20', { univGap: 10 }, 0.8);
  TACT_TYPE_W2[6] = W0;
} else if (PART === 'energy') {
  for (const tb of ['prod', 'steep'] as const) for (const rec of [20, 50, 80]) for (const lm of [1, 1.4]) for (const [nm, c] of [['full', { mode: 'full' }], ['basic', { mode: 'basic' }], ['adv60', { mode: 'advisor', advMin: 60 }], ['adv80', { mode: 'advisor', advMin: 80 }], ['calendar', { mode: 'calendar' }]] as [string, Partial<CfgF2>][]) run(`tabuľka ${tb} / Reg ${rec} / záťaž ${lm} / ${nm}`, { effTable: tb, forceHidden: { po: 50, tr: 50, pr: 50, rec, vit: 50 }, raceLoadMul: lm, ...c });
} else if (PART === 'energy2') {
  // recalibration of the steep table: scale both coefficients by k (cPhys 1.8k, cTech 6.5k)
  for (const k of [1.0, 1.05, 1.10, 1.15, 1.20]) run(`steep kalibrácia k ${k}`, { effTable: 'steep', cPhys: 1.8 * k, cTech: 6.5 * k });
  for (const k of [1.0, 1.05, 1.10, 1.15, 1.20]) run(`steep kalibrácia k ${k} / záťaž 1.4`, { effTable: 'steep', cPhys: 1.8 * k, cTech: 6.5 * k, raceLoadMul: 1.4 });
  run('prod základ (referencia)', { effTable: 'prod' });
  run('prod záťaž 1.4 (referencia)', { effTable: 'prod', raceLoadMul: 1.4 });
} else if (PART === 'energy3') {
  const K = Number(process.argv[4] ?? 1.1);
  for (const m of [30, 40, 50, 60, 70, 80, 90]) run(`steep k${K} prah ${m}`, { effTable: 'steep', cPhys: 1.8 * K, cTech: 6.5 * K, advMin: m });
  for (const [nm, c] of [['full', { mode: 'full' }], ['basic', { mode: 'basic' }], ['calendar', { mode: 'calendar' }], ['random', { mode: 'random' }]] as [string, Partial<CfgF2>][]) run(`steep k${K} ${nm}`, { effTable: 'steep', cPhys: 1.8 * K, cTech: 6.5 * K, ...c });
  for (const lm of [0.6, 1.4, 2.0]) for (const [nm, c] of [['full', { mode: 'full' }], ['basic', { mode: 'basic' }], ['adv60', { mode: 'advisor', advMin: 60 }]] as [string, Partial<CfgF2>][]) run(`steep k${K} záťaž ${lm} / ${nm}`, { effTable: 'steep', cPhys: 1.8 * K, cTech: 6.5 * K, raceLoadMul: lm, ...c });
  for (const rec of [20, 50, 80]) for (const [nm, c] of [['full', { mode: 'full' }], ['basic', { mode: 'basic' }], ['adv60', { mode: 'advisor', advMin: 60 }]] as [string, Partial<CfgF2>][]) run(`steep k${K} Reg ${rec} / ${nm}`, { effTable: 'steep', cPhys: 1.8 * K, cTech: 6.5 * K, forceHidden: { po: 50, tr: 50, pr: 50, rec, vit: 50 }, ...c });
} else if (PART === 'calendar') {
  run('3 Tour všade', { tours: 3 });
  run('kalendár: 4 Tour iba Elite (pracovný návrh)', { tours: 0 });
  run('4 Tour od Pro', { tours4From: 3 });
  run('4 Tour od Continental', { tours4From: 2 });
  run('4 Tour všetky ligy', { tours: 4 });
  for (const [ek, tk] of [[7, 6], [21, 18]] as const) { run(`4 Tour všetky ligy, skúsenosti ×${ek / 14}`, { tours: 4, expK: ek, tactK: tk }); run(`3 Tour, skúsenosti ×${ek / 14}`, { tours: 3, expK: ek, tactK: tk }); }
  run('4 Tour všetky ligy, V 75/25', { tours: 4 }, 0.75); run('3 Tour, V 75/25', { tours: 3 }, 0.75);
  run('3 Tour, cap 100+1,2×Pot (strop pre 200)', { capBase: 100, capSlope: 1.2 });
}
// deterministic accumulator test (core only)
if (PART === 'core') {
  const TH12 = 12, res: any = {};
  for (const W of [0, 5, 20, 60]) for (const bug of [true, false]) {
    let A = 200, prog = 0; const pts = 1.0;
    for (let w = 0; w < W; w++) { const p = prog + TH12 * pts; let g = Math.floor((p + 1e-9) / TH12); g = Math.min(g, Math.max(0, 200 - A)); A += g; prog = Math.max(0, p - g * TH12); if (!bug && A >= 200) prog = 0; }
    const stored = prog; A -= 3; const afterDecline = A; const gain: number[] = [];
    for (let w = 1; w <= 4; w++) { const p = prog + TH12 * 0.3; let g = Math.floor((p + 1e-9) / TH12); g = Math.min(g, Math.max(0, 200 - A)); A += g; prog = Math.max(0, p - g * TH12); if (!bug && A >= 200) prog = 0; gain.push(A - afterDecline); }
    res[`${W} týždňov na 200 / ${bug ? 'bez opravy' : 's opravou'}`] = { storedProgress: stored, after1: gain[0], after4: gain[3], final: A };
  }
  out.accTest = res;
}
writeFileSync(new URL(`../../../../../../../docs/audit-ovr-career/careerF3_${PART}_${SEED}${process.argv[4] ? '_k' + process.argv[4] : ''}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.log('done', SEED, PART);
void TECH_IDX; void DEF2; void (null as unknown as PlanPolicy);
