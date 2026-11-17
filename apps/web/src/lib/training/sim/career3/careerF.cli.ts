/** Model F runner -> docs/audit-ovr-career/careerF_results.json (all numbers from really executed runs; seed 20261116, 10 000 riders, same population in every run) */
import { writeFileSync } from 'node:fs';
import { makePop, calibratedMu, snap, RTYPES, type Res3 } from './model3';
import { PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX } from '../career/params';
import { runCareerF, DEFF, PLANS, gMod, recMod, effF, type CfgF, type ResF } from './modelF';
import { tauE, piE, rhoE } from './modelE';
import { dist } from '../stats';

const N = 10000, SEED = 20261116, mu = calibratedMu(SEED), pop = makePop(N, SEED, mu);
const LG = ['Rookie', 'Amateur', 'Continental', 'Pro', 'Elite'], TH = [150, 160, 170, 180, 185, 190, 195], WS = [0.6, 0.75, 0.8];
const AGES = [18, 20, 23, 25, 28, 30, 32, 33, 35];
export const CAL: Partial<CfgF> = { cScale: 2.0, capBase: 130, techScale: 1.5, tactK: 12 };
const NAT: Record<string, number> = { 'Vrchár': 0, 'Puncheur': 1, 'Rovinár': 2, 'Šprintér': 3, 'Časovkár': 4, 'Univerzál': 5 };

const t3 = (x: ArrayLike<number>) => PERF_IDX.map((k) => x[k]).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3;
const m7 = (x: ArrayLike<number>) => PERF_IDX.reduce((s, k) => s + x[k], 0) / 7;
const bestT = (x: ArrayLike<number>) => Math.max(...TACT_IDX.map((k) => x[k])), bestTe = (x: ArrayLike<number>) => Math.max(...TECH_IDX.map((k) => x[k]));
const ovw = (x: ArrayLike<number>, w: number) => Math.min(200, Math.max(1, Math.round(0.6 * (w * t3(x) + (1 - w) * m7(x)) + 0.15 * bestT(x) + 0.10 * bestTe(x) + 0.15 * x[EXP_IDX])));
const pct = (a: ArrayLike<number>, t: number) => { let c = 0; for (let i = 0; i < a.length; i++) if (a[i] >= t) c++; return a.length ? (100 * c) / a.length : 0; };
const D = (a: number[]) => { const d = dist(a); return { median: d.median, p75: d.p75, p90: d.p90, p99: d.p99, max: d.max, mean: d.mean }; };
const natPlan = (r: Res3, i: number) => PLANS[NAT[RTYPES[r.arch[i]]]];
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function atAge(r: ResF, age: number) {
  const si = age - 17, xs = Array.from({ length: r.n }, (_, i) => snap(r, i, si)), lg = Array.from({ length: r.n }, (_, i) => r.league[i * r.S + Math.min(si, r.S - 1)]);
  const out: any = { age, byV: {}, attrs: {} };
  for (const w of WS) {
    const ov = xs.map((x) => ovw(x, w));
    out.byV[w] = { ovr: D(ov), share: Object.fromEntries(TH.map((t) => [t, pct(ov, t)])), byLeague: LG.map((nm, l) => { const o = ov.filter((_, i) => lg[i] === l); return { league: nm, n: o.length, median: o.length ? dist(o).median : null, p90: o.length ? dist(o).p90 : null, max: o.length ? dist(o).max : null, share: Object.fromEntries(TH.map((t) => [t, o.length ? pct(o, t) : null])) }; }) };
  }
  const ri = Array.from({ length: r.n }, (_, i) => i);
  out.attrs = { m7: mean(xs.map(m7)), top3: mean(xs.map(t3)), main1: mean(ri.map((i) => xs[i][natPlan(r, i).phys[0]])), main2: mean(ri.map((i) => xs[i][natPlan(r, i).phys[1]])), main3: mean(ri.map((i) => xs[i][natPlan(r, i).phys[2]])),
    others: mean(ri.map((i) => { const p = natPlan(r, i).phys; return mean(PERF_IDX.filter((k) => !p.includes(k)).map((k) => xs[i][k])); })), tech1: mean(ri.map((i) => xs[i][natPlan(r, i).tech[0]])), tech2: mean(ri.map((i) => xs[i][natPlan(r, i).tech[1]])), techBest: mean(xs.map(bestTe)),
    tactBest: mean(xs.map(bestT)), tactMean: mean(xs.map((x) => mean(TACT_IDX.map((k) => x[k])))), exp: mean(xs.map((x) => x[EXP_IDX])), expP10: dist(xs.map((x) => x[EXP_IDX])).p5, expP90: dist(xs.map((x) => x[EXP_IDX])).p95 };
  return out;
}
function peaks(r: ResF, w: number) { return Array.from({ length: r.n }, (_, i) => { let m = 0; for (let s = 0; s <= r.S; s++) m = Math.max(m, ovw(snap(r, i, s), w)); return m; }); }
function summ(r: ResF) {
  const a = [25, 30, 33].map((x) => atAge(r, x)), pk = WS.map((w) => peaks(r, w)); const e200 = Array.from(r.firstExp200).filter((x) => x > 0);
  const x30 = Array.from({ length: r.n }, (_, i) => snap(r, i, 13)), ri = Array.from({ length: r.n }, (_, i) => i);
  return { ages: a, peak: Object.fromEntries(WS.map((w, k) => [w, { ...Object.fromEntries(TH.map((t) => [t, pct(pk[k], t)])), max: Math.max(...pk[k]) }])),
    fatigue: { weekly: dist(Array.from(r.fatigueMean)).median, afterTour: dist(Array.from(r.fatigueAfterTour)).median, basicShare: dist(Array.from(r.basicShare)).median },
    disc30: mean(ri.map((i) => mean(natPlan(r, i).phys.map((k) => x30[i][k])))), exp200: { share: (100 * e200.length) / r.n, median: e200.length ? dist(e200).median : null, p5: e200.length ? dist(e200).p5 : null, p95: e200.length ? dist(e200).p95 : null } };
}
const out: any = { meta: { N, SEED, mu, cal: CAL, def: DEFF }, runs: {} };
const run = (name: string, c: Partial<CfgF>, keepFull = false) => { const t0 = Date.now(); const r = runCareerF(pop, { ...DEFF, ...CAL, ...c }); out.runs[name] = summ(r); const s = out.runs[name].ages[1].byV[0.6]; console.log(name, `${((Date.now() - t0) / 1000).toFixed(0)}s`, 'age30 V60', s.ovr.median, s.ovr.p90, s.ovr.p99, s.ovr.max, 'F tour', out.runs[name].fatigue.afterTour.toFixed(1), 'F wk', out.runs[name].fatigue.weekly.toFixed(1)); return keepFull ? r : null; };

// 0) the user's raw coefficients (no scale, no tech scale, capBase 120) and the calibrated recommendation
out.runs['F0 surové koeficienty (×1,0)'] = null; { const r = runCareerF(pop, { ...DEFF, capBase: 120, tactK: 12 }); out.runs['F0 surové koeficienty (×1,0)'] = summ(r); console.log('F0', out.runs['F0 surové koeficienty (×1,0)'].ages[1].byV[0.6].ovr); }
const rc = run('F1 kalibrované (smart režim, pevný plán)', {}, true);
out.full = { byAge: AGES.map((a) => atAge(rc!, a)), attrDev: [17, 18, 20, 23, 25, 28, 30, 33, 35].map((a) => atAge(rc!, a).attrs) };
for (const [k, nm] of [[4, 'hidden Potenciál'], [0, 'x']] as const) void k, nm;
// hidden-trait terciles (age 30, V 60/40)
{
  const ov = Array.from({ length: N }, (_, i) => ovw(snap(rc!, i, 13), 0.6)); const names = ['Potenciál', 'Trénovateľnosť', 'Profesionalita', 'Regenerácia', 'Vitalita']; out.terciles = {};
  names.forEach((nm, k) => { const v = Array.from({ length: N }, (_, i) => rc!.hidden[i * 5 + k]); const s = [...v].sort((a, b) => a - b), a = s[Math.floor(N / 3)], b = s[Math.floor((2 * N) / 3)]; const g: Record<string, number[]> = { nízky: [], stredný: [], vysoký: [] }; for (let i = 0; i < N; i++) g[v[i] < a ? 'nízky' : v[i] < b ? 'stredný' : 'vysoký'].push(ov[i]);
    out.terciles[nm] = Object.fromEntries(Object.entries(g).map(([q, o]) => [q, { median: dist(o).median, p90: dist(o).p90, ge170: pct(o, 170) }])); });
}
// concrete careers (rules, not hand-picked)
{
  const ov30 = Array.from({ length: N }, (_, i) => ovw(snap(rc!, i, 13), 0.6)), d = dist(ov30), ri = Array.from({ length: N }, (_, i) => i);
  const pick = (f: (i: number) => boolean, target: number) => { let b = -1, bs = Infinity; for (const i of ri) if (f(i)) { const s = Math.abs(ov30[i] - target); if (s < bs) { bs = s; b = i; } } return b; };
  const h = (i: number, k: number) => rc!.hidden[i * 5 + k]; const ty = (i: number) => RTYPES[rc!.arch[i]];
  const cs: Record<string, number> = { 'medián': pick(() => true, d.median), 'dobrý talent (p90)': pick((i) => h(i, 0) > 65, d.p90), 'výnimočný (najvyššie OVR)': pick(() => true, 999), 'vrchár (p90)': pick((i) => ty(i) === 'Vrchár', d.p90), 'šprintér (p90)': pick((i) => ty(i) === 'Šprintér', d.p90), 'univerzál (p90)': pick((i) => ty(i) === 'Univerzál', d.p90) };
  out.careers = Object.fromEntries(Object.entries(cs).map(([k, i]) => [k, { arch: ty(i), plan: natPlan(rc!, i).name, hidden: [0, 1, 2, 3, 4].map((q) => h(i, q)), path: Array.from({ length: rc!.S }, (_, s) => 'RACEP'[rc!.league[i * rc!.S + s]]).join(''), rows: [17, 20, 25, 30, 33, 35].map((a) => { const x = snap(rc!, i, a - 17); return { age: a, ovr: ovw(x, 0.6), ovr75: ovw(x, 0.75), perf: PERF_IDX.map((q) => x[q]), T: bestT(x), Te: bestTe(x), S: x[EXP_IDX], league: LG[rc!.league[i * rc!.S + Math.min(a - 17, rc!.S - 1)]] }; }) }]));
}
// 2) general growth of the 4 other physical attributes
for (const g of [0.20, 0.35, 0.50]) run(`gen ${g}`, { gen: g });
// 3) plan strategies
for (const p of ['fixed', 'rotate', 'adaptive', 'random'] as const) run(`plán: ${p}`, { plan: p });
// 4) modes with real energy/fatigue
for (const m of ['full', 'basic', 'tourBasic', 'randomMode'] as const) run(`režim: ${m}`, { mode: m });
for (const f of [15, 25, 35, 45]) run(`režim: smart (prah únavy ${f})`, { mode: 'smart', smartF: f });
for (const rec of [20, 50, 90]) for (const m of ['full', 'basic', 'smart'] as const) run(`Regenerácia ${rec} / ${m}`, { mode: m, forceHidden: { rec } });
// 5) hidden traits in isolation: all other traits fixed at 50, one varied
for (const [k, nm] of [['po', 'Potenciál'], ['tr', 'Trénovateľnosť'], ['pr', 'Profesionalita'], ['rec', 'Regenerácia'], ['vit', 'Vitalita']] as const) for (const v of [20, 50, 80]) run(`trait ${nm} ${v}`, { forceHidden: { po: 50, tr: 50, pr: 50, rec: 50, vit: 50, [k]: v } });
// 6) talent profiles (good manager: fixed natural plan, smart mode; plus bad manager: random plan, always 100 %)
const TAL: Record<string, CfgF['forceHidden']> = { 'priemerný jazdec': { po: 50, tr: 50, pr: 50, rec: 50, vit: 50 }, 'dobrý talent': { po: 75, tr: 70, pr: 65, rec: 60, vit: 60 }, 'výnimočný talent': { po: 92, tr: 85, pr: 75, rec: 70, vit: 70 } };
out.talents = {};
for (const [nm, fh] of Object.entries(TAL)) {
  const r = runCareerF(pop, { ...DEFF, ...CAL, forceHidden: fh }); const s = summ(r); const dev = [17, 18, 20, 23, 25, 28, 30, 33, 35].map((a) => ({ age: a, ...atAge(r, a).attrs, ovr60: D(Array.from({ length: N }, (_, i) => ovw(snap(r, i, a - 17), 0.6))), ovr75: D(Array.from({ length: N }, (_, i) => ovw(snap(r, i, a - 17), 0.75))) }));
  const techPath = Array.from({ length: 19 }, (_, k) => { const si = k; return mean(Array.from({ length: N }, (_, i) => snap(r, i, si)[natPlan(r, i).tech[0]])); });
  const techFirst = Object.fromEntries([120, 150, 170].map((t) => [t, (() => { const k = techPath.findIndex((v) => v >= t); return k < 0 ? null : 17 + k; })()]));
  out.talents[nm] = { summ: s, dev, techPath, techFirst };
  const rb = runCareerF(pop, { ...DEFF, ...CAL, forceHidden: fh, plan: 'random', mode: 'full' }); out.talents[nm + ' / zlý manažér (náhodný plán, 100 %)'] = { summ: summ(rb) };
  console.log('TAL', nm, JSON.stringify(s.ages[1].byV[0.6].ovr));
}
// 7) tactics/experience calibration
for (const tk of [9, 12, 16]) run(`tactK ${tk}`, { tactK: tk });
for (const ek of [10, 14, 18]) run(`expK ${ek}`, { expK: ek });
// 8) personal ceiling: Potential as speed only (no cap) vs soft cap vs hard cap
run('strop: žiadny osobný strop (Potenciál = rýchlosť)', { capMode: 'none', potSpeed: 0.4 }); run('strop: tvrdý', { capMode: 'hard' });
// 9) deterministic energy scenario: weeks to get below F = 25 after a Tour (F = 50), for each recovery trait and mode
out.energy = {};
for (const rec of [20, 50, 90]) { const rm = recMod(rec); const res: any = {}; for (const m of ['full', 'basic']) { let F = 50; const seq = [F]; for (let w = 1; w <= 6; w++) { const q = Math.min(0.9, DEFF.qBase * rm + (m === 'basic' ? DEFF.qBasic : 0)); F = F * (1 - q) + (m === 'basic' ? DEFF.loadBasic : DEFF.load100); seq.push(+F.toFixed(1)); } res[m] = { seq, eff: seq.map((f) => +effF(DEFF, f).toFixed(2)), eq: (m === 'basic' ? DEFF.loadBasic : DEFF.load100) / Math.min(0.9, DEFF.qBase * rm + (m === 'basic' ? DEFF.qBasic : 0)) }; } out.energy[rec] = res; }
// 10) hidden-trait modifiers: additive G (model F) vs multiplicative product (model E: tau*pi*rho*potential speed) over the population
{
  const G = pop.map((p) => gMod({ ...DEFF } as CfgF, p.hidden[1], p.hidden[2], p.hidden[0])), M = pop.map((p) => tauE(p.hidden[1]) * piE(p.hidden[2]) * rhoE(p.hidden[3]) * (0.5 + p.hidden[0] / 100));
  out.modifiers = { G: dist(G), Mult: dist(M), Gp1: dist(G).p5 };
}
writeFileSync(new URL('../../../../../../../docs/audit-ovr-career/careerF_results.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('done');
void TH;
