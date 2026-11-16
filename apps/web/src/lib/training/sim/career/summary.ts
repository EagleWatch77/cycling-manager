import { dist, mean, percentile, sorted } from '../stats';
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';
import type { SimRider } from '../population';
import { NATTR, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX, SNAPSHOT_SEASONS, STAGE_PERF, IDX } from './params';
import type { CareerResult } from './engine';
import { ols } from './ols';

export const BANDS = [[1, 20], [21, 40], [41, 60], [61, 80], [81, 95], [96, 100]] as const;
const bandOf = (v: number) => BANDS.findIndex(([lo, hi]) => v >= lo && v <= hi);
const HKEYS = ['potential', 'trainability', 'professionalism', 'recovery'] as const;

function groupMeanAt(res: CareerResult, ri: number, s: number, idx: readonly number[]): number {
  const o = (ri * (res.seasons + 1) + s) * NATTR; let t = 0; for (const i of idx) t += res.attrs[o + i]; return t / idx.length;
}

export function summarize(res: CareerResult, pop: readonly SimRider[]) {
  const n = res.n, S = res.seasons, W = S + 1;
  const ovr = (ri: number, s: number) => res.ovr[ri * W + s];
  const snaps = SNAPSHOT_SEASONS.filter((s) => s <= S).map((s) => {
    const v = new Float64Array(n), g = new Float64Array(n);
    for (let i = 0; i < n; i++) { v[i] = ovr(i, s); g[i] = ovr(i, s) - ovr(i, 0); }
    const attrMean = new Array(NATTR).fill(0), attrGain = new Array(NATTR).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < NATTR; k++) {
      const x = res.attrs[(i * W + s) * NATTR + k]; attrMean[k] += x; attrGain[k] += x - res.attrs[(i * W) * NATTR + k];
    }
    const grp = (idx: readonly number[]) => ({
      mean: mean(Array.from({ length: n }, (_, i) => groupMeanAt(res, i, s, idx))),
      gain: mean(Array.from({ length: n }, (_, i) => groupMeanAt(res, i, s, idx) - groupMeanAt(res, i, 0, idx))),
    });
    return {
      season: s, ovr: dist(v), growth: dist(g), min: Math.min(...v), max: Math.max(...v),
      attrs: Object.fromEntries(SKILL_ATTRIBUTES.map((k, i) => [k, { mean: attrMean[i] / n, gain: attrGain[i] / n }])),
      groups: { perf: grp(PERF_IDX), tactics: grp(TACT_IDX), technique: grp(TECH_IDX), experience: { mean: attrMean[EXP_IDX] / n, gain: attrGain[EXP_IDX] / n } },
    };
  });
  const curveMean: number[] = [], curveMedian: number[] = [];
  for (let s = 0; s <= S; s++) { const v = new Float64Array(n); for (let i = 0; i < n; i++) v[i] = ovr(i, s); curveMean.push(mean(v)); curveMedian.push(percentile(sorted(v), 50)); }

  // hidden-value breakdown
  const g12 = (i: number) => ovr(i, S) - ovr(i, 0);
  const byHidden: Record<string, any[]> = {};
  for (const hk of HKEYS) {
    byHidden[hk] = BANDS.map((_, b) => {
      const ids: number[] = []; for (let i = 0; i < n; i++) if (bandOf(pop[i].hidden[hk]) === b) ids.push(i);
      const m = (f: (i: number) => number) => (ids.length ? mean(ids.map(f)) : 0);
      return {
        band: `${BANDS[b][0]}–${BANDS[b][1]}`, n: ids.length,
        growth: m(g12), skipped: m((i) => res.sessionsSkipped[i]), done: m((i) => res.sessionsDone[i]),
        exhaustedShare: ids.length ? ids.filter((i) => res.exhaustedDays[i] > 0).length / ids.length : 0, exhaustedDays: m((i) => res.exhaustedDays[i]),
        stageREff: m((i) => res.stageREff[i]), tiredShare: m((i) => res.stageTiredShare[i]),
        preE: m((i) => res.tourPreE[i]), preF: m((i) => res.tourPreF[i]), postE: m((i) => res.tourPostE[i]), postF: m((i) => res.tourPostF[i]),
        weekEndE: m((i) => res.tourWeekEndE[i]), weekEndF: m((i) => res.tourWeekEndF[i]), nextScore: m((i) => res.nextWeekScore[i]),
        stageIndex: m((i) => res.sumStageIndex[i]),
      };
    });
  }
  // variance decomposition of the 12-season OVR growth on the four hidden values (standardised)
  const X = pop.map((r) => HKEYS.map((k) => r.hidden[k]));
  const mu = HKEYS.map((_, j) => mean(X.map((r) => r[j]))), sd = HKEYS.map((_, j) => Math.sqrt(mean(X.map((r) => (r[j] - mu[j]) ** 2))));
  const Xs = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const decomp = (yv: number[]) => {
    const full = ols(Xs, yv);
    const sdY = Math.sqrt(mean(yv.map((v) => (v - mean(yv)) ** 2))) || 1;
    return {
      r2: full.r2,
      beta: Object.fromEntries(HKEYS.map((k, j) => [k, full.beta[j + 1] / sdY])), // standardised effect (sd of outcome per sd of hidden)
      drop: Object.fromEntries(HKEYS.map((k, j) => [k, full.r2 - ols(Xs.map((r) => r.filter((_, q) => q !== j)), yv).r2])),
    };
  };
  const regression = {
    growth: decomp(Array.from({ length: n }, (_, i) => g12(i))),
    skipped: decomp(Array.from(res.sessionsSkipped)),
    exhaustedDays: decomp(Array.from(res.exhaustedDays)),
    stageREff: decomp(Array.from(res.stageREff)),
  };
  // age
  const byAgeStart = [18, 19, 20, 21, 22].map((a) => {
    const ids = pop.map((r, i) => (r.age === a ? i : -1)).filter((i) => i >= 0);
    return { age: a, n: ids.length, growth: mean(ids.map(g12)) };
  });
  const bySeasonAge: Record<number, { n: number; ovrGain: number; perfGain: number }> = {};
  for (let i = 0; i < n; i++) for (let s = 1; s <= S; s++) {
    const age = pop[i].age + s - 1;
    const b = (bySeasonAge[age] ??= { n: 0, ovrGain: 0, perfGain: 0 });
    b.n++; b.ovrGain += ovr(i, s) - ovr(i, s - 1); b.perfGain += groupMeanAt(res, i, s, PERF_IDX) - groupMeanAt(res, i, s - 1, PERF_IDX);
  }
  const ageSeason = Object.entries(bySeasonAge).map(([age, b]) => ({ age: Number(age), n: b.n, ovrGain: b.ovrGain / b.n, perfGain: b.perfGain / b.n })).sort((x, y) => x.age - y.age);

  const tourRiders = Array.from({ length: n }, (_, i) => i).filter((i) => res.tourCount[i] > 0);
  const tm = (arr: Float32Array) => (tourRiders.length ? mean(tourRiders.map((i) => arr[i])) : 0);
  const sess = {
    planned: mean(res.sessionsPlanned), done: mean(res.sessionsDone), skipped: mean(res.sessionsSkipped),
    skippedShare: mean(res.sessionsPlanned) > 0 ? mean(res.sessionsSkipped) / mean(res.sessionsPlanned) : 0,
    plannedWeeks: mean(res.plannedWeeks), restWeeks: mean(res.restWeeks),
  };
  const exhaustedRiders = Array.from(res.exhaustedDays).filter((v) => v > 0).length;
  return {
    cfg: { ...res.cfg, log: undefined }, n, seasons: S, snapshots: snaps, curveMean, curveMedian, sessions: sess,
    exhaustedRiders, exhaustedDaysMean: mean(res.exhaustedDays),
    tour: {
      count: mean(res.tourCount), preE: tm(res.tourPreE), preF: tm(res.tourPreF), postE: tm(res.tourPostE), postF: tm(res.tourPostF),
      weekEndE: tm(res.tourWeekEndE), weekEndF: tm(res.tourWeekEndF), nextWeekScore: tm(res.nextWeekScore),
      stageREff: tm(res.stageREff), tiredShare: tm(res.stageTiredShare), stageIndex: tm(res.sumStageIndex),
      form: tm(res.formAtTour), morale: tm(res.moraleAtTour), fitness: tm(res.fitnessAtTour),
    },
    finalForm: mean(res.finalForm), finalFitness: mean(res.finalFitness), finalMorale: mean(res.finalMorale),
    byHidden, regression, byAgeStart, ageSeason, invalidValues: res.invalidValues,
  };
}
export type RunSummary = ReturnType<typeof summarize>;
void IDX; void STAGE_PERF;
