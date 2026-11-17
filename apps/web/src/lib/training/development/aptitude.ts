import { PHYSICAL, productionShape, ALLROUNDER_PLAN } from './config';
import { TECHNIQUE_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';

/**
 * Individual aptitude profile (internal, never shown to the player): one value in [-1, 1] for each of the 7 performance and
 * 6 technique attributes. It decides WHERE a rider has more or less room to grow; overall Potential still sets how much
 * (see effectiveCap() in core.ts) and the training plan still decides what is trained.
 *
 *  - Deterministic from an integer seed: store the 13 numbers (riders.aptitude_profile) when the rider is created; the
 *    profile never changes during the career. Pure + cheap, suitable for 10 000+ riders.
 *  - Performance and technique are drawn INDEPENDENTLY (own unevenness, own level), so a great climber can be a poor
 *    descender, a sprinter technically weak, and a rider physically even but technically very uneven.
 *  - Type (shape) only nudges the physical profile slightly; there is no fixed pattern per type.
 *  - About 14 % of riders are nearly balanced in each group independently, so nearly balanced in BOTH groups ~ 1 in 50.
 *    These are probabilities, not quotas.
 */
export type AptitudeProfile = Record<SkillAttribute, number>;

export const APTITUDE_CONFIG = {
  pBalanced: 0.14, balancedSd: 0.07, unevenSdMin: 0.40, unevenSdRange: 0.50, typeBias: 0.25, techLevelSd: 0.15, balancedThreshold: 0.15,
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const normal = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

function group(r: () => number, n: number, bias: number[], levelSd: number, cfg: typeof APTITUDE_CONFIG): number[] {
  const balanced = r() < cfg.pBalanced;
  const sd = balanced ? cfg.balancedSd : cfg.unevenSdMin + cfg.unevenSdRange * r();
  const level = levelSd * normal(r);
  let v = Array.from({ length: n }, (_, i) => sd * normal(r) + (balanced ? 0 : bias[i]));
  if (levelSd === 0) { const m = v.reduce((a, b) => a + b, 0) / n; v = v.map((x) => x - m); } // physical: keeps the total (Potential) neutral
  return v.map((x) => round2(clamp1(x + level)));
}

/** Profile of a rider of natural shape `shape` (plan id 0..6) from a 32-bit seed. */
export function generateAptitudeProfile(seed: number, shape: number, cfg = APTITUDE_CONFIG): AptitudeProfile {
  const r = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const sh = productionShape(shape);
  const bias = PHYSICAL.map((k) => (shape === ALLROUNDER_PLAN ? 0 : (sh.strong as readonly string[]).includes(k) ? cfg.typeBias : (sh.weak as readonly string[]).includes(k) ? -cfg.typeBias : 0));
  const phys = group(r, 7, bias, 0, cfg);
  const tech = group(r, 6, new Array(6).fill(0), cfg.techLevelSd, cfg);
  const out = {} as AptitudeProfile;
  PHYSICAL.forEach((k, i) => { out[k] = phys[i]; });
  TECHNIQUE_ATTRIBUTES.forEach((k, i) => { out[k] = tech[i]; });
  return out;
}

/** standard deviation of the aptitudes of a group of attributes (0 = perfectly even) */
export function unevenness(p: Partial<Record<SkillAttribute, number>>, keys: readonly SkillAttribute[]): number {
  const v = keys.map((k) => p[k] ?? 0), m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
}
export const isNearlyBalanced = (p: Partial<Record<SkillAttribute, number>>, cfg = APTITUDE_CONFIG) =>
  unevenness(p, PHYSICAL) < cfg.balancedThreshold && unevenness(p, TECHNIQUE_ATTRIBUTES) < cfg.balancedThreshold;
