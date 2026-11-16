import { writeFileSync, mkdirSync } from 'node:fs';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { generatePopulation, type SimRider } from '../population';
import { mean } from '../stats';
import { runCareer, defaultConfig, type CareerConfig, type CareerResult } from './engine';
import { summarize } from './summary';
import { NATTR, PERF_IDX, SEASONS, TOUR_STAGES, stageLoad, potentialCeiling, RACE_GROWTH, HARD_LOADS, declinePerSeason, POT_CEILING_BASE, POT_CEILING_SLOPE, POT_SLOWDOWN_SPAN, POT_REL_BASE, POT_REL_SLOPE } from './params';
import type { StrategyId } from './planners';

const SEED = Number(process.argv[2] ?? 20261115), N = Number(process.argv[3] ?? 10000);
const t0 = Date.now();
const pop = generatePopulation(N, SEED, { ageMin: 18, ageMax: 22, restedOnly: true });
const W = SEASONS + 1;

const runs: Record<string, any> = {};
const keep: Record<string, CareerResult> = {};
const defs: { id: string; cfg: CareerConfig; keep?: boolean }[] = [];
const add = (id: string, strategy: StrategyId, o: Partial<CareerConfig> = {}, keepRes = false) => defs.push({ id, cfg: { ...defaultConfig(strategy), ...o }, keep: keepRes });

const MAIN: StrategyId[] = ['specialist', 'allrounder', 'complex', 'racer', 'maxTraining', 'smart', 'noTrainRace', 'noTrainNoRace', 'oracle'];
for (const s of MAIN) add(`main:${s}`, s, {}, true);
for (const s of MAIN.filter((x) => x !== 'oracle')) add(`t3:${s}`, s, { tours: 3 });
for (const s of ['allrounder', 'complex', 'smart', 'noTrainRace'] as StrategyId[]) add(`bold:${s}`, s, { growth: 'bold' });
for (const s of ['maxTraining', 'smart', 'specialist'] as StrategyId[]) add(`nogate:${s}`, s, { gate: false });
for (const l of ['h24', 'h20'] as const) {
  for (const s of ['maxTraining', 'smart'] as StrategyId[]) { add(`load:${s}:${l}`, s, { hardLoad: l }); add(`load:${s}:${l}:nogate`, s, { hardLoad: l, gate: false }); }
}
for (const s of ['specialist', 'allrounder', 'complex', 'smart', 'maxTraining'] as StrategyId[]) add(`pot:${s}`, s, { potentialModel: 'experimental' });
for (const s of ['specialist', 'complex', 'smart', 'maxTraining'] as StrategyId[]) add(`potrel:${s}`, s, { potentialModel: 'experimentalRel' });
for (const s of ['specialist', 'complex', 'smart', 'maxTraining'] as StrategyId[]) add(`map:${s}`, s, { mapping: 'rescaled' });
for (const s of ['specialist', 'complex', 'smart'] as StrategyId[]) add(`fac:${s}`, s, { facilities: true });
for (const s of ['complex', 'smart', 'maxTraining'] as StrategyId[]) add(`race06:${s}`, s, { raceLoadScale: 0.6 });
add('decline:smart', 'smart', { decline: true });

for (const d of defs) {
  const t = Date.now();
  const res = runCareer(pop, d.cfg);
  runs[d.id] = summarize(res, pop);
  if (d.keep) keep[d.id] = res;
  console.log(`${d.id.padEnd(28)} OVR12 +${runs[d.id].snapshots.at(-1)!.growth.mean.toFixed(2)}  skipped ${runs[d.id].sessions.skipped.toFixed(1)}  exhausted ${runs[d.id].exhaustedRiders}  invalid ${res.invalidValues}  ${((Date.now() - t) / 1000).toFixed(1)}s`);
}

// ---------------------------------------------------------------- controlled identical riders
const mk = (id: number, hidden: Partial<SimRider['hidden']>, extra: Partial<SimRider> = {}): SimRider => {
  const attrs = {} as Record<SkillAttribute, number>; for (const k of SKILL_ATTRIBUTES) attrs[k] = 130;
  return { id, age: 20, attrs, hidden: { potential: 50, trainability: 50, professionalism: 50, recovery: 50, ...hidden }, energy: 100, fatigue: 0, focus: 'climbing', ...extra };
};
const ctrlDefs: { label: string; hidden: Partial<SimRider['hidden']>; group: string }[] = [{ label: 'základ 50/50/50/50', hidden: {}, group: 'base' }];
for (const [g, key] of [['potential', 'potential'], ['trainability', 'trainability'], ['recovery', 'recovery'], ['professionalism', 'professionalism']] as const) {
  for (const v of [10, 50, 95]) ctrlDefs.push({ label: `${g} ${v}`, hidden: { [key]: v }, group: g });
}
ctrlDefs.push({ label: 'A: potenciál 95, trénovateľnosť 50', hidden: { potential: 95, trainability: 50 }, group: 'cross' });
ctrlDefs.push({ label: 'B: potenciál 10, trénovateľnosť 95', hidden: { potential: 10, trainability: 95 }, group: 'cross' });
const ctrlPop = ctrlDefs.map((c, i) => mk(i + 1, c.hidden));
const controlled: any[] = [];
for (const strategy of ['specialist', 'maxTraining', 'complex', 'smart'] as StrategyId[]) {
  for (const potentialModel of ['existing', 'experimental', 'experimentalRel'] as const) {
    for (const mapping of ['direct', 'rescaled'] as const) {
      if (potentialModel !== 'existing' && mapping === 'rescaled') continue;
      const res = runCareer(ctrlPop, { ...defaultConfig(strategy), potentialModel, mapping });
      controlled.push({
        strategy, potentialModel, mapping,
        riders: ctrlDefs.map((c, i) => ({
          label: c.label, group: c.group,
          ovr: Array.from({ length: W }, (_, s) => res.ovr[i * W + s]),
          perf: Array.from({ length: W }, (_, s) => mean(PERF_IDX.map((k) => res.attrs[(i * W + s) * NATTR + k]))),
          focus: Array.from({ length: W }, (_, s) => res.attrs[(i * W + s) * NATTR + PERF_IDX[0]]),
          sessionsDone: res.sessionsDone[i], skipped: res.sessionsSkipped[i], exhaustedDays: res.exhaustedDays[i],
          preE: res.tourPreE[i], postE: res.tourPostE[i], postF: res.tourPostF[i], nextScore: res.nextWeekScore[i], stageREff: res.stageREff[i], tired: res.stageTiredShare[i],
        })),
      });
    }
  }
}
// recovery under multi-day Tours: hard training, no gate — shows the exhaustion price of low recovery
const recNoGate: any[] = [];
for (const r of [10, 50, 95]) {
  const res = runCareer([mk(1, { recovery: r })], { ...defaultConfig('maxTraining'), gate: false });
  recNoGate.push({ recovery: r, ovr12: res.ovr[SEASONS], exhaustedDays: res.exhaustedDays[0], skipped: res.sessionsSkipped[0], postE: res.tourPostE[0], postF: res.tourPostF[0], stageREff: res.stageREff[0], tired: res.stageTiredShare[0] });
}

// ---------------------------------------------------------------- aging (separate experiment)
const vet = (hid: Partial<SimRider['hidden']>) => mk(1, hid, { age: 30 });
const aging: any[] = [];
for (const decline of [false, true]) for (const strategy of ['specialist', 'noTrainRace'] as StrategyId[]) {
  const rider = vet({}); for (const k of SKILL_ATTRIBUTES) rider.attrs[k] = 150;
  const res = runCareer([rider], { ...defaultConfig(strategy), decline });
  aging.push({ decline, strategy, perf: Array.from({ length: W }, (_, s) => mean(PERF_IDX.map((k) => res.attrs[(s) * NATTR + k]))), ovr: Array.from({ length: W }, (_, s) => res.ovr[s]), age: Array.from({ length: W }, (_, s) => 30 + Math.max(0, s - 1)) });
}

// ---------------------------------------------------------------- careers
const M = (id: string) => keep[id];
const smart = M('main:smart');
const growth = (r: CareerResult, i: number) => r.ovr[i * W + SEASONS] - r.ovr[i * W];
const ids = Array.from({ length: N }, (_, i) => i);
const chosen: { i: number; label: string }[] = [];
const pick = (label: string, cands: number[], better: (a: number, b: number) => number) => {
  const sorted = cands.filter((i) => !chosen.some((c) => c.i === i)).sort(better);
  if (sorted.length) chosen.push({ i: sorted[0], label });
};
const h = (i: number) => pop[i].hidden;
const g = (i: number) => growth(smart, i);
const medG = (() => { const v = ids.map(g).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; })();
const medOvr = (() => { const v = ids.map((i) => smart.ovr[i * W + SEASONS]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; })();
const o12 = (r: CareerResult, i: number) => r.ovr[i * W + SEASONS];
const sumH = (i: number) => h(i).potential + h(i).trainability + h(i).professionalism + h(i).recovery;
const minH = (i: number) => Math.min(h(i).potential, h(i).trainability, h(i).professionalism, h(i).recovery);
pick('Najlepší jazdec (najvyšší OVR po 12 sezónach)', ids, (a, b) => o12(smart, b) - o12(smart, a) || g(b) - g(a));
pick('Priemerný jazdec (OVR najbližšie k mediánu)', ids, (a, b) => Math.abs(o12(smart, a) - medOvr) - Math.abs(o12(smart, b) - medOvr) || a - b);
pick('Najslabší jazdec (najnižší OVR po 12 sezónach)', ids, (a, b) => o12(smart, a) - o12(smart, b) || g(a) - g(b));
pick('Najväčší rast OVR', ids, (a, b) => g(b) - g(a));
pick('Vysoký potenciál (≥81), nízka trénovateľnosť (≤20) — najlepší rast', ids.filter((i) => h(i).potential >= 81 && h(i).trainability <= 20), (a, b) => g(b) - g(a));
pick('Nízky potenciál (≤20), vysoká trénovateľnosť (≥81) — najlepší rast', ids.filter((i) => h(i).potential <= 20 && h(i).trainability >= 81), (a, b) => g(b) - g(a));
pick('Vysoký potenciál, priemerná trénovateľnosť (41–60) — najlepší rast', ids.filter((i) => h(i).potential >= 81 && h(i).trainability >= 41 && h(i).trainability <= 60), (a, b) => g(b) - g(a));
pick('Nízky potenciál, vysoká trénovateľnosť — medián rastu', ids.filter((i) => h(i).potential <= 20 && h(i).trainability >= 81), (a, b) => Math.abs(g(a) - medG) - Math.abs(g(b) - medG));
pick('Výnimočná regenerácia (≥96) — najlepší rast', ids.filter((i) => h(i).recovery >= 96), (a, b) => g(b) - g(a));
pick('Veľmi nízka regenerácia (≤10) — najviac vyčerpaných dní pri maximálnom tréningu', ids.filter((i) => h(i).recovery <= 10), (a, b) => M('main:maxTraining').exhaustedDays[b] - M('main:maxTraining').exhaustedDays[a]);
pick('Výnimočná kombinácia — najvyšší súčet skrytých vlastností', ids, (a, b) => sumH(b) - sumH(a));
pick('Vyvážený talent — najvyššie minimum zo skrytých vlastností', ids, (a, b) => minH(b) - minH(a) || sumH(b) - sumH(a));
const spread = (i: number) => { const v = ['specialist', 'allrounder', 'complex', 'racer', 'maxTraining', 'smart'].map((s) => o12(M(`main:${s}`), i)); return Math.max(...v) - Math.min(...v); };
pick('Najväčší vplyv stratégie manažéra (rozdiel najlepšej a najhoršej stratégie)', ids, (a, b) => spread(b) - spread(a));
pick('Stratégia s rozumným plánovaním ďaleko predbehla maximálny tréning', ids, (a, b) => (o12(smart, b) - o12(M('main:maxTraining'), b)) - (o12(smart, a) - o12(M('main:maxTraining'), a)));
pick('Maximálny tréning ďaleko predbehol rozumné plánovanie', ids, (a, b) => (o12(M('main:maxTraining'), b) - o12(smart, b)) - (o12(M('main:maxTraining'), a) - o12(smart, a)));
pick('Komplexný jazdec získal najviac oproti špecialistovi', ids, (a, b) => (o12(M('main:complex'), b) - o12(M('main:specialist'), b)) - (o12(M('main:complex'), a) - o12(M('main:specialist'), a)));
pick('Najstarší štart (22) — najlepší rast', ids.filter((i) => pop[i].age === 22), (a, b) => g(b) - g(a));
pick('Najmladší štart (18) — najlepší rast', ids.filter((i) => pop[i].age === 18), (a, b) => g(b) - g(a));
pick('Silné skryté vlastnosti, ale podpriemerný rast', ids.filter((i) => g(i) < medG), (a, b) => sumH(b) - sumH(a));
pick('Slabé skryté vlastnosti, ale nadpriemerný rast', ids.filter((i) => g(i) > medG), (a, b) => sumH(a) - sumH(b));
const careers = chosen.map(({ i, label }) => ({
  label, id: pop[i].id, startAge: pop[i].age, hidden: pop[i].hidden,
  start: Object.fromEntries(SKILL_ATTRIBUTES.map((k, q) => [k, smart.attrs[(i * W) * NATTR + q]])),
  final: Object.fromEntries(SKILL_ATTRIBUTES.map((k, q) => [k, smart.attrs[(i * W + SEASONS) * NATTR + q]])),
  ovrBySeason: Array.from({ length: W }, (_, s) => smart.ovr[i * W + s]),
  ovr12ByStrategy: Object.fromEntries(['specialist', 'allrounder', 'complex', 'racer', 'maxTraining', 'smart', 'noTrainRace', 'noTrainNoRace', 'oracle'].map((s) => [s, o12(M(`main:${s}`), i)])),
  smartSessions: { done: smart.sessionsDone[i], skipped: smart.sessionsSkipped[i] },
  maxExhaustedDays: M('main:maxTraining').exhaustedDays[i],
}));

// ---------------------------------------------------------------- hidden-population stats
const hiddenDist = (['potential', 'trainability', 'professionalism', 'recovery'] as const).map((k) => {
  const counts = [0, 0, 0, 0, 0, 0]; const edges = [20, 40, 60, 80, 95, 100];
  for (const r of pop) counts[edges.findIndex((e) => r.hidden[k] <= e)]++;
  return { key: k, counts, mean: mean(pop.map((r) => r.hidden[k])) };
});
const strat = TOUR_STAGES;
const stages = Object.fromEntries(Object.entries(strat).map(([w, list]) => [w, list.map((s) => ({ ...s, load: stageLoad(s), load06: stageLoad(s, 0.6) }))]));
const out = {
  meta: {
    seed: SEED, n: N, seasons: SEASONS, runs: defs.length, elapsedSec: (Date.now() - t0) / 1000,
    experimentalParams: { raceGrowth: RACE_GROWTH, hardLoads: HARD_LOADS, potential: { rel: { base: POT_REL_BASE, slope: POT_REL_SLOPE }, base: POT_CEILING_BASE, slope: POT_CEILING_SLOPE, span: POT_SLOWDOWN_SPAN, ceilings: [1, 10, 50, 95, 100].map((p) => [p, potentialCeiling(p)]) }, decline: [30, 31, 34, 37].map((a) => [a, declinePerSeason(a)]) },
    startOvrMean: mean(Array.from({ length: N }, (_, i) => keep['main:smart'].ovr[i * W])),
    ages: [18, 19, 20, 21, 22].map((a) => pop.filter((r) => r.age === a).length),
  },
  hiddenDist, stages, runs, controlled, recNoGate, aging, careers,
};
mkdirSync('../../docs/training-simulation/career', { recursive: true });
writeFileSync('../../docs/training-simulation/career/results.json', JSON.stringify(out));
console.log(`done in ${out.meta.elapsedSec.toFixed(1)}s, careers ${careers.length}`);
