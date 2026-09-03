import { performance } from 'node:perf_hooks';
import { WorkMode } from '../src/types/domain.js';
import { Terrain } from '../src/types/terrain.js';
import {
  BALANCE_V1,
  BreakawayEffort,
  ChaseIntensity,
} from '../src/config/balance.js';
import {
  computeGroupPace,
  gapChangeSecPerKm,
  PaceMember,
} from '../src/core/groupPace.js';
import { buildStageSnapshot } from '../src/core/snapshot.js';
import { simulateStage } from '../src/core/segmentLoop.js';
import { riderWithClimbing } from '../test/fixtures.js';

const B = BALANCE_V1;
const V_REF = 42;
const P_REF = 130;
const N_FIELD = 40;

const m = (
  id: string,
  ep: number,
  effort: BreakawayEffort,
  chase: ChaseIntensity,
): PaceMember => ({ id, ep, breakawayEffort: effort, chaseIntensity: chase });

const pace = (members: PaceMember[], mode: WorkMode) =>
  computeGroupPace({
    members,
    mode,
    pRef: P_REF,
    fieldSize: N_FIELD,
    referenceSpeedKmh: V_REF,
    balance: B,
  });

const breakGroup = (effort: BreakawayEffort, ep = 130, n = 5) =>
  Array.from({ length: n }, (_, i) =>
    m(`b${i}`, ep, effort, ChaseIntensity.NONE),
  );

const pelotonGroup = (
  chasers: number,
  chaserEP: number,
  passiveEP: number,
  chase: ChaseIntensity,
  size = 35,
) => [
  ...Array.from({ length: chasers }, (_, i) =>
    m(`c${i}`, chaserEP, BreakawayEffort.NORMAL, chase),
  ),
  ...Array.from({ length: size - chasers }, (_, i) =>
    m(`p${i}`, passiveEP, BreakawayEffort.NORMAL, ChaseIntensity.NONE),
  ),
];

const f2 = (n: number) => n.toFixed(2).padStart(8);
const f3 = (n: number) => n.toFixed(3).padStart(9);

function line(): void {
  console.log('-'.repeat(78));
}

/* ================================================================== */
/* Scenario matrix                                                    */
/* ================================================================== */

interface Row {
  id: string;
  label: string;
  lead: ReturnType<typeof pace>;
  chase: ReturnType<typeof pace>;
}

const rows: Row[] = [];

const push = (
  id: string,
  label: string,
  lead: PaceMember[],
  chaseG: PaceMember[],
) => {
  rows.push({
    id,
    label,
    lead: pace(lead, WorkMode.ESCAPE),
    chase: pace(chaseG, WorkMode.CHASE),
  });
};

// Set A — homogeneous calibration scenarios
push('A1', 'break Hard, 0 chasers',
  breakGroup(BreakawayEffort.HARD),
  pelotonGroup(0, 130, 130, ChaseIntensity.NONE));
push('A2', 'break Hard, 2x Medium',
  breakGroup(BreakawayEffort.HARD),
  pelotonGroup(2, 130, 130, ChaseIntensity.MEDIUM));
push('A3', 'break Hard, 6x Medium',
  breakGroup(BreakawayEffort.HARD),
  pelotonGroup(6, 130, 130, ChaseIntensity.MEDIUM));
push('A4', 'break Hard, 10x High',
  breakGroup(BreakawayEffort.HARD),
  pelotonGroup(10, 130, 130, ChaseIntensity.HIGH));
push('A5', 'break All-out, 0 chasers',
  breakGroup(BreakawayEffort.ALL_OUT),
  pelotonGroup(0, 130, 130, ChaseIntensity.NONE));
push('A6', 'break Hard, 35x All-out',
  breakGroup(BreakawayEffort.HARD),
  pelotonGroup(35, 130, 130, ChaseIntensity.ALL_OUT));

// Set B — heterogeneous scenarios (P_ref held fixed at 130 by construction)
push('B1', 'chasers EP 145 (6x Medium)',
  breakGroup(BreakawayEffort.HARD),
  pelotonGroup(6, 145, 130, ChaseIntensity.MEDIUM));
push('B2', 'chasers EP 130 (6x Medium)',
  breakGroup(BreakawayEffort.HARD),
  pelotonGroup(6, 130, 130, ChaseIntensity.MEDIUM));
push('B3', 'chasers EP 115 (6x Medium)',
  breakGroup(BreakawayEffort.HARD),
  pelotonGroup(6, 115, 130, ChaseIntensity.MEDIUM));
push('B4', 'passive EP 105 (6x Medium @130)',
  breakGroup(BreakawayEffort.HARD),
  pelotonGroup(6, 130, 105, ChaseIntensity.MEDIUM));

console.log('\nGROUP PACE SCENARIO MATRIX');
console.log(`v_ref=${V_REF} km/h   P_ref=${P_REF}   N_field=${N_FIELD}\n`);
line();
console.log(
  '  ID  scenario                        v_lead   v_chase   s/km lead  s/km chase   dGap/km',
);
line();
for (const r of rows) {
  console.log(
    `  ${r.id.padEnd(3)} ${r.label.padEnd(30)} ${f2(r.lead.speedKmh)} ${f2(
      r.chase.speedKmh,
    )}  ${f3(r.lead.secPerKm)} ${f3(r.chase.secPerKm)}  ${f2(
      gapChangeSecPerKm(r.lead, r.chase),
    )}`,
  );
}
line();

/* B4 vs B2 — pace purity check at benchmark level */
const b2 = rows.find((r) => r.id === 'B2')!;
const b4 = rows.find((r) => r.id === 'B4')!;
const purityDelta = Math.abs(b2.chase.speedKmh - b4.chase.speedKmh);
console.log(
  `\nB7a pace purity: |v(B2) - v(B4)| = ${purityDelta.toExponential(3)} km/h  ` +
    `(passive EP 130 vs 105)  ${purityDelta < 1e-12 ? 'PASS' : 'FAIL'}`,
);

/* B9 — neutral front group must ride exactly v_ref */
const neutralAllOut = computeGroupPace({
  members: Array.from({ length: 40 }, (_, i) =>
    m(`n${i}`, 130, BreakawayEffort.ALL_OUT, ChaseIntensity.ALL_OUT),
  ),
  mode: WorkMode.NEUTRAL,
  pRef: P_REF,
  fieldSize: N_FIELD,
  referenceSpeedKmh: V_REF,
  balance: B,
});
console.log(
  `B9 neutral front group: v = ${neutralAllOut.speedKmh.toFixed(9)} km/h ` +
    `(expect exactly ${V_REF})  ` +
    `${Math.abs(neutralAllOut.speedKmh - V_REF) < 1e-9 ? 'PASS' : 'FAIL'}`,
);

/* B6 — escape freeloading, EP-weighted */
const eps = [142, 138, 134, 128, 118];
const mk = (efforts: BreakawayEffort[]) =>
  pace(
    eps.map((ep, i) => m(`r${i}`, ep, efforts[i], ChaseIntensity.NONE)),
    WorkMode.ESCAPE,
  );
const H = BreakawayEffort.HARD;
const W = BreakawayEffort.WORK;
const S = BreakawayEffort.SAVE;
const allHard = mk([H, H, H, H, H]);
const strongSave = mk([S, S, W, H, H]);
const weakSave = mk([H, H, W, S, S]);
console.log(
  `\nB8 escape freeloading (EP-weighted):\n` +
    `  all Hard          ${f3(allHard.secPerKm)} s/km\n` +
    `  strongest 2 Save  ${f3(strongSave.secPerKm)} s/km\n` +
    `  weakest 2 Save    ${f3(weakSave.secPerKm)} s/km\n` +
    `  strong-save penalty vs weak-save: ${(
      strongSave.secPerKm - weakSave.secPerKm
    ).toFixed(3)} s/km  ${strongSave.secPerKm > weakSave.secPerKm ? 'PASS' : 'FAIL'}`,
);

/* ================================================================== */
/* Batch load benchmark — V10.5                                       */
/* ================================================================== */

console.log('\n\nBATCH LOAD BENCHMARK (V10.5)\n');

const FIELD = 45;
const STAGE_KM = 160;
const riders = Array.from({ length: FIELD }, (_, i) =>
  riderWithClimbing(`r${i}`, 95 + (i % 25) * 2),
);
const snapshot = buildStageSnapshot({
  stageId: 'bench',
  seed: 1234,
  riders,
  balance: B,
});
const stage = {
  id: 'bench',
  segments: [
    { startKm: 0, lengthKm: 60, terrain: Terrain.FLAT, referenceSpeedKmh: 44 },
    { startKm: 60, lengthKm: 40, terrain: Terrain.HILLY, referenceSpeedKmh: 38 },
    { startKm: 100, lengthKm: 35, terrain: Terrain.MOUNTAIN, referenceSpeedKmh: 24 },
    { startKm: 135, lengthKm: 25, terrain: Terrain.DESCENT, referenceSpeedKmh: 58 },
  ],
};
const groups = [
  riders.slice(0, 5).map((r) => r.id),
  riders.slice(5).map((r) => r.id),
];

const runOne = (recordTimeline: boolean) =>
  simulateStage({
    snapshot,
    stage,
    initialGroups: groups,
    balance: B,
    options: { paceOnly: true },
    recordTimeline,
  });

// warm up
for (let i = 0; i < 3; i++) runOne(false);

const SINGLE_RUNS = 25;
const singles: number[] = [];
for (let i = 0; i < SINGLE_RUNS; i++) {
  const t0 = performance.now();
  runOne(false);
  singles.push(performance.now() - t0);
}
singles.sort((a, b) => a - b);

const timelineRun = runOne(true);
const payloadBytes = Buffer.byteLength(JSON.stringify(timelineRun.timeline));

console.log(`  field size            ${FIELD} riders`);
console.log(`  stage length          ${STAGE_KM} km`);
console.log(`  tick                  ${B.TICK_KM} km  (${STAGE_KM / B.TICK_KM} ticks)`);
console.log(`  single stage  p50     ${singles[Math.floor(SINGLE_RUNS * 0.5)].toFixed(2)} ms`);
console.log(`  single stage  p95     ${singles[Math.floor(SINGLE_RUNS * 0.95)].toFixed(2)} ms`);
console.log(`  single stage  max     ${singles[singles.length - 1].toFixed(2)} ms`);
console.log(`  timeline payload      ${(payloadBytes / 1024).toFixed(1)} KiB raw JSON`);
console.log(`  clamp hits            ${timelineRun.clampHits}`);

// Race-day batch: 5 instances x 5 stages = 25 simulations in one job.
const BATCH = 25;
const memBefore = process.memoryUsage().heapUsed;
const tBatch0 = performance.now();
for (let i = 0; i < BATCH; i++) runOne(false);
const batchMs = performance.now() - tBatch0;
const memPeak = process.memoryUsage().heapUsed;

console.log(`\n  race-day batch        ${BATCH} simulations (5 instances x 5 stages)`);
console.log(`  batch total           ${batchMs.toFixed(1)} ms`);
console.log(`  batch per sim         ${(batchMs / BATCH).toFixed(2)} ms`);
console.log(`  heap delta            ${((memPeak - memBefore) / 1024 / 1024).toFixed(1)} MiB`);

console.log('\n\nNOT RUN — blocked on design gap RP-01:');
console.log('  B0-B4 breakaway survival rate');
console.log('  B5    field variance sweep / GC spread');
console.log('  B6    chaser quality survival sweep');
console.log('  B7b   split-onset divergence');
console.log('  catch km distribution, split counts, Energy at finish');
console.log('  These all require Struggle, which requires RequiredPerformance(G).\n');
