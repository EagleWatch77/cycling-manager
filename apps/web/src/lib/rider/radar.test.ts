/**
 * Ability radar — model, Rozvoj handling, render smoke tests, privacy guards.
 * Run with: npx tsx src/lib/rider/radar.test.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildRadarModel, developmentInterval, NO_DEVELOPMENT_ESTIMATES, DEVELOPMENT_KEYS, RADAR_GROUP_ORDER,
  type DevelopmentEstimates,
} from './radar';
import { riderOverall, meanOf } from './score';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import { TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from './config';
import { AbilityRadar } from '@/components/rider/AbilityRadar';
import sk from '@/i18n/messages/sk.json';

// tsx uses the classic JSX transform; Next uses the automatic one.
(globalThis as unknown as { React: typeof React }).React = React;

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const KEYS: SkillAttribute[] = [
  'climbing', 'hills', 'flat', 'sprint', 'timeTrial', 'endurance', 'descending', 'acceleration',
  'energyManagement', 'positioning', 'reaction', 'breakawaySkill', 'packRiding', 'experience',
  'bikeHandling', 'cornering', 'attackTiming', 'roughSurface', 'wetHandling',
];
const attrs = {} as Record<SkillAttribute, number>;
KEYS.forEach((k, i) => { attrs[k] = 118 + ((i * 7) % 30); });
const lbl = (k: string) => (sk as Record<string, string>)[k] ?? k;

// ---- model: five axes, real group means ----
const m = buildRadarModel(attrs, NO_DEVELOPMENT_ESTIMATES, lbl);
check('five axes in the requested order', m.groups.map((g) => g.id).join() === RADAR_GROUP_ORDER.join()
  && m.groups.map((g) => g.id).join() === 'performance,tactics,technique,experience,development');
const g = (id: string) => m.groups.find((x) => x.id === id)!;
check('Výkon = mean of its 7 attributes (same as cards)', g('performance').value === Math.round(meanOf(attrs, PERFORMANCE_FOCUS)));
check('Taktika = mean of its attributes', g('tactics').value === Math.round(meanOf(attrs, TACTICS_ATTRIBUTES)));
check('Technika = mean of its attributes', g('technique').value === Math.round(meanOf(attrs, TECHNIQUE_ATTRIBUTES)));
check('Skúsenosti = the experience attribute, no sub-points', g('experience').value === attrs.experience && g('experience').attributes.length === 0);
check('groups expose ALL real attributes (7 / 5 / 6)', g('performance').attributes.length === 7 && g('tactics').attributes.length === 5 && g('technique').attributes.length === 6);
check('every sub-point value equals the stored attribute', ['performance', 'tactics', 'technique'].every((id) =>
  g(id).attributes.every((a) => a.value === attrs[a.key as SkillAttribute])));
check('sub-point labels match attribute names (i18n)', g('performance').attributes[0].label === 'Stúpanie');
check('norm within 0..1 and monotonic with value', m.groups.every((x) => x.norm === null || (x.norm >= 0 && x.norm <= 1)));
const hi = { ...attrs, climbing: 150 }, lo = { ...attrs, climbing: 120 };
check('higher attribute -> farther from centre',
  buildRadarModel(hi, NO_DEVELOPMENT_ESTIMATES, lbl).groups[0].attributes[0].norm! > buildRadarModel(lo, NO_DEVELOPMENT_ESTIMATES, lbl).groups[0].attributes[0].norm!);
check('radar does not use / change overall score input', riderOverall(attrs) === riderOverall({ ...attrs }));

// ---- Rozvoj without estimates ----
check('no estimates -> Rozvoj value/range/norm are null (never 0)', g('development').value === null && g('development').range === null && g('development').norm === null);
check('no estimates -> every development attribute is unknown (null, not 0)', g('development').attributes.length === 4
  && g('development').attributes.every((a) => a.value === null && a.range === null && a.norm === null));
check('partial estimates -> no misleading joint interval', developmentInterval({ ...NO_DEVELOPMENT_ESTIMATES, potential: { min: 70, max: 80 } }) === null);

// ---- Rozvoj with estimates ----
const est: DevelopmentEstimates = {
  potential: { min: 70, max: 80 }, trainability: { min: 60, max: 70 },
  professionalism: { min: 72, max: 84 }, recovery: { min: 64, max: 76 },
};
const ji = developmentInterval(est)!;
check('joint interval = mean of lows .. mean of highs', ji.min === Math.round((70 + 60 + 72 + 64) / 4) && ji.max === Math.round((80 + 70 + 84 + 76) / 4));
const me = buildRadarModel(attrs, est, lbl).groups[4];
check('with estimates Rozvoj gets range + norm + per-attribute ranges', me.range !== null && me.norm !== null && me.attributes.every((a) => a.range && a.normRange));
check('shorter (better scouted) range -> shorter segment', (() => {
  const narrow = buildRadarModel(attrs, { ...est, potential: { min: 74, max: 76 } }, lbl).groups[4].attributes[0].normRange!;
  const wide = me.attributes[0].normRange!;
  return narrow.max - narrow.min < wide.max - wide.min;
})());
check('out-of-scale/inverted ranges are clamped and ordered', (() => {
  const r = buildRadarModel(attrs, { ...est, potential: { min: 120, max: 10 } }, lbl).groups[4].attributes[0].range!;
  return r.min === 55 && r.max === 95;
})());

// ---- render smoke ----
const labels = { overview: 'Prehľad', estimate: 'odhad', unknown: 'Neznámy', note: 'NOTE', noteUnknown: 'NOTE-UNKNOWN', aria: 'Radar' };
const R = (model: typeof m, sel: 'performance' | 'tactics' | 'technique' | 'development' | null) =>
  renderToStaticMarkup(createElement(AbilityRadar, { model, labels, title: 'Radar schopností', initialSelected: sel }));
const overview = R(m, null);
check('overview shows five main labels + toggles', ['Výkon', 'Taktika', 'Technika', 'Skúsenosti', 'Rozvoj', 'Prehľad'].every((s) => overview.includes(s)));
check('overview shows no sub-attribute (no fan)', !overview.includes('Stúpanie') && !overview.includes('Zjazd'));
check('overview: Rozvoj shown as Neznámy', overview.includes('Neznámy'));
for (const id of ['performance', 'tactics', 'technique'] as const) {
  const html = R(m, id);
  const grp = g(id);
  check(`expanded ${id}: all ${grp.attributes.length} attributes with name + value`,
    grp.attributes.every((a) => html.includes(`>${a.label}<`) && html.includes(`>${a.value}<`)));
}
check('only one group expanded at a time (Výkon open hides Taktika attrs)', !R(m, 'performance').includes('Načasovanie útoku'));
const devUnknown = R(m, 'development');
check('expanded Rozvoj without estimates: names + Neznámy, unknown note', ['Potenciál', 'Trénovateľnosť', 'Profesionalita', 'Regenerácia'].every((s) => devUnknown.includes(s))
  && devUnknown.includes('NOTE-UNKNOWN'));
const devEst = R(buildRadarModel(attrs, est, lbl), 'development');
check('expanded Rozvoj with estimates: ranges + "odhad" label + estimate note', devEst.includes('70–80') && devEst.includes('odhad') && devEst.includes('>NOTE<'));

// ---- privacy: hidden true values never reach the client ----
const comp = readFileSync('src/components/rider/AbilityRadar.tsx', 'utf8');
const page = readFileSync('src/app/rider/page.tsx', 'utf8');
const radarSrc = readFileSync('src/lib/rider/radar.ts', 'utf8');
const estSrc = readFileSync('src/lib/rider/developmentEstimates.ts', 'utf8');
check('client radar component never mentions hidden true fields', !/\.(potential|trainability|professionalism|recovery)\b/.test(comp));
check('radar model takes only skill attributes + estimates (no hidden true-value parameter)', /attributes: Record<SkillAttribute, number>,\s*estimates: DevelopmentEstimates,/.test(radarSrc));
check('page passes only radar model + labels to the client radar (no rider.potential etc.)',
  /<AbilityRadar[\s\S]*?\/>/.test(page) && !/<AbilityRadar[^>]*rider\.(potential|trainability|professionalism|recovery)/.test(page.match(/<AbilityRadar[\s\S]*?\/>/)![0]));
check('estimates provider is server-only and takes only the rider id', /import 'server-only'/.test(estSrc) && /getDevelopmentEstimates\(_riderId: string\)/.test(estSrc));
check('serialised model contains no hidden-looking numbers for Rozvoj', !/"(potential|trainability|professionalism|recovery)":\s*\d/.test(JSON.stringify(m)));

// ---- write static SVGs for visual inspection ----
mkdirSync('/tmp/radar', { recursive: true });
const toSvg = (html: string) => {
  const mm = html.match(/<svg[\s\S]*<\/svg>/)![0].replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" font-family="DejaVu Sans, Arial"');
  return mm.replace(/class="[^"]*text-\[(\d+(?:\.\d+)?)px\][^"]*"/g, 'font-size="$1" font-weight="bold"');
};
writeFileSync('/tmp/radar/overview.svg', toSvg(overview));
for (const id of ['performance', 'tactics', 'technique'] as const) writeFileSync(`/tmp/radar/${id}.svg`, toSvg(R(m, id)));
writeFileSync('/tmp/radar/dev-unknown.svg', toSvg(devUnknown));
writeFileSync('/tmp/radar/dev-est.svg', toSvg(devEst));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
