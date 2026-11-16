import { buildComponentView } from '@/lib/facilities/bikeDisplay';

/** Test fixture only (never imported by app code): a brand-new bike's rows. */
export const NEW_BIKE_ROWS = [
  buildComponentView({ id: 'wheels', condition: null, level: null }),
  buildComponentView({ id: 'tires', condition: 100, level: null }),
  buildComponentView({ id: 'brakes', condition: 100, level: null }),
  buildComponentView({ id: 'drivetrain', condition: 100, level: null }),
];
