import { potentialToStars, type SegmentLevel } from '@/lib/rider/development';
import { POTENTIAL_MIN, POTENTIAL_MAX } from '@/lib/rider/config';
import { SCOUTING_ESTIMATE_WINDOW, type FacilityLevel } from './config';

/** Deterministic FNV-1a hash — no Math.random, stable across renders/reloads (same idea as lib/rider/avatarPool.ts's resolveAvatarSrc). */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A scouting-facility-accuracy-adjusted potential estimate, shown to the
 * player as stars ONLY — never the underlying number. Deterministic per
 * rider (same riderId + level always yields the same result: hashSeed has
 * no randomness, so a page refresh can never flip 3★ to 5★ for the same
 * rider at the same facility level), per the explicit requirement.
 *
 * truePotential itself must never reach the browser — see the chat report.
 * Only call this server-side and only ever return its `.stars` output to a
 * client component/page; never pass the intermediate perturbed value out.
 */
export function estimatePotentialStars(riderId: string, truePotential: number, scoutingLevel: FacilityLevel): SegmentLevel {
  const window = SCOUTING_ESTIMATE_WINDOW[scoutingLevel];
  // hashSeed is unsigned 32-bit; fold to a signed offset in [-window, +window].
  const unit = (hashSeed(riderId) % 2001) / 1000 - 1; // deterministic value in [-1, 1]
  const perturbed = truePotential + unit * window;
  const clamped = Math.max(POTENTIAL_MIN, Math.min(POTENTIAL_MAX, perturbed));
  return potentialToStars(clamped, POTENTIAL_MIN, POTENTIAL_MAX);
}

const ACCURACY_LABEL_KEY: Record<FacilityLevel, string> = {
  1: 'facilities.scoutingAccuracy1',
  2: 'facilities.scoutingAccuracy2',
  3: 'facilities.scoutingAccuracy3',
  4: 'facilities.scoutingAccuracy4',
  5: 'facilities.scoutingAccuracy5',
};

/** The player-facing i18n key for a scouting level's accuracy label (never the raw ± window). */
export function scoutingAccuracyLabelKey(level: FacilityLevel): string {
  return ACCURACY_LABEL_KEY[level];
}
