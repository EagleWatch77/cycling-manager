import { TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from './config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';

/**
 * "Silné stránky jazdca" — information only, no game effect.
 *
 * Candidates are ONLY the visible skills of the Výkon, Taktika and Technika
 * groups (the existing group definitions, reused). Deliberately NOT
 * candidates: Skúsenosti, group averages, the overall rating, the hidden
 * development attributes, condition, equipment. The function receives only
 * skill attributes, so nothing else can leak into the selection.
 *
 * Ties are broken by the fixed order of the groups above (Výkon, Taktika,
 * Technika, each in its own defined order) so equal values never reshuffle.
 */
export const STRENGTH_CANDIDATES: readonly SkillAttribute[] = [
  ...PERFORMANCE_FOCUS, ...TACTICS_ATTRIBUTES, ...TECHNIQUE_ATTRIBUTES,
];

export const STRENGTH_COUNT = 3;

export interface Strength { key: SkillAttribute; value: number }

export function topStrengths(
  attributes: Record<SkillAttribute, number>, count: number = STRENGTH_COUNT,
): Strength[] {
  return STRENGTH_CANDIDATES
    .map((key, order) => ({ key, value: attributes[key], order }))
    .sort((a, b) => b.value - a.value || a.order - b.order)
    .slice(0, count)
    .map(({ key, value }) => ({ key, value }));
}
