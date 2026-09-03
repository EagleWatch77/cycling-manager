/**
 * Unit types — Rev C §C3.
 *
 * Percentages in this engine exist in two NON-INTERCHANGEABLE forms.
 * The brands below make mixing them a compile error.
 *
 *   Fraction     0.04  == +4 %      (breakaway effort, all *Work factors, SizeFactor)
 *   ChasePoints  3     == Medium    (chase intensity, ChaseInput, CHASE_SAT)
 *
 * ChaseWork() is the ONLY place in the model where ChasePoints -> Fraction.
 *
 * CONVERSION TRAP (Rev C §C3): spec tables §11 and §12 are BOTH written in
 * percent, but behave differently:
 *   §11 Breakaway Effort  -> Fraction     (divide by 100:  +4 %  -> 0.04)
 *   §12 Chase intensity   -> ChasePoints  (raw, NO divide: +3 %  -> 3)
 * Dividing both by 100 makes ChaseInput 100x too small, chase stops working,
 * and breakaways win almost always. Guarded by test T38.
 */

export type Fraction = number & { readonly __unit: 'Fraction' };
export type ChasePoints = number & { readonly __unit: 'ChasePoints' };

export type Seconds = number & { readonly __unit: 'Seconds' };
export type Km = number & { readonly __unit: 'Km' };
export type KmPerHour = number & { readonly __unit: 'KmPerHour' };

/** Effective Performance points (same scale as rider attributes, ~0-200). */
export type EPPoints = number & { readonly __unit: 'EPPoints' };

export const frac = (n: number): Fraction => n as Fraction;
export const chasePoints = (n: number): ChasePoints => n as ChasePoints;
export const seconds = (n: number): Seconds => n as Seconds;
export const km = (n: number): Km => n as Km;
export const kmh = (n: number): KmPerHour => n as KmPerHour;
export const ep = (n: number): EPPoints => n as EPPoints;

/** Convert a spec table value written in percent into a Fraction. §11 only. */
export const percentToFraction = (percent: number): Fraction =>
  frac(percent / 100);

/** Take a spec table value written in percent as raw ChasePoints. §12 only. */
export const percentToChasePoints = (percent: number): ChasePoints =>
  chasePoints(percent);

export const addFractions = (...xs: Fraction[]): Fraction =>
  frac(xs.reduce((a, b) => a + b, 0));

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
