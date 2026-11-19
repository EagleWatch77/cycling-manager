/**
 * Market list: no Potential column / stars, real flags instead of letters, OVR shown, row order exactly as given (the sort lives in marketSort.ts).
 * Run with: npx tsx src/components/market/MarketTable.test.tsx
 */
import '../BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { getDictionary } from '@/i18n/config';
import { MarketTable } from './MarketTable';
import type { MarketRiderView } from '@/lib/market/playerRepository';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const t = getDictionary('sk');
const mk = (id: string, first: string, iso2: string, country: string, ovr: number, stars: 1 | 2 | 3 | 4 | 5): MarketRiderView =>
  ({ id, tier: 'free', firstName: first, surname: 'Test', countryName: country, countryIso2: iso2, age: 18, archetype: 'allrounder', potentialStars: stars, overallRating: ovr });
const riders = [mk('a1', 'Zoltán', 'SK', 'Slovakia', 75, 5), mk('b2', 'Adam', 'FR', 'France', 72, 3), mk('c3', 'Mia', 'ZZ', 'Atlantis', 69, 1)];
const h = renderToStaticMarkup(createElement(MarketTable, { t, riders, rankOffset: 0 }));

check('no Potential column header', !h.includes(t('market.colPotential')));
check('no star glyphs in the list', !h.includes('★'));
check('OVR column header + all OVR values shown', h.includes(t('rating.overall')) && ['75', '72', '69'].every((v) => h.includes(`>${v}<`)));
check('country text codes (SK, FR) are not shown as letters', !/>SK</.test(h) && !/>FR</.test(h));
check('flags rendered as svg for known countries (2) and neutral for unknown', (h.match(/preserveAspectRatio="xMidYMid slice"/g) ?? []).length === 2 && h.includes('title="Atlantis"'));
check('tooltip = country name', h.includes('title="Slovakia"') && h.includes('title="France"'));
check('rows keep the given order (not re-sorted)', h.indexOf('Zoltán') < h.indexOf('Adam') && h.indexOf('Adam') < h.indexOf('Mia'));
check('rank numbers follow the order', h.indexOf('>1<') < h.indexOf('>2<') && h.indexOf('>2<') < h.indexOf('>3<'));
check('type (specialisation) still shown unchanged', h.includes(t('style.allrounder')));
check('empty list shows the existing message', renderToStaticMarkup(createElement(MarketTable, { t, riders: [], rankOffset: 0 })).includes(t('market.noResults')));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
