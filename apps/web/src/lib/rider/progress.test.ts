/**
 * Vývoj jazdca — comparison math, series, card rendering, wiring.
 * Run with: npx tsx src/lib/rider/progress.test.ts
 */
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import {
  PROGRESS_ATTRIBUTES, buildProgress, buildSeries, deltaTone, formatDelta, toAttributes,
  type Attributes, type HistoryPoint,
} from './progress';
import { SKILL_ATTRIBUTES } from './config';
import { overallRating } from './score';
import { RiderProgressCard } from '@/components/rider/RiderProgressCard';
import sk from '@/i18n/messages/sk.json';

(globalThis as unknown as { React: typeof React }).React = React;
let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
const base = Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, 130])) as Attributes;
const now = { ...base, sprint: 134, climbing: 131, flat: 128 } as Attributes;
const t = (k: string) => k;

// ---- pure logic
check('19 attributes, each exactly once, same set as SKILL_ATTRIBUTES',
  PROGRESS_ATTRIBUTES.length === 19 && new Set(PROGRESS_ATTRIBUTES).size === 19 && SKILL_ATTRIBUTES.every((k) => PROGRESS_ATTRIBUTES.includes(k)));
const p = buildProgress(base, now);
check('rows contain ALL attributes, including unchanged ones', p.rows.length === 19 && p.rows.filter((r) => r.delta === 0).length === 16);
check('unchanged attribute: same from/now, delta 0', (() => { const r = p.rows.find((x) => x.attr === 'hills')!; return r.from === 130 && r.now === 130 && r.delta === 0; })());
check('positive and negative deltas are exact differences', p.rows.find((r) => r.attr === 'sprint')!.delta === 4 && p.rows.find((r) => r.attr === 'flat')!.delta === -2);
check('OVR uses the approved overallRating()', p.ovrFrom === overallRating(base) && p.ovrNow === overallRating(now) && p.ovrDelta === p.ovrNow - p.ovrFrom);
check('identical attributes -> OVR delta 0', buildProgress(base, base).ovrDelta === 0);
check('delta formatting + tone', formatDelta(3) === '+3' && formatDelta(0) === '0' && formatDelta(-2) === '−2' && deltaTone(3) === 'up' && deltaTone(0) === 'zero' && deltaTone(-1) === 'down');
check('toAttributes accepts a complete object and ignores hidden keys', (() => { const a = toAttributes({ ...base, potential: 99, trainability: 99 }); return !!a && !('potential' in a) && Object.keys(a).length === 19; })());
check('toAttributes rejects incomplete / non-numeric snapshots (no guessing)', toAttributes({ climbing: 130 }) === null && toAttributes({ ...base, sprint: '130' }) === null && toAttributes(null) === null);

const hp = (a: Attributes, source: HistoryPoint['source'], week: number): HistoryPoint => ({ recordedAt: `2026-11-0${week}T10:00:00Z`, seasonId: 'season-2', week, source, attributes: a });
const hist = [hp(base, 'baseline', 1), hp(now, 'training', 2)];
const sOvr = buildSeries(hist, 'ovr'), sSprint = buildSeries(hist, 'sprint');
check('series has exactly one point per stored record, in order, real values', sOvr.length === 2 && sSprint.map((x) => x.value).join() === '130,134' && sOvr[1].value === overallRating(now));
check('series keeps season, week, time and source', sSprint[1].seasonId === 'season-2' && sSprint[1].week === 2 && sSprint[1].source === 'training' && sSprint[1].recordedAt.startsWith('2026-11'));
check('one record -> one point (nothing invented)', buildSeries([hist[0]], 'ovr').length === 1);

// ---- card rendering
const html = (props: Partial<Parameters<typeof RiderProgressCard>[0]> = {}) =>
  renderToStaticMarkup(createElement(RiderProgressCard, { t, baseline: base, baselineKind: 'acquired', current: now, history: null, ...props }));
const free = html();
check('Free: title and the three OVR boxes (acquired / now / diff)', ['progress.title', 'progress.ovrAcquired', 'progress.ovrNow', 'progress.ovrDelta'].every((k) => free.includes(k)));
check('Free: compact OVR comparison only — the duplicate 19-attribute table is gone', !free.includes('<table') && !free.includes('<tr') && !free.includes('<img') && !free.includes('progress.colAttribute'));
check('Free: OVR delta is coloured (green when positive)', html({ current: Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, 140])) as Attributes }).includes('text-green-600'));
check('Free: NO chart', !free.includes('role="img"') && !free.includes('progress.chartTitle') && !free.includes('<select'));
const start = html({ baselineKind: 'tracking_start' });
check('tracking_start rider: OVR box says start of tracking + note, never "Pri získaní"', start.includes('progress.ovrStart') && start.includes('progress.trackingNote') && !start.includes('progress.ovrAcquired'));
check('acquired rider: no tracking note', !free.includes('progress.trackingNote'));
const prem = html({ history: hist });
check('Premium: chart + metric selector with OVR and the 19 attributes', prem.includes('progress.chartTitle') && prem.includes('<select') && (prem.match(/<option /g) ?? []).length === 20 /* OVR + 19 public attributes, incl. experience */);
check('Premium: 2 real points -> a line and 2 circles, no "just started" note', (prem.match(/<circle /g) ?? []).length === 2 && prem.includes('stroke-teal"') && !prem.includes('progress.chartStarted'));
const prem1 = html({ history: [hist[0]] });
check('Premium, one record: one point + "tracking just started", no line', (prem1.match(/<circle /g) ?? []).length === 1 && prem1.includes('progress.chartStarted') && !prem1.includes('stroke-teal"'));

check('Premium, empty history -> no chart', !html({ history: [] }).includes('role="img"'));
check('no hidden attributes anywhere in the card', !/potential|trainability|professionalism|recovery/i.test(prem));

// ---- per-attribute history inside the existing cards (Zobraziť históriu)
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { DevAttributeRow } from '@/components/rider/DevAttributeRow';
import { HistoryToggle } from '@/components/training/HistoryToggle';
import { PERFORMANCE_FOCUS, } from '@/lib/training/config';
import { TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES } from './config';
const labels = { from: 'L.from', now: 'L.now', delta: 'L.delta' };
const grp = (keys: readonly any[], compare?: any, bonuses?: any) =>
  renderToStaticMarkup(createElement(AttributeGroup, { t, titleKey: 'g', icon: 'chart', keys, attributes: now, showStatIcons: true, statIconSize: 24, showBars: false, bonuses, compare }));
const off = grp(PERFORMANCE_FOCUS, undefined, { sprint: 2 });
const on = grp(PERFORMANCE_FOCUS, { from: base, labels });
check('history OFF: original clean card (value + real "+N" gain only, no from/delta columns)', !off.includes('L.from') && off.includes('+2') && !off.includes('text-danger'));
check('history ON: header + baseline, current and difference for every row of the card', on.includes('L.from') && on.includes('L.now') && on.includes('L.delta') && (on.match(/<li /g) ?? []).length === 7);
check('history ON: colours — +4 green, 0 neutral, −2 red', on.includes('+4') && on.includes('text-green-600') && on.includes('text-navy-muted') && on.includes('\u22122') && on.includes('text-danger'));
check('history ON: unchanged attributes are shown with 0', (on.match(/>0</g) ?? []).length >= 1);
check('history ON hides the separate gain column (delta replaces it)', !grp(PERFORMANCE_FOCUS, { from: base, labels }, undefined).includes('+2<'));
check('Technika card gets the same compare view', grp(TECHNIQUE_ATTRIBUTES, { from: base, labels }).includes('L.delta'));
const exp = (compare?: any) => renderToStaticMarkup(createElement(DevAttributeRow, { icon: null, label: 'Skúsenosti', level: 3, variant: 'segments', compare }));
check('Skúsenosti (public) shows baseline / now / diff when history is on, nothing when off', exp().indexOf('L.from') === -1 && exp({ from: 130, now: 132, labels }).includes('L.from') && exp({ from: 130, now: 132, labels }).includes('+2'));
const tg = (on: boolean) => renderToStaticMarkup(createElement(HistoryToggle, { on, href: on ? '/x' : '/x?history=1', label: on ? 'Skryť' : 'Zobraziť', hint: 'h' }));
check('toggle: one link, aria-pressed, hint only when on', tg(false).includes('aria-pressed="false"') && !tg(false).includes('>h<') && tg(true).includes('aria-pressed="true"') && tg(true).includes('>h<') && (tg(false).match(/<a /g) ?? []).length === 1);

// ---- wiring / static checks
const page = readFileSync('src/app/rider/training/page.tsx', 'utf8');
const repo = readFileSync('src/lib/rider/progressRepository.ts', 'utf8');
const sql = readFileSync('../../supabase/migrations/20261115_03_rider_development_tracking.sql', 'utf8');
const at = (s: string) => page.indexOf(s);
check('card sits under the planner in the left column, before the right column', at('planCardTitle}') < at('<RiderProgressCard') && at('<RiderProgressCard') < at('RIGHT (narrower)'));
check('one shared toggle above the three cards, state in ?history=1, only when a stored baseline exists', /<HistoryToggle/.test(page) && at('<HistoryToggle') < at('group.performance') && /history === '1'/.test(page) && /progress != null/.test(page));
check('all three cards + the Skúsenosti row receive the compare data', (page.match(/compare=\{compare\}/g) ?? []).length === 3 && /experience: ?|compare\.from\.experience/.test(page));
check('page passes the real current attributes and stored baseline, no mock data', /current=\{rider\.attributes\}/.test(page) && /progress\.baseline\.attributes/.test(page));
check('repository only reads (no insert/update/delete/rpc) and never selects hidden columns', !/\.(insert|update|delete|upsert|rpc)\(/.test(repo) && !/potential|trainability|professionalism|recovery/.test(repo));
check('history is read only for Premium (isPremiumEntitled) and the repository hides the card on error', /isPremiumEntitled\(\)/.test(repo) && /if \(error \|\| !acq\) return null/.test(repo));
check('migration: tables are not writable by clients, immutable, history is Premium via RLS',
  /revoke all on public\.rider_acquisitions from public, anon, authenticated/.test(sql) && /grant select on public\.rider_acquisitions to authenticated/.test(sql)
  && !/grant (insert|update|delete)/i.test(sql) && /before update on public\.rider_acquisitions/.test(sql) && /premium_entitlements/.test(sql));

const keys = ['title', 'ovr', 'ovrAcquired', 'ovrStart', 'ovrNow', 'ovrDelta', 'showHistory', 'hideHistory', 'compareWith', 'colAcquired', 'colStart', 'colNow', 'colDelta', 'trackingNote', 'chartTitle', 'chartMetric', 'chartStarted', 'chartAria', 'sourceTraining'];
check('all progress.* keys exist in sk (i18n:check covers the other 6 locales)', keys.every((k) => (sk as Record<string, string>)[`progress.${k}`]));
check('sk wording matches the spec', sk['progress.title'] === 'Vývoj jazdca' && sk['progress.colAcquired'] === 'Pri získaní' && sk['progress.colStart'] === 'Začiatok sledovania' && sk['progress.colNow'] === 'Teraz' && sk['progress.colDelta'] === 'Rozdiel');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
