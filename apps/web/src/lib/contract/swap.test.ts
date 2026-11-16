/**
 * Market purchase + weekly swap: pure rules, drift guards against the SQL, UI
 * and security of the app code. Run: npx --no-install tsx --tsconfig tsconfig.json src/lib/contract/swap.test.ts
 * (Database behaviour: supabase/tests/rider_swaps.test.sh against a real Postgres.)
 */
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { planSwap, reserveFailureFromError } from './swap';
import { contractSpan } from './contract';
import { overallRating } from '@/lib/rider/score';
import { SKILL_ATTRIBUTES, TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES } from '@/lib/rider/config';
import { PendingSwapRows } from '@/components/rider/PendingSwapRows';
import { CareerHistoryCard } from '@/components/rider/CareerHistoryCard';

(globalThis as unknown as { React: typeof React }).React = React;
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
const sk = JSON.parse(readFileSync('src/i18n/messages/sk.json', 'utf8')) as Record<string, string>;
const t = ((k: string, v?: Record<string, string | number>) => (sk[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(v?.[n] ?? `{${n}}`))) as never;
const wk = (w: { seasonNumber: number; week: number }) => `S${w.seasonNumber}W${w.week}`;

console.log('== takeover rule: next Monday 00:00 UTC');
{
  const p = planSwap(new Date('2026-11-18T08:30:00Z')); // S2 W4 (Wed)
  check('purchase S2 W4 -> takeover S2 W5', wk(p.purchaseWeek) === 'S2W4' && wk(p.takeoverWeek) === 'S2W5');
  check('takeover is Monday 2026-11-23 00:00 UTC', p.takeoverAt.toISOString() === '2026-11-23T00:00:00.000Z');
  const c = contractSpan(p.takeoverAt);
  check('contract from takeover week: S2 W5 -> S3 W4 (2027-02-01)', wk(c.start) === 'S2W5' && wk(c.end) === 'S3W4' && c.expiresAt.toISOString() === '2027-02-01T00:00:00.000Z');
  const sun = planSwap(new Date('2026-11-22T23:59:59Z'));
  check('Sunday 23:59:59 UTC still belongs to the purchase week', wk(sun.purchaseWeek) === 'S2W4' && sun.takeoverAt.toISOString() === '2026-11-23T00:00:00.000Z');
  const mon = planSwap(new Date('2026-11-23T00:00:00Z'));
  check('Monday 00:00 UTC is the next week already', wk(mon.purchaseWeek) === 'S2W5' && wk(mon.takeoverWeek) === 'S2W6');
  const w10 = planSwap(new Date('2027-01-03T12:00:00Z'));
  check('week 10 purchase takes over in week 1 of the NEXT season', wk(w10.purchaseWeek) === 'S2W10' && wk(w10.takeoverWeek) === 'S3W1' && w10.takeoverAt.toISOString() === '2027-01-04T00:00:00.000Z');
}

console.log('== error mapping');
{
  const cases: [string, string][] = [['swap_disabled', 'disabled'], ['no_active_rider', 'no-rider'], ['swap_pending', 'swap-pending'], ['not_available', 'not-available'], ['not_eligible', 'not-eligible'], ['not_found', 'not-found'], ['not_authenticated', 'not-authenticated']];
  for (const [m, want] of cases) check(`${m} -> ${want}`, reserveFailureFromError(`ERROR: ${m}`) === want);
  check('unknown text -> unknown (never shown raw)', reserveFailureFromError('boom') === 'unknown' && reserveFailureFromError(null) === 'unknown');
}

console.log('== drift: SQL rider_overall_rating == lib/rider/score.ts');
{
  const sql = readFileSync('../../supabase/migrations/20261116_02_market_purchase_and_swap.sql', 'utf8');
  const fn = sql.slice(sql.indexOf('function public.rider_overall_rating'), sql.indexOf('function public.manager_league_now'));
  const keys = [...fn.matchAll(/->> '(\w+)'/g)].map((m) => m[1]);
  const want = [...TACTICS_ATTRIBUTES, ...TECHNIQUE_ATTRIBUTES, 'experience'] as string[];
  check('SQL reads exactly the tactics + technique + experience keys', JSON.stringify([...keys].sort()) === JSON.stringify([...want].sort()), keys.join(','));
  check('weights 0.50 / 0.25 / 0.20 / 0.05', ['* 0.50', '* 0.25', '* 0.20', '* 0.05'].every((w) => fn.includes(w)));
  check('SQL divides by the group sizes', fn.includes(`/ ${TACTICS_ATTRIBUTES.length} * 0.25`) && fn.includes(`/ ${TECHNIQUE_ATTRIBUTES.length} * 0.20`));
  const flat = Object.fromEntries(SKILL_ATTRIBUTES.map((a) => [a, 130])) as never;
  check('flat-130 rider has OVR 130 (same value the SQL test asserts)', overallRating(flat) === 130);
}

console.log('== no invented numbers, switch off by default');
{
  const sql = readFileSync('../../supabase/migrations/20261116_02_market_purchase_and_swap.sql', 'utf8');
  check('rider_swap_settings.enabled defaults to false', /enabled\s+boolean not null default false/.test(sql) && /values \(true, false\)/.test(sql));
  check('limits are inserted with NO numbers', /insert into public\.league_rider_limits \(league\) values/.test(sql));
  check('migration never deletes market or rider rows', !/delete from public\.(riders|market_riders|rider_contracts)\b/.test(sql));
}

console.log('== UI');
{
  const html = renderToStaticMarkup(createElement(PendingSwapRows, { t, swap: { newFirstName: 'Ján', newSurname: 'Novák', newCountryIso2: 'SK', newAge: 18, takeoverSeason: 2, takeoverWeek: 5, takeoverAt: '2026-11-23T00:00:00Z' } }));
  check('pending swap shows new rider name and takeover week only', html.includes('Ján Novák') && html.includes('Sezóna 2 · Týždeň 5') && !/potential|trainab/i.test(html));
  const hist = renderToStaticMarkup(createElement(CareerHistoryCard, { t, events: [{ id: 'e', type: 'contract_ended', season: 2, week: 5, league: null, divisionNumber: null, durationWeeks: null }] }));
  check('history shows the contract end', hist.includes('Koniec kontraktu'));
  const page = readFileSync('src/app/transfers/[id]/page.tsx', 'utf8');
  check('buy button only when the switch is on and no swap is pending', /enabled && !pendingSwap/.test(page));
}

console.log('== security of the app code');
{
  const files = ['src/lib/market/swap.ts', 'src/app/transfers/actions.ts', 'src/components/market/BuyRiderButton.tsx'].map((f) => readFileSync(f, 'utf8')).join('\n');
  check('no direct writes to ownership/contract/reservation tables', !/\.(insert|update|upsert|delete)\(/.test(files) && !/from\('(riders|market_riders|rider_swaps|rider_contracts)'\)/.test(files));
  check('purchase goes through the reserve_market_rider rpc only', files.includes("rpc('reserve_market_rider'"));
  const gs = readFileSync('src/lib/gameState.ts', 'utf8');
  check('weekly closure runs after season aging', gs.indexOf('ensureSeasonTransitionsProcessed()') < gs.indexOf('processDueRiderSwaps()'));
  const repo = readFileSync('src/lib/market/repository.ts', 'utf8');
  check('market reset never deletes a row linked to a rider', /\.is\('acquired_rider_id', null\)/.test(repo));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
