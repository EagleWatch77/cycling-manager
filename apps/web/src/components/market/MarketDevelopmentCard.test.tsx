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
const levels: MarketEstimateLevels = { potential: 4, trainability: 2, professionalism: 5, recovery: 3, vitality: 1, experience: 1 };
const h = renderToStaticMarkup(createElement(MarketDevelopmentCard, { t, levels }));

for (const label of ['Potenciál', 'Trénovateľnosť', 'Profesionalita', 'Regenerácia', 'Vitalita', 'Skúsenosti']) check(`row "${label}" is shown`, h.includes(`>${label}<`));
check('exactly six rows', (h.match(/<li /g) ?? []).length === 6);
check('each row has five bars (30 in total)', (h.match(/h-2 w-3\.5 rounded-full/g) ?? []).length === 30);
check('verbal level shown for each value', ['Dobré', 'Slabé', 'Výborné', 'Priemerné', 'Veľmi slabé'].every((w) => h.includes(`>${w}<`)));
check('no "Neznáme" and no "not available" when the levels exist', !h.includes('Neznáme') && !h.includes(t('market.detail.devUnavailable')));
const visible = h.replace(/<[^>]*>/g, ' ');
check('no digit appears in the visible text (no exact number, no interval, no "3/5")', !/\d/.test(visible), visible.replace(/\s+/g, ' ').slice(0, 200));
check('explains that it is a rough estimate', h.includes(t('market.detail.devNote')));
const off = renderToStaticMarkup(createElement(MarketDevelopmentCard, { t, levels: { ...levels, trainability: null, vitality: null } }));
check('unavailable levels show the dash text, still 6 rows, no invented level', (off.match(new RegExp(`>${t('market.detail.devUnavailable')}<`, 'g')) ?? []).length === 2 && (off.match(/<li /g) ?? []).length === 6);

// the page must not use the own-rider card (exact Experience number) nor read hidden columns
const page = fs.readFileSync(path.join(__dirname, '../../app/transfers/[id]/page.tsx'), 'utf8');
check('detail page uses the market card + market radar, not the own-rider DevelopmentCard', page.includes('MarketDevelopmentCard') && page.includes('buildMarketRadarModel') && !/\bDevelopmentCard\b(?!.*Market)/.test(page.replace(/MarketDevelopmentCard/g, '')));
const repo = fs.readFileSync(path.join(__dirname, '../../lib/market/playerRepository.ts'), 'utf8');
check('repository reads levels through the rpc only; hidden columns are not in any select', /rpc\('market_rider_estimates'/.test(repo) && !/select\([^)]*(trainability|professionalism|recovery|vitality)/.test(repo));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
