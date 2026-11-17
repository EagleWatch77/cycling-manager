import { SKILL_ATTRIBUTES, TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { clamp, intBetween, pickWeighted, COUNTRIES, FIRST, SUR, type Rng } from '@/lib/rider/shared';
import { officialOvr } from './ovr';
import { PHYSICAL, SHAPE_OF_PLAN, ALLROUNDER_PLAN, productionShape, type HiddenTraits } from './config';
import { generateAptitudeProfile, mulberry32, type AptitudeProfile } from './aptitude';

/**
 * Initial transfer market generator (owner rule, 2026-11-17).
 *
 * At the FULL LAUNCH of the game every rider on the first-filled transfer market has OVR 69..75 inclusive; nobody above 75.
 * The rule belongs ONLY to this first fill (INITIAL_MARKET_OVR is applied by generateInitialMarketRider() and nowhere else):
 * stronger riders arrive later through sales between managers, riders leaving teams after the first season, and other approved
 * mechanics - none of them is limited by 69..75, and generateMarketRider(seed, null) is the unconstrained variant.
 *
 * Diversity inside the narrow range: the OVR is accepted/rejected AFTER the attributes were generated (rejection sampling on
 * real attributes), so nothing is levelled and the OVR is never edited separately. Physical and technical profiles are drawn
 * independently (type nudges the physical side), individual aptitudes (aptitude.ts) and the five hidden traits are independent
 * of the starting OVR, so equal OVR can hide very different Potential and development room.
 *
 * OVR: the ONE official OVR (ovr.ts = production overallRating(), C-083 / F4) is used for the range check, for riders on the market and everywhere
 * else; there is no second formula. Attribute scale 1..200 for the new launch; wiring into the production market pool is a separate step
 * (see docs/INITIAL_MARKET_DEMO.md and DECISIONS C-082).
 */
export const INITIAL_MARKET_OVR = { min: 69, max: 75 } as const;
export const MARKET_GENERATOR_VERSION = 'initial-market-1.0';

export const MARKET_GEN_CONFIG = {
  ageMin: 17, ageMax: 20,
  /** initial fill: group levels (physical / technical / tactical) are drawn INDEPENDENTLY around the range centre (+ offset), so technique does not follow the physical level; diversity comes from the profile inside each group */
  groupSd: 3.5, physOff: 6, techOff: -6, tactOff: -8,
  /** unconstrained (later) riders: wide physical level, technique/tactics follow it loosely */
  laterCentre: 75, laterSd: 14, laterTechSd: 6, laterTactSd: 3,
  maxAttempts: 600, maxTacticsShift: 40, maxPhysShift: 14, absorbPhysShare: 0.25, absorbExpShare: 0.25, expFloor: 5, expCeiling: 70, targetSd: 2.6,
  typeDeltaMin: 8, typeDeltaRange: 17, weakShare: 0.7,
  physAptSpanMin: 6, physAptSpanRange: 8, techAptSpan: 18, shapeTactBoost: 8, shapeTechBoost: 0,
  noisePhys: 3, noiseTech: 5, noiseTact: 4, expMin: 15, expRange: 30,
  hiddenMean: 50, hiddenSd: 20,
};

/** The rule is checked with the ONE official OVR (ovr.ts). */
export const ovrInRange = (a: Record<SkillAttribute, number>, range: OvrRange) => { const o = officialOvr(a); return o >= range.min && o <= range.max; };

export interface MarketRider {
  firstName: string; surname: string; countryName: string; countryIso2: string; age: number;
  attributes: Record<SkillAttribute, number>;
  /** production generation shape id (climber, sprinter, ...) */
  inferredShape: string;
  hidden: HiddenTraits;
  aptitude: AptitudeProfile;
  generatorVersion: string;
}
export type OvrRange = { min: number; max: number };

const OFFICIAL_PHYSICAL_WEIGHT = 0.60; // weight of V (physical rating) in the official OVR (C-083, F4)
const OFFICIAL_EXPERIENCE_WEIGHT = 0.15; // weight of Experience in the official OVR (C-083, F4)
const OFFICIAL_TACTICS_WEIGHT = 0.15; // weight of the best Tactics attribute in the official OVR (C-083, F4); all tactics shift together
const gauss = (r: Rng) => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / 0.7071; };
const I = (v: number) => Math.max(1, Math.min(200, Math.round(v)));

function candidate(r: Rng, shape: number, aptitude: AptitudeProfile, L: number, Lt: number, Lc: number, c = MARKET_GEN_CONFIG): Record<SkillAttribute, number> {
  const sh = productionShape(shape);
  const delta = shape === ALLROUNDER_PLAN ? 0 : c.typeDeltaMin + c.typeDeltaRange * r();
  const physSpan = c.physAptSpanMin + c.physAptSpanRange * r();
  const a = {} as Record<SkillAttribute, number>;
  for (const k of PHYSICAL) {
    a[k] = I(L + ((sh.strong as readonly string[]).includes(k) ? delta : 0) - ((sh.weak as readonly string[]).includes(k) ? c.weakShare * delta : 0) + physSpan * aptitude[k] + c.noisePhys * gauss(r));
  }
  for (const k of TECHNIQUE_ATTRIBUTES) a[k] = I(Lt + c.techAptSpan * aptitude[k] + ((sh.strong as readonly string[]).includes(k) ? c.shapeTechBoost : 0) + c.noiseTech * gauss(r));
  for (const k of TACTICS_ATTRIBUTES) a[k] = I(Lc + ((sh.strong as readonly string[]).includes(k) ? c.shapeTactBoost : 0) + c.noiseTact * gauss(r));
  a.experience = I(c.expMin + c.expRange * r());
  return a;
}

/** One market rider. `range` = OVR window enforced by rejection sampling on real attributes; null = unconstrained (later riders). Deterministic from `seed`. */
export function generateMarketRider(seed: number, range: OvrRange | null, c = MARKET_GEN_CONFIG): MarketRider {
  const r = mulberry32((seed ^ 0x51ed270b) >>> 0);
  const country = pickWeighted(r, COUNTRIES, (x) => x.weight);
  const fl = FIRST[country.iso2] ?? FIRST['SK'], sl = SUR[country.iso2] ?? SUR['SK'];
  const firstName = fl[Math.floor(r() * fl.length)], surname = sl[Math.floor(r() * sl.length)];
  const age = intBetween(r, c.ageMin, c.ageMax);
  const shape = Math.floor(r() * 7);
  const aptitude = generateAptitudeProfile(Math.floor(r() * 4294967296), shape);
  const hidden = Object.fromEntries((['potential', 'trainability', 'professionalism', 'recovery', 'vitality'] as const).map((k) => [k, clamp(Math.round(c.hiddenMean + c.hiddenSd * gauss(r)), 1, 100)])) as unknown as HiddenTraits;
  const levels = (): [number, number, number] => {
    if (!range) { const Lp = c.laterCentre + c.laterSd * gauss(r); return [Lp, Lp - 10 + c.laterTechSd * gauss(r), Lp - 10 + c.laterTactSd * gauss(r)]; }
    const centre = (range.min + range.max) / 2;
    return [centre + c.physOff + c.groupSd * gauss(r), centre + c.techOff + c.groupSd * gauss(r), centre + c.tactOff + c.groupSd * gauss(r)];
  };
  let attrs = candidate(r, shape, aptitude, ...levels(), c);
  if (range) {
    // Physical and technical levels are drawn independently of each other. The OVR then lands on a target drawn from a bell inside the window:
    // the physical block, Experience and the TACTICS (real attributes; V 60 %, best tactic 15 %, Experience 15 % of the OVR) share the difference, so the narrow window does not force a
    // trade-off between the physical and the technical level. Candidates that would need an implausible tactical shift are resampled.
    const centre = (range.min + range.max) / 2;
    let tries = 0;
    for (; tries < c.maxAttempts; tries++) {
      let target = centre + c.targetSd * gauss(r);
      for (let k = 0; k < 20 && (target < range.min - 0.5 || target > range.max + 0.5); k++) target = centre + c.targetSd * gauss(r);
      // the difference to the target is shared by the physical block (V, 60 % of the OVR), Experience (15 %) and the tactics (best tactic, 15 %), so no single block is pushed to an implausible level and the blocks do not end up strongly anti-correlated
      const delta = target - officialOvr(attrs);
      const dPhys = Math.round(c.absorbPhysShare * delta / OFFICIAL_PHYSICAL_WEIGHT), dExp = Math.round(c.absorbExpShare * delta / OFFICIAL_EXPERIENCE_WEIGHT);
      const dTact = Math.round((1 - c.absorbPhysShare - c.absorbExpShare) * delta / OFFICIAL_TACTICS_WEIGHT);
      if (Math.abs(dTact) <= c.maxTacticsShift && Math.abs(dPhys) <= c.maxPhysShift) {
        const t = { ...attrs };
        for (const k of PHYSICAL) t[k] = I(t[k] + dPhys);
        for (const k of TACTICS_ATTRIBUTES) t[k] = I(t[k] + dTact);
        t.experience = clamp(t.experience + dExp, c.expFloor, c.expCeiling);
        if (ovrInRange(t, range)) { attrs = t; break; }
      }
      attrs = candidate(r, shape, aptitude, ...levels(), c);
    }
    for (let guard = 0; !ovrInRange(attrs, range) && guard < 60; guard++) { // practically never: shift every non-experience attribute by the same real amount
      const d = officialOvr(attrs) < range.min ? 1 : -1;
      for (const k of SKILL_ATTRIBUTES) if (k !== 'experience') attrs[k] = I(attrs[k] + d);
    }
  }
  return { firstName, surname, countryName: country.name, countryIso2: country.iso2, age, attributes: attrs, inferredShape: SHAPE_OF_PLAN[shape], hidden, aptitude, generatorVersion: MARKET_GENERATOR_VERSION };
}

/** First fill of the market: OVR 69..75 inclusive. */
export const generateInitialMarketRider = (seed: number): MarketRider => generateMarketRider(seed, INITIAL_MARKET_OVR);

export function generateInitialMarketPool(count: number, seed: number): MarketRider[] {
  const r = mulberry32(seed >>> 0);
  const pool = Array.from({ length: count }, () => generateInitialMarketRider(Math.floor(r() * 4294967296)));
  assertInitialMarketPool(pool);
  return pool;
}

/** Guard for the admin/launch path: throws when any rider of the first fill is outside 69..75. */
export function assertInitialMarketPool(pool: readonly Pick<MarketRider, 'attributes'>[]): void {
  pool.forEach((p, i) => { if (!ovrInRange(p.attributes, INITIAL_MARKET_OVR)) throw new Error(`initial market rider #${i} has OVR ${officialOvr(p.attributes)}, allowed ${INITIAL_MARKET_OVR.min}..${INITIAL_MARKET_OVR.max}`); });
}
