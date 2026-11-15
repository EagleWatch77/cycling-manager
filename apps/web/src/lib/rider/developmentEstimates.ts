import 'server-only';
import { NO_DEVELOPMENT_ESTIMATES, type DevelopmentEstimates } from './radar';

/**
 * Manager-visible Rozvoj estimates for the ability radar.
 *
 * No numeric scouting ranges exist in the project yet: scouting today only
 * yields a star bucket for potential (lib/facilities/scouting.ts) and the
 * other development traits have no estimate at all. Inventing ranges would
 * be a new scouting rule, so every estimate is null ("not scouted") and the
 * radar shows Rozvoj as unknown.
 *
 * FUTURE: when scouting produces real intervals, return them here (server
 * side, on the shared 55–95 development scale). Return ONLY the estimate,
 * never the true hidden value — this is the single place that feeds the
 * client radar, so the true values cannot leak through it.
 */
export function getDevelopmentEstimates(_riderId: string): DevelopmentEstimates {
  return NO_DEVELOPMENT_ESTIMATES;
}
