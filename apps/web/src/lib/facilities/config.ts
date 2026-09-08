/**
 * Zázemie (Team Facilities) V1 — the single canonical source for every
 * facility effect. UI and backend both read from here; nothing computes an
 * effect number inline anywhere else (see the chat report, item 17).
 *
 * BALANCE_PLACEHOLDER: every price and every numeric effect below is a
 * temporary dev default, not a finalized game-design number — prices in
 * particular are explicitly unbalanced pending the real Financie system
 * (see item 13 of the request). Production UI must never claim these are
 * final; the Facilities page labels prices as provisional in its own copy.
 */

export type FacilityId = 'training' | 'recovery' | 'scouting' | 'technical' | 'teamCenter';
export type FacilityLevel = 1 | 2 | 3 | 4 | 5;

export const FACILITY_IDS: readonly FacilityId[] = ['training', 'recovery', 'scouting', 'technical', 'teamCenter'];
export const FACILITY_LEVELS: readonly FacilityLevel[] = [1, 2, 3, 4, 5];

/** Training Center — multiplier applied once to raw training progress (see lib/training/growth.ts). */
export const TRAINING_BONUS: Record<FacilityLevel, number> = {
  1: 0, 2: 0.03, 3: 0.06, 4: 0.09, 5: 0.12,
};

/** Recovery Center — relative improvement to energy recovery / fatigue reduction. Superseded for training's own condition math by RECOVERY_MULTIPLIER below (Unified Weekly Training V1 — see the chat report, item 16); kept for the Facilities page's own effect display. */
export const RECOVERY_BONUS: Record<FacilityLevel, number> = {
  1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.20,
};

/**
 * Recovery Center — Unified Weekly Training V1 (see the chat report, item
 * 16). Applies ONLY to the new passive weekly recovery (RECOVERY_DAY_ENERGY/
 * RECOVERY_DAY_FATIGUE in lib/training/config.ts), never to training's own
 * raw growth or to the training energy/fatigue cost itself — a straight
 * multiplier (not a "reduction fraction" like RECOVERY_BONUS above), applied
 * inside process_training_plan() (supabase/schema.sql), the sole
 * authoritative source for condition changes now.
 */
export const RECOVERY_MULTIPLIER: Record<FacilityLevel, number> = {
  1: 1.00, 2: 1.05, 3: 1.10, 4: 1.15, 5: 1.20,
};

/**
 * Scouting Dept — INTERNAL tuning only, the +/- window (in raw potential
 * points, same scale as POTENTIAL_MIN/MAX) a scouting estimate may deviate
 * from truePotential. NEVER send this number, or the perturbed/true
 * potential value itself, to the browser — see lib/facilities/scouting.ts.
 * The player only ever sees the L1-L5 label below or a star rating.
 */
export const SCOUTING_ESTIMATE_WINDOW: Record<FacilityLevel, number> = {
  1: 18, 2: 14, 3: 10, 4: 6, 5: 3,
};

/** Technical Center — RELATIVE risk reduction and repair-price discount (both multiplicative, never subtracted as flat percentage points). */
export const TECHNICAL_RISK_REDUCTION: Record<FacilityLevel, number> = {
  1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.20,
};
export const TECHNICAL_REPAIR_DISCOUNT: Record<FacilityLevel, number> = {
  1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.20,
};

/** Team Center — roster/staff capacity this level allows. */
export const TEAM_CENTER_RIDER_CAPACITY: Record<FacilityLevel, number> = {
  1: 2, 2: 4, 3: 6, 4: 8, 5: 10,
};
export const TEAM_CENTER_STAFF_CAPACITY: Record<FacilityLevel, number> = {
  1: 2, 2: 3, 3: 5, 4: 7, 5: 10,
};

/** BALANCE_PLACEHOLDER — provisional upgrade prices (EUR), pending Financie balancing (item 13). */
export const FACILITY_UPGRADE_PRICE: Record<FacilityId, Record<FacilityLevel, number>> = {
  training:   { 1: 0, 2: 8000,  3: 16000, 4: 28000, 5: 45000 },
  recovery:   { 1: 0, 2: 8000,  3: 16000, 4: 28000, 5: 45000 },
  scouting:   { 1: 0, 2: 8000,  3: 16000, 4: 28000, 5: 45000 },
  technical:  { 1: 0, 2: 8000,  3: 16000, 4: 28000, 5: 45000 },
  teamCenter: { 1: 0, 2: 15000, 3: 30000, 4: 50000, 5: 80000 },
};
/** The price to go FROM level `level` TO `level + 1` (undefined at level 5, already max). */
export function upgradePrice(facility: FacilityId, level: FacilityLevel): number | undefined {
  if (level >= 5) return undefined;
  return FACILITY_UPGRADE_PRICE[facility][(level + 1) as FacilityLevel];
}

/** BALANCE_PLACEHOLDER — bike service V1 (item 13): base repair cost per lost condition point per component. */
export const BIKE_REPAIR_PRICE_PER_POINT: Record<'tires' | 'brakes' | 'drivetrain', number> = {
  tires: 400, brakes: 350, drivetrain: 500,
};

/**
 * Bike condition risk bands (item 10) — centralized so the Facilities page
 * and any future race-entry check read the exact same thresholds.
 */
export const BIKE_RISK_BANDS = [
  { min: 75, max: 100, key: 'normal' },
  { min: 50, max: 74, key: 'elevated' },
  { min: 25, max: 49, key: 'high' },
  { min: 0, max: 24, key: 'veryHigh' },
] as const;
export type BikeRiskBand = (typeof BIKE_RISK_BANDS)[number]['key'];

export function bikeRiskBand(overallCondition: number): BikeRiskBand {
  const band = BIKE_RISK_BANDS.find((b) => overallCondition >= b.min && overallCondition <= b.max);
  return band?.key ?? 'veryHigh';
}

/** Base (pre-Technical-Center) probability a stage produces a technical incident — see the chat report: no race-engine incident system exists yet, so this is never actually consulted for anything today; it exists only so applyRiskReduction() has a real number to demonstrate against in tests. */
export const BASE_TECHNICAL_INCIDENT_RISK = 0.05;

export function applyRiskReduction(baseRiskPct: number, level: FacilityLevel): number {
  return baseRiskPct * (1 - TECHNICAL_RISK_REDUCTION[level]);
}

export function applyRepairDiscount(basePrice: number, level: FacilityLevel): number {
  return Math.round(basePrice * (1 - TECHNICAL_REPAIR_DISCOUNT[level]));
}
