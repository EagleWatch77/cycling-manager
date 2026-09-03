import { Terrain, Attributes, ZERO_ATTRIBUTES } from '../src/types/terrain.js';
import { RiderSnapshot } from '../src/types/domain.js';
import { PaceMember } from '../src/core/groupPace.js';
import { BreakawayEffort, ChaseIntensity } from '../src/config/balance.js';

/**
 * Worked-example fixtures.
 *
 * The Rev B/C examples are stated directly in EP points, so the pace-level
 * fixtures build PaceMember values directly rather than going through
 * attributes. That keeps the numeric tests independent of the UNVALIDATED
 * FLAT/HILLY/CLASSICS weight placeholders.
 */

export const V_REF = 42;
export const P_REF = 130;
export const N_FIELD = 40;

export function member(
  id: string,
  ep: number,
  opts: {
    effort?: BreakawayEffort;
    chase?: ChaseIntensity;
  } = {},
): PaceMember {
  return {
    id,
    ep,
    breakawayEffort: opts.effort ?? BreakawayEffort.NORMAL,
    chaseIntensity: opts.chase ?? ChaseIntensity.NONE,
  };
}

export function uniformGroup(
  prefix: string,
  count: number,
  ep: number,
  opts: { effort?: BreakawayEffort; chase?: ChaseIntensity } = {},
): PaceMember[] {
  return Array.from({ length: count }, (_, i) =>
    member(`${prefix}${i}`, ep, opts),
  );
}

/** Peloton of 35: `chasers` riders chasing at `chase`, the rest passive. */
export function peloton(params: {
  size?: number;
  chasers: number;
  chaserEP: number;
  passiveEP: number;
  chase: ChaseIntensity;
}): PaceMember[] {
  const size = params.size ?? 35;
  const out: PaceMember[] = [];
  for (let i = 0; i < params.chasers; i++) {
    out.push(member(`c${i}`, params.chaserEP, { chase: params.chase }));
  }
  for (let i = params.chasers; i < size; i++) {
    out.push(member(`p${i}`, params.passiveEP, { chase: ChaseIntensity.NONE }));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Attribute-level fixtures, used for snapshot / P_ref tests           */
/* ------------------------------------------------------------------ */

export function riderWithClimbing(
  id: string,
  climbing: number,
  overrides: Partial<Attributes> = {},
): RiderSnapshot {
  const attributes: Attributes = {
    ...ZERO_ATTRIBUTES,
    climbing,
    endurance: climbing,
    acceleration: climbing,
    energyManagement: climbing,
    positioning: climbing,
    experience: climbing,
    descending: climbing,
    bikeHandling: climbing,
    cornering: climbing,
    flat: climbing,
    hills: climbing,
    packRiding: climbing,
    ...overrides,
  };
  return {
    id,
    attributes,
    condition: 1,
    setup: 1,
    weather: 1,
    startEnergy: 100,
    tactics: {
      breakawayEffort: BreakawayEffort.NORMAL,
      chaseIntensity: ChaseIntensity.NONE,
    },
  };
}

export const FLAT_SEGMENT = {
  startKm: 0,
  lengthKm: 160,
  terrain: Terrain.FLAT,
  referenceSpeedKmh: V_REF,
};
