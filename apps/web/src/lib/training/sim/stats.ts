export function mean(a: ArrayLike<number>): number { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
export function percentile(sortedAsc: ArrayLike<number>, p: number): number {
  const n = sortedAsc.length; if (!n) return 0;
  const pos = (p / 100) * (n - 1); const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}
export function sorted(a: ArrayLike<number>): Float64Array { const x = Float64Array.from(a as ArrayLike<number> as any); x.sort(); return x; }
export interface Dist { mean: number; median: number; p5: number; p25: number; p75: number; p90: number; p95: number; p99: number; max: number }
export function dist(a: ArrayLike<number>): Dist {
  const s = sorted(a);
  return { mean: mean(s), median: percentile(s, 50), p5: percentile(s, 5), p25: percentile(s, 25), p75: percentile(s, 75), p90: percentile(s, 90), p95: percentile(s, 95), p99: percentile(s, 99), max: s[s.length - 1] ?? 0 };
}
