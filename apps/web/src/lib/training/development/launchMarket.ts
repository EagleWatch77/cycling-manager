import { createHash } from 'node:crypto';
import { POTENTIAL_MIN, POTENTIAL_MAX } from '@/lib/rider/config';
import { INITIAL_MARKET_OVR, MARKET_GEN_CONFIG, generateMarketRider, type MarketRider } from './initialMarket';
import { mulberry32 } from './aptitude';

/**
 * Launch market (C-093): the first 100 free riders of the new market start. Uses the ONE official OVR (F4) via the existing
 * initial-market generator — only its configuration differs: attribute scale 1..200, Skúsenosti 1..20 (young riders), a bigger share
 * of the OVR difference carried by the physical block (the others sit low on the 1..200 scale), and the four hidden development traits
 * on the production 55..95 scale (so the stars, the soft cap and create_my_starter_rider bounds stay compatible).
 * The F4 formula and existing riders are untouched.
 */
export const LAUNCH_MARKET_COUNT = 100;
export const LAUNCH_MARKET_SEED = 20261119;
export const LAUNCH_MARKET_BATCH = 'launch-market-1';

export const LAUNCH_MARKET_CONFIG = {
  ...MARKET_GEN_CONFIG,
  expMin: 1, expRange: 19.999, absorbExpShare: 0, absorbPhysShare: 0.7, maxPhysShift: 40, expFloor: 1, expCeiling: 20,
  devRange: { min: POTENTIAL_MIN, max: POTENTIAL_MAX },
};

/** Stable rider id (UUID shape) derived from batch + index, so re-running the seed never creates duplicates. */
export function launchMarketId(index: number): string {
  const h = createHash('md5').update(`${LAUNCH_MARKET_BATCH}:${index}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function generateLaunchMarket(count = LAUNCH_MARKET_COUNT, seed = LAUNCH_MARKET_SEED): MarketRider[] {
  const r = mulberry32(seed >>> 0);
  const out: MarketRider[] = [];
  const names = new Set<string>();
  for (let guard = 0; out.length < count && guard < count * 20; guard++) {
    const rider = generateMarketRider(Math.floor(r() * 4294967296), INITIAL_MARKET_OVR, LAUNCH_MARKET_CONFIG);
    const name = `${rider.firstName} ${rider.surname}`;
    if (names.has(name)) continue; // 100 distinct names
    names.add(name);
    out.push(rider);
  }
  if (out.length !== count) throw new Error(`launch market: generated ${out.length} of ${count} riders`);
  return out;
}
