import { performance } from 'node:perf_hooks';
import { Terrain, ZERO_ATTRIBUTES, Attributes } from '../src/types/terrain.js';
import { RiderSnapshot } from '../src/types/domain.js';
import { BALANCE_V1, BreakawayEffort, ChaseIntensity, StageApproach } from '../src/config/balance.js';
import { buildStageSnapshot } from '../src/core/snapshot.js';
import { simulateStage } from '../src/core/segmentLoop.js';
import { experimentalHoldingThreshold } from '../src/core/struggle.js';

const B = BALANCE_V1, RP = experimentalHoldingThreshold(B.HOLDING_K);
const FIELD = 40, BUDGET = 130, DELTA = 40;

/** Equal-budget archetypes: only the distribution differs. */
const ARCHETYPES: [string, keyof Attributes, keyof Attributes][] = [
  ['climber  ', 'climbing', 'flat'],
  ['rouleur  ', 'flat', 'climbing'],
  ['puncheur ', 'hills', 'flat'],
  ['descender', 'descending', 'climbing'],
  ['allround ', 'endurance', 'endurance'],
];

function attrs(strong: keyof Attributes, weak: keyof Attributes): Attributes {
  const a: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = BUDGET;
  if (strong !== weak) { a[strong] += DELTA; a[weak] -= DELTA; }
  return a;
}

function buildField(): { riders: RiderSnapshot[]; label: Map<string, string> } {
  const riders: RiderSnapshot[] = [];
  const label = new Map<string, string>();
  for (let i = 0; i < FIELD; i++) {
    const [name, s, w] = ARCHETYPES[i % ARCHETYPES.length];
    const id = `r${i}`;
    riders.push({
      id, attributes: attrs(s, w),
      condition: 1, setup: 1, weather: 1, startEnergy: 100,
      tactics: {
        breakawayEffort: BreakawayEffort.NORMAL,
        chaseIntensity: ChaseIntensity.NONE,
        stageApproach: StageApproach.NORMAL,   // TC-01B: Normal, weather 1.00
      },
    });
    label.set(id, name);
  }
  return { riders, label };
}

const REF: Record<string, number> = {
  FLAT: 44, HILLY: 38, CLASSICS: 40, MOUNTAIN: 24, DESCENT: 58,
};

function stageOf(terrains: Terrain[], km: number) {
  const each = km / terrains.length;
  return {
    id: terrains.join('+'),
    segments: terrains.map((t, i) => ({
      startKm: i * each, lengthKm: each, terrain: t,
      referenceSpeedKmh: REF[t], weatherEnergyMultiplier: 1.0,
    })),
  };
}

function run(terrains: Terrain[], km = 160) {
  const { riders, label } = buildField();
  const snapshot = buildStageSnapshot({ stageId: terrains.join('+'), seed: 1, riders, balance: B });
  const t0 = performance.now();
  const res = simulateStage({
    snapshot, stage: stageOf(terrains, km),
    initialGroups: [riders.map(r => r.id)],
    balance: B, options: { paceOnly: false, requiredPerformance: RP },
    recordTimeline: true,
  });
  return { res, label, snapshot, ms: performance.now() - t0 };
}

const q = (x: number[], p: number) => { const s = [...x].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mmss = (s: number) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function report(name: string, terrains: Terrain[], km = 160) {
  const { res, label, ms } = run(terrains, km);
  const times = [...res.riders.values()].map(r => r.finishTimeSec!).sort((a, b) => a - b);
  const top10 = times.slice(0, 10);
  const en = [...res.riders.values()].map(r => r.energy).sort((a, b) => a - b);
  // Final Struggle is 0 by SP-01, so the PEAK is what carries information.
  const st = [...res.riders.keys()].map(id => res.peakStruggle.get(id) ?? 0).sort((a, b) => a - b);
  const largest = Math.max(...res.groups.filter(g => g.riderIds.length > 0).map(g => g.riderIds.length));

  // archetype finishing order by mean finish time
  const byArch = new Map<string, number[]>();
  for (const r of res.riders.values()) {
    const a = label.get(r.id)!;
    (byArch.get(a) ?? byArch.set(a, []).get(a)!).push(r.finishTimeSec!);
  }
  const order = [...byArch.entries()]
    .map(([a, xs]) => [a, xs.reduce((p, c) => p + c, 0) / xs.length] as const)
    .sort((x, y) => x[1] - y[1]);

  console.log(`\n${name}`);
  console.log(`  splits ${String(res.splits.length).padStart(3)}   first split ${res.splits.length ? res.splits[0].km.toFixed(1) + ' km' : 'none'}   ` +
    `finish groups ${String(res.finishGroupCount).padStart(2)}   largest ${String(largest).padStart(2)}   Top10 spread ${mmss(top10[top10.length - 1] - top10[0])}`);
  console.log(`  Energy min/med/max ${en[0].toFixed(1)} / ${q(en, .5).toFixed(1)} / ${en[en.length - 1].toFixed(1)}   ` +
    `peak Struggle p50/p90/max ${q(st, .5).toFixed(0)} / ${q(st, .9).toFixed(0)} / ${st[st.length - 1].toFixed(0)}   ` +
    `clamp ${res.clampHits}   ${ms.toFixed(0)} ms`);
  console.log(`  archetype order: ${order.map(([a, t]) => `${a.trim()} ${(t - order[0][1]).toFixed(0)}s`).join('  |  ')}`);
  return res;
}

console.log('TC-01B integrated terrain benchmark');
console.log(`Stage Approach Normal, weather 1.00, SmallVariance 0, Fatigue off, EN-01 Energy, HOLDING_K=${B.HOLDING_K}`);
console.log('equal-budget archetypes, no attacks, no chase\n' + '='.repeat(112));

report('FLAT     160 km', [Terrain.FLAT]);
report('HILLY    160 km', [Terrain.HILLY]);
report('CLASSICS 160 km', [Terrain.CLASSICS]);
report('MOUNTAIN 160 km', [Terrain.MOUNTAIN]);

const mixedTerrains = [Terrain.FLAT, Terrain.HILLY, Terrain.MOUNTAIN, Terrain.DESCENT];
const mixed = report('MIXED F+H+M+D 160 km', mixedTerrains);

/* ---------------- terrain-boundary invariants ---------------- */
console.log('\n' + '='.repeat(112));
console.log('TERRAIN BOUNDARY INVARIANTS (mixed stage)');
const bounds = [40, 80, 120];
const tl = mixed.timeline;
let ok = true;
for (const b of bounds) {
  const before = tl.filter(t => t.km <= b + 1e-9).pop();
  const after = tl.filter(t => t.km > b + 1e-9)[0];
  if (!before || !after) continue;
  const dt = after.groups[0].timeSec - before.groups[0].timeSec;
  const contiguous = dt > 0 && dt < 120;
  const gapBefore = before.gapsSec[0] ?? 0;
  const gapAfter = after.gapsSec[0] ?? 0;
  const gapCont = Math.abs(gapAfter - gapBefore) < 30;
  console.log(`  km ${b}: front-group time +${dt.toFixed(2)}s ${contiguous ? 'OK' : 'FAIL'}   ` +
    `lead gap ${gapBefore.toFixed(1)} -> ${gapAfter.toFixed(1)} ${gapCont ? 'OK' : 'FAIL'}`);
  ok &&= contiguous && gapCont;
}

const { snapshot } = run(mixedTerrains, 160);
const isolated = new Map<Terrain, number>();
for (const t of mixedTerrains) {
  const one = run([t], 40).snapshot;
  isolated.set(t, one.pRef[t]);
}
console.log('\n  P_ref immutability — mixed-stage snapshot vs isolated-stage snapshot');
for (const t of mixedTerrains) {
  const a = snapshot.pRef[t], b2 = isolated.get(t)!;
  console.log(`    ${t.padEnd(9)} mixed ${a.toFixed(4)}   isolated ${b2.toFixed(4)}   ${Math.abs(a - b2) < 1e-9 ? 'IDENTICAL' : 'DIFFERS'}`);
}
console.log(`\n  P_ref frozen object: ${Object.isFrozen(snapshot.pRef) ? 'yes' : 'NO'}`);
console.log(`  boundary continuity: ${ok ? 'PASS' : 'FAIL'}`);
