import 'server-only';
import type { StoredRider } from './repository';
import type { SegmentLevel } from './development';

/**
 * The shape a player is ever allowed to receive for their own rider —
 * deliberately a *different* type from StoredRider, not StoredRider with
 * some fields "hidden by the UI". Nothing here can leak `potential: 87` into
 * a page or a client-component prop by accident, because the raw number
 * simply never enters this object in the first place: `toPlayerRiderView()`
 * only ever writes the derived 1-5 level.
 *
 * Today's Training/Rider pages still call the full getMyRider() directly and
 * derive stars/levels inline (verified safe: every consumer of that raw
 * object is a Server Component, and the one Client Component in that tree,
 * TrainingConfigForm, never receives it — see the chat report). This type
 * exists so a future consumer has a structurally-safe option instead of
 * relying on every call site remembering not to forward the raw rider.
 */
export interface PlayerRiderView {
  id: string;
  firstName: string;
  surname: string;
  countryName: string;
  countryIso2: string;
  age: number;
  inferredArchetype: string;
  attributes: StoredRider['attributes'];
  condition: StoredRider['condition'];
  conditionPrevious: StoredRider['condition'];
  potentialStars: SegmentLevel;
  trainabilityLevel: SegmentLevel;
  professionalismLevel: SegmentLevel;
  recoveryLevel: SegmentLevel;
}

export function toPlayerRiderView(rider: StoredRider): PlayerRiderView {
  return {
    id: rider.id,
    firstName: rider.firstName,
    surname: rider.surname,
    countryName: rider.countryName,
    countryIso2: rider.countryIso2,
    age: rider.age,
    inferredArchetype: rider.inferredArchetype,
    attributes: rider.attributes,
    condition: rider.condition,
    conditionPrevious: rider.conditionPrevious,
    // 1-5 estimates computed in the database — the raw values never reach the app.
    potentialStars: rider.estimates.potentialStars,
    trainabilityLevel: rider.estimates.trainabilityLevel,
    professionalismLevel: rider.estimates.professionalismLevel,
    recoveryLevel: rider.estimates.recoveryLevel,
  };
}
