/**
 * Market Rozvoj card: all six values, five bars + a word each, no numbers, no "Neznáme" noise, honest dash when unavailable.
 * Run with: npx tsx src/components/market/MarketDevelopmentCard.test.tsx
 */
import '../BikeCard.setup';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { getDictionary } from '@/i18n/config';
import { MarketDevelopmentCard } from './MarketDevelopmentCard';
import type { MarketEstimateLevels } from '@/lib/market/estimates';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const t = getDictionary('sk');
const levels: MarketEstimateLevels = { potential: 4, trainability: 2, professionalism: 5, recovery: 3, vitality: 1, experience: 137 };
const h = renderToStaticMarkup(createElement(MarketDevelopmentCard, { t, levels }));

for (const label of ['Potenciál', 'Trénovateľnosť', 'Profesionalita', 'Regenerácia', 'Vitalita', 'Skúsenosti']) check(`row "${label}" is shown`, h.includes(`>${label}<`));
check('exactly six rows (five estimates + Experience)', (h.match(/<li /g) ?? []).length === 6);
check('five dash rows have five dashes each (25 in total), Experience has none', (h.match(/h-2 w-3\.5 rounded-full/g) ?? []).length === 25);
check('verbal level shown for each estimate', ['Dobré', 'Slabé', 'Výborné', 'Priemerné', 'Veľmi slabé'].every((w) => h.includes(`>${w}<`)));
check('Skúsenosti shows the exact number', h.includes('>137<'));
check('no "Neznáme" and no "not available" when the levels exist', !h.includes('Neznáme') && !h.includes(t('market.detail.devUnavailable')));
const visible = h.replace(/<[^>]*>/g, ' ');
check('the only digits in the visible text are the exact Experience (no estimate number, interval, percent or "3/5")', visible.replace(/137/, '').search(/\d/) === -1 && !visible.includes('%'), visible.replace(/\s+/g, ' ').slice(0, 220));
check('the misleading "exact data revealed after signing" text is gone in every language',
  ['sk', 'en', 'cs', 'de', 'es', 'fr', 'pl'].every((l) => !/(po získaní jazdca|once you have signed|po získání jezdce|nach der Verpflichtung|tras fichar|une fois le coureur|po pozyskaniu zawodnika)/.test(getDictionary(l as 'sk')('market.detail.devNote'))));
check('explains that it is a rough estimate', h.includes(t('market.detail.devNote')));
const off = renderToStaticMarkup(createElement(MarketDevelopmentCard, { t, levels: { ...levels, trainability: null, vitality: null } }));
check('unavailable levels: quiet text, NO dashes drawn for them (3 x 5 dashes remain), still 6 rows',
  (off.match(new RegExp(`>${t('market.detail.devUnavailable')}<`, 'g')) ?? []).length === 2 && (off.match(/h-2 w-3\.5 rounded-full/g) ?? []).length === 15 && (off.match(/<li /g) ?? []).length === 6);
const none = renderToStaticMarkup(createElement(MarketDevelopmentCard, { t, levels: { potential: 3, trainability: null, professionalism: null, recovery: null, vitality: null, experience: 5 } }));
check('function not installed: only Potential has dashes (5), the four others show text, no invented scale', (none.match(/h-2 w-3\.5 rounded-full/g) ?? []).length === 5 && (none.match(new RegExp(`>${t('market.detail.devUnavailable')}<`, 'g')) ?? []).length === 4);

// the page must not use the own-rider card (exact Experience number) nor read hidden columns
const page = fs.readFileSync(path.join(__dirname, '../../app/transfers/[id]/page.tsx'), 'utf8');
check('detail page uses the market card + market radar, not the own-rider DevelopmentCard', page.includes('MarketDevelopmentCard') && page.includes('buildMarketRadarModel') && !/\bDevelopmentCard\b(?!.*Market)/.test(page.replace(/MarketDevelopmentCard/g, '')));
const repo = fs.readFileSync(path.join(__dirname, '../../lib/market/playerRepository.ts'), 'utf8');
check('repository reads levels through the rpc only; hidden columns are not in any select', /rpc\('market_rider_estimates'/.test(repo) && !/select\([^)]*(trainability|professionalism|recovery|vitality)/.test(repo));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
