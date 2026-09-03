import { performance } from 'node:perf_hooks';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { Terrain, ZERO_ATTRIBUTES, Attributes } from '../src/types/terrain.js';
import { RiderSnapshot } from '../src/types/domain.js';
import { BALANCE_V1, BreakawayEffort, ChaseIntensity } from '../src/config/balance.js';
import { buildStageSnapshot, Rng } from '../src/core/snapshot.js';
import { simulateStage, SimulationResult } from '../src/core/segmentLoop.js';
import { experimentalHoldingThreshold } from '../src/core/struggle.js';

const B = BALANCE_V1;
const RP = experimentalHoldingThreshold(B.HOLDING_K);
const FIELD = 40, BREAK_SIZE = 5, ESTAB_KM = 15, RACED = 145, V_REF = 42, SIGMA = 12, MEAN_EP = 130;
const GAP = 180;
const RUNS = Number(process.env.RUNS ?? 2000);
const OUT = '/tmp/validate.json';

function gaussian(r: Rng) { const u = Math.max(r.next(), 1e-12), v = r.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function mk(id: string, lvl: number, e: BreakawayEffort, c: ChaseIntensity): RiderSnapshot {
  const a: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = lvl;
  return { id, attributes: a, condition: 1, setup: 1, weather: 1, startEnergy: 100,
    tactics: { breakawayEffort: e, chaseIntensity: c } };
}
interface Spec { id: string; label: string; chasers: number; intensity: ChaseIntensity }
const SPECS: Spec[] = [
  { id: 'B0', label: 'zero chase', chasers: 0, intensity: ChaseIntensity.NONE },
  { id: 'B1', label: 'weak 2x Medium', chasers: 2, intensity: ChaseIntensity.MEDIUM },
  { id: 'B2', label: 'normal 6x Medium', chasers: 6, intensity: ChaseIntensity.MEDIUM },
  { id: 'B3', label: 'strong 12x High', chasers: 12, intensity: ChaseIntensity.HIGH },
  { id: 'B4', label: 'team 4x High', chasers: 4, intensity: ChaseIntensity.HIGH },
];
const STAGE = { id: 'v', segments: [{ startKm: 0, lengthKm: RACED, terrain: Terrain.FLAT, referenceSpeedKmh: V_REF }] };

function build(spec: Spec, seed: number) {
  const rng = new Rng(seed);
  const lv = Array.from({ length: FIELD }, () => MEAN_EP + gaussian(rng) * SIGMA).sort((a, b) => b - a);
  const bi = new Set<number>(); let c = Math.floor(FIELD * 0.35);
  while (bi.size < BREAK_SIZE) bi.add(c++);
  const pi = lv.map((_, i) => i).filter(i => !bi.has(i));
  const step = Math.max(1, Math.floor(pi.length / (spec.chasers || 1)));
  const ci = new Set<number>();
  for (let i = 0; i < spec.chasers; i++) ci.add(pi[Math.min(i * step, pi.length - 1)]);
  const riders: RiderSnapshot[] = [], brk: string[] = [], pel: string[] = [], chs: string[] = [];
  lv.forEach((l, i) => { const id = `r${i}`;
    if (bi.has(i)) { riders.push(mk(id, l, BreakawayEffort.HARD, ChaseIntensity.NONE)); brk.push(id); }
    else { const w = ci.has(i); riders.push(mk(id, l, BreakawayEffort.NORMAL, w ? spec.intensity : ChaseIntensity.NONE));
      pel.push(id); if (w) chs.push(id); } });
  return { riders, brk, pel, chs };
}

function analyse(res: SimulationResult, brk: string[], chs: string[]) {
  const bs = new Set(brk), cs = new Set(chs);
  let maxGap = 0, catchKm: number | null = null, last: number | null = null;
  for (const t of res.timeline) {
    const lb = t.groups.find(g => g.size > 0 && g.riderIds.every(i => bs.has(i)));
    const lp = t.groups.find(g => g.size > 0 && g.riderIds.some(i => !bs.has(i)));
    if (lb && lp) { const gp = lp.timeSec - lb.timeSec;
      if (gp > maxGap) maxGap = gp; last = gp;
      if (gp <= 0 && catchKm === null) catchKm = ESTAB_KM + t.km; }
    else if (!lb && catchKm === null) catchKm = ESTAB_KM + t.km;
  }
  const all = [...res.riders.values()];
  const avg = (x: number[]) => x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN;
  const pg = res.groups.filter(g => g.riderIds.length > 0 && g.riderIds.some(i => !bs.has(i)));
  return { survived: catchKm === null, catchKm, maxGap, finishGap: catchKm === null ? last : null,
    brkE: avg(all.filter(r => bs.has(r.id)).map(r => r.energy)),
    chsE: avg(all.filter(r => cs.has(r.id)).map(r => r.energy)),
    largest: pg.length ? Math.max(...pg.map(g => g.riderIds.length)) : 0,
    splits: res.splits.length, clamp: res.clampHits };
}

const only = process.env.SCENARIO;
const store: Record<string, unknown> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
for (const spec of SPECS) {
  if (only && spec.id !== only) continue;
  const t0 = performance.now();
  const out = [];
  for (let seed = 1; seed <= RUNS; seed++) {
    const { riders, brk, pel, chs } = build(spec, seed);
    const snapshot = buildStageSnapshot({ stageId: spec.id, seed, riders, balance: B });
    const res = simulateStage({ snapshot, stage: STAGE, initialGroups: [brk, pel],
      initialGapSec: GAP, balance: B, options: { paceOnly: false, requiredPerformance: RP },
      recordTimeline: true });
    out.push(analyse(res, brk, chs));
  }
  store[spec.id] = { label: spec.label, runs: RUNS, ms: performance.now() - t0, out };
  writeFileSync(OUT, JSON.stringify(store));
  console.log(`${spec.id} done  ${RUNS} runs  ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
