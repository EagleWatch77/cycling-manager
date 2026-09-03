import { Terrain, ZERO_ATTRIBUTES, Attributes } from '../src/types/terrain.js';
import { RiderSnapshot } from '../src/types/domain.js';
import {
  BALANCE_V1,
  BreakawayEffort,
  ChaseIntensity,
  draftingEnergyMultiplier,
} from '../src/config/balance.js';
import { buildStageSnapshot } from '../src/core/snapshot.js';
import { simulateStage } from '../src/core/segmentLoop.js';
import {
  CANONICAL_REQUIRED_PERFORMANCE,
  experimentalHoldingThreshold,
  holdingFactor,
  RequiredPerformancePort,
} from '../src/core/struggle.js';

/**
 * SP-02 diagnostic.
 *
 * Neutral field: one bunch, no breakaway, no chase, flat stage.
 * Nothing here is canonical. K is swept, not chosen.
 */

const B = BALANCE_V1;
const FIELD = 40;
const STAGE_KM = 160;
const V_REF = 42;
const MEAN_EP = 130;

function makeRider(id: string, level: number): RiderSnapshot {
  const a: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = level;
  return {
    id,
    attributes: a,
    condition: 1,
    setup: 1,
    weather: 1,
    startEnergy: 100,
    tactics: {
      breakawayEffort: BreakawayEffort.NORMAL,
      chaseIntensity: ChaseIntensity.NONE,
    },
  };
}

const STAGE = {
  id: 'sp02',
  segments: [
    {
      startKm: 0,
      lengthKm: STAGE_KM,
      terrain: Terrain.FLAT,
      referenceSpeedKmh: V_REF,
    },
  ],
};

interface Row {
  sigma: number;
  splits: number;
  firstSplitKm: number | null;
  finishGroups: number;
  largestGroup: number;
  top10SpreadSec: number;
  fullSpreadSec: number;
  energyMin: number;
  energyMedian: number;
  energyMax: number;
}

function run(port: RequiredPerformancePort, sigma: number): Row {
  // Uniform spread across [MEAN_EP - sigma, MEAN_EP + sigma].
  const riders = Array.from({ length: FIELD }, (_, i) =>
    makeRider(`r${i}`, MEAN_EP + ((i - (FIELD - 1) / 2) / ((FIELD - 1) / 2)) * sigma),
  );
  const snapshot = buildStageSnapshot({
    stageId: 'sp02',
    seed: 1,
    riders,
    balance: B,
  });
  const res = simulateStage({
    snapshot,
    stage: STAGE,
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: { paceOnly: false, requiredPerformance: port },
  });

  const energies = [...res.riders.values()].map((s) => s.energy).sort((a, b) => a - b);
  const times = [...res.riders.values()]
    .map((s) => s.finishTimeSec!)
    .sort((a, b) => a - b);
  const top10 = times.slice(0, 10);
  const largest = Math.max(
    ...res.groups.filter((g) => g.riderIds.length > 0).map((g) => g.riderIds.length),
  );

  return {
    sigma,
    splits: res.splits.length,
    firstSplitKm: res.splits.length ? res.splits[0].km : null,
    finishGroups: res.finishGroupCount,
    largestGroup: largest,
    top10SpreadSec: top10[top10.length - 1] - top10[0],
    fullSpreadSec: times[times.length - 1] - times[0],
    energyMin: energies[0],
    energyMedian: energies[Math.floor(energies.length / 2)],
    energyMax: energies[energies.length - 1],
  };
}

const SIGMAS = process.env.FINE
  ? [6, 7, 8, 9, 10, 11, 12, 14, 16]
  : [1, 2, 4, 6, 12];

const n = (v: number, w = 6, d = 0) => v.toFixed(d).padStart(w);
const km = (v: number | null) => (v === null ? '    none' : `${v.toFixed(1)} km`.padStart(8));
const mmss = (s: number) => {
  if (s === null || Number.isNaN(s)) return '    n/a';
  // Round the TOTAL seconds first, else 179.6 renders as 2:60.
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}:${String(r).padStart(2, '0')}`.padStart(7);
};

console.log('\nSP-02 DIAGNOSTIC — holding-threshold sweep');
console.log(
  `neutral field, one bunch, no chase, flat ${STAGE_KM} km, ` +
    `${FIELD} riders, mean EP ${MEAN_EP}, SmallVariance=0`,
);
console.log('Struggle dead zone ACTIVE: |deficit| < 1 EP is inert.\n');

console.log('HoldingFactor = 1 - K * (1 - DraftEnergyMultiplier(groupSize))');
console.log('effective threshold as a fraction of PaceEP:\n');
console.log('   group size   draftMult    K=0.20   K=0.30   K=0.40');
console.log('   ' + '-'.repeat(52));
for (const gs of [40, 21, 20, 11, 10, 6, 5, 3, 2, 1]) {
  const dm = draftingEnergyMultiplier(gs);
  console.log(
    `   ${String(gs).padStart(9)}   ${dm.toFixed(2).padStart(9)}   ` +
      [0.2, 0.3, 0.4]
        .map((k) => holdingFactor(k, gs).toFixed(4).padStart(6))
        .join('   '),
  );
}

const variants: [string, RequiredPerformancePort][] = process.env.K40_ONLY
  ? [['K = 0.40  (PROVISIONAL, with EN-01 Energy active)', experimentalHoldingThreshold(0.4)]]
  : [
      ['BASELINE  RP = PaceEP (K=0, reopened rule)', CANONICAL_REQUIRED_PERFORMANCE],
      ['K = 0.20', experimentalHoldingThreshold(0.2)],
      ['K = 0.30', experimentalHoldingThreshold(0.3)],
      ['K = 0.40', experimentalHoldingThreshold(0.4)],
    ];

for (const [label, port] of variants) {
  console.log(`\n\n${label}`);
  console.log('-'.repeat(84));
  console.log(
    '   sigma   splits   first split   finish groups   largest group   Top10 spread   full spread   Energy min/med/max',
  );
  console.log('-'.repeat(84));
  for (const sigma of SIGMAS) {
    const r = run(port, sigma);
    console.log(
      `   ${n(r.sigma, 5)}   ${n(r.splits, 6)}   ${km(r.firstSplitKm)}   ` +
        `${n(r.finishGroups, 13)}   ${n(r.largestGroup, 13)}   ` +
        `${mmss(r.top10SpreadSec)}   ${mmss(r.fullSpreadSec)}   ` +
        `${r.energyMin.toFixed(1).padStart(5)} / ${r.energyMedian.toFixed(1)} / ${r.energyMax.toFixed(1)}`,
    );
  }
}

console.log(
  '\n\nTarget shape for a normal flat stage with modest field variance:',
);
console.log('  one large main bunch retained; Top10 may legitimately share one Group Time.');
console.log('\nNothing above is canonical. K has NOT been chosen.\n');
