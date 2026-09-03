import { Terrain, AttributeKey, Attributes } from '../types/terrain.js';

/**
 * BaseSegmentSkill weight tables, one per terrain.
 * Weights are percentages and MUST sum to 100 for every terrain
 * (enforced by assertWeightTablesValid()).
 *
 * PROVENANCE — read before tuning:
 *
 *   MOUNTAIN  FROZEN.  Canonical v1 table, spec §05 "Pracovný
 *             high-mountain BaseSegmentSkill".
 *
 *   DESCENT   FROZEN.  Downhill skill composition supplied with the
 *             terrain enum freeze: Descending 60 / Bike Handling 25 /
 *             Cornering 15.
 *
 *   FLAT      UNVALIDATED PLACEHOLDER.
 *   HILLY     UNVALIDATED PLACEHOLDER.
 *   CLASSICS  UNVALIDATED PLACEHOLDER.
 *
 * Spec §05 explicitly leaves flat/hilly/technical weights as tuning
 * constants ("Presné flat/hilly/technical váhy ostávajú tuning
 * constants"), so these three slots are declared-but-unfilled rather
 * than specified. The values below are placeholders chosen to be
 * directionally consistent with the archetype weight table in §03.
 * They are NOT a design decision and MUST be reviewed before any
 * balance conclusion is drawn from a benchmark that uses them.
 */

export type SkillWeights = Partial<Record<AttributeKey, number>>;

export type WeightStatus = 'FROZEN' | 'CANDIDATE' | 'PLACEHOLDER';

export interface WeightTableEntry {
  readonly weights: SkillWeights;
  readonly frozen: boolean;
  readonly status: WeightStatus;
  readonly source: string;
}

export const SEGMENT_SKILL_WEIGHTS: Readonly<
  Record<Terrain, WeightTableEntry>
> = Object.freeze({
  [Terrain.MOUNTAIN]: {
    status: 'FROZEN',
    frozen: true,
    source: 'spec §05 canonical v1 high-mountain',
    weights: {
      climbing: 52,
      endurance: 20,
      acceleration: 8,
      energyManagement: 10,
      positioning: 5,
      experience: 5,
    },
  },

  [Terrain.DESCENT]: {
    status: 'FROZEN',
    frozen: true,
    source: 'terrain enum freeze — downhill skill composition',
    weights: {
      descending: 60,
      bikeHandling: 25,
      cornering: 15,
    },
  },

  [Terrain.FLAT]: {
    status: 'PLACEHOLDER',
    frozen: false,
    source: 'UNVALIDATED PLACEHOLDER — spec leaves flat weights as tuning constants',
    weights: {
      flat: 40,
      endurance: 22,
      energyManagement: 12,
      positioning: 10,
      packRiding: 8,
      experience: 8,
    },
  },

  [Terrain.HILLY]: {
    status: 'PLACEHOLDER',
    frozen: false,
    source: 'UNVALIDATED PLACEHOLDER — spec leaves hilly weights as tuning constants',
    weights: {
      hills: 38,
      endurance: 20,
      climbing: 12,
      acceleration: 10,
      energyManagement: 10,
      positioning: 5,
      experience: 5,
    },
  },

  [Terrain.CLASSICS]: {
    status: 'CANDIDATE',
    frozen: false,
    source:
      'CANDIDATE (TC-01C) — rolling / rough / technical classics terrain. ' +
      'Climbing is deliberately EXCLUDED: HILLY and MOUNTAIN already carry the ' +
      'climbing demand. Not frozen.',
    weights: {
      hills: 25,
      endurance: 20,
      flat: 15,
      acceleration: 10,
      positioning: 10,
      roughSurface: 10,
      packRiding: 5,
      bikeHandling: 5,
    },
  },
});

export function assertWeightTablesValid(): void {
  for (const terrain of Object.keys(SEGMENT_SKILL_WEIGHTS) as Terrain[]) {
    const entry = SEGMENT_SKILL_WEIGHTS[terrain];
    const sum = Object.values(entry.weights).reduce((a, b) => a + (b ?? 0), 0);
    if (Math.abs(sum - 100) > 1e-9) {
      throw new Error(
        `BaseSegmentSkill weights for ${terrain} sum to ${sum}, expected 100`,
      );
    }
  }
}

/** Weighted blend of rider attributes for a terrain. Returns EP-scale points. */
export function baseSegmentSkill(
  attributes: Attributes,
  terrain: Terrain,
): number {
  const { weights } = SEGMENT_SKILL_WEIGHTS[terrain];
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += attributes[key as AttributeKey] * (weight as number);
  }
  return total / 100;
}

/** Terrains whose weight table is not frozen (candidate or placeholder). */
export function unvalidatedTerrains(): Terrain[] {
  return (Object.keys(SEGMENT_SKILL_WEIGHTS) as Terrain[]).filter(
    (t) => !SEGMENT_SKILL_WEIGHTS[t].frozen,
  );
}

export function terrainsWithStatus(status: WeightStatus): Terrain[] {
  return (Object.keys(SEGMENT_SKILL_WEIGHTS) as Terrain[]).filter(
    (t) => SEGMENT_SKILL_WEIGHTS[t].status === status,
  );
}
