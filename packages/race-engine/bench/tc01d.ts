import { performance } from 'node:perf_hooks';
import { Terrain, ZERO_ATTRIBUTES, Attributes } from '../src/types/terrain.js';
import { RiderSnapshot } from '../src/types/domain.js';
import { BALANCE_V1, BreakawayEffort, ChaseIntensity, StageApproach } from '../src/config/balance.js';
import { buildStageSnapshot } from '../src/core/snapshot.js';
import { simulateStage } from '../src/core/segmentLoop.js';
import { experimentalHoldingThreshold } from '../src/core/struggle.js';

const B = BALANCE_V1;
const BASE = 130;
const REF: Record<string, number> = { FLAT: 44, HILLY: 38, CLASSICS: 40, MOUNTAIN: 24, DESCENT: 58 };

/* TC-01C archetype shapes, reused unchanged */
type Adj = Partial<Record<keyof Attributes, number>>;
const SHAPES: [string, Adj][] = [
  ['Climber', { climbing: +25, hills: +15, endurance: +10, acceleration: +5,
                flat: -25, sprint: -15, timeTrial: -10, packRiding: -5 }],
  ['Rouleur', { flat: +25, timeTrial: +20, endurance: +10,
                climbing: -25, hills: -20, acceleration: -10 }],
  ['Sprinter', { sprint: +30, flat: +15, positioning: +10, acceleration: +10,
                 climbing: -30, hills: -20, endurance: -15 }],
  ['Puncheur', { hills: +25, acceleration: +15, attackTiming: +10,
                 flat: -20, timeTrial: -20, endurance: -10 }],
  ['Classics', { roughSurface: +25, packRiding: +15, bikeHandling: +12, positioning: +8,
                 climbing: -25, timeTrial: -20, sprint: -15 }],
  ['Descender', { descending: +25, bikeHandling: +15, cornering: +12,
                  climbing: -22, endurance: -15, sprint: -15 }],
  ['AllRound', {}],
];

/**
 * BENCHMARK-ONLY global quality offset. This is NOT a game mechanic and does
 * not exist in the engine; it simply shifts every attribute of a rider so the
 * field has overall-quality variance as well as shape variance.
 */
const QUALITY = process.env.STRESS
  ? [-8, -4, 0, +4, +8]                 // separate stress fixture, NOT used to pick K
  : [-5, -2.5, 0, +2.5, +5];            // V1 same-league calibration field

function build(adj: Adj, quality: number): Attributes {
  const a: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = BASE + quality;
  for (const [k, v] of Object.entries(adj)) a[k as keyof Attributes] += v as number;
  return a;
}

interface Meta { shape: string; quality: number }
function makeField(): { riders: RiderSnapshot[]; meta: Map<string, Meta> } {
  const riders: RiderSnapshot[] = [];
  const meta = new Map<string, Meta>();
  let n = 0;
  for (const [shape, adj] of SHAPES) {
    for (const qv of QUALITY) {
      const id = `r${n++}`;
      riders.push({
        id, attributes: build(adj, qv),
        condition: 1, setup: 1, weather: 1, startEnergy: 100,
        tactics: { breakawayEffort: BreakawayEffort.NORMAL,
          chaseIntensity: ChaseIntensity.NONE, stageApproach: StageApproach.NORMAL },
      });
      meta.set(id, { shape, quality: qv });
    }
  }
  return { riders, meta };
}

type Seg = { startKm: number; lengthKm: number; terrain: Terrain; referenceSpeedKmh: number; weatherEnergyMultiplier: number };
const seg = (start: number, len: number, t: Terrain): Seg =>
  ({ startKm: start, lengthKm: len, terrain: t, referenceSpeedKmh: REF[t], weatherEnergyMultiplier: 1 });

const FIXTURES: [string, Seg[]][] = [
  ['40 km FLAT      ', [seg(0, 40, Terrain.FLAT)]],
  ['40 km HILLY     ', [seg(0, 40, Terrain.HILLY)]],
  ['40 km MOUNTAIN  ', [seg(0, 40, Terrain.MOUNTAIN)]],
  ['160 mixed ->MTN ', [seg(0, 60, Terrain.FLAT), seg(60, 40, Terrain.HILLY),
                        seg(100, 30, Terrain.CLASSICS), seg(130, 30, Terrain.MOUNTAIN)]],
];

const K_VALUES = [0.35, 0.375, 0.40];

const mmss = (s: number) => { const t = Math.round(Math.abs(s)); return `${s < 0 ? '-' : ''}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function run(segs: Seg[], k: number) {
  const { riders, meta } = makeField();
  const snapshot = buildStageSnapshot({ stageId: 'd', seed: 1, riders, balance: B });
  const res = simulateStage({
    snapshot, stage: { id: 'd', segments: segs },
    initialGroups: [riders.map(r => r.id)], balance: B,
    options: { paceOnly: false, requiredPerformance: experimentalHoldingThreshold(k) },
    recordTimeline: true,
  });
  const times = [...res.riders.values()].map(r => r.finishTimeSec!).sort((a, b) => a - b);
  const top10 = times.slice(0, 10);
  const largest = Math.max(...res.groups.filter(g => g.riderIds.length > 0).map(g => g.riderIds.length));
  let maxGap = 0;
  for (const t of res.timeline) {
    if (t.groups.length < 2) continue;
    const d = t.groups[t.groups.length - 1].timeSec - t.groups[0].timeSec;
    if (d > maxGap) maxGap = d;
  }
  const byShape = new Map<string, number[]>(), byQual = new Map<number, number[]>();
  for (const r of res.riders.values()) {
    const m = meta.get(r.id)!;
    if (!byShape.has(m.shape)) byShape.set(m.shape, []);
    if (!byQual.has(m.quality)) byQual.set(m.quality, []);
    byShape.get(m.shape)!.push(r.finishTimeSec!);
    byQual.get(m.quality)!.push(r.finishTimeSec!);
  }
  const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
  const shapeOrder = [...byShape.entries()].map(([k2, v]) => [k2, mean(v)] as const).sort((a, b) => a[1] - b[1]);
  const qualOrder = [...byQual.entries()].map(([k2, v]) => [k2, mean(v)] as const).sort((a, b) => a[1] - b[1]);
  return {
    splits: res.splits.length,
    firstSplit: res.splits.length ? res.splits[0].km : null,
    groups: res.finishGroupCount, largest,
    top10Spread: top10[top10.length - 1] - top10[0],
    maxGap, shapeOrder, qualOrder,
    fieldSize: riders.length,
  };
}

console.log('TC-01D — combined archetype shape + benchmark-only quality spread');
console.log(`7 shapes x quality {${QUALITY.join(', ')}} = 35 riders. Quality offset is BENCHMARK-ONLY, not a game mechanic.`);
console.log(process.env.STRESS ? 'STRESS FIXTURE (+/-8) — reference only, NOT used to choose K.' : 'V1 SAME-LEAGUE CALIBRATION FIELD (+/-5).');
console.log('Stage Approach Normal, weather 1.00, SmallVariance 0, Fatigue off, no attacks, no chase. Nothing tuned.\n');

for (const [name, segs] of FIXTURES) {
  console.log('='.repeat(112));
  console.log(name.trim());
  console.log('='.repeat(112));
  console.log('     K      splits  first split  groups  largest  Top10 spread   max gap');
  console.log('  ' + '-'.repeat(74));
  for (const k of K_VALUES) {
    const r = run(segs, k);
    console.log(`   ${k.toFixed(3)}   ${String(r.splits).padStart(6)}  ${(r.firstSplit === null ? 'none' : r.firstSplit.toFixed(1) + ' km').padStart(11)}  ` +
      `${String(r.groups).padStart(6)}  ${String(r.largest).padStart(7)}  ${mmss(r.top10Spread).padStart(12)}  ${mmss(r.maxGap).padStart(8)}`);
  }
  // ordering at the extremes of the K range
  for (const k of [K_VALUES[0], K_VALUES[K_VALUES.length - 1]]) {
    const r = run(segs, k);
    console.log(`   K=${k.toFixed(3)} shape order:   ` + r.shapeOrder.map(([s, t]) => `${s} ${mmss(t - r.shapeOrder[0][1])}`).join(' | '));
    console.log(`   K=${k.toFixed(3)} quality order: ` + r.qualOrder.map(([q, t]) => `${q > 0 ? '+' : ''}${q} ${mmss(t - r.qualOrder[0][1])}`).join(' | '));
  }
  console.log();
}
