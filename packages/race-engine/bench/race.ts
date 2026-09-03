import { performance } from 'node:perf_hooks';
import { Terrain, ZERO_ATTRIBUTES, Attributes } from '../src/types/terrain.js';
import { RiderSnapshot } from '../src/types/domain.js';
import {
  BALANCE_V1,
  BreakawayEffort,
  ChaseIntensity,
} from '../src/config/balance.js';
import { buildStageSnapshot, Rng } from '../src/core/snapshot.js';
import {
  simulateStage,
  SimulationResult,
} from '../src/core/segmentLoop.js';
import { experimentalHoldingThreshold } from '../src/core/struggle.js';

/** PROVISIONAL holding threshold. NOT canonical. */
const RP_PORT = experimentalHoldingThreshold(BALANCE_V1.HOLDING_K);

const B = BALANCE_V1;
const FIELD = 40;
const BREAK_SIZE = 5;
const STAGE_KM = 160;
const V_REF = 42;
const RUNS = 150;
/**
 * The break must start as a RECOGNIZED escape group, i.e. already beyond the
 * 16 s separate-entity threshold. Starting both groups at gap 0 makes the
 * merge rule fuse them in the first tick and the break never exists.
 */
const BREAK_FORMATION_GAP_SEC = 30;

/* ------------------------------------------------------------------ */
/* Field generation. SmallVariance is zero (EP-01), so the seed varies */
/* the FIELD, not in-race noise.                                       */
/* ------------------------------------------------------------------ */

function gaussian(rng: Rng): number {
  const u = Math.max(rng.next(), 1e-12);
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function makeRider(
  id: string,
  level: number,
  effort: BreakawayEffort,
  chase: ChaseIntensity,
): RiderSnapshot {
  const attributes: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(attributes) as (keyof Attributes)[]) {
    attributes[k] = level;
  }
  return {
    id,
    attributes,
    condition: 1,
    setup: 1,
    weather: 1,
    startEnergy: 100,
    tactics: { breakawayEffort: effort, chaseIntensity: chase },
  };
}

interface ScenarioSpec {
  id: string;
  label: string;
  chasers: number;
  chaseIntensity: ChaseIntensity;
  breakEffort?: BreakawayEffort;
  sigma?: number;
  /** pick chasers by rank: 'top' | 'median' | 'bottom' | 'spread' */
  chaserPick?: 'top' | 'median' | 'bottom' | 'spread';
  mean?: number;
}

function buildField(spec: ScenarioSpec, seed: number) {
  const rng = new Rng(seed);
  const sigma = spec.sigma ?? 12;
  const mean = spec.mean ?? 130;

  const levels = Array.from({ length: FIELD }, () => mean + gaussian(rng) * sigma);
  levels.sort((a, b) => b - a);

  // The break is a mid-pack sample, as breaks usually are.
  const breakIdx = new Set<number>();
  let cursor = Math.floor(FIELD * 0.35);
  while (breakIdx.size < BREAK_SIZE) breakIdx.add(cursor++);

  const pelotonIdx = levels
    .map((_, i) => i)
    .filter((i) => !breakIdx.has(i));

  let chaserIdx: number[];
  const pick = spec.chaserPick ?? 'spread';
  if (pick === 'top') chaserIdx = pelotonIdx.slice(0, spec.chasers);
  else if (pick === 'bottom') chaserIdx = pelotonIdx.slice(-spec.chasers);
  else if (pick === 'median') {
    const mid = Math.floor(pelotonIdx.length / 2 - spec.chasers / 2);
    chaserIdx = pelotonIdx.slice(mid, mid + spec.chasers);
  } else {
    const step = Math.max(1, Math.floor(pelotonIdx.length / (spec.chasers || 1)));
    chaserIdx = [];
    for (let i = 0; i < spec.chasers; i++) {
      chaserIdx.push(pelotonIdx[Math.min(i * step, pelotonIdx.length - 1)]);
    }
  }
  const chaserSet = new Set(chaserIdx);

  const riders: RiderSnapshot[] = [];
  const breakIds: string[] = [];
  const pelotonIds: string[] = [];

  levels.forEach((lvl, i) => {
    const id = `r${i}`;
    if (breakIdx.has(i)) {
      riders.push(
        makeRider(id, lvl, spec.breakEffort ?? BreakawayEffort.HARD, ChaseIntensity.NONE),
      );
      breakIds.push(id);
    } else {
      riders.push(
        makeRider(
          id,
          lvl,
          BreakawayEffort.NORMAL,
          chaserSet.has(i) ? spec.chaseIntensity : ChaseIntensity.NONE,
        ),
      );
      pelotonIds.push(id);
    }
  });

  return { riders, breakIds, pelotonIds };
}

const STAGE = {
  id: 'bench',
  segments: [
    { startKm: 0, lengthKm: STAGE_KM, terrain: Terrain.FLAT, referenceSpeedKmh: V_REF },
  ],
};

interface RunOutcome {
  survived: boolean;
  breakEnergy: number;
  pelotonEnergy: number;
  energyMin: number;
  energyMedian: number;
  energyMax: number;
  largestFinishGroup: number;
  catchKm: number | null;
  maxGapSec: number;
  splitCount: number;
  finishGroups: number;
  top10SpreadSec: number;
  clampHits: number;
}

function analyse(
  res: SimulationResult,
  breakIds: readonly string[],
): RunOutcome {
  // LINEAGE-BASED tracking. gapsSec[0] is unusable once the field fragments:
  // it measures whichever two groups happen to be adjacent, which is often
  // two shards of the same breakaway rather than break-vs-peloton.
  const breakSet = new Set(breakIds);

  let maxGap = 0;
  let catchKm: number | null = null;

  for (const t of res.timeline) {
    // Leading group made up ENTIRELY of breakaway-lineage riders.
    const leadBreak = t.groups.find(
      (g) => g.size > 0 && g.riderIds.every((id) => breakSet.has(id)),
    );
    // Leading group containing at least one main-peloton-lineage rider.
    const leadPeloton = t.groups.find(
      (g) => g.size > 0 && g.riderIds.some((id) => !breakSet.has(id)),
    );

    if (leadBreak && leadPeloton) {
      const gap = leadPeloton.timeSec - leadBreak.timeSec;
      if (gap > maxGap) maxGap = gap;
      if (gap <= 0 && catchKm === null) catchKm = t.km;
    } else if (!leadBreak && catchKm === null) {
      catchKm = t.km;
    }
  }

  const finishTimes = [...res.riders.values()]
    .map((s) => s.finishTimeSec!)
    .sort((a, b) => a - b);
  const top10 = finishTimes.slice(0, 10);
  const spread = top10.length > 1 ? top10[top10.length - 1] - top10[0] : 0;

  // A breakaway SURVIVED iff it was never caught. Checking the composition of
  // the leading finishing group is wrong: after a catch, a strong break-lineage
  // rider can split off the merged bunch again and lead at the line, which
  // would be scored as a surviving breakaway even though it was reeled in.
  const survived = catchKm === null;

  const all = [...res.riders.values()];
  const energies = all.map((r) => r.energy).sort((a, b) => a - b);
  const brkE = all.filter((r) => breakSet.has(r.id)).map((r) => r.energy);
  const pelE = all.filter((r) => !breakSet.has(r.id)).map((r) => r.energy);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const largestFinishGroup = Math.max(
    ...res.groups.filter((g) => g.riderIds.length > 0).map((g) => g.riderIds.length),
  );

  return {
    survived,
    breakEnergy: avg(brkE),
    pelotonEnergy: avg(pelE),
    energyMin: energies[0],
    energyMedian: energies[Math.floor(energies.length / 2)],
    energyMax: energies[energies.length - 1],
    largestFinishGroup,
    catchKm,
    maxGapSec: maxGap,
    splitCount: res.splits.length,
    finishGroups: res.finishGroupCount,
    top10SpreadSec: spread,
    clampHits: res.clampHits,
  };
}

function runScenario(spec: ScenarioSpec, runs = RUNS) {
  const outcomes: RunOutcome[] = [];
  for (let seed = 1; seed <= runs; seed++) {
    const { riders, breakIds, pelotonIds } = buildField(spec, seed);
    const snapshot = buildStageSnapshot({
      stageId: spec.id,
      seed,
      riders,
      balance: B,
    });
    const res = simulateStage({
      snapshot,
      stage: STAGE,
      initialGroups: [breakIds, pelotonIds],
      initialGapSec: BREAK_FORMATION_GAP_SEC,
      balance: B,
      options: {
        paceOnly: false,
        requiredPerformance: RP_PORT,
      },
      recordTimeline: true,
    });
    outcomes.push(analyse(res, breakIds));
  }
  return outcomes;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

function summarise(id: string, label: string, o: RunOutcome[]) {
  const survival = (o.filter((x) => x.survived).length / o.length) * 100;
  const gaps = o.map((x) => x.maxGapSec);
  const catches = o.map((x) => x.catchKm).filter((x): x is number => x !== null);
  return {
    id,
    label,
    survival,
    maxGapMedian: pct(gaps, 0.5),
    maxGapP90: pct(gaps, 0.9),
    catchKmMedian: catches.length ? pct(catches, 0.5) : NaN,
    splits: mean(o.map((x) => x.splitCount)),
    finishGroups: mean(o.map((x) => x.finishGroups)),
    largestFinishGroup: mean(o.map((x) => x.largestFinishGroup)),
    breakEnergy: mean(o.map((x) => x.breakEnergy)),
    pelotonEnergy: mean(o.map((x) => x.pelotonEnergy)),
    energyMin: mean(o.map((x) => x.energyMin)),
    energyMedian: mean(o.map((x) => x.energyMedian)),
    energyMax: mean(o.map((x) => x.energyMax)),
    catchKmMedianRaw: catches.length ? pct(catches, 0.5) : NaN,
    top10Spread: mean(o.map((x) => x.top10SpreadSec)),
    clamp: mean(o.map((x) => x.clampHits)),
  };
}

const fmt = (n: number, d = 1) =>
  Number.isNaN(n) ? '   n/a' : n.toFixed(d).padStart(7);
const mmss = (s: number) => {
  if (s === null || Number.isNaN(s)) return '  n/a';
  // Round the TOTAL seconds first. Rounding the remainder independently
  // produces 2:60 for 179.6 s instead of 3:00.
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}:${String(r).padStart(2, '0')}`.padStart(6);
};

console.log(`\nRACE-LEVEL BENCHMARKS  B0-B9`);
console.log(
  `field=${FIELD}  break=${BREAK_SIZE}  stage=${STAGE_KM} km  v_ref=${V_REF}  ` +
    `runs/scenario=${RUNS}  SmallVariance=0\n`,
);

const t0 = performance.now();

const chaseScenarios: ScenarioSpec[] = [
  { id: 'B0', label: 'zero chase', chasers: 0, chaseIntensity: ChaseIntensity.NONE },
  { id: 'B1', label: 'weak chase 2x Medium', chasers: 2, chaseIntensity: ChaseIntensity.MEDIUM },
  { id: 'B2', label: 'normal chase 6x Medium', chasers: 6, chaseIntensity: ChaseIntensity.MEDIUM },
  { id: 'B3', label: 'strong chase 12x High', chasers: 12, chaseIntensity: ChaseIntensity.HIGH },
  { id: 'B4', label: 'coordinated 4x High (team)', chasers: 4, chaseIntensity: ChaseIntensity.HIGH },
];

const rows = chaseScenarios.map((s) =>
  summarise(s.id, s.label, runScenario(s)),
);

console.log('-'.repeat(96));
console.log(
  '  ID  scenario                     survival%  maxGap p50  maxGap p90   splits  fin.grp  top10 spread',
);
console.log('-'.repeat(96));
console.log(
  '\nENERGY (EN-01 active) + CATCH + GROUPS',
);
console.log('-'.repeat(96));
console.log(
  '  ID   break E   peloton E   diff    E min / med / max     catch km   largest fin.grp   clamp',
);
console.log('-'.repeat(96));
for (const r of rows) {
  console.log(
    `  ${r.id}  ${r.breakEnergy.toFixed(1).padStart(7)}   ${r.pelotonEnergy.toFixed(1).padStart(9)}  ` +
      `${(r.breakEnergy - r.pelotonEnergy).toFixed(1).padStart(6)}   ` +
      `${r.energyMin.toFixed(1).padStart(5)} / ${r.energyMedian.toFixed(1)} / ${r.energyMax.toFixed(1)}   ` +
      `${(Number.isNaN(r.catchKmMedianRaw) ? 'none' : r.catchKmMedianRaw.toFixed(1)).padStart(8)}   ` +
      `${r.largestFinishGroup.toFixed(1).padStart(15)}   ${r.clamp.toFixed(2).padStart(5)}`,
  );
}
console.log('-'.repeat(96));
const SURVIVAL_TARGET: Record<string, [number, number]> = {
  B2: [15, 25],
};
const MAXGAP_TARGET_BAND: [number, number] = [3 * 60, 5 * 60]; // "normal max gap 3-5 min"
for (const r of rows) {
  console.log(
    `  ${r.id.padEnd(3)} ${r.label.padEnd(28)} ${fmt(r.survival)}    ` +
      `${mmss(r.maxGapMedian)}      ${mmss(r.maxGapP90)}  ${fmt(r.splits)}  ` +
      `${fmt(r.finishGroups)}      ${mmss(r.top10Spread)}`,
  );
}
console.log('-'.repeat(96));
console.log('\nPER-CRITERION VERDICT (a scenario passes only if ALL its criteria pass)');
for (const r of rows) {
  const st = SURVIVAL_TARGET[r.id];
  const survOk = st ? r.survival >= st[0] && r.survival <= st[1] : true;
  // The 3-5 min band applies to NORMALLY CONTESTED races only (B2).
  // B0/B1 are explicitly exempt: zero/weak chase must not be forced to it.
  const gapApplies = r.id === 'B2';
  const gapOk =
    !gapApplies ||
    (r.maxGapMedian >= MAXGAP_TARGET_BAND[0] &&
      r.maxGapMedian <= MAXGAP_TARGET_BAND[1]);
  const parts = [
    st ? `survival ${survOk ? 'PASS' : 'FAIL'}` : 'survival n/a  ',
    gapApplies
      ? `maxGap p50 in 3:00-5:00 ${gapOk ? 'PASS' : 'FAIL'}`
      : 'maxGap band n/a (exempt)   ',
  ];
  console.log(
    `  ${r.id}  ${parts.join('   ')}   -> ${survOk && gapOk ? 'PASS' : 'FAIL'}`,
  );
}
console.log(
  '\nNOTE: this is a ONE-STAGE FLAT benchmark. Its Top10 spread is NOT\n' +
    'comparable to the §24 target of 2-4 min Top10 GC spread over a\n' +
    '5-stage MIXED Tour. No GC verdict is issued here.\n' +
    'NOTE: EN-01 Energy consumption is ACTIVE. Holding threshold K = ' +
    `${BALANCE_V1.HOLDING_K} is PROVISIONAL, not canonical.`,
);

/* B6 — chaser quality sweep, same field, different chasers */
console.log('\nB6  chaser quality sweep (6x Medium, same field, different chasers)');
console.log('-'.repeat(96));
for (const pick of ['top', 'median', 'bottom'] as const) {
  const r = summarise(
    'B6',
    `chasers = ${pick}`,
    runScenario({
      id: 'B6',
      label: pick,
      chasers: 6,
      chaseIntensity: ChaseIntensity.MEDIUM,
      chaserPick: pick,
    }),
  );
  console.log(
    `      chasers = ${pick.padEnd(8)} survival ${fmt(r.survival)} %   ` +
      `maxGap p50 ${mmss(r.maxGapMedian)}   splits ${fmt(r.splits)}`,
  );
}

/* B5 — field variance sweep */
console.log('\nB5  field variance sweep (6x Medium chase, mean EP fixed)');
console.log('-'.repeat(96));
for (const sigma of [6, 12, 20]) {
  const r = summarise(
    'B5',
    `sigma ${sigma}`,
    runScenario({
      id: 'B5',
      label: `s${sigma}`,
      chasers: 6,
      chaseIntensity: ChaseIntensity.MEDIUM,
      sigma,
    }),
  );
  console.log(
    `      sigma(EP) = ${String(sigma).padStart(2)}     splits ${fmt(r.splits)}   ` +
      `finish groups ${fmt(r.finishGroups)}   top10 GC spread ${mmss(r.top10Spread)}   ` +
      `survival ${fmt(r.survival)} %`,
  );
}

/* B7b — split-onset divergence */
console.log('\nB7b split-onset divergence (passive EP changed, workers identical)');
console.log('-'.repeat(96));
{
  const spec: ScenarioSpec = {
    id: 'B7b',
    label: 'x',
    chasers: 6,
    chaseIntensity: ChaseIntensity.MEDIUM,
    chaserPick: 'median',
  };
  const { riders, breakIds, pelotonIds } = buildField(spec, 1);
  const workerIds = new Set(
    riders.filter((r) => r.tactics.chaseIntensity !== ChaseIntensity.NONE).map((r) => r.id),
  );
  const run = (freeze: boolean) => {
    const snapshot = buildStageSnapshot({ stageId: 'x', seed: 1, riders, balance: B });
    return simulateStage({
      snapshot,
      stage: STAGE,
      initialGroups: [breakIds, pelotonIds],
      balance: B,
      options: {
        paceOnly: false,
        requiredPerformance: RP_PORT,
        freezeStruggleFor: freeze
          ? new Set(riders.map((r) => r.id).filter((id) => !workerIds.has(id)))
          : undefined,
      },
      recordTimeline: true,
    });
  };
  const a = run(false);
  const b = run(true);
  let firstDiverge: number | null = null;
  const n = Math.min(a.timeline.length, b.timeline.length);
  for (let i = 0; i < n; i++) {
    const ga = a.timeline[i].gapsSec[0] ?? 0;
    const gb = b.timeline[i].gapsSec[0] ?? 0;
    if (Math.abs(ga - gb) > 1e-9) {
      firstDiverge = a.timeline[i].km;
      break;
    }
  }
  const firstSplitKm = a.splits.length ? a.splits[0].km : null;
  console.log(`      first split at      ${firstSplitKm ?? 'none'} km`);
  console.log(`      first divergence at ${firstDiverge ?? 'none'} km`);
  const ok =
    firstDiverge === null ||
    (firstSplitKm !== null && firstDiverge >= firstSplitKm - 1e-9);
  console.log(`      divergence never precedes the first split: ${ok ? 'PASS' : 'FAIL'}`);
}

console.log(`\nProvisional holding threshold K = ${BALANCE_V1.HOLDING_K} (NOT canonical)`);
console.log(`total benchmark wall time  ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);
