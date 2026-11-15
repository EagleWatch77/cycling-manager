import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import * as React from 'react';
(globalThis as unknown as { React: typeof React }).React = React;
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { ConditionRow } from '@/components/rider/ConditionRow';
import { TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from './config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import { getSkillStatIcon } from './statIcons';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++; else { fail++; console.log(`FAIL: ${name} ${detail}`); }
}
const t = (k: string) => k;
const page = readFileSync('src/app/rider/training/page.tsx', 'utf8');
const form = readFileSync('src/components/training/TrainingConfigForm.tsx', 'utf8');

// layout order: left column (planning, Vývoj jazdca) then right column (condition, development), then 3 cards
const at = (s: string) => page.indexOf(s);
check('left column is wider (lg:col-span-8) and right narrower (lg:col-span-4)', /col-span-12 space-y-3 lg:col-span-8/.test(page) && /col-span-12 space-y-3 lg:col-span-4/.test(page));
check('DOM order: planning < condition < development', at('planCardTitle}') < at("group.condition") && at("group.condition") < at("group.development"));
check('no "Posledné tréningy" card on the page (history stays in the DB)', !/recentHistory|historyRows|HistoryRow/.test(page));
check('no lock explanation text under the confirmed plan', !/\{labels\.lockedNote\}<\/p>/.test(form));
check('confirmed card has a lock icon (lockedNote only as aria-label/title)', /<Icon name="lock"/.test(form) && /aria-label=\{labels\.lockedNote\}/.test(form));
check('no bottom condition strip (Energy/Fatigue/Readiness) in the planner', !/conditionSummary|readinessLabel|READINESS_COLOR|labels\.energyLabel|labels\.fatigueLabel/.test(form) && !/readinessLabel|readiness\./.test(page));
check('bottom row: Výkon, Taktika, Technika in one 3-column grid after the main columns', /lg:grid-cols-3/.test(page) && at('group.performance') > at('group.development') && at('group.performance') < at('group.tactics') && at('group.tactics') < at('group.technique'));
check('planner heading uses shared CardTitle (week + season)', /<CardTitle icon="calendar">\{planCardTitle\}<\/CardTitle>/.test(page) && /trainingPage\.forWeek/.test(page) && /seasonNumber/.test(page));
for (const k of ['group.condition', 'group.development']) {
  check(`heading ${k} uses shared CardTitle`, new RegExp(`<CardTitle icon="[a-z]+">\\{t\\('${k.replace('.', '\\.')}'\\)`).test(page));
}
check('no local text-teal-dark heading spans remain', !/<span className="text-sm text-teal-dark">/.test(page));
check('all 3 detail cards use AttributeGroup with colored icons 24px and bonuses', (page.match(/showStatIcons statIconSize=\{24\} showBars=\{false\} bonuses=\{compare \? undefined : bonuses\} compare=\{compare\}/g) ?? []).length === 3);
check('training mechanics untouched: no new training types, same server action + focus lists', /saveTrainingAction/.test(page) && /PERFORMANCE_FOCUS/.test(page) && /TECHNICAL_FOCUS/.test(page));

// controls
check('active toggles are teal, no navy left in the planner', !/bg-navy/.test(form) && (form.match(/CONTROL_ON/g) ?? []).length >= 4 && /CONTROL_ON = 'bg-teal text-white'/.test(form));
check('inactive toggles stay light (bg-surface)', /CONTROL_OFF = 'bg-surface text-navy-soft/.test(form));
check('type + intensity buttons share one control style and expose aria-pressed', (form.match(/\$\{CONTROL\} \$\{/g) ?? []).length === 3 && (form.match(/aria-pressed/g) ?? []).length === 3);
check('save button stays the main teal button', /w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white/.test(form));
check('planner has no second green uppercase heading ("Tréning pre týždeň" lives in the card header)', !/uppercase tracking-wide text-teal-dark/.test(form));
check('focus select keeps the colored attribute icon', /getSkillStatIcon\(selected\.id as SkillAttribute\)/.test(form));

// attribute cards: icons + gains kept
const bonuses: Partial<Record<SkillAttribute, number>> = { climbing: 2, cornering: 1 };
const attrs = Object.fromEntries([...PERFORMANCE_FOCUS, ...TACTICS_ATTRIBUTES, ...TECHNIQUE_ATTRIBUTES].map((k) => [k, 120])) as Record<SkillAttribute, number>;
const card = (keys: readonly SkillAttribute[], tk: string, icon: string) => renderToStaticMarkup(createElement(AttributeGroup, { t, titleKey: tk, icon, keys, attributes: attrs, showStatIcons: true, statIconSize: 24, showBars: false, bonuses }));
const perf = card(PERFORMANCE_FOCUS, 'group.performance', 'chart');
const tac = card(TACTICS_ATTRIBUTES, 'group.tactics', 'bolt');
const tech = card(TECHNIQUE_ATTRIBUTES, 'group.technique', 'wheel');
check('Výkon: 7 icons, Taktika: 5, Technika: 6', (perf.match(/<img/g) ?? []).length === 7 && (tac.match(/<img/g) ?? []).length === 5 && (tech.match(/<img/g) ?? []).length === 6);
check('each icon is the shared statIcons.ts PNG', [...PERFORMANCE_FOCUS, ...TACTICS_ATTRIBUTES, ...TECHNIQUE_ATTRIBUTES].every((k) => (perf + tac + tech).includes(getSkillStatIcon(k) as string)));
check('training gains (+2, +1) still rendered', perf.includes('>+2<') && tech.includes('>+1<'));
check('values use the Prehľad style (text-base font-bold tabular-nums)', /text-base font-bold tabular-nums text-navy">120</.test(perf) && /text-base font-bold tabular-nums text-navy">120</.test(tech));
const cond = renderToStaticMarkup(createElement(ConditionRow, { icon: '/ride-icon/x.png', label: 'Energia', value: 80, trend: 'up', goodDirection: 'up' }));
check('condition value uses the same value style', /text-base font-bold tabular-nums text-navy">80</.test(cond));
check('Rozvoj/Stav unchanged: no scouting note, no new explanatory text on the page', !/scoutNote|pribudne/.test(page));
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
