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

/**
 * Training Center V1 — FINAL canonical model (see the chat report,
 * "TRAINING CENTER CLOSE-OUT"). Affects PERFORMANCE training ONLY (the 7
 * canonical Performance attributes — see lib/training/config.ts's
 * PERFORMANCE_FOCUS) — never Technical training, Technique, Tactics,
 * Experience, Potential, Trainability, Professionalism, Recovery, or
 * Energy/Fatigue. Not to be confused with the Technical Center facility
 * (bike technical risk/service — a completely different system, see
 * TECHNICAL_RISK_REDUCTION below).
 *
 * Cumulative but NON-ADDITIVE: each level unlocks one more age band's
 * bonus, but a rider only ever receives the SINGLE multiplier for their
 * OWN age band — bands are never summed, even at L5 where the facility has
 * "unlocked" all four. A 20-year-old at L5 still gets exactly 1.15, not
 * 1.15×1.10×1.05×1.03.
 *
 * These age bands (17-23/24-27/28-31/32+) are a SEPARATE layer from
 * lib/training/config.ts's ageFactor() (the biological-age training curve,
 * with its own different band boundaries) — the two must never be merged
 * into one function (item 3 of the request). ageFactor = biological age;
 * trainingCenterMultiplier = club infrastructure quality.
 */
export type PerformanceAgeBand = '17-23' | '24-27' | '28-31' | '32+';

/** The multiplier a rider's own age band receives, once their effective Training Center level has unlocked it (see TRAINING_CENTER_AGE_BAND_UNLOCK_LEVEL). */
export const TRAINING_CENTER_AGE_BAND_MULTIPLIER: Record<PerformanceAgeBand, number> = {
  '17-23': 1.15,
  '24-27': 1.10,
  '28-31': 1.05,
  '32+': 1.03,
};

/** The facility level at which each age band's bonus first becomes available. L1 grants none — "Základné tréningové podmienky". */
export const TRAINING_CENTER_AGE_BAND_UNLOCK_LEVEL: Record<PerformanceAgeBand, FacilityLevel> = {
  '17-23': 2,
  '24-27': 3,
  '28-31': 4,
  '32+': 5,
};

export function performanceAgeBand(age: number): PerformanceAgeBand {
  if (age <= 23) return '17-23';
  if (age <= 27) return '24-27';
  if (age <= 31) return '28-31';
  return '32+';
}

/**
 * The authoritative Training Center effect on Performance training raw
 * growth (both primary AND secondary — see lib/training/growth.ts) — a
 * single multiplier selected by (effective level, rider age), never summed
 * across bands. Mirrors process_training_plan()'s SQL exactly (see
 * supabase/schema.sql) — kept in sync by hand, see
 * trainingCenterSql.test.ts's canary. Must be called with the rider's
 * EFFECTIVE level (min(storedLevel, leagueCap) — see
 * lib/facilities/capMath.ts), never the raw stored level, so a relegated
 * player's gameplay effect is correctly clamped down without erasing their
 * stored progress.
 */
export function trainingCenterMultiplier(level: FacilityLevel, age: number): number {
  const band = performanceAgeBand(age);
  return level >= TRAINING_CENTER_AGE_BAND_UNLOCK_LEVEL[band] ? TRAINING_CENTER_AGE_BAND_MULTIPLIER[band] : 1.00;
}

/**
 * L5 RETENTION — PREPARED FUTURE INTEGRATION POINT, NOT WIRED UP ANYWHERE
 * (see the chat report, item 7). Final game-design contract for a future
 * natural age-related PERFORMANCE decline system: at effective Training
 * Center L5, a 32+ rider's decline should be reduced by this fraction.
 * Scope, per that same contract: PERFORMANCE decline only — never Energy,
 * Fatigue, injury, Technique, Tactics, or race penalties.
 *
 * No decline system of any kind exists anywhere in this codebase yet
 * (Weekly Training V1 only ever grows attributes) — this constant is NOT
 * read by any function today. Recorded here only so a future decline
 * system has one canonical place to look; do not wire it into anything
 * until that system actually exists.
 */
export const TRAINING_CENTER_L5_PERFORMANCE_DECLINE_REDUCTION = 0.15;

/**
 * Recovery Center V1 — FINAL canonical model (see the chat report,
 * "REGENERAČNÉ CENTRUM CLOSE-OUT"). Affects PASSIVE RECOVERY ONLY — the
 * Energy regained / Fatigue reduced on a training week's non-training days
 * (RECOVERY_DAY_ENERGY/RECOVERY_DAY_FATIGUE in lib/training/config.ts).
 * Never affects: Performance training gain, Technical training gain,
 * Potential, Trainability, Professionalism, Experience, Form, Morale,
 * Fitness, race performance, or the training Energy/Fatigue COST itself
 * (ENERGY_COST/FATIGUE_GAIN/TECHNICAL_ENERGY_COST/TECHNICAL_FATIGUE_GAIN —
 * those are fixed regardless of facility level). Also never changes the
 * NUMBER of recovery days (PERFORMANCE_RECOVERY_DAYS/
 * TECHNICAL_RECOVERY_DAYS) — the facility improves the QUALITY of each
 * recovery day, not how many there are.
 *
 * A straight multiplier applied to the recovery day's own baseline amount —
 * levels do NOT stack or multiply against each other; the rider's
 * effective level simply looks up its own canonical value (same
 * non-additive convention as Training Center's trainingCenterMultiplier()
 * — see the chat report, item 2).
 *
 * Applied inside process_training_plan() (supabase/schema.sql), the sole
 * authoritative source for condition changes — see recoveryCenterMultiplier()
 * below, the TS mirror kept in sync by hand (see
 * recoveryCenterSql.test.ts's canary).
 */
export const RECOVERY_MULTIPLIER: Record<FacilityLevel, number> = {
  1: 1.00, 2: 1.05, 3: 1.10, 4: 1.15, 5: 1.20,
};

/**
 * The authoritative Recovery Center effect on passive recovery — must be
 * called with the rider's EFFECTIVE level (min(storedLevel, leagueCap) —
 * see lib/facilities/capMath.ts), never the raw stored level, so a
 * relegated player's gameplay effect is correctly clamped down without
 * erasing their stored progress (same convention as Training Center's
 * trainingCenterMultiplier()).
 */
export function recoveryCenterMultiplier(level: FacilityLevel): number {
  return RECOVERY_MULTIPLIER[level];
}

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
