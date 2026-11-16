import {
  ATTR_MIN, ATTR_MAX, PERFORMANCE_MIN, PERFORMANCE_MAX,
  POTENTIAL_MIN, POTENTIAL_MAX, TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES,
  type SkillAttribute,
} from './config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import { meanOf, normalizeScore } from './score';
import type { SegmentLevel } from './development';

/**
 * Ability radar model — pure math, no I/O. Reuses the SAME group means and
 * normalisation as riderOverall() (lib/rider/score.ts), so the radar can
 * never disagree with the overall score or the attribute cards.
 *
 * Only data a manager may see goes in here. The four hidden development
 * attributes (potential / trainability / professionalism / recovery) are
 * NEVER inputs: the caller passes scouting ESTIMATES (ranges) or null.
 * Today no numeric scouting ranges exist (see developmentEstimates.ts), so
 * every estimate is null and Rozvoj renders as "unknown" — never as 0.
 */

export type RadarGroupId = 'performance' | 'tactics' | 'technique' | 'experience' | 'development';
/** Groups that fan out into several attributes (Skúsenosti is a single attribute -> own detail, no fan). */
export type ExpandableGroupId = Exclude<RadarGroupId, 'experience'>;
export const RADAR_GROUP_ORDER: readonly RadarGroupId[] = ['performance', 'tactics', 'technique', 'experience', 'development'];
/** Tab order: Prehľad | Výkon | Taktika | Technika | Skúsenosti | Rozvoj. */
export const RADAR_TABS: readonly RadarGroupId[] = RADAR_GROUP_ORDER;
export const EXPANDABLE_GROUPS: readonly ExpandableGroupId[] = ['performance', 'tactics', 'technique', 'development'];

export const DEVELOPMENT_KEYS = ['potential', 'trainability', 'professionalism', 'recovery'] as const;
export type DevelopmentKey = (typeof DEVELOPMENT_KEYS)[number];

/** A scouting estimate on the shared 55–95 development scale, or null = not scouted yet. */
export interface DevRange { min: number; max: number }
export type DevelopmentEstimates = Record<DevelopmentKey, DevRange | null>;

export const NO_DEVELOPMENT_ESTIMATES: DevelopmentEstimates = {
  potential: null, trainability: null, professionalism: null, recovery: null,
};

/** The 1-5 star estimates the player already sees for his own rider (DB my_rider_estimates()); null = not available -> "Neznáme". */
export type DevelopmentLevels = Record<DevelopmentKey, SegmentLevel | null>;
export const NO_DEVELOPMENT_LEVELS: DevelopmentLevels = { potential: null, trainability: null, professionalism: null, recovery: null };

export interface RadarAttribute {
  key: string;
  label: string;
  /** Exact value (skills) — null for development attributes. */
  value: number | null;
  /** Radius fraction 0..1 on the group's own scale — null when unknown. */
  norm: number | null;
  /** Development attributes only: the estimated range, else null. */
  range: DevRange | null;
  normRange: { min: number; max: number } | null;
  /** Development attributes only: the same 1-5 stars as the Rozvoj card, else null. */
  level: SegmentLevel | null;
}

export interface RadarGroup {
  id: RadarGroupId;
  label: string;
  value: number | null;
  range: DevRange | null;
  norm: number | null;
  normRange: { min: number; max: number } | null;
  /** Real attribute scale (Skúsenosti detail indicator). */
  scale?: { min: number; max: number };
  /** Rozvoj only: mean of the four stars rounded to whole stars, when all four are available. */
  level: SegmentLevel | null;
  attributes: RadarAttribute[];
}

export interface RadarModel { groups: RadarGroup[] }

const frac = (value: number, min: number, max: number) => normalizeScore(value, min, max) / 100;

function clampRange(r: DevRange | null | undefined): DevRange | null {
  if (!r || !Number.isFinite(r.min) || !Number.isFinite(r.max)) return null;
  const lo = Math.max(POTENTIAL_MIN, Math.min(POTENTIAL_MAX, Math.min(r.min, r.max)));
  const hi = Math.max(POTENTIAL_MIN, Math.min(POTENTIAL_MAX, Math.max(r.min, r.max)));
  return { min: lo, max: hi };
}

/**
 * Joint Rozvoj interval = mean of the lower bounds .. mean of the upper
 * bounds, ONLY when all four attributes have an estimate (same scale).
 * A partial set would give a misleading average, so it returns null.
 */
export function developmentInterval(estimates: DevelopmentEstimates): DevRange | null {
  const ranges = DEVELOPMENT_KEYS.map((k) => clampRange(estimates[k]));
  if (ranges.some((r) => r === null)) return null;
  const rs = ranges as DevRange[];
  return {
    min: Math.round(rs.reduce((s, r) => s + r.min, 0) / rs.length),
    max: Math.round(rs.reduce((s, r) => s + r.max, 0) / rs.length),
  };
}

export function buildRadarModel(
  attributes: Record<SkillAttribute, number>,
  estimates: DevelopmentEstimates,
  label: (key: string) => string,
  levels: DevelopmentLevels = NO_DEVELOPMENT_LEVELS,
): RadarModel {
  const skillGroup = (
    id: RadarGroupId, keys: readonly SkillAttribute[], min: number, max: number,
  ): RadarGroup => {
    const mean = meanOf(attributes, keys);
    return {
      id, label: label(`group.${id}`),
      value: Math.round(mean), range: null, norm: frac(mean, min, max), normRange: null, level: null,
      attributes: keys.map((k) => ({
        key: k, label: label(`attr.${k}`), value: attributes[k],
        norm: frac(attributes[k], min, max), range: null, normRange: null, level: null,
      })),
    };
  };

  const devScale = (r: DevRange) => ({
    min: frac(r.min, POTENTIAL_MIN, POTENTIAL_MAX), max: frac(r.max, POTENTIAL_MIN, POTENTIAL_MAX),
  });
  const joint = developmentInterval(estimates);
  // A star bucket is drawn at the middle of its fifth of the axis; it carries no more information than the stars themselves.
  const levelNorm = (l: SegmentLevel) => (l - 0.5) / 5;
  const lv = DEVELOPMENT_KEYS.map((k) => levels[k]);
  const allLevels = lv.every((l) => l !== null);
  const meanLevel = allLevels ? (Math.max(1, Math.min(5, Math.round((lv as SegmentLevel[]).reduce((s, l) => s + l, 0) / 4))) as SegmentLevel) : null;
  const development: RadarGroup = {
    id: 'development', label: label('group.development'),
    value: null, range: joint,
    norm: joint ? (devScale(joint).min + devScale(joint).max) / 2 : allLevels ? (lv as SegmentLevel[]).reduce((s, l) => s + levelNorm(l), 0) / 4 : null,
    normRange: joint ? devScale(joint) : null,
    level: joint ? null : meanLevel,
    attributes: DEVELOPMENT_KEYS.map((k) => {
      const r = clampRange(estimates[k]);
      const l = r ? null : levels[k];
      return {
        key: k, label: label(`dev.${k}`), value: null,
        norm: r ? (devScale(r).min + devScale(r).max) / 2 : l ? levelNorm(l) : null,
        range: r, normRange: r ? devScale(r) : null, level: l,
      };
    }),
  };

  return {
    groups: [
      skillGroup('performance', PERFORMANCE_FOCUS, PERFORMANCE_MIN, PERFORMANCE_MAX),
      skillGroup('tactics', TACTICS_ATTRIBUTES, ATTR_MIN, ATTR_MAX),
      skillGroup('technique', TECHNIQUE_ATTRIBUTES, ATTR_MIN, ATTR_MAX),
      {
        id: 'experience', label: label('attr.experience'),
        value: attributes.experience, range: null, norm: frac(attributes.experience, ATTR_MIN, ATTR_MAX),
        normRange: null, level: null, scale: { min: ATTR_MIN, max: ATTR_MAX }, attributes: [],
      },
      development,
    ],
  };
}
