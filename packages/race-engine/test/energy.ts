import { test, assert, assertClose } from './harness.js';
import { Terrain, ZERO_ATTRIBUTES, Attributes } from '../src/types/terrain.js';
import { RiderSnapshot, WorkMode, ContactState } from '../src/types/domain.js';
import {
  BALANCE_V1,
  BreakawayEffort,
  ChaseIntensity,
  StageApproach,
  BASE_ROAD_ENERGY_PER_KM,
  TERRAIN_ENERGY_MULTIPLIER,
} from '../src/config/balance.js';
import { buildStageSnapshot, neutralEP } from '../src/core/snapshot.js';
import { simulateStage } from '../src/core/segmentLoop.js';
import { experimentalHoldingThreshold } from '../src/core/struggle.js';
import { energyBurnForTick, workEnergyMultiplier, clampEnergy } from '../src/core/energy.js';

const B = BALANCE_V1;
const K = 0.4;
const PORT = experimentalHoldingThreshold(K);

function rider(
  id: string,
  level: number,
  o: {
    effort?: BreakawayEffort;
    chase?: ChaseIntensity;
    approach?: StageApproach;
  } = {},
): RiderSnapshot {
  const a: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = level;
  return {
    id, attributes: a, condition: 1, setup: 1, weather: 1, startEnergy: 100,
    tactics: {
      breakawayEffort: o.effort ?? BreakawayEffort.NORMAL,
      chaseIntensity: o.chase ?? ChaseIntensity.NONE,
      stageApproach: o.approach ?? StageApproach.NORMAL,
    },
  };
}

interface Seg { startKm: number; lengthKm: number; terrain: Terrain; referenceSpeedKmh: number; weatherEnergyMultiplier?: number }
interface Stg { id: string; segments: Seg[] }

const flat = (lengthKm = 160, weatherEnergyMultiplier?: number): Stg => ({
  id: 's',
  segments: [{ startKm: 0, lengthKm, terrain: Terrain.FLAT, referenceSpeedKmh: 42, weatherEnergyMultiplier }],
});

function run(riders: RiderSnapshot[], groups: string[][], stage: Stg = flat()) {
  const snapshot = buildStageSnapshot({ stageId: 's', seed: 1, riders, balance: B });
  return {
    snapshot,
    res: simulateStage({
      snapshot, stage, initialGroups: groups,
      initialGapSec: groups.length > 1 ? 30 : 0,
      balance: B,
      options: { paceOnly: false, requiredPerformance: PORT },
    }),
  };
}

const burned = (res: { riders: ReadonlyMap<string, { energy: number }> }, id: string) =>
  100 - res.riders.get(id)!.energy;

/* ---- Calibration: 160 km flat, 40-rider bunch, stage approach sweep ---- */

const APPROACH_CASES: [StageApproach, number][] = [
  [StageApproach.SAFE, 23.1],
  [StageApproach.NORMAL, 27.2],
  [StageApproach.AGGRESSIVE, 32.6],
  [StageApproach.ALL_OUT, 38.1],
];

for (const [approach, expected] of APPROACH_CASES) {
  test(`E-${approach}`, `160 km flat bunch, ${approach} approach ~= ${expected}`, () => {
    const riders = Array.from({ length: 40 }, (_, i) => rider(`r${i}`, 130, { approach }));
    const { res } = run(riders, [riders.map((r) => r.id)]);
    assertClose(burned(res, 'r0'), expected, 0.06, `${approach} burn`);
  });
}

test('E-BRK', '160 km flat, 5-rider break at Hard ~= 36.9', () => {
  const brk = Array.from({ length: 5 }, (_, i) => rider(`b${i}`, 130, { effort: BreakawayEffort.HARD }));
  const pel = Array.from({ length: 35 }, (_, i) => rider(`p${i}`, 130));
  const { res } = run([...brk, ...pel], [brk.map(r => r.id), pel.map(r => r.id)]);
  assertClose(burned(res, 'b0'), 36.9, 0.1, 'breakaway Hard burn');
});

test('E-CHS', '160 km flat, Medium chase worker ~= 29.9, passive 27.2', () => {
  // Calibration is stated for chase sustained over the full 160 km, so it is
  // asserted against the formula directly rather than a race in which the
  // break is caught and the peloton reverts to NEUTRAL after ~14 km.
  const ticks = 160 / B.TICK_KM;
  const worker = ticks * energyBurnForTick({
    tickKm: B.TICK_KM, groupSize: 35, mode: WorkMode.CHASE, terrain: Terrain.FLAT,
    breakawayEffort: BreakawayEffort.NORMAL, chaseIntensity: ChaseIntensity.MEDIUM,
    stageApproach: StageApproach.NORMAL,
  });
  const passive = ticks * energyBurnForTick({
    tickKm: B.TICK_KM, groupSize: 35, mode: WorkMode.CHASE, terrain: Terrain.FLAT,
    breakawayEffort: BreakawayEffort.NORMAL, chaseIntensity: ChaseIntensity.NONE,
    stageApproach: StageApproach.NORMAL,
  });
  assertClose(worker, 29.9, 0.05, 'chase worker burn');
  assertClose(passive, 27.2, 0.05, 'passive rider burn');
  assertClose(worker / passive, 1.10, 1e-12, 'worker/passive ratio');
});

test('E-CHS2', 'in a real race the worker outburns the passive rider', () => {
  const brk = Array.from({ length: 5 }, (_, i) => rider(`b${i}`, 130, { effort: BreakawayEffort.HARD }));
  const pel = Array.from({ length: 35 }, (_, i) =>
    rider(`p${i}`, 130, { chase: i < 6 ? ChaseIntensity.MEDIUM : ChaseIntensity.NONE }));
  const { res } = run([...brk, ...pel], [brk.map(r => r.id), pel.map(r => r.id)]);
  const worker = burned(res, 'p0');
  const passive = burned(res, 'p20');
  assert(worker > passive, `worker ${worker} did not outburn passive ${passive}`);
  // The break is caught, so chase mode does not last the whole stage; the
  // worker's excess must be strictly between zero and the full-stage excess.
  assert(worker - passive < 29.92 - 27.2 + 1e-9, 'excess exceeds the full-stage maximum');
});

/* ---- Structural tests ---- */

test('E-01', 'Energy never falls below 0', () => {
  const riders = Array.from({ length: 40 }, (_, i) =>
    rider(`r${i}`, 130, { approach: StageApproach.ALL_OUT }));
  const long: Stg = { id: 's', segments: [{ startKm: 0, lengthKm: 900, terrain: Terrain.FLAT, referenceSpeedKmh: 42 }] };
  const { res } = run(riders, [riders.map(r => r.id)], long);
  for (const st of res.riders.values()) {
    assert(st.energy >= 0, `energy ${st.energy} below zero`);
  }
  assert(res.riders.get('r0')!.energy === 0, 'expected floor to be reached');
  assertClose(clampEnergy(-5), 0, 1e-12, 'clamp low');
  assertClose(clampEnergy(140), 100, 1e-12, 'clamp high');
});

test('E-02', 'same snapshot and seed remain deterministic with Energy on', () => {
  const mk = () => Array.from({ length: 30 }, (_, i) => rider(`r${i}`, 118 + i));
  const a = run(mk(), [mk().map(r => r.id)]);
  const b = run(mk(), [mk().map(r => r.id)]);
  const ea = [...a.res.riders.values()].map(s => s.energy).join(',');
  const eb = [...b.res.riders.values()].map(s => s.energy).join(',');
  assert(ea === eb, 'energy trajectories diverged between identical runs');
  assert(a.res.splits.length === b.res.splits.length, 'split counts diverged');
});

test('E-03', 'chase multiplier applies only to actual chase workers', () => {
  assertClose(
    workEnergyMultiplier({ mode: WorkMode.CHASE, breakawayEffort: BreakawayEffort.NORMAL, chaseIntensity: ChaseIntensity.MEDIUM }),
    1.10, 1e-12, 'worker');
  assertClose(
    workEnergyMultiplier({ mode: WorkMode.CHASE, breakawayEffort: BreakawayEffort.NORMAL, chaseIntensity: ChaseIntensity.NONE }),
    1.00, 1e-12, 'passive rider in a chasing group');
});

test('E-04', 'breakaway multiplier applies only in recognized escape mode', () => {
  const args = { breakawayEffort: BreakawayEffort.ALL_OUT, chaseIntensity: ChaseIntensity.NONE };
  assertClose(workEnergyMultiplier({ mode: WorkMode.ESCAPE, ...args }), 1.30, 1e-12, 'escape');
  assertClose(workEnergyMultiplier({ mode: WorkMode.NEUTRAL, ...args }), 1.00, 1e-12, 'neutral must ignore effort');
  assertClose(workEnergyMultiplier({ mode: WorkMode.CHASE, ...args }), 1.00, 1e-12, 'chase must ignore effort');
});

test('E-05', 'DESCENT consumes 35% of the equivalent flat base burn', () => {
  const common = {
    tickKm: 0.2, groupSize: 40, mode: WorkMode.NEUTRAL,
    breakawayEffort: BreakawayEffort.NORMAL, chaseIntensity: ChaseIntensity.NONE,
  };
  const flatBurn = energyBurnForTick({ ...common, terrain: Terrain.FLAT });
  const descBurn = energyBurnForTick({ ...common, terrain: Terrain.DESCENT });
  assertClose(descBurn / flatBurn, 0.35, 1e-12, 'descent ratio');
  assertClose(TERRAIN_ENERGY_MULTIPLIER[Terrain.DESCENT], 0.35, 1e-12, 'table value');
  for (const t of [Terrain.FLAT, Terrain.HILLY, Terrain.MOUNTAIN, Terrain.CLASSICS]) {
    assertClose(TERRAIN_ENERGY_MULTIPLIER[t], 1.0, 1e-12, `${t} must be 1.00`);
  }
});

test('E-06', 'P_ref stage-start snapshot is immutable while Energy decreases', () => {
  const riders = Array.from({ length: 40 }, (_, i) => rider(`r${i}`, 130));
  const { snapshot, res } = run(riders, [riders.map(r => r.id)]);
  const before = { ...snapshot.pRef };
  assert(res.riders.get('r0')!.energy < 100, 'energy did not decrease');
  for (const t of Object.keys(before) as Terrain[]) {
    assertClose(snapshot.pRef[t], before[t], 1e-12, `P_ref[${t}] mutated`);
  }
  // and it still reflects START energy, not current energy
  assertClose(snapshot.pRef[Terrain.FLAT], neutralEP(riders[0], Terrain.FLAT), 1e-9, 'P_ref vs start EP');
});

test('E-07', 'burn formula composes exactly as specified', () => {
  const b = energyBurnForTick({
    tickKm: 0.2, groupSize: 5, mode: WorkMode.ESCAPE, terrain: Terrain.DESCENT,
    breakawayEffort: BreakawayEffort.HARD, chaseIntensity: ChaseIntensity.NONE,
    stageApproach: StageApproach.AGGRESSIVE, weatherEnergyMultiplier: 1.04,
  });
  assertClose(b, 0.2 * BASE_ROAD_ENERGY_PER_KM * 0.92 * 1.20 * 1.18 * 0.35 * 1.04, 1e-12, 'composition');
});

test('E-08', 'Energy at tick start drives EP; burn is applied after', () => {
  // One tick of 0.2 km: EP must be computed at energy 100, then burn applied.
  const riders = Array.from({ length: 40 }, (_, i) => rider(`r${i}`, 130));
  const one: Stg = { id: 's', segments: [{ startKm: 0, lengthKm: 0.2, terrain: Terrain.FLAT, referenceSpeedKmh: 42 }] };
  const { res } = run(riders, [riders.map(r => r.id)], one);
  const expected = 0.2 * BASE_ROAD_ENERGY_PER_KM * 0.80;
  assertClose(burned(res, 'r0'), expected, 1e-9, 'single tick burn');
});
