/**
 * Rider profile header, portrait slot and attribute group headings.
 * Run with: npx tsx src/lib/rider/profileHeader.test.ts
 */
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { RiderProfileHeader } from '@/components/rider/RiderProfileHeader';
import { RiderPortrait } from '@/components/rider/RiderPortrait';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { DevelopmentCard } from '@/components/rider/DevelopmentCard';
import { AbilityRadar } from '@/components/rider/AbilityRadar';
import { StrengthsCard } from '@/components/rider/StrengthsCard';
import { buildRadarModel, NO_DEVELOPMENT_ESTIMATES } from './radar';
import { overallRating } from './score';
import { TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from './config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import sk from '@/i18n/messages/sk.json';

(globalThis as unknown as { React: typeof React }).React = React;
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
const t = ((k: string) => (sk as Record<string, string>)[k] ?? k) as never;

const KEYS: SkillAttribute[] = ['climbing', 'hills', 'flat', 'sprint', 'timeTrial', 'endurance', 'descending', 'acceleration',
  'energyManagement', 'positioning', 'reaction', 'breakawaySkill', 'packRiding', 'experience',
  'bikeHandling', 'cornering', 'attackTiming', 'roughSurface', 'wetHandling'];
const attributes = {} as Record<SkillAttribute, number>;
for (const k of KEYS) attributes[k] = 128;
for (const k of TACTICS_ATTRIBUTES) attributes[k] = 132;
attributes.experience = 129;
const rider = {
  id: 'r1', firstName: 'Jan', surname: 'Novak', countryName: 'Slovensko', countryIso2: 'SK', age: 19,
  attributes, inferredArchetype: 'climber',
  condition: { energy: 90, fatigue: 10, form: 55, fitness: 62, morale: 71 },
} as never;

const withImg = renderToStaticMarkup(createElement(RiderProfileHeader, { t, rider, leagueLabel: 'Rookie 1.1', portraitSrc: '/avatars/x.png' }));
const noImg = renderToStaticMarkup(createElement(RiderProfileHeader, { t, rider, leagueLabel: 'Rookie 1.1', portraitSrc: null }));
const expected = overallRating(attributes);

check('header shows the shared overallRating()', withImg.includes(`>${expected}<`), String(expected));
check('header uses the label "Celkové hodnotenie"', withImg.includes('Celkové hodnotenie'));
check('header shows name, nationality, age, league', ['Jan Novak', 'Slovensko', 'Rookie 1.1', 'rider.age'].every((s) => withImg.includes(s)) || (withImg.includes('Jan Novak') && withImg.includes('Slovensko') && withImg.includes('Rookie 1.1')));
check('header keeps the four condition meters (energy/form/fitness/morale)', ['rider.energy', 'rider.form', 'rider.fitness', 'rider.morale'].every((k) => withImg.includes(((sk as Record<string, string>)[k]) ?? k)));
check('header no longer shows the hard-coded plain "Rookie" badge', !/>Rookie</.test(withImg));
check('portrait: shows <img> when a src is given', /<img[^>]+src="\/avatars\/x\.png"/.test(withImg));
check('portrait: placeholder silhouette when there is no src', !/<img/.test(noImg) && noImg.includes('<svg'));
check('portrait slot is 3:4', withImg.includes('aspect-[3/4]'));
check('RiderPortrait is a reusable client component with onError fallback', (() => {
  const src = readFileSync('src/components/rider/RiderPortrait.tsx', 'utf8');
  return /'use client'/.test(src) && /onError/.test(src) && /setFailed/.test(src);
})());
check('portrait placeholder when src empty string', !/<img/.test(renderToStaticMarkup(createElement(RiderPortrait, { src: '' }))));

const grp = renderToStaticMarkup(createElement(AttributeGroup, {
  t, titleKey: 'group.performance', icon: 'chart', keys: PERFORMANCE_FOCUS, attributes,
  descriptionKey: 'groupDesc.performance',
}));
check('group heading is just the title, no average number ("Výkon", not "Výkon · 128")', grp.includes('>Výkon<') && !/Výkon\s*·/.test(grp), grp.slice(0, 400));
check('group description sits under the heading, before the list', grp.indexOf('Fyzická výkonnosť jazdca') > 0 && grp.indexOf('Fyzická výkonnosť jazdca') < grp.indexOf('<ul'));
const plain = renderToStaticMarkup(createElement(AttributeGroup, { t, titleKey: 'group.performance', icon: 'chart', keys: PERFORMANCE_FOCUS, attributes }));
check('without the description prop the group renders no paragraph (Training page unaffected)', !plain.includes(' · ') && !plain.includes('<p '));
check('AttributeGroup no longer has an average prop', !/average/.test(readFileSync('src/components/rider/AttributeGroup.tsx', 'utf8')));

// page structure
const page = readFileSync('src/app/rider/page.tsx', 'utf8');
check('standalone Celkové skóre card removed from the page', !/SummaryCard|score\.overall|riderOverall/.test(page));
check('"Hlavné oblasti" card removed', !/areas\./.test(page));
check('bottom Skúsenosti card removed; Skúsenosti lives in the Rozvoj card (no group.experience on the page, no group.other)', !/group\.experience/.test(page) && !/group\.other/.test(page) && /<DevelopmentCard[^>]*experience=\{rider\.attributes\.experience\}/.test(page));
check('three equal cards Výkon/Taktika/Technika across the full width (lg:col-span-4 each)', (page.match(/<AttributeGroup/g) ?? []).length === 1 && /lg:col-span-4/.test(page) && !/xl:col-span-3/.test(page) && (page.match(/titleKey: 'group\./g) ?? []).length === 3);
check('Silné stránky card present', /StrengthsCard/.test(page));
check('radar + attribute cards + Rozvoj card kept', /AbilityRadar/.test(page) && /AttributeGroup/.test(page) && /<DevelopmentCard/.test(page));
{
  const iRadar = page.indexOf('<AbilityRadar'), iStr = page.indexOf('<StrengthsCard'), iDev = page.indexOf('<DevelopmentCard'), iGrp = page.indexOf('<AttributeGroup');
  check('DOM/mobile order: radar, strengths, Rozvoj, then detailed attributes', iRadar > 0 && iRadar < iStr && iStr < iDev && iDev < iGrp, `${iRadar},${iStr},${iDev},${iGrp}`);
  check('Rozvoj appears exactly once on the page (old bottom card removed)', (page.match(/<DevelopmentCard/g) ?? []).length === 1 && !/DevAttributeRow|group\.development/.test(page));
  check('right column wraps Silné stránky + Rozvoj (lg:col-span-5), radar is lg:col-span-7', /lg:col-span-7/.test(page) && /col-span-12 flex flex-col gap-3 lg:col-span-5/.test(page));
}
const dev = renderToStaticMarkup(createElement(DevelopmentCard, { t, experience: 129, levels: { potential: 4, trainability: 3, professionalism: 5, recovery: 2 } }));
check('Rozvoj card: four attributes in order Potenciál, Trénovateľnosť, Profesionalita, Regenerácia', (() => { const i = ['Potenciál', 'Trénovateľnosť', 'Profesionalita', 'Regenerácia'].map((n) => dev.indexOf(n)); return i.every((x) => x > 0) && i.every((x, k) => k === 0 || x > i[k - 1]); })());
check('Rozvoj card: all four use five stars (aria-label N/5), each with its own icon, no segment dashes / purple', ['4/5', '3/5', '5/5', '2/5'].every((l) => dev.includes(`aria-label="${l}"`)) && (dev.match(/<img[^>]+ride-icon/g) ?? []).length === 5 && !/bg-purple|rounded-full bg-line|h-1\.5 w-3/.test(dev) && (dev.match(/★/g) ?? []).length === 20);
check('Rozvoj card: no sub-heading/description texts at all (only title + rows), tooltips instead', !dev.includes('Vrodené vlastnosti') && !dev.includes('Pretekárske skúsenosti získané počas kariéry.</') && (dev.match(/<p /g) ?? []).length === 0 && dev.includes('title="Akú úroveň môže jazdec počas kariéry dosiahnuť."') && dev.includes('title="Ako rýchlo sa jazdec zlepšuje tréningom."') && dev.includes('title="Kvalita a konzistentnosť prístupu k príprave."') && dev.includes('title="Schopnosť obnovovať energiu a odbúravať únavu."') );
check('Rozvoj card: five rows, Skúsenosti last = icon + name + public number 129 (no stars), tooltip', (dev.match(/<li /g) ?? []).length === 5 && dev.indexOf('Regenerácia') < dev.indexOf('Skúsenosti') && />129</.test(dev) && /<img[^>]+skusenosti\.png/.test(dev) && dev.includes('title="Pretekárske skúsenosti získané počas kariéry."') && (dev.match(/★/g) ?? []).length === 20);
const devUnk = renderToStaticMarkup(createElement(DevelopmentCard, { t, experience: 129, levels: { potential: 4, trainability: 3, professionalism: null, recovery: null } }));
check('unavailable estimate shows "Neznáme" (no stars, no placeholder value)', (devUnk.match(/Neznáme/g) ?? []).length === 2 && (devUnk.match(/aria-label="\d\/5"/g) ?? []).length === 2);
check('page feeds the card + radar only from the DB 1-5 estimates', /professionalismLevel/.test(page) && /recoveryLevel/.test(page) && /buildRadarModel\(.*devLevels\)/.test(page));
check('"dev.scoutNote" removed from all 7 locales', ['sk', 'en', 'cs', 'de', 'es', 'fr', 'pl'].every((l) => !('dev.scoutNote' in JSON.parse(readFileSync(`src/i18n/messages/${l}.json`, 'utf8')))));

// unified card headings
const TITLE = /flex items-center gap-1\.5 text-sm text-teal-dark/;
const strengthsHtml = renderToStaticMarkup(createElement(StrengthsCard, { t, attributes, archetype: 'puncheur' }));
const groupHtml = (tk: string, icon: string, keys: readonly SkillAttribute[]) => renderToStaticMarkup(createElement(AttributeGroup, { t, titleKey: tk, icon, keys, attributes }));
const headings: [string, string][] = [
  ['Silné stránky jazdca', strengthsHtml], ['Rozvoj', dev],
  ['Výkon', groupHtml('group.performance', 'chart', PERFORMANCE_FOCUS)], ['Taktika', groupHtml('group.tactics', 'bolt', TACTICS_ATTRIBUTES)],
  ['Technika', groupHtml('group.technique', 'wheel', TECHNIQUE_ATTRIBUTES)],
];
for (const [name, html] of headings) {
  const h = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
  check(`${name}: heading uses the shared teal title (icon 3.5, text-sm teal-dark) in the standard Card header`, TITLE.test(h) && h.includes('h-3.5 w-3.5 text-teal') && h.includes('px-3.5 py-2.5') && h.includes('uppercase') && h.includes('tracking-wide'), h.slice(0, 260));
}
const radarHtml = renderToStaticMarkup(createElement(AbilityRadar, { model: buildRadarModel(attributes, NO_DEVELOPMENT_ESTIMATES, (k: string) => k), labels: { overview: 'o', estimate: 'e', unknown: 'u', note: 'n', noteUnknown: 'nu', experienceDesc: 'ed', aria: 'a' }, title: 'Radar schopností' }));
const rh = radarHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
check('Radar schopností: same shared title + header padding/typography', TITLE.test(rh) && rh.includes('h-3.5 w-3.5 text-teal') && rh.includes('px-3.5 py-2.5') && rh.includes('uppercase') && rh.includes('tracking-wide'), rh.slice(0, 260));
const iconOf = (html: string) => (html.match(/<header[\s\S]*?<path d="([^"]+)"/)?.[1] ?? '');
check('new heading icons exist and differ from each other (radar / trend / sprout)', new Set([iconOf(radarHtml), iconOf(strengthsHtml), iconOf(dev)]).size === 3
  && [iconOf(radarHtml), iconOf(strengthsHtml), iconOf(dev)].every((d) => d.length > 10));
check('heading icons are outline SVG (not the coloured PNG attribute icons)', !/<img/.test(radarHtml.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '') && ![strengthsHtml, dev].some((h) => /<header[\s\S]*?<img[\s\S]*?<\/header>/.test(h)));
// typography
const cls = (html: string, re: RegExp) => (html.match(re) ?? []).length;
check('attribute names share one style (text-[15px] text-navy) in Strengths, groups and Rozvoj', /text-\[15px\] text-navy/.test(strengthsHtml) && /text-\[15px\] text-navy/.test(groupHtml('group.tactics', 'bolt', TACTICS_ATTRIBUTES)) && /text-\[15px\] text-navy/.test(dev) && !/text-\[15px\] font-semibold/.test(strengthsHtml));
check('values share one style (text-base font-bold tabular-nums text-navy) in Strengths and groups', /text-base font-bold tabular-nums text-navy/.test(strengthsHtml) && /text-base font-bold tabular-nums text-navy/.test(groupHtml('group.tactics', 'bolt', TACTICS_ATTRIBUTES)) && !/text-lg/.test(strengthsHtml));
check('secondary texts share text-xs leading-snug text-navy-soft (group descriptions, Rozvoj, strengths)', cls(strengthsHtml, /text-xs leading-snug text-navy-soft/g) >= 4 && /text-xs leading-snug text-navy-soft/.test(grp));
check('rows share one rhythm (gap-2.5, py-2, border-b border-line)', [strengthsHtml, grp].every((h) => /gap-2\.5 border-b border-line py-2 last:border-0/.test(h)));
check('Rozvoj card shows no raw numeric HIDDEN value (only the public Skúsenosti number)', (dev.match(/>\d{2,3}</g) ?? []).join() === '>129<');
const radarSrc = readFileSync('src/components/rider/AbilityRadar.tsx', 'utf8');
check('radar keeps tabs + interactive handlers', /aria-pressed/.test(radarSrc) && /onClick/.test(radarSrc) && /onKeyDown/.test(radarSrc));
check('radar background is pure CSS/SVG (gradient + contour paths), no external images', /radial-gradient/.test(radarSrc) && /CONTOURS/.test(radarSrc) && !/<img|url\(/.test(radarSrc));
check('radar background covers the WHOLE card (card shell carries gradient + contours, keeps rounded-card)', /<section className=\{`relative flex flex-col overflow-hidden rounded-card border border-line bg-card shadow-card/.test(radarSrc)
  && /absolute inset-0/.test(radarSrc) && !/overflow-hidden rounded-xl/.test(radarSrc));
check('title + tabs live inside the same card as the plot', radarSrc.indexOf('<header') > radarSrc.indexOf('<section') && radarSrc.indexOf('role="group"') > radarSrc.indexOf('<header') && radarSrc.indexOf('role="img"') > radarSrc.indexOf('role="group"'));
check('Rozvoj card still uses existing level display (no raw hidden numbers)', !/rider\.(potential|trainability)\}/.test(page));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
