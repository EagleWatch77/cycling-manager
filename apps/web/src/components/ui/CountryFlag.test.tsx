/**
 * CountryFlag: every country of the game data has real flag art; unknown/missing/invalid codes fall back to a neutral symbol.
 * Run with: npx tsx src/components/ui/CountryFlag.test.tsx
 */
import '../BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CountryFlag } from './CountryFlag';
import { FLAG_SVG } from '@/lib/flagSvg';
import { COUNTRIES } from '@/lib/rider/shared';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const html = (iso2: string | null | undefined, name?: string) => renderToStaticMarkup(createElement(CountryFlag, { iso2, name }));

check('game data has 16 countries', COUNTRIES.length === 16, String(COUNTRIES.length));
for (const c of COUNTRIES) {
  const h = html(c.iso2, c.name);
  check(`${c.iso2} ${c.name}: has flag art, tooltip = country name`, !!FLAG_SVG[c.iso2] && h.includes('<svg') && h.includes(`title="${c.name}"`), h.slice(0, 120));
}
check('lowercase code works', html('sk', 'Slovakia').includes('<svg'));
for (const bad of [null, undefined, '', 'X', 'ZZ', '1A', 'SKX']) {
  const h = html(bad as string | null | undefined);
  check(`unknown/invalid "${String(bad)}" -> neutral symbol, no svg, no emoji`, !h.includes('<svg') && h.includes('–') && !/[\u{1F1E6}-\u{1F1FF}]/u.test(h));
}
check('same fixed frame size for all flags', COUNTRIES.every((c) => html(c.iso2).includes('h-[15px] w-[22px]')));
check('no emoji flags are produced', COUNTRIES.every((c) => !/[\u{1F1E6}-\u{1F1FF}]/u.test(html(c.iso2, c.name))));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
