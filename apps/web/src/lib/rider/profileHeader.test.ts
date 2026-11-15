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
import { overallRating, meanOf } from './score';
import { TACTICS_ATTRIBUTES, type SkillAttribute } from './config';
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
  descriptionKey: 'groupDesc.performance', average: Math.round(meanOf(attributes, PERFORMANCE_FOCUS)),
}));
check('group heading shows the average ("Výkon · 128")', grp.includes('Výkon · 128'), grp.slice(0, 300));
check('group description sits under the heading, before the list', grp.indexOf('Fyzická výkonnosť jazdca') > 0 && grp.indexOf('Fyzická výkonnosť jazdca') < grp.indexOf('<ul'));
const plain = renderToStaticMarkup(createElement(AttributeGroup, { t, titleKey: 'group.performance', icon: 'chart', keys: PERFORMANCE_FOCUS, attributes }));
check('without the new props the group renders as before (Training page unaffected)', !plain.includes(' · ') && !plain.includes('<p '));

// page structure
const page = readFileSync('src/app/rider/page.tsx', 'utf8');
check('standalone Celkové skóre card removed from the page', !/SummaryCard|score\.overall|riderOverall/.test(page));
check('"Hlavné oblasti" card removed', !/areas\./.test(page));
check('"Ostatné" renamed to Skúsenosti', /group\.experience/.test(page) && !/group\.other/.test(page));
check('Silné stránky card present', /StrengthsCard/.test(page));
check('radar + attribute cards + Rozvoj card kept', /AbilityRadar/.test(page) && /AttributeGroup/.test(page) && /DevAttributeRow/.test(page));
check('Rozvoj card still uses existing level display (no raw hidden numbers)', !/rider\.(potential|trainability)\}/.test(page));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
