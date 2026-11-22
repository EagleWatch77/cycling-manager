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

export interface CatalogEntry { id: string; name: string; no: number }
