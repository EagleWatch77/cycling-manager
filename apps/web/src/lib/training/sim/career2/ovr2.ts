/** OVR audit helpers: CURRENT production formula (lib/rider/score.ts overallRating) vs the PROPOSED formula (brief, section 2). Pure, no I/O. */
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { IDX, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX } from '../career/params';

const meanIdx = (a: ArrayLike<number>, idx: readonly number[]): number => { let s = 0; for (const i of idx) s += a[i]; return s / idx.length; };
const maxIdx = (a: ArrayLike<number>, idx: readonly number[]): number => { let m = -Infinity; for (const i of idx) if (a[i] > m) m = a[i]; return m; };

/** CURRENT: 0.50 mean(7 Performance) + 0.25 mean(5 Tactics) + 0.20 mean(6 Technique) + 0.05 Experience, rounded (rider_overall_rating() in SQL is identical). */
export function ovrCurrent(a: ArrayLike<number>): number {
  return Math.round(meanIdx(a, PERF_IDX) * 0.5 + meanIdx(a, TACT_IDX) * 0.25 + meanIdx(a, TECH_IDX) * 0.20 + a[EXP_IDX] * 0.05);
}
/** PROPOSED physical rating V = 0.60 mean(top 3 of 7) + 0.40 mean(7). */
export function physV(a: ArrayLike<number>): number {
  const p = PERF_IDX.map((i) => a[i]).sort((x, y) => y - x);
  return 0.6 * ((p[0] + p[1] + p[2]) / 3) + 0.4 * (p.reduce((x, y) => x + y, 0) / p.length);
}
/** PROPOSED: round(0.60 V + 0.15 T + 0.10 Te + 0.15 S), T = best Tactics attribute, Te = best Technique attribute, S = Experience, clamped to 1..200. */
export function ovrProposed(a: ArrayLike<number>): number {
  const o = Math.round(0.6 * physV(a) + 0.15 * maxIdx(a, TACT_IDX) + 0.10 * maxIdx(a, TECH_IDX) + 0.15 * a[EXP_IDX]);
  return Math.max(1, Math.min(200, o));
}
export const asArray = (r: Record<SkillAttribute, number>): Float64Array => { const x = new Float64Array(SKILL_ATTRIBUTES.length); SKILL_ATTRIBUTES.forEach((k, i) => { x[i] = r[k]; }); return x; };
export { IDX };
