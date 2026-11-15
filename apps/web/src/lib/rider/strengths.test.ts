/**
 * Silné stránky jazdca — selection, ties, exclusions, card rendering, i18n.
 * Run with: npx tsx src/lib/rider/strengths.test.ts
 */
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { topStrengths, STRENGTH_CANDIDATES } from './strengths';
import { SKILL_ATTRIBUTES, SHAPES, TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from './config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import { StrengthsCard } from '@/components/rider/StrengthsCard';

(globalThis as unknown as { React: typeof React }).React = React;
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
const base = (v: number, o: Partial<Record<SkillAttribute, number>> = {}) => {
  const a = {} as Record<SkillAttribute, number>;
  for (const k of SKILL_ATTRIBUTES) a[k] = o[k] ?? v;
  return a;
};
const keys = (a: Record<SkillAttribute, number>) => topStrengths(a).map((s) => s.key);

// ---- top three ----
const a1 = base(120, { attackTiming: 139, hills: 138, climbing: 130, flat: 125 });
check('picks the three highest, in descending order', keys(a1).join() === 'attackTiming,hills,climbing', keys(a1).join());
check('returns real values', topStrengths(a1).map((s) => s.value).join() === '139,138,130');
check('exactly three items', topStrengths(a1).length === 3);
check('candidates are exactly Výkon + Taktika + Technika (18 skills)', STRENGTH_CANDIDATES.length === 18
  && STRENGTH_CANDIDATES.every((k) => [...PERFORMANCE_FOCUS, ...TACTICS_ATTRIBUTES, ...TECHNIQUE_ATTRIBUTES].includes(k)));

// ---- updates automatically when attributes change ----
const a2 = { ...a1, sprint: 150 };
check('selection follows changed attributes', keys(a2)[0] === 'sprint' && keys(a2).join() === 'sprint,attackTiming,hills', keys(a2).join());

// ---- ties: stable ----
const tie = base(130);
check('all equal -> first three in fixed group order (Výkon first)', keys(tie).join() === PERFORMANCE_FOCUS.slice(0, 3).join(), keys(tie).join());
const tie2 = base(120, { positioning: 140, reaction: 140, climbing: 140, descending: 140 });
check('equal top values keep the fixed order (Výkon, then Taktika, then Technika)', keys(tie2).join() === 'climbing,positioning,reaction', keys(tie2).join());
check('same input -> same output every time', [1, 2, 3, 4, 5].every(() => keys(tie2).join() === 'climbing,positioning,reaction'));
check('input key order does not change the result', (() => {
  const rev = {} as Record<SkillAttribute, number>;
  for (const k of [...SKILL_ATTRIBUTES].reverse()) rev[k] = tie2[k];
  return keys(rev).join() === keys(tie2).join();
})());

// ---- exclusions ----
const exp = base(120, { experience: 200 });
check('Skúsenosti are never selected, even at the maximum', !keys(exp).includes('experience'));
check('selection ignores a hugely high experience', keys(base(120, { experience: 200, hills: 121 }))[0] === 'hills');
const hiddenLeak = { ...base(120, { hills: 125 }), potential: 999, trainability: 999, professionalism: 999, recovery: 999, energy: 999, form: 999 } as unknown as Record<SkillAttribute, number>;
check('hidden development attributes, condition and other fields are never selected', keys(hiddenLeak).every((k) => (STRENGTH_CANDIDATES as readonly string[]).includes(k)) && keys(hiddenLeak)[0] === 'hills');
const src = readFileSync('src/lib/rider/strengths.ts', 'utf8');
check('strengths.ts has no reference to overall rating, averages, condition or hidden fields',
  !/overallRating|riderOverall|meanOf|potential|trainability|professionalism|recovery|condition/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
check('strengths.ts reuses existing group definitions (no duplicate attribute lists)', !/'climbing'|'attackTiming'/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));

// ---- i18n completeness (all 7 locales) ----
const locales = ['sk', 'en', 'cs', 'de', 'es', 'fr', 'pl'];
const ids = SHAPES.map((s) => s.id);
for (const l of locales) {
  const m = JSON.parse(readFileSync(`src/i18n/messages/${l}.json`, 'utf8')) as Record<string, string>;
  check(`${l}: description for every candidate attribute`, STRENGTH_CANDIDATES.every((k) => (m[`attrDesc.${k}`] ?? '').length > 5));
  check(`${l}: name + description for every rider style (${ids.length})`, ids.every((id) => (m[`style.${id}`] ?? '').length > 1 && (m[`styleDesc.${id}`] ?? '').length > 5), ids.filter((id) => !m[`style.${id}`] || !m[`styleDesc.${id}`]).join());
  check(`${l}: card title keys exist`, Boolean(m['profile.strengths'] && m['strengths.profile']));
}

// ---- render ----
const sk = JSON.parse(readFileSync('src/i18n/messages/sk.json', 'utf8')) as Record<string, string>;
const t = ((k: string) => sk[k] ?? k) as never;
const html = renderToStaticMarkup(createElement(StrengthsCard, { t, attributes: a1, archetype: 'puncheur' }));
check('card shows title, 3 rows with name + value + description', html.includes('Silné stránky jazdca') && html.includes('Načasovanie útoku')
  && html.includes('>139<') && html.includes('Schopnosť zvoliť vhodný moment na nástup.')
  && html.includes('Kopce') && html.includes('>138<') && html.includes('Stúpanie') && html.includes('>130<'));
check('card shows exactly three attribute rows', (html.match(/<li /g) ?? []).length === 3);
check('card shows Pretekársky profil with the existing style + description', html.includes('Pretekársky profil') && html.includes('Puncheur')
  && html.includes('Jazdec vhodný na zvlnené trate, krátke stúpania a útočné pretekanie.'));
check('values are right-aligned (own shrink-0 column after the text)', /shrink-0 text-lg font-bold tabular-nums text-navy">139</.test(html));
check('no progress bars, images other than stat icons', !/progress|role="progressbar"/i.test(html));
const page = readFileSync('src/app/rider/page.tsx', 'utf8');
check('page uses the card next to the radar and no longer builds its own top-5 list', /<StrengthsCard/.test(page) && !/\.slice\(0, 5\)/.test(page));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
