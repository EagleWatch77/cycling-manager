/**
 * Sponsor logos (80 approved FICTIONAL brands, owner 2026-11-22, "cycling-manager-80-log-sponzorov-v1").
 * A logo is looked up by the exact company `kind` + `name` (NEVER by a running number). The value is the file slug:
 *   horizontal logo (800x200, transparent) -> /sponsors/<kind>/<slug>.svg
 *   compact symbol  (190x200, transparent) -> /sponsors/marks/<kind>/<slug>.svg
 * Files live in apps/web/public/sponsors. Unknown company -> null -> the caller shows the plain text name.
 * Purely visual: no game rule reads this file.
 */
import type { SponsorKind } from './rules';

export const SPONSOR_LOGO_SLUGS: Readonly<Record<string, string>> = {
  'main:Veltaro Cycling': 'veltaro-cycling',
  'main:Kadrin Wheels': 'kadrin-wheels',
  'main:Aerovex': 'aerovex',
  'main:Torvello Bikes': 'torvello-bikes',
  'main:Rydexa': 'rydexa',
  'main:Solvanta Energy': 'solvanta-energy',
  'main:Noryx Power': 'noryx-power',
  'main:Voltaris Group': 'voltaris-group',
  'main:Eltrava Energy': 'eltrava-energy',
  'main:Energonix': 'energonix',
  'main:Veltrion Motors': 'veltrion-motors',
  'main:Arvexa Automotive': 'arvexa-automotive',
  'main:Nordaris Mobility': 'nordaris-mobility',
  'main:Motravia': 'motravia',
  'main:Axeron Motors': 'axeron-motors',
  'main:Datrix Systems': 'datrix-systems',
  'main:Quantelis': 'quantelis',
  'main:Nexoria Tech': 'nexoria-tech',
  'main:Syntrava': 'syntrava',
  'main:Corevanta': 'corevanta',
  'main:Monvera Capital': 'monvera-capital',
  'main:Asteriq Finance': 'asteriq-finance',
  'main:Valtrix Bank': 'valtrix-bank',
  'main:Norvella Insurance': 'norvella-insurance',
  'main:Fintravo': 'fintravo',
  'main:Altivex Logistics': 'altivex-logistics',
  'main:Montaris Group': 'montaris-group',
  'main:Avendra Global': 'avendra-global',
  'main:Trinex Industries': 'trinex-industries',
  'main:Orvanta Holdings': 'orvanta-holdings',
  'secondary:Velora Nutrition': 'velora-nutrition',
  'secondary:Endriva Fuel': 'endriva-fuel',
  'secondary:Nutrexia Sport': 'nutrexia-sport',
  'secondary:Proventa Hydration': 'proventa-hydration',
  'secondary:Carbion Energy': 'carbion-energy',
  'secondary:Hydrava': 'hydrava',
  'secondary:Peakora Nutrition': 'peakora-nutrition',
  'secondary:Vitanex Sport': 'vitanex-sport',
  'secondary:Geltrix': 'geltrix',
  'secondary:Revora Recovery': 'revora-recovery',
  'secondary:Aerion Helmets': 'aerion-helmets',
  'secondary:Veltrix Apparel': 'veltrix-apparel',
  'secondary:Gripora': 'gripora',
  'secondary:Pedalix': 'pedalix',
  'secondary:Carbonex Components': 'carbonex-components',
  'secondary:Optivelo': 'optivelo',
  'secondary:Rovenna Sportswear': 'rovenna-sportswear',
  'secondary:Spinora': 'spinora',
  'secondary:Vexaro Gear': 'vexaro-gear',
  'secondary:Lumetra Lights': 'lumetra-lights',
  'secondary:Nexbit Digital': 'nexbit-digital',
  'secondary:Trackora Systems': 'trackora-systems',
  'secondary:Pulsion Tech': 'pulsion-tech',
  'secondary:DataVelo': 'datavelo',
  'secondary:Synexis Mobile': 'synexis-mobile',
  'secondary:Velometric': 'velometric',
  'secondary:Optaris Electronics': 'optaris-electronics',
  'secondary:Cloudvanta': 'cloudvanta',
  'secondary:Nexaro Devices': 'nexaro-devices',
  'secondary:Chronexa': 'chronexa',
  'secondary:Montiva Hotels': 'montiva-hotels',
  'secondary:Traveon': 'traveon',
  'secondary:Alpiora Resorts': 'alpiora-resorts',
  'secondary:Routevia Travel': 'routevia-travel',
  'secondary:Velmont Coffee': 'velmont-coffee',
  'secondary:Frutella Foods': 'frutella-foods',
  'secondary:Granovia': 'granovia',
  'secondary:Naturivo': 'naturivo',
  'secondary:Aquenor Water': 'aquenor-water',
  'secondary:Bravento Foods': 'bravento-foods',
  'secondary:Transvex Express': 'transvex-express',
  'secondary:Moventra Logistics': 'moventra-logistics',
  'secondary:Packora': 'packora',
  'secondary:Urbanexa': 'urbanexa',
  'secondary:Servion Auto': 'servion-auto',
  'secondary:Finora Pay': 'finora-pay',
  'secondary:Insurevia': 'insurevia',
  'secondary:Noventra Media': 'noventra-media',
  'secondary:Printora Studio': 'printora-studio',
  'secondary:EcoVantis': 'ecovantis',
};

export const sponsorLogoSlug = (kind: SponsorKind, name: string): string | null => SPONSOR_LOGO_SLUGS[`${kind}:${name}`] ?? null;
export const sponsorLogoUrl = (kind: SponsorKind, name: string): string | null => {
  const s = sponsorLogoSlug(kind, name); return s ? `/sponsors/${kind}/${s}.svg` : null;
};
export const sponsorMarkUrl = (kind: SponsorKind, name: string): string | null => {
  const s = sponsorLogoSlug(kind, name); return s ? `/sponsors/marks/${kind}/${s}.svg` : null;
};
