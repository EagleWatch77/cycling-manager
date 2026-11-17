/** Career simulation 2 runner. tsx --tsconfig tsconfig.json src/lib/training/sim/career2/career2.cli.ts [sweep|main] */
import { writeFileSync, mkdirSync } from 'node:fs';
import { generatePopulation } from '../population';
import { runCareer2, DEFAULT, view, metricsOf, RTYPES, type Cfg, type Res } from './model2';
import { PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX } from '../career/params';
import { dist } from '../stats';

const N = 10000, SEED = 20261116;
const pop = generatePopulation(N, SEED, { ageMin: 17, ageMax: 17, restedOnly: true });
const AGES = [17, 20, 25, 28, 30, 32, 35];
const grp = (x: ArrayLike<number>, idx: number[]) => idx.reduce((s, i) => s + x[i], 0) / idx.length;
function summarize(r: Res) {
  const out: any = { cfg: r.cfg, byAge: {}, types: {}, exp200: {}, ex: {} };
  const med = (a: number[]) => dist(a).median;
  for (const age of AGES) {
    const si = age - r.cfg.startAge; if (si < 0 || si >= r.ages.length) continue;
    const m = Array.from({ length: r.n }, (_, i) => metricsOf(view(r, i, si)));
    const v = view; void v;
    const ov = m.map((x) => x.ovrCur), on = m.map((x) => x.ovrNew), V = m.map((x) => x.V);
    const at = (k: number) => Array.from({ length: r.n }, (_, i) => view(r, i, si)[k]);
    out.byAge[age] = {
      perfMean: med(Array.from({ length: r.n }, (_, i) => grp(view(r, i, si), PERF_IDX))), tactMean: med(Array.from({ length: r.n }, (_, i) => grp(view(r, i, si), TACT_IDX))),
      techMean: med(Array.from({ length: r.n }, (_, i) => grp(view(r, i, si), TECH_IDX))), expMed: med(at(EXP_IDX)), expP90: dist(at(EXP_IDX)).p90,
      T_best: med(m.map((x) => x.T)), Te_best: med(m.map((x) => x.Te)),
      V: dist(V), ovrCur: dist(ov), ovrNew: dist(on),
      V190: V.filter((x) => x >= 190).length, V185: V.filter((x) => x >= 185).length, ovrNew190: on.filter((x) => x >= 190).length, ovrNew185: on.filter((x) => x >= 185).length, ovrCur190: ov.filter((x) => x >= 190).length,
      maxPerfAttr: dist(Array.from({ length: r.n }, (_, i) => Math.max(...PERF_IDX.map((k) => view(r, i, si)[k])))),
    };
  }
  // experience 200: share and age distribution
  const ages200 = Array.from(r.firstExp200Age).filter((x) => x > 0);
  out.exp200 = { share: ages200.length / r.n, median: ages200.length ? dist(ages200).median : null, p10: ages200.length ? dist(ages200).p5 : null, p90: ages200.length ? dist(ages200).p95 : null, byAge: Object.fromEntries([28, 30, 32, 33, 35].map((a) => [a, ages200.filter((x) => x <= a).length / r.n])) };
  // per type, age 28 / 30 / 35 means
  for (const t of RTYPES) {
    const idx = r.types.map((x, i) => (x === t ? i : -1)).filter((i) => i >= 0);
    const row: any = { n: idx.length };
    for (const age of [17, 25, 30, 35]) { const si = age - r.cfg.startAge; const ms = idx.map((i) => metricsOf(view(r, i, si)));
      row[age] = { V: dist(ms.map((x) => x.V)).median, Vp99: dist(ms.map((x) => x.V)).p99, ovrCur: dist(ms.map((x) => x.ovrCur)).median, ovrNew: dist(ms.map((x) => x.ovrNew)).median, ovrNewP99: dist(ms.map((x) => x.ovrNew)).p99, S: dist(ms.map((x) => x.S)).median, T: dist(ms.map((x) => x.T)).median, Te: dist(ms.map((x) => x.Te)).median }; }
    out.types[t] = row;
  }
  // example riders at age 30: best OVR(new) per type
  const sc = r.cfg.startAge + 13 - r.cfg.startAge; void sc;
  for (const t of RTYPES) {
    const idx = r.types.map((x, i) => (x === t ? i : -1)).filter((i) => i >= 0);
    const si = 30 - r.cfg.startAge; const sorted = idx.map((i) => ({ i, o: metricsOf(view(r, i, si)).ovrNew })).sort((a, b) => a.o - b.o);
    const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].i;
    out.ex[t] = [0.5, 0.95].map((q) => { const i = pick(q); return { q, id: i, hidden: pop[i].hidden, age17: Array.from(view(r, i, 0)).map(Math.round), age25: Array.from(view(r, i, 8)).map(Math.round), age30: Array.from(view(r, i, 13)).map(Math.round), age35: Array.from(view(r, i, 18)).map(Math.round), m17: metricsOf(view(r, i, 0)), m30: metricsOf(view(r, i, 13)), m35: metricsOf(view(r, i, 18)) }; });
  }
  out.activity = { stagesPerSeasonMean: Array.from(r.stagesRidden).reduce((a, b) => a + b, 0) / r.n / r.cfg.seasons, trainWeeksPerSeason: Array.from(r.trainWeeks).reduce((a, b) => a + b, 0) / r.n / r.cfg.seasons, techWeeksPerSeason: Array.from(r.techWeeks).reduce((a, b) => a + b, 0) / r.n / r.cfg.seasons };
  return out;
}
const mode = process.argv[2] ?? 'main';
const base: Cfg = { ...DEFAULT, seasons: 18, startAge: 17 };
if (mode === 'sweep') {
  for (const expK of [7, 8]) for (const cap of [200]) {
    const r = runCareer2(pop.slice(0, 2000), { ...base, expK, capNonPerf: cap, path: 'std', cal: 'code' });
    const s = summarize(r); console.log('expK', expK, 'exp200', JSON.stringify(s.exp200), 'expMed@25/30/35', s.byAge[25].expMed, s.byAge[30].expMed, s.byAge[35].expMed);
  }
  for (const tactK of []) {
    const r = runCareer2(pop.slice(0, 2000), { ...base, expK: 4, tactK, capNonPerf: 200 });
    const s = summarize(r); console.log('tactK', tactK, 'tactMean@25/30/35', s.byAge[25].tactMean, s.byAge[30].tactMean, s.byAge[35].tactMean, 'Tbest', s.byAge[30].T_best);
  }
} else {
  const E = { expK: 7, tactK: 4, capNonPerf: 200, ms: true };
  const scen: Record<string, Cfg> = {
    'PROD_std': { ...base },                                                    // production behaviour (cap 160, no tactics/exp growth)
    'EXP_std_perf': { ...base, ...E, strategy: 'perf' },
    'EXP_std_perfTech': { ...base, ...E, strategy: 'perfTech' },
    'EXP_std_hard': { ...base, ...E, strategy: 'hard' },
    'EXP_fast_perfTech': { ...base, ...E, strategy: 'perfTech', path: 'fast' },
    'EXP_slow_perfTech': { ...base, ...E, strategy: 'perfTech', path: 'slow' },
    'EXP_rookie_perfTech': { ...base, ...E, strategy: 'perfTech', path: 'rookie' },
    'EXP_o026_perfTech': { ...base, ...E, strategy: 'perfTech', cal: 'o026' },
    'EXP_decline_perfTech': { ...base, ...E, strategy: 'perfTech', decline: true },
  };
  const all: any = {};
  for (const [k, c] of Object.entries(scen)) { all[k] = summarize(runCareer2(pop, c)); const b = all[k].byAge; console.log(k, 'perf@30', b[30].perfMean.toFixed(1), 'V99@30', b[30].V.p99.toFixed(1), 'V190', b[30].V190, 'OVRnew190@30', b[30].ovrNew190, 'exp200', all[k].exp200.share.toFixed(2), all[k].exp200.median); }
  mkdirSync(new URL('../../../../../../../docs/audit-ovr-career', import.meta.url), { recursive: true });
  writeFileSync(new URL('../../../../../../../docs/audit-ovr-career/career2_results.json', import.meta.url), JSON.stringify({ meta: { N, SEED, base }, scen: all }, null, 1));
}
if (mode === 'mult') {
  const E = { expK: 7, tactK: 4, capNonPerf: 200, ms: true, strategy: 'perfTech' as const };
  const rows: any = {};
  for (const m of [3, 5, 8, 12]) {
    const s = summarize(runCareer2(pop, { ...base, ...E, perfMult: m, decline: true })); rows[m] = s;
    console.log('mult', m, [25, 30, 35].map((a) => `${a}: perf ${s.byAge[a].perfMean.toFixed(0)} Vp99 ${s.byAge[a].V.p99.toFixed(0)} Vmax ${s.byAge[a].V.max.toFixed(0)} V190 ${s.byAge[a].V190} V185 ${s.byAge[a].V185} OVRnew190 ${s.byAge[a].ovrNew190} OVRcur190 ${s.byAge[a].ovrCur190}`).join(' | '));
  }
  writeFileSync(new URL('../../../../../../../docs/audit-ovr-career/career2_mult.json', import.meta.url), JSON.stringify(rows, null, 1));
}
