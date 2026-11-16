/**
 * Training simulation runner — EXPERIMENT, no database, no production code is
 * modified. Writes docs/training-simulation/results.json.
 *   npx tsx src/lib/training/sim/run.cli.ts [seed] [n]
 * Defaults: seed 20261115, n 10000. Same seed => identical results.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { overallRating, riderOverall } from '@/lib/rider/score';
import { generatePopulation, HIDDEN_BANDS, HIDDEN_KEYS, type SimRider } from './population';
import { runScenario, type RunResult, type ScenarioConfig, type Policy, type CalendarKind, type ModelKind } from './model';
import { dist, mean, percentile, sorted } from './stats';

const SEED = Number(process.argv[2] ?? 20261115);
const N = Number(process.argv[3] ?? 10000);
const pop = generatePopulation(N, SEED);

// ---- population statistics -------------------------------------------------
const bandOf = (v: number) => HIDDEN_BANDS.findIndex((b) => v >= b.lo && v <= b.hi);
const hiddenStats = Object.fromEntries(HIDDEN_KEYS.map((k) => {
  const vals = pop.map((r) => r.hidden[k]);
  const counts = HIDDEN_BANDS.map(() => 0); vals.forEach((v) => counts[bandOf(v)]++);
  return [k, { counts, shares: counts.map((c) => c / N), mean: mean(vals), median: percentile(sorted(vals), 50), min: Math.min(...vals), max: Math.max(...vals) }];
}));
function corr(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
}
const correlations: Record<string, number> = {};
for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) correlations[`${HIDDEN_KEYS[i]}~${HIDDEN_KEYS[j]}`] = corr(pop.map((r) => r.hidden[HIDDEN_KEYS[i]]), pop.map((r) => r.hidden[HIDDEN_KEYS[j]]));
const h = (r: SimRider) => r.hidden;
const cnt = (f: (r: SimRider) => boolean) => pop.filter(f).length;
const share = (lo: number) => HIDDEN_BANDS.filter((b) => b.lo >= lo).reduce((s, b) => s + b.share, 0);
const combos = [
  { name: 'Potenciál 96–100', count: cnt((r) => h(r).potential >= 96), expected: N * 0.01 },
  { name: 'Potenciál 96–100 a trénovateľnosť > 80', count: cnt((r) => h(r).potential >= 96 && h(r).trainability > 80), expected: N * 0.01 * share(81) },
  { name: 'Potenciál ≥ 81 a trénovateľnosť ≥ 81', count: cnt((r) => h(r).potential >= 81 && h(r).trainability >= 81), expected: N * share(81) ** 2 },
  { name: 'Všetky štyri ≥ 61', count: cnt((r) => HIDDEN_KEYS.every((k) => h(r)[k] >= 61)), expected: N * share(61) ** 4 },
  { name: 'Aspoň tri zo štyroch ≥ 81', count: cnt((r) => HIDDEN_KEYS.filter((k) => h(r)[k] >= 81).length >= 3), expected: N * (4 * share(81) ** 3 * (1 - share(81)) + share(81) ** 4) },
  { name: 'Všetky štyri ≥ 81 (výnimočná kombinácia)', count: cnt((r) => HIDDEN_KEYS.every((k) => h(r)[k] >= 81)), expected: N * share(81) ** 4 },
  { name: 'Všetky štyri ≥ 96', count: cnt((r) => HIDDEN_KEYS.every((k) => h(r)[k] >= 96)), expected: N * 0.01 ** 4 },
  { name: 'Všetky štyri ≤ 20 (najslabšia kombinácia)', count: cnt((r) => HIDDEN_KEYS.every((k) => h(r)[k] <= 20)), expected: N * 0.1 ** 4 },
];

// segments by the mean of the four hidden values
const q4 = pop.map((r) => mean(HIDDEN_KEYS.map((k) => h(r)[k])));
const order = pop.map((_, i) => i).sort((a, b) => q4[a] - q4[b] || a - b);
const seg = {
  weak: order.slice(0, Math.floor(N * 0.2)),
  average: order.slice(Math.floor(N * 0.4), Math.floor(N * 0.6)),
  exceptional: order.slice(Math.floor(N * 0.99)),
};

// ---- scenario matrix --------------------------------------------------------
const POLICIES: Policy[] = ['none', 'light', 'normal', 'hard', 'rotate', 'smart'];
const MODELS: ModelKind[] = ['weekly', 'daily', 'dailyGate'];
const cfgs: ScenarioConfig[] = [];
for (const model of MODELS) for (const calendar of ['noTour', 'tour'] as CalendarKind[]) for (const policy of POLICIES) cfgs.push({ model, policy, calendar });
for (const model of ['daily', 'dailyGate'] as ModelKind[]) for (const policy of ['hard', 'smart'] as Policy[]) cfgs.push({ model, policy, calendar: 'tourLoad' });
for (const policy of ['hard', 'smart'] as Policy[]) cfgs.push({ model: 'dailyGate', policy, calendar: 'noTour', mapping: 'direct' });
for (const policy of ['hard', 'smart'] as Policy[]) cfgs.push({ model: 'weekly', policy, calendar: 'noTour', mapping: 'direct' });
const keyOf = (c: ScenarioConfig) => `${c.model}|${c.policy}|${c.calendar}|${c.mapping ?? 'rescaled'}`;

const runs = new Map<string, RunResult>();
const t0 = Date.now();
for (const c of cfgs) runs.set(keyOf(c), runScenario(pop, c));
const elapsed = Date.now() - t0;

const gains = (r: RunResult, which: 1 | 3) => Array.from(which === 1 ? r.ovr1 : r.ovr3, (v, i) => v - r.ovr0[i]);
const segMean = (r: RunResult, ids: number[], which: 1 | 3) => { const g = which === 1 ? r.ovr1 : r.ovr3; return mean(ids.map((i) => g[i] - r.ovr0[i])); };
const segFocus = (r: RunResult, ids: number[]) => mean(ids.map((i) => r.focusGain3[i]));
const THRESH = [140, 145, 150, 155, 160];
const above = (arr: Float64Array, t: number, strict = false) => { let c = 0; for (const v of arr) if (strict ? v > t : v >= t) c++; return c; };

const summaries = [...runs.entries()].map(([key, r]) => ({
  key, ...r.cfg, mapping: r.cfg.mapping ?? 'rescaled',
  ovrGain1: dist(gains(r, 1)), ovrGain3: dist(gains(r, 3)),
  focusGain1: mean(r.focusGain1), focusGain3: mean(r.focusGain3),
  attrGain1: r.attrGain1, attrGain3: r.attrGain3,
  weekEndEnergy: r.weekEndEnergy, weekEndFatigue: r.weekEndFatigue,
  trainWeekEnergy: r.trainWeekEnergy, trainWeekFatigue: r.trainWeekFatigue,
  sessionsPlanned: r.sessionsPlanned, sessionsDone: r.sessionsDone, sessionsSkipped: r.sessionsSkipped,
  plannedWeeksPerRider: r.plannedWeeks / N,
  readinessBands: r.readinessBands, exhaustedRiders: r.exhaustedRiders, exhaustedRiderDays: r.exhaustedRiderDays,
  invalidValues: r.invalidValues,
  segments: {
    weak: { s1: segMean(r, seg.weak, 1), s3: segMean(r, seg.weak, 3), focus3: segFocus(r, seg.weak) },
    average: { s1: segMean(r, seg.average, 1), s3: segMean(r, seg.average, 3), focus3: segFocus(r, seg.average) },
    exceptional: { s1: segMean(r, seg.exceptional, 1), s3: segMean(r, seg.exceptional, 3), focus3: segFocus(r, seg.exceptional) },
  },
  ovrAbove: { start: THRESH.map((t) => above(r.ovr0, t)), s1: THRESH.map((t) => above(r.ovr1, t)), s3: THRESH.map((t) => above(r.ovr3, t)) },
  rookieLegacy: { startAbove75: above(r.legacy0, 75, true), s1Above95: above(r.legacy1, 95, true), s3Above95: above(r.legacy3, 95, true), maxStart: Math.max(...r.legacy0), maxS3: Math.max(...r.legacy3) },
}));

// influence of each hidden value on the trained attribute's gain (3 seasons) — one scenario per model
const influenceKeys = ['weekly|hard|noTour|rescaled', 'dailyGate|hard|noTour|rescaled', 'dailyGate|smart|noTour|rescaled', 'dailyGate|hard|noTour|direct'];
const influence = Object.fromEntries(influenceKeys.map((k) => {
  const r = runs.get(k)!;
  return [k, Object.fromEntries(HIDDEN_KEYS.map((hk) => [hk, HIDDEN_BANDS.map((b) => {
    const ids = pop.map((p, i) => (p.hidden[hk] >= b.lo && p.hidden[hk] <= b.hi ? i : -1)).filter((i) => i >= 0);
    return { band: `${b.lo}–${b.hi}`, n: ids.length, focusGain3: mean(ids.map((i) => r.focusGain3[i])), ovrGain3: mean(ids.map((i) => r.ovr3[i] - r.ovr0[i])) };
  })]))];
}));
// age effect
const ageBands = [[18, 22], [23, 27], [28, 32], [33, 39]];
const ageEffect = Object.fromEntries(['weekly|hard|noTour|rescaled', 'dailyGate|smart|noTour|rescaled'].map((k) => {
  const r = runs.get(k)!;
  return [k, ageBands.map(([lo, hi]) => { const ids = pop.map((p, i) => (p.age >= lo && p.age <= hi ? i : -1)).filter((i) => i >= 0); return { band: `${lo}–${hi}`, n: ids.length, focusGain3: mean(ids.map((i) => r.focusGain3[i])), ovrGain3: mean(ids.map((i) => r.ovr3[i] - r.ovr0[i])) }; })];
}));

// does Potential matter when riders are already strong? (same riders, the 7 Performance attributes lifted by +22 => overall ~150)
import { PERFORMANCE_FOCUS } from '../config';
const popHigh = pop.map((r) => { const a = { ...r.attrs }; for (const k of PERFORMANCE_FOCUS) a[k] = Math.min(200, a[k] + 22); return { ...r, attrs: a }; });
const highLevel = Object.fromEntries((['rescaled', 'direct'] as const).map((mapping) => {
  const r = runScenario(popHigh, { model: 'weekly', policy: 'hard', calendar: 'noTour', mapping });
  const rows = HIDDEN_BANDS.map((b) => {
    const ids = popHigh.map((p, i) => (p.hidden.potential >= b.lo && p.hidden.potential <= b.hi ? i : -1)).filter((i) => i >= 0);
    return { band: `${b.lo}–${b.hi}`, n: ids.length, focusGain3: mean(ids.map((i) => r.focusGain3[i])) };
  });
  return [mapping, { startOvr: mean(Array.from(r.ovr0)), rows }];
}));

// sensitivity of the proposed HARD session load (evaluation only — nothing is adopted)
const LOADS: { label: string; load: { energy: number; fatigue: number } }[] = [
  { label: 'Návrh: −24 / +18', load: { energy: 24, fatigue: 18 } }, { label: '−22 / +16', load: { energy: 22, fatigue: 16 } },
  { label: '−20 / +15', load: { energy: 20, fatigue: 15 } }, { label: '−18 / +14', load: { energy: 18, fatigue: 14 } },
];
const loadSensitivity = LOADS.flatMap((l) => (['daily', 'dailyGate'] as ModelKind[]).map((model) => {
  const r = runScenario(pop, { model, policy: 'hard', calendar: 'noTour', loadOverride: { hard: l.load } });
  return { label: l.label, model, focusGain3: mean(r.focusGain3), ovrGain3: mean(Array.from(r.ovr3, (v, i) => v - r.ovr0[i])), trainWeekEnergy: r.trainWeekEnergy, trainWeekFatigue: r.trainWeekFatigue,
    exhaustedRiders: r.exhaustedRiders, skipped: r.sessionsSkipped, planned: r.sessionsPlanned,
    exhaustedByRecovery: [[1, 20], [21, 40], [41, 60], [61, 80], [81, 100]].map(([lo, hi]) => { const ids = pop.map((p, i) => (p.hidden.recovery >= lo && p.hidden.recovery <= hi ? i : -1)).filter((i) => i >= 0); const sub = ids.map((i) => pop[i]); const rr = runScenario(sub, { model, policy: 'hard', calendar: 'noTour', loadOverride: { hard: l.load } }); return { band: `${lo}–${hi}`, n: sub.length, exhausted: rr.exhaustedRiders, focusGain3: mean(rr.focusGain3) }; }) };
}));

// ---- ten careers -------------------------------------------------------------
const SHOW = ['weekly|none|tour|rescaled', 'weekly|hard|tour|rescaled', 'daily|hard|tour|rescaled', 'dailyGate|hard|tour|rescaled', 'dailyGate|smart|tour|rescaled'];
const ref = runs.get('dailyGate|smart|tour|rescaled')!;
const gainRef = (i: number) => ref.ovr3[i] - ref.ovr0[i];
const focusRef = (i: number) => ref.focusGain3[i];
const idx = pop.map((_, i) => i);
function best(filter: (r: SimRider) => boolean, score: (i: number) => number, used: Set<number>): number {
  const c = idx.filter((i) => !used.has(i) && filter(pop[i])); c.sort((a, b) => score(b) - score(a) || a - b); return c[0];
}
const used = new Set<number>(); const picks: { title: string; i: number }[] = [];
const add = (title: string, i: number | undefined) => { if (i == null) return; used.add(i); picks.push({ title, i }); };
add('Najväčší rast (po 3 sezónach, inteligentné plánovanie)', best(() => true, (i) => focusRef(i), used));
add('Potenciál 96–100 a trénovateľnosť > 80', best((r) => r.hidden.potential >= 96 && r.hidden.trainability > 80, (i) => focusRef(i), used));
add('Obrovský talent, pomalé učenie (potenciál ≥ 96, trénovateľnosť ≤ 20)', best((r) => r.hidden.potential >= 96 && r.hidden.trainability <= 20, (i) => pop[i].hidden.potential, used));
add('Rýchle učenie, nízky strop (trénovateľnosť ≥ 96, potenciál ≤ 20)', best((r) => r.hidden.trainability >= 96 && r.hidden.potential <= 20, (i) => focusRef(i), used));
add('Všetky štyri ≥ 61 (najlepšia kombinácia)', best((r) => HIDDEN_KEYS.every((k) => r.hidden[k] >= 61), (i) => HIDDEN_KEYS.reduce((s, k) => s + pop[i].hidden[k], 0), used));
add('Najslabšia kombinácia (najnižší súčet skrytých hodnôt)', best(() => true, (i) => -HIDDEN_KEYS.reduce((s, k) => s + pop[i].hidden[k], 0), used));
add('Slabá regenerácia (≤ 10), vysoká trénovateľnosť (≥ 81) — tvrdý tréning', best((r) => r.hidden.recovery <= 10 && r.hidden.trainability >= 81, (i) => pop[i].hidden.trainability, used));
add('Výborná regenerácia (≥ 96), vysoká trénovateľnosť (≥ 81)', best((r) => r.hidden.recovery >= 96 && r.hidden.trainability >= 81, (i) => focusRef(i), used));
add('Najstarší jazdec s najlepšou trénovateľnosťou (vek ≥ 33)', best((r) => r.age >= 33, (i) => pop[i].hidden.trainability, used));
add('Typický jazdec (medián skrytých hodnôt, vek ≤ 22)', best((r) => r.age <= 22, (i) => -Math.abs(q4[i] - percentile(sorted(q4), 50)), used));
const careers = picks.map(({ title, i }) => {
  const p = pop[i];
  return {
    title, id: p.id, age: p.age, hidden: p.hidden, energy: p.energy, fatigue: p.fatigue, focus: p.focus, ovrStart: overallRating(p.attrs), focusStart: p.attrs[p.focus],
    outcomes: Object.fromEntries(SHOW.map((k) => { const r = runs.get(k)!; return [k, { ovrGain3: r.ovr3[i] - r.ovr0[i], focusGain3: r.focusGain3[i] }]; })),
  };
});

const out = {
  meta: { seed: SEED, n: N, seasons: 3, weeksPerSeason: 10, runs: cfgs.length, elapsedMs: elapsed, generated: new Date().toISOString().slice(0, 10) },
  hiddenBands: HIDDEN_BANDS, hiddenStats, correlations, combos,
  segments: { sizes: { weak: seg.weak.length, average: seg.average.length, exceptional: seg.exceptional.length } },
  attributes: SKILL_ATTRIBUTES, startMean: { ovr: mean(Array.from(runs.get('weekly|none|noTour|rescaled')!.ovr0)), legacy: mean(Array.from(runs.get('weekly|none|noTour|rescaled')!.legacy0)) },
  summaries, influence, ageEffect, highLevel, loadSensitivity, careers,
};
mkdirSync('../../docs/training-simulation', { recursive: true });
writeFileSync('../../docs/training-simulation/results.json', JSON.stringify(out));
console.log(`seed ${SEED}, n ${N}, ${cfgs.length} runs in ${(elapsed / 1000).toFixed(1)} s, invalid values: ${summaries.reduce((s, x) => s + x.invalidValues, 0)}`);
