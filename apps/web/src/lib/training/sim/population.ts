import { SKILL_ATTRIBUTES, ATTR_MIN, ATTR_MAX, type SkillAttribute } from '@/lib/rider/config';
import { PERFORMANCE_FOCUS } from '../config';
import { mulberry32, randInt, pickIndex, type Rng } from './rng';

/**
 * EXPERIMENTAL population for the training simulation — never written to any
 * database, never read from one. Hidden values use the experimental 1–100
 * scale (see HIDDEN_BANDS); production currently stores 55–95.
 */
export type HiddenKey = 'potential' | 'trainability' | 'professionalism' | 'recovery';
export const HIDDEN_KEYS: readonly HiddenKey[] = ['potential', 'trainability', 'professionalism', 'recovery'];

/** Approved experimental distribution of EVERY hidden value (inclusive bands, uniform inside a band). */
export const HIDDEN_BANDS: readonly { lo: number; hi: number; share: number }[] = [
  { lo: 1, hi: 20, share: 0.10 },
  { lo: 21, hi: 40, share: 0.25 },
  { lo: 41, hi: 60, share: 0.40 },
  { lo: 61, hi: 80, share: 0.20 },
  { lo: 81, hi: 95, share: 0.04 },
  { lo: 96, hi: 100, share: 0.01 },
];

export function sampleHidden(rng: Rng): number {
  const u = rng();
  let acc = 0;
  for (const b of HIDDEN_BANDS) {
    acc += b.share;
    if (u < acc) return randInt(rng, b.lo, b.hi);
  }
  const last = HIDDEN_BANDS[HIDDEN_BANDS.length - 1];
  return randInt(rng, last.lo, last.hi);
}

export interface SimRider {
  id: number;
  age: number;
  /** Public attributes (the 19 canonical ones). */
  attrs: Record<SkillAttribute, number>;
  hidden: Record<HiddenKey, number>;
  energy: number;
  fatigue: number;
  /** Performance attribute this rider trains (fixed for the whole simulation, identical in every scenario). */
  focus: SkillAttribute;
}

const AGE_BANDS: readonly { lo: number; hi: number; share: number }[] = [
  { lo: 18, hi: 22, share: 0.55 }, { lo: 23, hi: 27, share: 0.25 },
  { lo: 28, hi: 32, share: 0.13 }, { lo: 33, hi: 36, share: 0.07 },
];

function sampleAge(rng: Rng): number {
  const u = rng();
  let acc = 0;
  for (const b of AGE_BANDS) { acc += b.share; if (u < acc) return randInt(rng, b.lo, b.hi); }
  return randInt(rng, 33, 36);
}

const clampAttr = (v: number) => Math.max(ATTR_MIN, Math.min(ATTR_MAX, v));

function profileKey(r: SimRider): string {
  return `${r.age}|${SKILL_ATTRIBUTES.map((k) => r.attrs[k]).join(',')}|${HIDDEN_KEYS.map((k) => r.hidden[k]).join(',')}|${r.energy}|${r.fatigue}|${r.focus}`;
}

/**
 * Public ability model (ASSUMPTION, mirrors the starter generator's spirit —
 * rookie base ~130, noise ±3, three strengths +10 / three weaknesses −10 —
 * plus a per-rider level offset ±12 so weak and strong riders both exist).
 * Starting condition: half the riders start rested (100/0, like a real
 * starter), half with a random energy 30–100 / fatigue 0–70.
 */
export interface PopulationOptions { ageMin: number; ageMax: number; restedOnly: boolean }
export function generatePopulation(n: number, seed: number, opts?: PopulationOptions): SimRider[] {
  const rng = mulberry32(seed);
  const seen = new Set<string>();
  const out: SimRider[] = [];
  while (out.length < n) {
    const level = 130 + Math.round((rng() + rng() - 1) * 12);
    const strong = new Set<number>(); while (strong.size < 3) strong.add(pickIndex(rng, SKILL_ATTRIBUTES.length));
    const weak = new Set<number>(); while (weak.size < 3) { const i = pickIndex(rng, SKILL_ATTRIBUTES.length); if (!strong.has(i)) weak.add(i); }
    const attrs = {} as Record<SkillAttribute, number>;
    SKILL_ATTRIBUTES.forEach((k, i) => {
      attrs[k] = clampAttr(level + (strong.has(i) ? 10 : weak.has(i) ? -10 : 0) + randInt(rng, -3, 3));
    });
    const hidden = {} as Record<HiddenKey, number>;
    for (const k of HIDDEN_KEYS) hidden[k] = sampleHidden(rng);
    const rested = opts?.restedOnly ? true : rng() < 0.5;
    const rider: SimRider = {
      id: out.length + 1,
      age: opts ? randInt(rng, opts.ageMin, opts.ageMax) : sampleAge(rng),
      attrs, hidden,
      energy: rested ? 100 : randInt(rng, 30, 100),
      fatigue: rested ? 0 : randInt(rng, 0, 70),
      focus: PERFORMANCE_FOCUS[pickIndex(rng, PERFORMANCE_FOCUS.length)],
    };
    const key = profileKey(rider);
    if (seen.has(key)) continue; // every rider is a unique profile
    seen.add(key);
    out.push(rider);
  }
  return out;
}

/**
 * Safe mapping of the experimental 1–100 scale onto what the production
 * formulas were calibrated for (55–95): 1 → 55, 100 → 95, linear.
 * 'direct' feeds raw 1–100 values into the unchanged formulas (sensitivity run).
 */
export type HiddenMapping = 'rescaled' | 'direct';
export function mapHidden(v: number, mapping: HiddenMapping): number {
  return mapping === 'direct' ? v : 55 + ((v - 1) * 40) / 99;
}
