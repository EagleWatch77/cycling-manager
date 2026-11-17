import { overallRating } from '@/lib/rider/score';

/**
 * THE official OVR of the game (decision C-083, model F4): V = 0.60 x mean(3 best Performance) + 0.40 x mean(7 Performance);
 * OVR = 0.60 V + 0.15 best Tactics + 0.10 best Technique + 0.15 Experience, rounded only at the end - lib/rider/score.ts overallRating().
 * Rider profile, transfer market, the initial-market generator and the development model all use this ONE function; nothing in this
 * module computes OVR any other way. The formula is closed (owner decision 2026-11-17).
 */
export const officialOvr = overallRating;
export const OFFICIAL_OVR_SOURCE = 'lib/rider/score.ts overallRating() (C-083, F4)';
