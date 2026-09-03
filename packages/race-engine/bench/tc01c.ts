import { performance } from 'node:perf_hooks';
import { Terrain, ZERO_ATTRIBUTES, Attributes, ALL_TERRAINS } from '../src/types/terrain.js';
import { RiderSnapshot } from '../src/types/domain.js';
import { BALANCE_V1, BreakawayEffort, ChaseIntensity, StageApproach } from '../src/config/balance.js';
import { buildStageSnapshot } from '../src/core/snapshot.js';
import { simulateStage } from '../src/core/segmentLoop.js';
import { experimentalHoldingThreshold, holdingFactor } from '../src/core/struggle.js';
import { baseSegmentSkill, SEGMENT_SKILL_WEIGHTS } from '../src/config/segmentSkills.js';

const B = BALANCE_V1, RP = experimentalHoldingThreshold(B.HOLDING_K);
const FIELD = 42, BASE = 130;
const REF: Record<string, number> = { FLAT: 44, HILLY: 38, CLASSICS: 40, MOUNTAIN: 24, DESCENT: 58 };

/* ---- multi-attribute, equal-budget rider profiles ---- */
type Adj = Partial<Record<keyof Attributes, number>>;
const PROFILES: [string, Adj][] = [
  ['Climber   ', { climbing: +25, hills: +15, endurance: +10, acceleration: +5,
                   flat: -25, sprint: -15, timeTrial: -10, packRiding: -5 }],
  ['Rouleur/TT', { flat: +25, timeTrial: +20, endurance: +10,
                   climbing: -25, hills: -20, acceleration: -10 }],
  ['Sprinter  ', { sprint: +30, flat: +15, positioning: +10, acceleration: +10,
                   climbing: -30, hills: -20, endurance: -15 }],
  ['Puncheur  ', { hills: +25, acceleration: +15, attackTiming: +10,
                   flat: -20, timeTrial: -20, endurance: -10 }],
  ['Classics  ', { roughSurface: +25, packRiding: +15, bikeHandling: +12, positioning: +8,
                   climbing: -25, timeTrial: -20, sprint: -15 }],
  ['Descender ', { descending: +25, bikeHandling: +15, cornering: +12,
                   climbing: -22, endurance: -15, sprint: -15 }],
  ['AllRounder', {}],
];

function build(adj: Adj): Attributes {
  const a: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = BASE;
  for (const [k, v] of Object.entries(adj)) a[k as keyof Attributes] += v as number;
  return a;
}
const total = (a: Attributes) => Object.values(a).reduce((x, y) => x + y, 0);

/* ---- STRESS fixture kept from TC-01B, now explicitly labelled ---- */
const STRESS: [string, keyof Attributes, keyof Attributes][] = [
  ['climber', 'climbing', 'flat'], ['rouleur', 'flat', 'climbing'],
  ['puncheur', 'hills', 'flat'], ['descender', 'descending', 'climbing'],
  ['allround', 'endurance', 'endurance'],
];
function stressAttrs(s: keyof Attributes, w: keyof Attributes, d: number): Attributes {
  const a: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = BASE;
  if (s !== w) { a[s] += d; a[w] -= d; }
  return a;
}

function rider(id: string, attributes: Attributes): RiderSnapshot {
  return { id, attributes, condition: 1, setup: 1, weather: 1, startEnergy: 100,
    tactics: { breakawayEffort: BreakawayEffort.NORMAL, chaseIntensity: ChaseIntensity.NONE,
      stageApproach: StageApproach.NORMAL } };
}

function runStage(riders: RiderSnapshot[], terrains: Terrain[], km: number) {
  const snapshot = buildStageSnapshot({ stageId: terrains.join('+'), seed: 1, riders, balance: B });
  const each = km / terrains.length;
  const t0 = performance.now();
  const res = simulateStage({
    snapshot,
    stage: { id: 's', segments: terrains.map((t, i) => ({
      startKm: i * each, lengthKm: each, terrain: t,
      referenceSpeedKmh: REF[t], weatherEnergyMultiplier: 1.0 })) },
    initialGroups: [riders.map(r => r.id)],
    balance: B, options: { paceOnly: false, requiredPerformance: RP },
    recordTimeline: true,
  });
  return { res, snapshot, ms: performance.now() - t0 };
}

const q = (x: number[], p: number) => { const s = [...x].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mmss = (s: number) => { const t = Math.round(Math.abs(s)); return `${s < 0 ? '-' : ''}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

console.log('TC-01C corrected terrain benchmark');
console.log(`Stage Approach Normal, weather 1.00, SmallVariance 0, Fatigue off, EN-01, HOLDING_K=${B.HOLDING_K}`);
console.log('no attacks, no chase. Isolated terrains 40 km; one 160 km mixed stage.\n');

/* ================= profiles ================= */
console.log('='.repeat(118));
console.log('RIDER PROFILES — multi-attribute, equal budget');
console.log('='.repeat(118));
const baseTotal = total(build({}));
for (const [name, adj] of PROFILES) {
  const a = build(adj);
  const diff = Object.entries(adj).map(([k, v]) => `${k} ${(v as number) > 0 ? '+' : ''}${v}`).join(', ') || '(baseline, all 130)';
  console.log(`  ${name}  budget ${total(a)} ${total(a) === baseTotal ? 'OK' : 'MISMATCH'}   ${diff}`);
}

/* ============ BaseSegmentSkill per profile per terrain ============ */
console.log('\n' + '='.repeat(118));
console.log('BaseSegmentSkill BY PROFILE AND TERRAIN, and predicted Holding outcome');
console.log('='.repeat(118));
console.log('  terrain    ' + PROFILES.map(([n]) => n.trim().padStart(11)).join('') + '     mean   worst-below   tol(K=.4)  predict');
for (const t of ALL_TERRAINS) {
  const eps = PROFILES.map(([, adj]) => baseSegmentSkill(build(adj), t));
  const mean = eps.reduce((a, b) => a + b, 0) / eps.length;
  const below = mean - Math.min(...eps);
  const tol = mean * (1 - holdingFactor(B.HOLDING_K, FIELD)) + 1;
  console.log(`  ${t.padEnd(9)}  ` + eps.map(e => e.toFixed(1).padStart(11)).join('') +
    `  ${mean.toFixed(1).padStart(7)}  ${below.toFixed(2).padStart(11)}  ${tol.toFixed(2).padStart(10)}   ${below > tol ? 'SPLIT' : 'hold'}`);
}

/* ============ isolated 40 km terrains, realistic profiles ============ */
console.log('\n' + '='.repeat(118));
console.log('ISOLATED 40 km SEGMENTS — realistic profiles');
console.log('='.repeat(118));
const profRiders = Array.from({ length: FIELD }, (_, i) => {
  const [, adj] = PROFILES[i % PROFILES.length];
  return rider(`r${i}`, build(adj));
});
const profLabel = new Map(profRiders.map((r, i) => [r.id, PROFILES[i % PROFILES.length][0]]));

for (const t of [Terrain.FLAT, Terrain.HILLY, Terrain.CLASSICS, Terrain.MOUNTAIN]) {
  const { res, ms } = runStage(profRiders, [t], 40);
  const times = [...res.riders.values()].map(r => r.finishTimeSec!).sort((a, b) => a - b);
  const peak = [...res.riders.keys()].map(id => res.peakStruggle.get(id) ?? 0).sort((a, b) => a - b);
  const byP = new Map<string, number[]>();
  for (const r of res.riders.values()) {
    const k = profLabel.get(r.id)!;
    if (!byP.has(k)) byP.set(k, []);
    byP.get(k)!.push(r.finishTimeSec!);
  }
  const order = [...byP.entries()].map(([k, xs]) => [k, xs.reduce((a, b) => a + b, 0) / xs.length] as const)
    .sort((a, b) => a[1] - b[1]);
  console.log(`\n  ${t}  40 km`);
  console.log(`    splits ${String(res.splits.length).padStart(2)}   first split ${res.splits.length ? res.splits[0].km.toFixed(1) + ' km' : 'none'}   ` +
    `groups ${res.finishGroupCount}   peak Struggle p50/max ${q(peak, .5).toFixed(0)}/${peak[peak.length - 1].toFixed(0)}   ` +
    `clamp ${res.clampHits}   ${ms.toFixed(0)} ms`);
  console.log(`    gap after 40 km: ` + order.map(([k, v]) => `${k.trim()} ${mmss(v - order[0][1])}`).join(' | '));
}

/* ============ STRESS sensitivity ============ */
console.log('\n' + '='.repeat(118));
console.log('STRESS TEST (single-attribute swing) — sensitivity, 40 km isolated');
console.log('='.repeat(118));
console.log('  terrain     +/-10        +/-20        +/-30        +/-40');
for (const t of [Terrain.FLAT, Terrain.HILLY, Terrain.CLASSICS, Terrain.MOUNTAIN]) {
  const row: string[] = [];
  for (const d of [10, 20, 30, 40]) {
    const rs = Array.from({ length: 40 }, (_, i) => {
      const [, s, w] = STRESS[i % STRESS.length];
      return rider(`s${i}`, stressAttrs(s, w, d));
    });
    const { res } = runStage(rs, [t], 40);
    const times = [...res.riders.values()].map(x => x.finishTimeSec!).sort((a, b) => a - b);
    row.push(`${String(res.splits.length).padStart(2)}sp ${mmss(times[times.length - 1] - times[0])}`);
  }
  console.log(`  ${t.padEnd(10)}` + row.map(x => x.padStart(13)).join(''));
}

/* ============ mixed 160 km integration ============ */
console.log('\n' + '='.repeat(118));
console.log('MIXED 160 km REALISTIC STAGE (FLAT 60 / HILLY 40 / CLASSICS 30 / MOUNTAIN 20 / DESCENT 10)');
console.log('='.repeat(118));
{
  const snapshot = buildStageSnapshot({ stageId: 'mixed', seed: 1, riders: profRiders, balance: B });
  const segs = [
    { startKm: 0, lengthKm: 60, terrain: Terrain.FLAT, referenceSpeedKmh: 44, weatherEnergyMultiplier: 1 },
    { startKm: 60, lengthKm: 40, terrain: Terrain.HILLY, referenceSpeedKmh: 38, weatherEnergyMultiplier: 1 },
    { startKm: 100, lengthKm: 30, terrain: Terrain.CLASSICS, referenceSpeedKmh: 40, weatherEnergyMultiplier: 1 },
    { startKm: 130, lengthKm: 20, terrain: Terrain.MOUNTAIN, referenceSpeedKmh: 24, weatherEnergyMultiplier: 1 },
    { startKm: 150, lengthKm: 10, terrain: Terrain.DESCENT, referenceSpeedKmh: 58, weatherEnergyMultiplier: 1 },
  ];
  const t0 = performance.now();
  const res = simulateStage({ snapshot, stage: { id: 'mixed', segments: segs },
    initialGroups: [profRiders.map(r => r.id)], balance: B,
    options: { paceOnly: false, requiredPerformance: RP }, recordTimeline: true });
  const ms = performance.now() - t0;
  const times = [...res.riders.values()].map(r => r.finishTimeSec!).sort((a, b) => a - b);
  const top10 = times.slice(0, 10);
  const en = [...res.riders.values()].map(r => r.energy).sort((a, b) => a - b);
  const peak = [...res.riders.keys()].map(id => res.peakStruggle.get(id) ?? 0).sort((a, b) => a - b);
  const largest = Math.max(...res.groups.filter(g => g.riderIds.length > 0).map(g => g.riderIds.length));
  const byP = new Map<string, number[]>();
  for (const r of res.riders.values()) {
    const k = profLabel.get(r.id)!;
    if (!byP.has(k)) byP.set(k, []);
    byP.get(k)!.push(r.finishTimeSec!);
  }
  const order = [...byP.entries()].map(([k, xs]) => [k, xs.reduce((a, b) => a + b, 0) / xs.length] as const)
    .sort((a, b) => a[1] - b[1]);
  console.log(`  splits ${res.splits.length}   first split ${res.splits.length ? res.splits[0].km.toFixed(1) + ' km' : 'none'}   ` +
    `finish groups ${res.finishGroupCount}   largest ${largest}   Top10 spread ${mmss(top10[top10.length - 1] - top10[0])}`);
  console.log(`  Energy min/med/max ${en[0].toFixed(1)} / ${q(en, .5).toFixed(1)} / ${en[en.length - 1].toFixed(1)}   ` +
    `peak Struggle p50/p90/max ${q(peak, .5).toFixed(0)}/${q(peak, .9).toFixed(0)}/${peak[peak.length - 1].toFixed(0)}   ` +
    `clamp ${res.clampHits}   ${ms.toFixed(0)} ms`);
  console.log(`  order: ` + order.map(([k, v]) => `${k.trim()} ${mmss(v - order[0][1])}`).join(' | '));

  for (const b of [60, 100, 130, 150]) {
    const before = res.timeline.filter(x => x.km <= b + 1e-9).pop();
    const after = res.timeline.filter(x => x.km > b + 1e-9)[0];
    if (!before || !after) continue;
    const dt = after.groups[0].timeSec - before.groups[0].timeSec;
    console.log(`  boundary km ${String(b).padStart(3)}: front time +${dt.toFixed(2)}s   ` +
      `lead gap ${(before.gapsSec[0] ?? 0).toFixed(1)} -> ${(after.gapsSec[0] ?? 0).toFixed(1)}`);
  }
  console.log(`  P_ref frozen: ${Object.isFrozen(snapshot.pRef)}   ` +
    ALL_TERRAINS.map(t => `${t.slice(0,4)} ${snapshot.pRef[t].toFixed(2)}`).join('  '));
  void SEGMENT_SKILL_WEIGHTS;
}
