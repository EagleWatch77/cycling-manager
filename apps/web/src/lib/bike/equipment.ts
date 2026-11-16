import { LEAGUES, type LeagueId } from '@/lib/leagues';

/**
 * Bike equipment configuration — the ONE shared place for the five
 * components, the ten levels and the league limits (C-059). UI components
 * read from here and never repeat league conditions.
 *
 * NOT final game values: no prices, weights, bonuses or wear rates live here
 * (see DECISIONS C-059). Only structure and names.
 */
export const BIKE_EQUIPMENT_IDS = ['frame', 'wheels', 'tires', 'brakes', 'drivetrain'] as const;
export type BikeEquipmentId = (typeof BIKE_EQUIPMENT_IDS)[number];

export const BIKE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type BikeLevel = (typeof BIKE_LEVELS)[number];

/** Every new rider starts with the basic bike: all components on level 1. No level is stored in the database yet. */
export const BASE_BIKE_LEVEL: BikeLevel = 1;

/** Highest equipment level a league can buy (APPROVED concept; behaviour after relegation is NOT decided). */
export const LEAGUE_MAX_BIKE_LEVEL: Record<LeagueId, BikeLevel> = {
  rookie: 2, amateur: 4, continental: 6, pro: 8, elite: 10,
};

export function maxBikeLevel(league: LeagueId): BikeLevel {
  return LEAGUE_MAX_BIKE_LEVEL[league];
}

export function isLevelAvailable(level: number, league: LeagueId): boolean {
  return level <= LEAGUE_MAX_BIKE_LEVEL[league];
}

/** The lowest league in which a level can be bought, or null for an invalid level. */
export function unlockLeague(level: number): LeagueId | null {
  return LEAGUES.find((l) => LEAGUE_MAX_BIKE_LEVEL[l] >= level) ?? null;
}

/** Levels above the current one, in order: the choices of the upgrade tab. */
export function upgradeLevels(current: number): BikeLevel[] {
  return BIKE_LEVELS.filter((l) => l > current);
}

/** Frame material path (APPROVED): 1 steel, 2 aluminium, 3-4 better aluminium, 5-6 basic carbon, 7-8 performance carbon, 9-10 top race carbon. */
export type FrameMaterial = 'steel' | 'aluminium' | 'aluminiumPlus' | 'carbonBasic' | 'carbonPerformance' | 'carbonRace';
export function frameMaterial(level: number): FrameMaterial {
  if (level <= 1) return 'steel';
  if (level === 2) return 'aluminium';
  if (level <= 4) return 'aluminiumPlus';
  if (level <= 6) return 'carbonBasic';
  if (level <= 8) return 'carbonPerformance';
  return 'carbonRace';
}

/** Property NAMES per component (values are not decided yet and are shown as a dash). */
export const BIKE_PROPERTIES: Record<BikeEquipmentId, readonly string[]> = {
  frame: ['weight', 'stiffness', 'aero'],
  wheels: ['weight', 'aero', 'rims'],
  tires: ['rolling', 'grip', 'wear'],
  brakes: ['braking', 'downhill', 'wear'],
  drivetrain: ['efficiency', 'quality', 'wear'],
};

/** All five components have a stored condition (frame + wheels since migration 20261116_03; a missing value still shows a dash). */
export const BIKE_WEAR_STORED: Record<BikeEquipmentId, boolean> = {
  frame: true, wheels: true, tires: true, brakes: true, drivetrain: true,
};

export function isBikeEquipmentId(v: string | null | undefined): v is BikeEquipmentId {
  return !!v && (BIKE_EQUIPMENT_IDS as readonly string[]).includes(v);
}
