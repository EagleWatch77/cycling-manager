/**
 * V1 road terrain enum — FROZEN.
 *
 * Time Trial is deliberately NOT a member. TT does not use the Group Pace
 * model; it uses the separate TT model in spec §22.
 *
 * Sprint, KOM, cornering and other technical features are segment
 * events/modifiers, NOT terrain types.
 */
export enum Terrain {
  FLAT = 'FLAT',
  HILLY = 'HILLY',
  MOUNTAIN = 'MOUNTAIN',
  CLASSICS = 'CLASSICS',
  DESCENT = 'DESCENT',
}

export const ALL_TERRAINS: readonly Terrain[] = Object.freeze([
  Terrain.FLAT,
  Terrain.HILLY,
  Terrain.MOUNTAIN,
  Terrain.CLASSICS,
  Terrain.DESCENT,
]);

/** Rider attribute keys referenced by BaseSegmentSkill weight tables. */
export type AttributeKey =
  | 'climbing'
  | 'endurance'
  | 'hills'
  | 'acceleration'
  | 'flat'
  | 'sprint'
  | 'timeTrial'
  | 'energyManagement'
  | 'positioning'
  | 'packRiding'
  | 'experience'
  | 'descending'
  | 'bikeHandling'
  | 'cornering'
  | 'attackTiming'
  | 'reaction'
  /** TC-01C: cobbles / gravel / broken tarmac handling. */
  | 'roughSurface';

export type Attributes = Record<AttributeKey, number>;

export const ZERO_ATTRIBUTES: Attributes = Object.freeze({
  climbing: 0,
  endurance: 0,
  hills: 0,
  acceleration: 0,
  flat: 0,
  sprint: 0,
  timeTrial: 0,
  energyManagement: 0,
  positioning: 0,
  packRiding: 0,
  experience: 0,
  descending: 0,
  bikeHandling: 0,
  cornering: 0,
  roughSurface: 0,
  attackTiming: 0,
  reaction: 0,
});
