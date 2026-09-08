import { BIKE_REPAIR_PRICE_PER_POINT, applyRepairDiscount, bikeRiskBand, type BikeRiskBand, type FacilityLevel } from './config';
import type { Tour } from '@/data/tours';

/**
 * Pure Bike Condition V1 math — no I/O, no 'server-only' (mirrors this
 * codebase's existing growth.ts/engine.ts split: pure formula in one file,
 * DB plumbing in another). See lib/facilities/bike.ts for the persistence
 * layer that calls these; see bikeCalc.test.ts for the tests.
 */

export interface BikeCondition {
  tires: number;
  brakes: number;
  drivetrain: number;
  overall: number;
  riskBand: BikeRiskBand;
}

/** The overall figure is the weakest component — a bike is only as safe as its worst part — never an average that could mask one badly worn part. */
export function deriveOverall(c: { tires: number; brakes: number; drivetrain: number }): number {
  return Math.min(c.tires, c.brakes, c.drivetrain);
}

export function toBikeCondition(row: { tires: number; brakes: number; drivetrain: number }): BikeCondition {
  const overall = deriveOverall(row);
  return { tires: row.tires, brakes: row.brakes, drivetrain: row.drivetrain, overall, riskBand: bikeRiskBand(overall) };
}

export function clamp0to100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export interface ServiceQuoteItem {
  component: 'tires' | 'brakes' | 'drivetrain';
  condition: number;
  recommended: boolean;
  price: number;
}

export interface ServiceQuote {
  items: ServiceQuoteItem[];
  basePrice: number;
  discountedPrice: number;
  technicalLevel: FacilityLevel;
}

/**
 * Real, server-computed service price — never a random/fake number from
 * the client (item 11). Price is strictly derived from how many condition
 * points are actually missing per component, times a BALANCE_PLACEHOLDER
 * rate (lib/facilities/config.ts), then reduced by the Technical Center's
 * real repair discount.
 */
export function computeServiceQuote(condition: { tires: number; brakes: number; drivetrain: number }, technicalLevel: FacilityLevel): ServiceQuote {
  const components: ('tires' | 'brakes' | 'drivetrain')[] = ['tires', 'brakes', 'drivetrain'];
  const items: ServiceQuoteItem[] = components.map((c) => {
    const missing = 100 - condition[c];
    return {
      component: c,
      condition: condition[c],
      recommended: condition[c] < 75,
      price: Math.round(missing * BIKE_REPAIR_PRICE_PER_POINT[c]),
    };
  });
  const basePrice = items.reduce((sum, i) => sum + i.price, 0);
  const discountedPrice = applyRepairDiscount(basePrice, technicalLevel);
  return { items, basePrice, discountedPrice, technicalLevel };
}

export interface TourWear {
  tires: number;
  brakes: number;
  drivetrain: number;
}

/**
 * Real, static Tour data only (item 9) — distanceKm and the per-stage
 * `difficulty` category are the ONLY real inputs available anywhere in
 * this codebase (see data/tours.ts); there is no weather, no rain flag,
 * no gravel/cobbles flag, no elevation-profile number, and race-engine is
 * never actually invoked by the web app at all (confirmed in an earlier
 * audit), so no simulation-derived environment data exists to read either.
 * `difficulty: 'classics'` is used here as the closest real proxy for
 * rough-surface riding (cobbles); there is no dedicated surface field.
 *
 * BALANCE_PLACEHOLDER coefficients — tuning, not final game design.
 */
export function computeTourWear(tour: Tour): TourWear {
  const totalKm = tour.totalKm ?? tour.masterStages.reduce((sum, s) => sum + s.distanceKm, 0);
  const mountainKm = tour.masterStages.filter((s) => s.difficulty === 'mountain').reduce((sum, s) => sum + s.distanceKm, 0);
  const roughKm = tour.masterStages.filter((s) => s.difficulty === 'classics').reduce((sum, s) => sum + s.distanceKm, 0);

  const tires = totalKm * 0.035 + roughKm * 0.05;
  const brakes = mountainKm * 0.08 + totalKm * 0.015;
  const drivetrain = totalKm * 0.03 + roughKm * 0.06;

  return {
    tires: Math.round(tires),
    brakes: Math.round(brakes),
    drivetrain: Math.round(drivetrain),
  };
}
