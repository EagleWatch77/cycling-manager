/**
 * Approved catalogue of the 30 FICTIONAL main sponsors (owner 2026-11-22), in the approved order.
 * The page reads the catalogue from the DATABASE (sponsor_companies). This constant exists only as (a) a parity check against the
 * migration 20261122_02 in tests and (b) a fallback so the clearly-labelled DEMO still has names before that migration has run.
 * Do not rename the sponsors without the owner's approval.
 */
export const APPROVED_MAIN_SPONSORS: readonly string[] = [
  'Veltaro Cycling', 'Kadrin Wheels', 'Aerovex', 'Torvello Bikes', 'Rydexa', 'Solvanta Energy', 'Noryx Power', 'Voltaris Group', 'Eltrava Energy', 'Energonix',
  'Veltrion Motors', 'Arvexa Automotive', 'Nordaris Mobility', 'Motravia', 'Axeron Motors', 'Datrix Systems', 'Quantelis', 'Nexoria Tech', 'Syntrava', 'Corevanta',
  'Monvera Capital', 'Asteriq Finance', 'Valtrix Bank', 'Norvella Insurance', 'Fintravo', 'Altivex Logistics', 'Montaris Group', 'Avendra Global', 'Trinex Industries', 'Orvanta Holdings',
];

/**
 * Approved catalogue of the 50 FICTIONAL secondary sponsors (owner 2026-11-22), in the approved order. Same role as the main constant:
 * parity check against migration 20261122_06 in tests and DEMO names. The page never lists the catalogue.
 */
export const APPROVED_SECONDARY_SPONSORS: readonly string[] = [
  'Velora Nutrition', 'Endriva Fuel', 'Nutrexia Sport', 'Proventa Hydration', 'Carbion Energy', 'Hydrava', 'Peakora Nutrition', 'Vitanex Sport', 'Geltrix', 'Revora Recovery',
  'Aerion Helmets', 'Veltrix Apparel', 'Gripora', 'Pedalix', 'Carbonex Components', 'Optivelo', 'Rovenna Sportswear', 'Spinora', 'Vexaro Gear', 'Lumetra Lights',
  'Nexbit Digital', 'Trackora Systems', 'Pulsion Tech', 'DataVelo', 'Synexis Mobile', 'Velometric', 'Optaris Electronics', 'Cloudvanta', 'Nexaro Devices', 'Chronexa',
  'Montiva Hotels', 'Traveon', 'Alpiora Resorts', 'Routevia Travel', 'Velmont Coffee', 'Frutella Foods', 'Granovia', 'Naturivo', 'Aquenor Water', 'Bravento Foods',
  'Transvex Express', 'Moventra Logistics', 'Packora', 'Urbanexa', 'Servion Auto', 'Finora Pay', 'Insurevia', 'Noventra Media', 'Printora Studio', 'EcoVantis',
];

export interface CatalogEntry { id: string; name: string; no: number }
