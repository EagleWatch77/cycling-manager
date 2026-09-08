import {
  PERFORMANCE_MIN, PERFORMANCE_MAX, ATTR_MIN, ATTR_MAX,
  POTENTIAL_MIN, POTENTIAL_MAX, TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES,
  type SkillAttribute,
} from './config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';

/**
 * Development + Rider Score foundation V1 — pure math, no I/O (same
 * pure/DB-plumbing split as growth.ts vs engine.ts elsewhere in this
 * codebase). The authoritative copy of the development-factor math lives
 * in process_training_plan() (see supabase/schema.sql); this file is the
 * unit-tested reference mirror, kept in sync by hand — see score.test.ts's
 * canary tests.
 *
 * REPLACES the old potentialCeiling()/potentialRoomFactor() model (see the
 * chat report's audit): Potential is no longer converted into an implied
 * per-attribute ceiling. It now only shapes how much OVERALL Performance
 * development slows down as a rider's OVERALL level approaches the
 * PERFORMANCE_MAX career ceiling — never a single attribute's own value in
 * isolation, and never a hard cap below PERFORMANCE_MAX for anyone.
 */

// ---------------------------------------------------------------------------
// Local attribute difficulty — depends ONLY on the attribute's own current
// value, never on Potential. A rider training one attribute hard into the
// 170-200 zone slows down on THAT attribute regardless of who they are.
// ---------------------------------------------------------------------------
const LOCAL_ANCHORS: readonly [number, number][] = [
  [140, 1.00], [150, 0.90], [160, 0.80], [170, 0.65], [180, 0.45], [190, 0.25], [200, 0.00],
];

function interpolateY(x: number, anchors: readonly [number, number][]): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (x <= x1) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return anchors[anchors.length - 1][1];
}

export function localAttributeFactor(currentValue: number): number {
  if (currentValue >= PERFORMANCE_MAX) return 0;
  return Math.max(0, Math.min(1, interpolateY(currentValue, LOCAL_ANCHORS)));
}

// ---------------------------------------------------------------------------
// overallPerformance — arithmetic mean of exactly the 7 canonical
// Performance attributes. Never includes Potential, Tactics, Technique,
// Experience, or Condition. Internal development metric — not player-facing
// on its own (performanceScore below is the player-facing 0-100 version).
// ---------------------------------------------------------------------------
export function overallPerformance(attributes: Record<SkillAttribute, number>): number {
  const sum = PERFORMANCE_FOCUS.reduce((s, a) => s + attributes[a], 0);
  return sum / PERFORMANCE_FOCUS.length;
}

// ---------------------------------------------------------------------------
// Overall Potential factor — depends on overallPerformance (not a single
// attribute) and Potential. Below overall=140, Potential has NO effect
// (base=1.0, weight=0) — a rider training their first attribute up while
// everything else is still low never gets slowed by their own talent
// ceiling. Above that, Potential increasingly decides how gracefully high-
// end development goes, but this is a MULTIPLIER on top of
// localAttributeFactor, never a replacement for it and never a per-rider
// hard cap (see developmentRoomFactor below for the hard cap, which is
// PERFORMANCE_MAX itself, identical for every rider regardless of Potential).
// ---------------------------------------------------------------------------
const OVERALL_ANCHORS: readonly [number, number, number][] = [
  [140, 1.00, 0.00],
  [150, 0.85, 0.30],
  [160, 0.75, 0.45],
  [170, 0.60, 0.65],
  [180, 0.45, 0.80],
  [190, 0.32, 0.90],
  [200, 0.22, 1.00],
];

function interpolate3(x: number, anchors: readonly [number, number, number][]): { base: number; weight: number } {
  if (x <= anchors[0][0]) return { base: anchors[0][1], weight: anchors[0][2] };
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, b0, w0] = anchors[i];
    const [x1, b1, w1] = anchors[i + 1];
    if (x <= x1) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return { base: b0 + (b1 - b0) * t, weight: w0 + (w1 - w0) * t };
    }
  }
  const last = anchors[anchors.length - 1];
  return { base: last[1], weight: last[2] };
}

/** Potential normalized to 0..1 over its canonical 55..95 range, 0.5 = neutral (average talent). */
function potentialEase(potential: number): number {
  return Math.max(0, Math.min(1, (potential - POTENTIAL_MIN) / (POTENTIAL_MAX - POTENTIAL_MIN)));
}

export function overallPotentialFactor(overall: number, potential: number): number {
  const { base, weight } = interpolate3(overall, OVERALL_ANCHORS);
  const ease = potentialEase(potential);
  const delta = (ease - 0.5) * 2 * weight * base * 0.85; // +/-85% swing at full weight, same as the approved simulation
  return Math.max(0.08, Math.min(1, base + delta));
}

// ---------------------------------------------------------------------------
// Final development room factor — the value that replaces the old
// potentialRoomFactor() slot in the training growth formula.
// ---------------------------------------------------------------------------
export const DEVELOPMENT_ROOM_FLOOR = 0.05;

export function developmentRoomFactor(currentValue: number, overall: number, potential: number): number {
  if (currentValue >= PERFORMANCE_MAX) return 0;
  const local = localAttributeFactor(currentValue);
  const overallFactor = overallPotentialFactor(overall, potential);
  return Math.max(DEVELOPMENT_ROOM_FLOOR, local * overallFactor);
}

// ---------------------------------------------------------------------------
// Player-facing 0-100 scores. Deterministic rounding (Math.round) so the
// same inputs always render the same integer in the UI.
// ---------------------------------------------------------------------------
export function normalizeScore(value: number, min: number, max: number): number {
  const pct = (value - min) / (max - min);
  return Math.round(Math.max(0, Math.min(1, pct)) * 100);
}

/** "Výkon" — player-facing 0-100, derived ONLY from the 7 Performance attributes. Never includes Potential. */
export function performanceScore(attributes: Record<SkillAttribute, number>): number {
  return normalizeScore(overallPerformance(attributes), PERFORMANCE_MIN, PERFORMANCE_MAX);
}

const RIDER_OVERALL_WEIGHTS = { performance: 0.65, tactics: 0.15, technique: 0.15, experience: 0.05 } as const;

function meanOf(attributes: Record<SkillAttribute, number>, keys: readonly SkillAttribute[]): number {
  return keys.reduce((s, k) => s + attributes[k], 0) / keys.length;
}

/**
 * "Celkové skóre" — player-facing 0-100 "how good is this rider TODAY".
 * Includes Performance/Tactics/Technique/Experience ONLY. Deliberately
 * excludes Potential, Trainability, Professionalism, Recovery (development
 * TRAITS — what the rider could become) and Energy/Fatigue/Form/Fitness/
 * Morale (Condition — today's readiness, not today's ability) — see the
 * chat report's item 15/16 for the exact rationale.
 */
export function riderOverall(attributes: Record<SkillAttribute, number>): number {
  const perf = performanceScore(attributes);
  const tactics = normalizeScore(meanOf(attributes, TACTICS_ATTRIBUTES), ATTR_MIN, ATTR_MAX);
  const technique = normalizeScore(meanOf(attributes, TECHNIQUE_ATTRIBUTES), ATTR_MIN, ATTR_MAX);
  const experience = normalizeScore(attributes.experience, ATTR_MIN, ATTR_MAX);

  const weighted = perf * RIDER_OVERALL_WEIGHTS.performance
    + tactics * RIDER_OVERALL_WEIGHTS.tactics
    + technique * RIDER_OVERALL_WEIGHTS.technique
    + experience * RIDER_OVERALL_WEIGHTS.experience;

  return Math.round(weighted);
}
