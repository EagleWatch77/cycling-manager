/**
 * Transfer Market V1 — tunable numbers, kept separate from the generation
 * service (generateMarketPool.ts) and admin UI so pool sizing can be
 * rebalanced without touching either. Not specified by any existing brief;
 * smallest reasonable starting point for testing, same convention as
 * Training V1's BASE_TRAINING etc.
 */

export const MARKET_FREE_POOL_SIZE = 30;
export const MARKET_PREMIUM_POOL_SIZE = 15;

/**
 * The season week automatic market generation is meant to run on, per the
 * game design this task must not change. No season-tick/week-event system
 * exists yet (confirmed in the prior architecture audit) — this constant is
 * declared here so that whenever such a system is built, it has a single
 * place to read "which week" from, rather than a hardcoded 6 buried in new
 * job code. lib/market/generateMarketPool.ts is NOT currently called by
 * anything tied to this — only by the admin action.
 */
export const MARKET_AUTO_GENERATION_WEEK = 6;
