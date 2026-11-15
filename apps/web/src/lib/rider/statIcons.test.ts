/**
 * Attribute icon set — mapping, files, rendering.
 * Run with: npx tsx src/lib/rider/statIcons.test.ts
 */
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { getSkillStatIcon, getConditionStatIcon, getDevStatIcon } from './statIcons';
import { SKILL_ATTRIBUTES, TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from './config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { StrengthsCard } from '@/components/rider/StrengthsCard';
import sk from '@/i18n/messages/sk.json';

(globalThis as unknown as { React: typeof React }).React = React;
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
const t = ((k: string) => (sk as Record<string, string>)[k] ?? k) as never;

const EXPECTED: Record<string, string> = {
  positioning: 'pozicia', attackTiming: 'nacasovanie-utoku', reaction: 'reakcia', energyManagement: 'manazment-energie', breakawaySkill: 'unik',
  descending: 'zjazd', bikeHandling: 'ovladanie-bicykla', cornering: 'zatacky', packRiding: 'jazda-v-baliku', wetHandling: 'jazda-v-dazdi', roughSurface: 'nerovny-povrch',
};
for (const [attr, file] of Object.entries(EXPECTED)) {
  check(`${attr} -> /ride-icon/${file}.png`, getSkillStatIcon(attr as SkillAttribute) === `/ride-icon/${file}.png`, String(getSkillStatIcon(attr as SkillAttribute)));
}
check('all 5 Taktika attributes have an icon', TACTICS_ATTRIBUTES.every((k) => getSkillStatIcon(k)));
check('all 6 Technika attributes have an icon', TECHNIQUE_ATTRIBUTES.every((k) => getSkillStatIcon(k)));
check('Skúsenosti has its own icon', getSkillStatIcon('experience') === '/ride-icon/skusenosti.png');
check('every one of the 19 skill attributes has an icon (no placeholder dot left)', SKILL_ATTRIBUTES.every((k) => getSkillStatIcon(k) !== null));
check('no two attributes share a file', new Set(SKILL_ATTRIBUTES.map((k) => getSkillStatIcon(k))).size === SKILL_ATTRIBUTES.length);

// existing Výkon + Rozvoj + condition mappings unchanged
const PERF: Record<string, string> = { climbing: 'stupanie', hills: 'kopce', flat: 'rovina', sprint: 'sprint', timeTrial: 'casovka', endurance: 'vytrvalost', acceleration: 'akceleracia' };
check('Výkon icons unchanged', Object.entries(PERF).every(([k, f]) => getSkillStatIcon(k as SkillAttribute) === `/ride-icon/${f}.png`) && PERFORMANCE_FOCUS.length === 7);
check('Rozvoj icons unchanged', ['potential:potencial', 'trainability:trenovatelnost', 'professionalism:profesionalita', 'recovery:regeneracia']
  .every((p) => { const [k, f] = p.split(':'); return getDevStatIcon(k as never) === `/ride-icon/${f}.png`; }));
check('condition icons unchanged', ['energy:energia', 'fatigue:unava', 'form:forma', 'fitness:kondicia', 'morale:moralka']
  .every((p) => { const [k, f] = p.split(':'); return getConditionStatIcon(k as never) === `/ride-icon/${f}.png`; }));

// files: exist + valid PNG with alpha
const all = [...SKILL_ATTRIBUTES.map((k) => getSkillStatIcon(k)), ...['energy', 'fatigue', 'form', 'fitness', 'morale'].map((k) => getConditionStatIcon(k as never)),
  ...['potential', 'trainability', 'professionalism', 'recovery'].map((k) => getDevStatIcon(k as never))] as string[];
check('every mapped icon path points to an existing file in public/', all.every((p) => existsSync(`public${p}`)), all.filter((p) => !existsSync(`public${p}`)).join());
const newFiles = Object.values(EXPECTED).map((f) => `public/ride-icon/${f}.png`);
const hdr = (p: string) => { const b = readFileSync(p); return { sig: b.subarray(1, 4).toString(), w: b.readUInt32BE(16), h: b.readUInt32BE(20), ct: b[25] }; };
check('new icons are valid PNG, 128x128, RGBA (colour type 6)', newFiles.every((p) => { const h = hdr(p); return h.sig === 'PNG' && h.w === 128 && h.h === 128 && h.ct === 6; }));

// rendering
const attrs = {} as Record<SkillAttribute, number>;
for (const k of SKILL_ATTRIBUTES) attrs[k] = 120;
const render = (keys: readonly SkillAttribute[], titleKey: string) => renderToStaticMarkup(createElement(AttributeGroup, { t, titleKey, icon: 'bolt', keys, attributes: attrs, showStatIcons: true, statIconSize: 24 }));
for (const [name, keys, tk] of [['Taktika', TACTICS_ATTRIBUTES, 'group.tactics'], ['Technika', TECHNIQUE_ATTRIBUTES, 'group.technique'], ['Skúsenosti', ['experience'] as const, 'group.experience']] as const) {
  const html = render(keys, tk);
  check(`${name} card renders every attribute with its own <img>, no placeholder`, keys.every((k) => html.includes(`src="${getSkillStatIcon(k)}"`)) && (html.match(/<img /g) ?? []).length === keys.length, html.slice(0, 200));
  check(`${name} icons use a fixed 24px box (no layout shift)`, (html.match(/width:24px;height:24px/g) ?? []).length === keys.length);
}
// Silné stránky follows the displayed attributes
for (const [top, file] of [['attackTiming', 'nacasovanie-utoku'], ['wetHandling', 'jazda-v-dazdi'], ['descending', 'zjazd'], ['breakawaySkill', 'unik']]) {
  const a = { ...attrs, [top]: 160 } as Record<SkillAttribute, number>;
  const html = renderToStaticMarkup(createElement(StrengthsCard, { t, attributes: a, archetype: 'allrounder' }));
  check(`Silné stránky show the right icon for ${top}`, html.includes(`src="/ride-icon/${file}.png"`) && (html.match(/<img /g) ?? []).length === 3 && html.includes('width:30px;height:30px'));
}

// page + training stay as designed
const page = readFileSync('src/app/rider/page.tsx', 'utf8');
check('Rider page enables icons for every group (24px)', /showStatIcons statIconSize=\{24\}/.test(page) && !/group\.performance'\}/.test(page.split('GROUPS.map')[1] ?? ''));
const training = readFileSync('src/app/rider/training/page.tsx', 'utf8');
check('Training page untouched by this change (Výkon icons at 24 as before)', /showStatIcons statIconSize=\{24\} showBars=\{false\}/.test(training));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
