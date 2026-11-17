/**
 * OVR test population (EXPERIMENTAL ASSUMPTION — no real data with 150–200 riders exists; production riders start around 130).
 * 10 000 synthetic profiles covering the whole 19-attribute scale with explicit archetypes, so the two OVR formulas can be compared
 * on identical riders. Level L ~ mixture of 5 tiers; archetype strong/weak performance attributes; correlated Tactics/Technique/Experience.
 */
import { mulberry32, type Rng } from '../rng';
import { NATTR, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX, IDX } from '../career/params';

export type Arch = 'Vrchár' | 'Šprintér' | 'Časovkár' | 'Univerzál' | 'Puncheur' | 'Rovinár';
export const ARCHS: Arch[] = ['Vrchár', 'Šprintér', 'Časovkár', 'Univerzál', 'Puncheur', 'Rovinár'];
const ARCH_SHARE: Record<Arch, number> = { 'Vrchár': 0.20, 'Šprintér': 0.15, 'Časovkár': 0.15, 'Univerzál': 0.25, 'Puncheur': 0.12, 'Rovinár': 0.13 };
/** Strong (+Δ) / weak (−Δ) performance attributes of an archetype (Univerzál: none). */
const SHAPE: Record<Arch, { strong: string[]; weak: string[] }> = {
  'Vrchár': { strong: ['climbing', 'endurance'], weak: ['sprint', 'timeTrial'] },
  'Šprintér': { strong: ['sprint', 'acceleration'], weak: ['climbing', 'endurance'] },
  'Časovkár': { strong: ['timeTrial', 'flat'], weak: ['hills', 'acceleration'] },
  'Univerzál': { strong: [], weak: [] },
  'Puncheur': { strong: ['hills', 'acceleration'], weak: ['flat', 'timeTrial'] },
  'Rovinár': { strong: ['flat', 'endurance'], weak: ['climbing', 'hills'] },
};
/** Tier mixture of the rider pool (assumption): share, mean level, sd. */
const TIERS = [{ s: 0.35, m: 125, sd: 10 }, { s: 0.30, m: 140, sd: 12 }, { s: 0.20, m: 158, sd: 12 }, { s: 0.11, m: 174, sd: 10 }, { s: 0.04, m: 188, sd: 6 }];
const gauss = (r: Rng) => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / 0.7071; }; // ~N(0,1)
const clamp = (v: number, lo = 30, hi = 200) => Math.max(lo, Math.min(hi, v));

export interface ProfA { id: number; arch: Arch; level: number; attrs: Float64Array }
export function populationA(n: number, seed: number): ProfA[] {
  const r = mulberry32(seed), out: ProfA[] = [];
  for (let id = 1; id <= n; id++) {
    let u = r(), tier = TIERS[0]; for (const t of TIERS) { if (u < t.s) { tier = t; break; } u -= t.s; }
    let ua = r(), arch: Arch = 'Univerzál'; for (const a of ARCHS) { if (ua < ARCH_SHARE[a]) { arch = a; break; } ua -= ARCH_SHARE[a]; }
    const L = clamp(tier.m + tier.sd * gauss(r), 100, 200);
    const delta = arch === 'Univerzál' ? 0 : 12 + 28 * r(); // specialisation strength 12..40 points
    const a = new Float64Array(NATTR);
    const P = ['climbing', 'hills', 'flat', 'sprint', 'timeTrial', 'endurance', 'acceleration'];
    for (const k of P) {
      const sh = SHAPE[arch];
      const base = L + (sh.strong.includes(k) ? delta : 0) - (sh.weak.includes(k) ? delta * 0.8 : 0);
      a[IDX[k as keyof typeof IDX]] = clamp(base + 3 * gauss(r));
    }
    // Tactics / Technique / Experience: correlated with the level, one favoured attribute of each group
    const lt = 0.75 * L + 0.25 * 130 + 5 * gauss(r), lte = 0.75 * L + 0.25 * 130 + 5 * gauss(r), ls = 0.80 * L + 0.20 * 130 + 6 * gauss(r);
    const favT = TACT_IDX[Math.floor(r() * TACT_IDX.length)], favTe = TECH_IDX[Math.floor(r() * TECH_IDX.length)];
    for (const i of TACT_IDX) a[i] = clamp(lt + (i === favT ? 12 * r() + 4 : 0) + 4 * gauss(r));
    for (const i of TECH_IDX) a[i] = clamp(lte + (i === favTe ? 12 * r() + 4 : 0) + 4 * gauss(r));
    a[EXP_IDX] = clamp(ls + 4 * gauss(r));
    out.push({ id, arch, level: L, attrs: a });
  }
  void PERF_IDX;
  return out;
}
