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
check('Free: title, OVR boxes and the 4 table columns', ['progress.title', 'progress.ovrAcquired', 'progress.ovrNow', 'progress.ovrDelta', 'progress.colAttribute', 'progress.colAcquired', 'progress.colNow', 'progress.colDelta'].every((k) => free.includes(k)));
check('Free: 19 attribute rows with icons', (free.match(/<tr class="border-b border-line last:border-0"/g) ?? []).length === 19 && (free.match(/<img /g) ?? []).length === 19);
check('Free: green for positive, red for negative, neutral for zero', free.includes('text-green-600') && free.includes('text-danger') && free.includes('text-navy-muted'));
check('Free: NO chart', !free.includes('role="img"') && !free.includes('progress.chartTitle') && !free.includes('<select'));
const start = html({ baselineKind: 'tracking_start' });
check('tracking_start rider: "Začiatok sledovania" label + note, never "Pri získaní"', start.includes('progress.colStart') && start.includes('progress.ovrStart') && start.includes('progress.trackingNote') && !start.includes('progress.colAcquired') && !start.includes('progress.ovrAcquired'));
check('acquired rider: no tracking note', !free.includes('progress.trackingNote'));
const prem = html({ history: hist });
check('Premium: chart + metric selector with OVR and the 19 attributes', prem.includes('progress.chartTitle') && prem.includes('<select') && (prem.match(/<option /g) ?? []).length === 20);
check('Premium: 2 real points -> a line and 2 circles, no "just started" note', (prem.match(/<circle /g) ?? []).length === 2 && prem.includes('stroke-teal"') && !prem.includes('progress.chartStarted'));
const prem1 = html({ history: [hist[0]] });
check('Premium, one record: one point + "tracking just started", no line', (prem1.match(/<circle /g) ?? []).length === 1 && prem1.includes('progress.chartStarted') && !prem1.includes('stroke-teal"'));

check('Premium, empty history -> no chart', !html({ history: [] }).includes('role="img"'));
check('no hidden attributes anywhere in the card', !/potential|trainability|professionalism|recovery/i.test(prem));

// ---- wiring / static checks
const page = readFileSync('src/app/rider/training/page.tsx', 'utf8');
const repo = readFileSync('src/lib/rider/progressRepository.ts', 'utf8');
const sql = readFileSync('../../supabase/migrations/20261115_03_rider_development_tracking.sql', 'utf8');
const at = (s: string) => page.indexOf(s);
check('card sits under the planner in the left column, before the right column', at('planCardTitle}') < at('<RiderProgressCard') && at('<RiderProgressCard') < at('RIGHT (narrower)'));
check('page passes the real current attributes and stored baseline, no mock data', /current=\{rider\.attributes\}/.test(page) && /progress\.baseline\.attributes/.test(page));
check('repository only reads (no insert/update/delete/rpc) and never selects hidden columns', !/\.(insert|update|delete|upsert|rpc)\(/.test(repo) && !/potential|trainability|professionalism|recovery/.test(repo));
check('history is read only for Premium (isPremiumEntitled) and the repository hides the card on error', /isPremiumEntitled\(\)/.test(repo) && /if \(error \|\| !acq\) return null/.test(repo));
check('migration: tables are not writable by clients, immutable, history is Premium via RLS',
  /revoke all on public\.rider_acquisitions from public, anon, authenticated/.test(sql) && /grant select on public\.rider_acquisitions to authenticated/.test(sql)
  && !/grant (insert|update|delete)/i.test(sql) && /before update on public\.rider_acquisitions/.test(sql) && /premium_entitlements/.test(sql));

const keys = ['title', 'ovr', 'ovrAcquired', 'ovrStart', 'ovrNow', 'ovrDelta', 'colAttribute', 'colAcquired', 'colStart', 'colNow', 'colDelta', 'trackingNote', 'chartTitle', 'chartMetric', 'chartStarted', 'chartAria', 'sourceTraining'];
check('all progress.* keys exist in sk (i18n:check covers the other 6 locales)', keys.every((k) => (sk as Record<string, string>)[`progress.${k}`]));
check('sk wording matches the spec', sk['progress.title'] === 'Vývoj jazdca' && sk['progress.colAcquired'] === 'Pri získaní' && sk['progress.colStart'] === 'Začiatok sledovania' && sk['progress.colNow'] === 'Teraz' && sk['progress.colDelta'] === 'Rozdiel');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
