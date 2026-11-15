import { SKILL_ATTRIBUTES, TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from './config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import { overallRating } from './score';

/**
 * "Vývoj jazdca" — pure comparison/series logic, no I/O. Everything here is
 * derived from REAL stored attribute snapshots (rider_acquisitions /
 * rider_attribute_history, see supabase migration 20261115_03); nothing is
 * estimated or invented. OVR always comes from the approved overallRating().
 */

export type Attributes = Record<SkillAttribute, number>;
/** 'acquired' = captured when the manager got the rider; 'tracking_start' = the real acquisition values were never stored. */
export type BaselineKind = 'acquired' | 'tracking_start';

/** Display order: Výkon, Taktika, Technika, Skúsenosti — the 19 public attributes, each exactly once. */
export const PROGRESS_ATTRIBUTES: readonly SkillAttribute[] = [
  ...PERFORMANCE_FOCUS, ...TACTICS_ATTRIBUTES, ...TECHNIQUE_ATTRIBUTES, 'experience',
];

/** A stored attributes object is usable only when all 19 public values are finite numbers. */
export function toAttributes(raw: unknown): Attributes | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out = {} as Attributes;
  for (const k of SKILL_ATTRIBUTES) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out[k] = v;
  }
  return out;
}

export type DeltaTone = 'up' | 'zero' | 'down';
export const deltaTone = (d: number): DeltaTone => (d > 0 ? 'up' : d < 0 ? 'down' : 'zero');
/** "+3", "0", "−2" (true minus sign). */
export const formatDelta = (d: number): string => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '0');
export const DELTA_CLASS: Record<DeltaTone, string> = {
  up: 'text-green-600', zero: 'text-navy-muted', down: 'text-danger',
};

export type ProgressRow = { attr: SkillAttribute; from: number; now: number; delta: number };
export type Progress = { ovrFrom: number; ovrNow: number; ovrDelta: number; rows: ProgressRow[] };

/** Baseline vs current. Unchanged attributes are included with delta 0. */
export function buildProgress(baseline: Attributes, current: Attributes): Progress {
  const ovrFrom = overallRating(baseline);
  const ovrNow = overallRating(current);
  return {
    ovrFrom, ovrNow, ovrDelta: ovrNow - ovrFrom,
    rows: PROGRESS_ATTRIBUTES.map((attr) => ({
      attr, from: baseline[attr], now: current[attr], delta: current[attr] - baseline[attr],
    })),
  };
}

/** Sources of change that really exist today. Anything else is not labelled. */
export type HistorySource = 'baseline' | 'training' | 'other';
export type HistoryPoint = {
  recordedAt: string; seasonId: string; week: number; source: HistorySource; attributes: Attributes;
};
export type SeriesKey = 'ovr' | SkillAttribute;
export type SeriesPoint = { recordedAt: string; seasonId: string; week: number; source: HistorySource; value: number };

/** One real value per stored history row, oldest first. Never interpolated, never extended. */
export function buildSeries(points: readonly HistoryPoint[], key: SeriesKey): SeriesPoint[] {
  return points.map((p) => ({
    recordedAt: p.recordedAt, seasonId: p.seasonId, week: p.week, source: p.source,
    value: key === 'ovr' ? overallRating(p.attributes) : p.attributes[key],
  }));
}
