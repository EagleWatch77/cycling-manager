import type { BikeOverviewItem } from './BikeCard';

/** Test fixtures only (never imported by app code). */
const row = (id: BikeOverviewItem['id'], state: number | null, level = 1): BikeOverviewItem => ({ id, level, state });

/** Real data today for a brand-new bike: frame and wheels are not stored, the other three are 100 %. */
export const NEW_BIKE_ROWS: BikeOverviewItem[] = [row('frame', null), row('wheels', null), row('tires', 100), row('brakes', 100), row('drivetrain', 100)];
/** Preview only: before the first Tour, all five 100 %. */
export const PREVIEW_BEFORE_TOUR: BikeOverviewItem[] = [row('frame', 100), row('wheels', 100), row('tires', 100), row('brakes', 100), row('drivetrain', 100)];
/** Preview only: after a Tour (frame 70, wheels 40, tires 10, brakes 10, drivetrain 40). */
export const PREVIEW_AFTER_TOUR: BikeOverviewItem[] = [row('frame', 70), row('wheels', 40), row('tires', 10), row('brakes', 10), row('drivetrain', 40)];
