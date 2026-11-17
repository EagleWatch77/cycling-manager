/** Model F2 runner: `tsx careerF2.cli.ts <seed> core|extra` -> docs/audit-ovr-career/careerF2_<part>_<seed>.json (all numbers from really executed runs). */
import { writeFileSync } from 'node:fs';
import { PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX } from '../career/params';
import { makePop2, runCareerF2, DEF2, F1LIKE, PLANS2, NAMES2, snap2, ovrW, type CfgF2, type ResF2, type PopInfo } from './modelF2';
import { dist } from '../stats';

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
  return { ages: AGES.map((a) => atAge(r, a, w)), attrs: ATTR_AGES.map((a) => attrs(r, a)), peak: { ...Object.fromEntries(TH.map((t) => [t, pct(pk, t)])), max: Math.max(...pk) },
    energy: { readMean: D(Array.from(r.readMean)).median, readTour: D(Array.from(r.readAfterTour)).median, readTourStart: D(Array.from(r.readTourStart)).median, basicShare: D(Array.from(r.basicShare)).median, eff: D(Array.from(r.effMean)).median, weeksTrain: D(Array.from(r.weeksTrain)).median },
    cap200: { share: (100 * f200.length) / r.n, medianAge: f200.length ? dist(f200).median : null, p10Age: f200.length ? dist(f200).p5 : null, byAge: Object.fromEntries([22, 25, 28, 30, 33, 35].map((a) => [a, (100 * f200.filter((x) => x <= a).length) / r.n])), bankedMean: mean(banked), bankedShare: pct(banked, 1), maxProgP99: dist(maxP).p99, maxProgMax: dist(maxP).max },
    exp200: { share: (100 * e200.length) / r.n, median: e200.length ? dist(e200).median : null } };
}
const out: any = { seed: SEED, part: PART, runs: {}, pops: {} };
const popCache: Record<string, ReturnType<typeof makePop2>> = {};
const getPop = (w: number) => (popCache[w] ??= makePop2(N, SEED, w));
function run(name: string, c: Partial<CfgF2>, w = 0.6) {
  const t0 = Date.now(); const { pop, info } = getPop(w); out.pops[w] = info;
  const r = runCareerF2(pop, { ...DEF2, seed: SEED, ...c }); out.runs[name] = { w, ...summ(r, w) }; const a = out.runs[name].ages[3];
  console.log(SEED, name, `${((Date.now() - t0) / 1000).toFixed(0)}s`, 'age30', a.ovr.median, a.ovr.p90, a.ovr.p99, a.ovr.max, 'read', out.runs[name].energy.readMean.toFixed(0), 'eff', out.runs[name].energy.eff.toFixed(2));
}
const F1ABS = { cPhys: 2.5, cTech: 7.5 };
if (PART === 'core') {
  run('F2 surové koeficienty (cPhys 1, cTech 1)', { cPhys: 1, cTech: 1 });
  run('F1-like (model F na populácii F2)', F1LIKE);
  run('F1 + spoločný rozpočet', { ...F1LIKE, budget: 'shared', ...F1ABS, split: 0.8 });
  run('F1 + produkčná energia', { ...F1LIKE, energy: 'prod', mode: 'advisor' });
  run('F1 + oprava akumulátora', { ...F1LIKE, accBug: false });
  run('F2 so škálou F1 (abs. prírastky F, cPhys 2,5 / cTech 7,5)', F1ABS);
  run('F2 kalibrované 80/20', {});
  run('F2 kalibrované 75/25', { split: 0.75 });
  run('F2 kalibrované 85/15', { split: 0.85 });
  run('F2 kalibrované 80/20, 4 Tour', { tours: 4 });
  run('F2 kalibrované 85/15, 4 Tour', { split: 0.85, tours: 4 });
  run('F2 kalibrované 75/25, 4 Tour', { split: 0.75, tours: 4 });
  run('F2 V 75/25', {}, 0.75);
  run('F2 V 80/20', {}, 0.8);
  run('F2 V 75/25, 4 Tour', { tours: 4 }, 0.75);
  run('F2 V 80/20, 4 Tour', { tours: 4 }, 0.8);
} else if (PART === 'extra2') {
  for (const [nm, c] of [['100/0 (bez techniky)', { split: 1.0 }], ['80/20', {}], ['60/40', { split: 0.6 }], ['50/50', { split: 0.5 }]] as [string, Partial<CfgF2>][]) run(`rozpočet ${nm}`, c);
  for (const [nm, c] of [['100/0 (bez techniky), 4 Tour', { split: 1.0, tours: 4 }], ['60/40, 4 Tour', { split: 0.6, tours: 4 }]] as [string, Partial<CfgF2>][]) run(`rozpočet ${nm}`, c);
  for (const [tb, lm] of [['prod', 1], ['steep', 1], ['steep', 1.4]] as const) for (const [nm, c] of [['plnohodnotný', { mode: 'full' }], ['základný', { mode: 'basic' }], ['odporúčanie 40', { mode: 'advisor', advMin: 40 }], ['odporúčanie 60', { mode: 'advisor', advMin: 60 }], ['odporúčanie 80', { mode: 'advisor', advMin: 80 }], ['kalendárny', { mode: 'calendar' }]] as [string, Partial<CfgF2>][]) run(`tabuľka ${tb} / záťaž ×${lm} / ${nm}`, { ...c, effTable: tb, raceLoadMul: lm });
} else if (PART === 'extra3') {
  for (const cp of [1.8, 2.0, 2.2]) run(`4 Tour, cPhys ${cp}`, { tours: 4, cPhys: cp });
  for (const cp of [1.8, 2.0]) run(`V 75/25, 4 Tour, cPhys ${cp}`, { tours: 4, cPhys: cp }, 0.75);
  run('3 Tour, cPhys 1,8 (porovnanie)', { tours: 3 });
} else {
  for (const [nm, c] of [['režim: plnohodnotný', { mode: 'full' }], ['režim: základný', { mode: 'basic' }], ['odporúčanie prah 40', { advMin: 40 }], ['odporúčanie prah 60 (kalibrované)', {}], ['odporúčanie prah 80', { advMin: 80 }], ['režim: kalendárny (základný 2 týždne po Tour-e)', { mode: 'calendar' }], ['režim: náhodný 50:50', { mode: 'random' }]] as [string, Partial<CfgF2>][]) run(nm, c);
  for (const lm of [0.6, 1.4, 2.0]) for (const m of ['full', 'basic', 'advisor'] as const) run(`záťaž Tour ×${lm} / ${m}`, { raceLoadMul: lm, mode: m });
  for (const rec of [20, 50, 90]) for (const m of ['full', 'basic', 'advisor'] as const) run(`Regenerácia ${rec} / ${m}`, { forceHidden: { rec }, mode: m });
  for (const m of ['full', 'basic', 'advisor'] as const) run(`4 Tour + záťaž ×1,4 / ${m}`, { tours: 4, raceLoadMul: 1.4, mode: m });
  for (const [nm, c] of [['M1 Štandard (80/20, odporúčanie)', {}], ['M2 Intenzívny (85/15, vždy 100 %)', { mode: 'full', split: 0.85 }], ['M3 Opatrný (80/20, vždy základný)', { mode: 'basic' }], ['M4 Technik (75/25, odporúčanie)', { split: 0.75 }], ['M5 Rotujúci plán', { plan: 'rotate' }], ['M6 Mladý univerzál (3 sezóny Univerzál)', { plan: 'youthUniv' }], ['M7 Kalendárny režim', { mode: 'calendar' }], ['M8 Mladí 75/25, potom 85/15', { splitPolicy: 'youngTech' }], ['M9 Mladí 85/15, potom 75/25', { splitPolicy: 'youngPerf' }], ['M10 Adaptívny plán', { plan: 'adaptive' }], ['M11 Náhodný plán a režim', { plan: 'random', mode: 'random' }]] as [string, Partial<CfgF2>][]) run(nm, c);
  for (let k = 0; k < 7; k++) run(`vynútený plán ${NAMES2[k]}`, { forcePlan: k });
  run('vynútený plán Univerzál (dynamický: dva najslabšie)', { forcePlan: 6, univDyn: true });
  run('Univerzál dynamický pre Univerzálov', { univDyn: true });
  for (const [nm, fh] of [['priemerný jazdec', { po: 50, tr: 50, pr: 50, rec: 50, vit: 50 }], ['dobrý talent', { po: 75, tr: 70, pr: 65, rec: 60, vit: 60 }], ['výnimočný talent', { po: 92, tr: 85, pr: 75, rec: 70, vit: 70 }]] as const) run(`talent: ${nm}`, { forceHidden: fh });
}
// deterministic accumulator test (only in the core part): attribute at 200 trained W weeks, then decline of 3 points, then training weeks; model F (progress kept) vs F2 (progress discarded)
if (PART === 'core') {
  const TH12 = 12, res: any = {};
  for (const W of [0, 5, 20, 60]) for (const bug of [true, false]) {
    let A = 200, prog = 0; const pts = 1.0; // 1 point/week of training potential at the cap (room is already ~0 in the model; this is the worst case without room)
    for (let w = 0; w < W; w++) { const p = prog + TH12 * pts; let g = Math.floor((p + 1e-9) / TH12); g = Math.min(g, Math.max(0, 200 - A)); A += g; prog = Math.max(0, p - g * TH12); if (!bug && A >= 200) prog = 0; }
    const stored = prog; A -= 3; const afterDecline = A; const gain: number[] = [];
    for (let w = 1; w <= 4; w++) { const p = prog + TH12 * 0.3; let g = Math.floor((p + 1e-9) / TH12); g = Math.min(g, Math.max(0, 200 - A)); A += g; prog = Math.max(0, p - g * TH12); if (!bug && A >= 200) prog = 0; gain.push(A - afterDecline); }
    res[`${W} týždňov na 200 / ${bug ? 'F (chyba)' : 'F2 (oprava)'}`] = { storedProgress: stored, after1: gain[0], after4: gain[3], final: A };
  }
  out.accTest = res;
}
writeFileSync(new URL(`../../../../../../../docs/audit-ovr-career/careerF2_${PART}_${SEED}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.log('done', SEED, PART);
void TECH_IDX;
