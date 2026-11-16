import type { BikeEquipmentId } from './equipment';
import { stateFromCondition } from './overview';

/**
 * Component states from ONE bike_condition row (condition 0-100, 100 = new).
 * A column that does not exist yet (frame/wheels before migration 20261116_03)
 * or is null gives null = "not stored", never an assumed 100.
 */
export type BikeComponentStates = Record<BikeEquipmentId, number | null>;

const COLUMNS: Record<BikeEquipmentId, string> = { frame: 'frame', wheels: 'wheels', tires: 'tires', brakes: 'brakes', drivetrain: 'drivetrain' };

export function statesFromBikeRow(row: Record<string, unknown> | null | undefined): BikeComponentStates {
  const out = {} as BikeComponentStates;
  for (const id of Object.keys(COLUMNS) as BikeEquipmentId[]) {
    const v = row?.[COLUMNS[id]];
    out[id] = typeof v === 'number' && Number.isFinite(v) ? stateFromCondition(v) : null;
  }
  return out;
}
