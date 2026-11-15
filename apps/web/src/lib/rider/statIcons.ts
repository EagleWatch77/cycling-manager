import type { SkillAttribute } from './config';

/** Rider condition fields, mirrors STARTER_CONDITION in ./config. */
export type ConditionKey = 'energy' | 'fatigue' | 'form' | 'fitness' | 'morale';

/** The four hidden "development rating" fields on a rider (0-100 scale, see ./config). */
export type DevRatingKey = 'potential' | 'trainability' | 'professionalism' | 'recovery';

/**
 * Single source of truth for the /ride-icon PNG assets (see
 * apps/web/public/ride-icon). Keyed by the real SkillAttribute / condition /
 * dev-rating ids used throughout the app — never invent new keys here.
 *
 * Attributes with no dedicated asset are intentionally absent from the map.
 * Callers must fall back to a neutral placeholder (RiderStatIcon does this
 * automatically) and must never reuse another attribute's icon.
 *
 * As of the Tactics/Technique icon set (2026-11-15) every one of the 19
 * skill attributes has its own icon; the placeholder remains only as a
 * safety net for future attributes.
 */
const SKILL_ICON: Partial<Record<SkillAttribute, string>> = {
  climbing: '/ride-icon/stupanie.png',
  hills: '/ride-icon/kopce.png',
  flat: '/ride-icon/rovina.png',
  sprint: '/ride-icon/sprint.png',
  timeTrial: '/ride-icon/casovka.png',
  endurance: '/ride-icon/vytrvalost.png',
  acceleration: '/ride-icon/akceleracia.png',
  experience: '/ride-icon/skusenosti.png',
  // Taktika
  positioning: '/ride-icon/pozicia.png',
  attackTiming: '/ride-icon/nacasovanie-utoku.png',
  reaction: '/ride-icon/reakcia.png',
  energyManagement: '/ride-icon/manazment-energie.png',
  breakawaySkill: '/ride-icon/unik.png',
  // Technika
  descending: '/ride-icon/zjazd.png',
  bikeHandling: '/ride-icon/ovladanie-bicykla.png',
  cornering: '/ride-icon/zatacky.png',
  packRiding: '/ride-icon/jazda-v-baliku.png',
  wetHandling: '/ride-icon/jazda-v-dazdi.png',
  roughSurface: '/ride-icon/nerovny-povrch.png',
};

const CONDITION_ICON: Record<ConditionKey, string> = {
  energy: '/ride-icon/energia.png',
  fatigue: '/ride-icon/unava.png',
  form: '/ride-icon/forma.png',
  fitness: '/ride-icon/kondicia.png',
  morale: '/ride-icon/moralka.png',
};

const DEV_ICON: Record<DevRatingKey, string> = {
  potential: '/ride-icon/potencial.png',
  trainability: '/ride-icon/trenovatelnost.png',
  professionalism: '/ride-icon/profesionalita.png',
  recovery: '/ride-icon/regeneracia.png',
};

/** Icon for a skill attribute, or null if no dedicated asset exists yet. */
export function getSkillStatIcon(attr: SkillAttribute): string | null {
  return SKILL_ICON[attr] ?? null;
}

/** Icon for a rider-condition field. Every condition field has one. */
export function getConditionStatIcon(key: ConditionKey): string {
  return CONDITION_ICON[key];
}

/** Icon for a development-rating field. Every dev-rating field has one. */
export function getDevStatIcon(key: DevRatingKey): string {
  return DEV_ICON[key];
}
