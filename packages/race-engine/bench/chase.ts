import { performance } from 'node:perf_hooks';
import { Terrain, ZERO_ATTRIBUTES, Attributes } from '../src/types/terrain.js';
import { RiderSnapshot } from '../src/types/domain.js';
import {
  BALANCE_V1,
  BreakawayEffort,
  ChaseIntensity,
} from '../src/config/balance.js';
import { buildStageSnapshot, Rng } from '../src/core/snapshot.js';
import { simulateStage, SimulationResult } from '../src/core/segmentLoop.js';
import { experimentalHoldingThreshold } from '../src/core/struggle.js';

/**
 * CHASE BENCHMARK — breakaway ALREADY ESTABLISHED.
 *
 * This fixture deliberately does NOT model breakaway formation. The break is
 * handed a finished gap at km 15 and normal chase settings apply from that
 * instant. There is no artificial no-chase window.
 *
 * Breakaway formation / attack-response logic is a separate design problem
 * and is not addressed here.
 */

const B = BALANCE_V1;
const RP_PORT = experimentalHoldingThreshold(B.HOLDING_K); // PROVISIONAL K
const FIELD = 40;
const BREAK_SIZE = 5;
const STAGE_TOTAL_KM = 160;
const BREAK_ESTABLISHED_AT_KM = 15;
const RACED_KM = STAGE_TOTAL_KM - BREAK_ESTABLISHED_AT_KM; // 145
const V_REF = 42;
const RUNS = Number(process.env.RUNS ?? 150);
const BATCHES = 4; // sub-batches for stability reporting
const SIGMA = 12;
const MEAN_EP = 130;

const GAP_FIXTURES = process.env.PRIMARY_ONLY ? [180] : [120, 180, 240];
const PRIMARY_FIXTURE = 180;

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
  const a: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = level;
  return {
    id,
    attributes: a,
    condition: 1,
    setup: 1,
    weather: 1,
    startEnergy: 100,
    tactics: { breakawayEffort: effort, chaseIntensity: chase },
  };
}

interface Spec {
  id: string;
  label: string;
  chasers: number;
  intensity: ChaseIntensity;
}

const SPECS: Spec[] = [
  { id: 'B0', label: 'zero chase', chasers: 0, intensity: ChaseIntensity.NONE },
  { id: 'B1', label: 'weak 2x Medium', chasers: 2, intensity: ChaseIntensity.MEDIUM },
  { id: 'B2', label: 'normal 6x Medium', chasers: 6, intensity: ChaseIntensity.MEDIUM },
  { id: 'B3', label: 'strong 12x High', chasers: 12, intensity: ChaseIntensity.HIGH },
  { id: 'B4', label: 'team 4x High', chasers: 4, intensity: ChaseIntensity.HIGH },
];

function buildField(spec: Spec, seed: number) {
  const rng = new Rng(seed);
  const levels = Array.from({ length: FIELD }, () => MEAN_EP + gaussian(rng) * SIGMA);
  levels.sort((a, b) => b - a);

  const breakIdx = new Set<number>();
  let cursor = Math.floor(FIELD * 0.35);
  while (breakIdx.size < BREAK_SIZE) breakIdx.add(cursor++);

  const pelotonIdx = levels.map((_, i) => i).filter((i) => !breakIdx.has(i));
  const step = Math.max(1, Math.floor(pelotonIdx.length / (spec.chasers || 1)));
  const chaserIdx: number[] = [];
  for (let i = 0; i < spec.chasers; i++) {
    chaserIdx.push(pelotonIdx[Math.min(i * step, pelotonIdx.length - 1)]);
  }
  const chaserSet = new Set(chaserIdx);

  const riders: RiderSnapshot[] = [];
  const breakIds: string[] = [];
  const pelotonIds: string[] = [];
  const chaserIds: string[] = [];

  levels.forEach((lvl, i) => {
    const id = `r${i}`;
    if (breakIdx.has(i)) {
      riders.push(makeRider(id, lvl, BreakawayEffort.HARD, ChaseIntensity.NONE));
      breakIds.push(id);
    } else {
      const isChaser = chaserSet.has(i);
      riders.push(
        makeRider(id, lvl, BreakawayEffort.NORMAL, isChaser ? spec.intensity : ChaseIntensity.NONE),
      );
      pelotonIds.push(id);
      if (isChaser) chaserIds.push(id);
    }
  });

  return { riders, breakIds, pelotonIds, chaserIds };
}

const STAGE = {
  id: 'chase',
  segments: [
    {
      startKm: 0,
      lengthKm: RACED_KM,
      terrain: Terrain.FLAT,
      referenceSpeedKmh: V_REF,
    },
  ],
};

interface Outcome {
  survived: boolean;
  catchKm: number | null;
  maxGapSec: number;
  finishGapSec: number | null;
  breakEnergy: number;
  chaserEnergy: number;
  largestPelotonGroup: number;
  splits: number;
}

function analyse(
  res: SimulationResult,
  breakIds: readonly string[],
  chaserIds: readonly string[],
): Outcome {
  const breakSet = new Set(breakIds);
  const chaserSet = new Set(chaserIds);

  let maxGap = 0;
  let catchKm: number | null = null;
  let lastGap: number | null = null;

  for (const t of res.timeline) {
    const leadBreak = t.groups.find(
      (g) => g.size > 0 && g.riderIds.every((id) => breakSet.has(id)),
    );
    const leadPeloton = t.groups.find(
      (g) => g.size > 0 && g.riderIds.some((id) => !breakSet.has(id)),
    );

    if (leadBreak && leadPeloton) {
      const gap = leadPeloton.timeSec - leadBreak.timeSec;
      if (gap > maxGap) maxGap = gap;
      lastGap = gap;
      if (gap <= 0 && catchKm === null) {
        catchKm = BREAK_ESTABLISHED_AT_KM + t.km;
      }
    } else if (!leadBreak && catchKm === null) {
      catchKm = BREAK_ESTABLISHED_AT_KM + t.km;
    }
  }

  const all = [...res.riders.values()];
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

  const pelotonGroups = res.groups.filter(
    (g) => g.riderIds.length > 0 && g.riderIds.some((id) => !breakSet.has(id)),
  );
  const largestPelotonGroup = pelotonGroups.length
    ? Math.max(...pelotonGroups.map((g) => g.riderIds.length))
    : 0;

  const survived = catchKm === null;

  return {
    survived,
    catchKm,
    maxGapSec: maxGap,
    finishGapSec: survived ? lastGap : null,
    breakEnergy: avg(all.filter((r) => breakSet.has(r.id)).map((r) => r.energy)),
    chaserEnergy: avg(all.filter((r) => chaserSet.has(r.id)).map((r) => r.energy)),
    largestPelotonGroup,
    splits: res.splits.length,
  };
}

function runCell(spec: Spec, gapSec: number): Outcome[] {
  const out: Outcome[] = [];
  for (let seed = 1; seed <= RUNS; seed++) {
    const { riders, breakIds, pelotonIds, chaserIds } = buildField(spec, seed);
    const snapshot = buildStageSnapshot({
      stageId: `${spec.id}-${gapSec}`,
      seed,
      riders,
      balance: B,
    });
    const res = simulateStage({
      snapshot,
      stage: STAGE,
      initialGroups: [breakIds, pelotonIds],
      initialGapSec: gapSec,
      balance: B,
      options: { paceOnly: false, requiredPerformance: RP_PORT },
      recordTimeline: true,
    });
    out.push(analyse(res, breakIds, chaserIds));
  }
  return out;
}

/** Each (scenario, gap) cell is simulated once and reused by every report. */
const cellCache = new Map<string, Outcome[]>();
function cached(spec: Spec, gap: number): Outcome[] {
  const key = `${spec.id}|${gap}`;
  let v = cellCache.get(key);
  if (!v) {
    v = runCell(spec, gap);
    cellCache.set(key, v);
  }
  return v;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const mmss = (s: number) => {
  if (s === null || Number.isNaN(s)) return '   n/a';
  // Round the TOTAL seconds first. Rounding the remainder independently
  // produces 2:60 for 179.6 s instead of 3:00.
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}:${String(r).padStart(2, '0')}`.padStart(6);
};
const num = (v: number, w: number, d = 1) =>
  Number.isNaN(v) ? 'n/a'.padStart(w) : v.toFixed(d).padStart(w);

console.log('\nCHASE BENCHMARK — BREAKAWAY ALREADY ESTABLISHED');
console.log(
  `break established at km ${BREAK_ESTABLISHED_AT_KM}, ${RACED_KM} km raced, ` +
    `field ${FIELD}, break ${BREAK_SIZE} at Hard, sigma(EP) ${SIGMA}`,
);
console.log(
  `chase applies immediately from the fixture start — no formation window. ` +
    `K = ${B.HOLDING_K} PROVISIONAL. runs/cell ${RUNS}.\n`,
);

const t0 = performance.now();

for (const gap of GAP_FIXTURES) {
  const primary = gap === PRIMARY_FIXTURE;
  console.log(
    `\n${'='.repeat(104)}\nESTABLISHED GAP ${gap} s` +
      (primary ? '   <-- PRIMARY CALIBRATION CASE' : ''),
  );
  console.log('='.repeat(104));
  console.log(
    '  ID  scenario           survival   catch km   max gap   finish gap   break E   chaser E   lg.pel.grp   splits',
  );
  console.log('-'.repeat(104));

  for (const spec of SPECS) {
    const o = cached(spec, gap);
    const survival = (o.filter((x) => x.survived).length / o.length) * 100;
    const catches = o.map((x) => x.catchKm).filter((x): x is number => x !== null);
    const finishGaps = o.map((x) => x.finishGapSec).filter((x): x is number => x !== null);

    console.log(
      `  ${spec.id}  ${spec.label.padEnd(18)} ${num(survival, 7)} %  ` +
        `${catches.length ? num(median(catches), 8) : '    none'}  ` +
        `${mmss(median(o.map((x) => x.maxGapSec)))}   ` +
        `${finishGaps.length ? mmss(median(finishGaps)) : '   n/a'}   ` +
        `${num(mean(o.map((x) => x.breakEnergy)), 7)}   ` +
        `${num(mean(o.map((x) => x.chaserEnergy)), 8)}   ` +
        `${num(mean(o.map((x) => x.largestPelotonGroup)), 10)}   ` +
        `${num(mean(o.map((x) => x.splits)), 6)}`,
    );
  }
}

/* ================================================================== */
/* Statistical validation of the primary fixture                      */
/* ================================================================== */

if (process.env.PRIMARY_ONLY) {
  console.log(`\n\n${'='.repeat(104)}`);
  console.log(`STATISTICAL VALIDATION — 180 s fixture, ${RUNS} runs per scenario`);
  console.log('='.repeat(104));

  const wilson = (k: number, n: number): [number, number] => {
    const z = 1.96;
    const p = k / n;
    const d = 1 + (z * z) / n;
    const c = p + (z * z) / (2 * n);
    const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return [((c - h) / d) * 100, ((c + h) / d) * 100];
  };
  const sd = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))));
  };
  const p25 = (xs: number[]) => {
    const s2 = [...xs].sort((a, b) => a - b);
    return s2[Math.floor(s2.length * 0.25)];
  };
  const p75 = (xs: number[]) => {
    const s2 = [...xs].sort((a, b) => a - b);
    return s2[Math.floor(s2.length * 0.75)];
  };

  for (const spec of SPECS) {
    const o = cached(spec, PRIMARY_FIXTURE);
    const k = o.filter((x) => x.survived).length;
    const [lo, hi] = wilson(k, o.length);
    const batch = Math.floor(o.length / BATCHES);
    const batchRates = Array.from({ length: BATCHES }, (_, i) => {
      const slice = o.slice(i * batch, (i + 1) * batch);
      return (slice.filter((x) => x.survived).length / slice.length) * 100;
    });
    const catches = o.map((x) => x.catchKm).filter((x): x is number => x !== null);
    const fin = o.map((x) => x.finishGapSec).filter((x): x is number => x !== null);
    const gaps = o.map((x) => x.maxGapSec);
    const brkE = o.map((x) => x.breakEnergy);
    const chsE = o.map((x) => x.chaserEnergy).filter((x) => !Number.isNaN(x));
    const sp = o.map((x) => x.splits);
    const lg = o.map((x) => x.largestPelotonGroup);

    console.log(`\n  ${spec.id}  ${spec.label}`);
    console.log(
      `      survival        ${((k / o.length) * 100).toFixed(2)} %   ` +
        `95% CI [${lo.toFixed(2)}, ${hi.toFixed(2)}]   ` +
        `batches ${batchRates.map((b) => b.toFixed(1)).join(' / ')}`,
    );
    console.log(
      `      catch km        ` +
        (catches.length
          ? `median ${median(catches).toFixed(1)}   IQR [${p25(catches).toFixed(1)}, ${p75(catches).toFixed(1)}]   n=${catches.length}`
          : 'never caught'),
    );
    console.log(
      `      max gap         median ${mmss(median(gaps))}   IQR [${mmss(p25(gaps))},${mmss(p75(gaps))} ]`,
    );
    console.log(
      `      finish gap      ` +
        (fin.length
          ? `median ${mmss(median(fin))}   IQR [${mmss(p25(fin))},${mmss(p75(fin))} ]   n=${fin.length}`
          : 'n/a (always caught)'),
    );
    console.log(
      `      Energy break    ${mean(brkE).toFixed(2)} +/- ${sd(brkE).toFixed(2)}` +
        (chsE.length ? `    chaser ${mean(chsE).toFixed(2)} +/- ${sd(chsE).toFixed(2)}` : '    chaser n/a'),
    );
    console.log(
      `      splits          ${mean(sp).toFixed(2)} +/- ${sd(sp).toFixed(2)}` +
        `    largest pel.grp ${mean(lg).toFixed(2)} +/- ${sd(lg).toFixed(2)}`,
    );
  }
}

console.log(`\n\nwall time  ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('No constant was tuned during this run.');
console.log(
  'The 30 s fixture in bench/race.ts is retained as a DIAGNOSTIC only and is\n' +
    'not a balance acceptance test.\n',
);
