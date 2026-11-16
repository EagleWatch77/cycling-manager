import { BIKE_COMPONENT_STATUS, bikeRiskBand } from './config';

/**
 * Pure display helpers for the Home bike card (no I/O). The database stores
 * CONDITION (100 = new); the card shows WEAR (0 % = new, 100 % = fully worn).
 * Nothing here changes stored values.
 */
export type BikeComponentId = 'wheels' | 'tires' | 'brakes' | 'drivetrain';
export type ComponentStatus = 'ok' | 'service' | 'maintenance';

export interface BikeComponentRow {
  id: BikeComponentId;
  /** Stored condition 0-100 (100 = new), or null when the app does not store it (wheels today). */
  condition: number | null;
  /** Purchased component level; null = not stored (no level data exists yet). */
  level: number | null;
}

export interface BikeComponentView {
  id: BikeComponentId;
  level: number | null;
  /** 0-100 wear, or null when unknown. */
  wear: number | null;
  status: ComponentStatus | null;
}

export function wearPct(condition: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - condition)));
}

export function componentStatus(condition: number): ComponentStatus {
  return BIKE_COMPONENT_STATUS[bikeRiskBand(Math.max(0, Math.min(100, Math.round(condition))))];
}

export function buildComponentView(row: BikeComponentRow): BikeComponentView {
  if (row.condition == null) return { id: row.id, level: row.level, wear: null, status: null };
  return { id: row.id, level: row.level, wear: wearPct(row.condition), status: componentStatus(row.condition) };
}

/** Number of components that need attention (service or maintenance). Unknown components never count. */
export function attentionCount(views: readonly BikeComponentView[]): number {
  return views.filter((v) => v.status === 'service' || v.status === 'maintenance').length;
}
