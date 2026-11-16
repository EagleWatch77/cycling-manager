/**
 * Rider contracts V1: rules, drift guard against the SQL, UI states, security
 * of the app code. Run: npx --no-install tsx --tsconfig tsconfig.json src/lib/contract/contract.test.ts
 * (The database behaviour itself is tested against a real Postgres in
 *  supabase/tests/rider_contracts.test.sh.)
 */
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONTRACT_WEEKS, MARKET_ENTRY_AGE, MARKET_MAX_AGE, contractSpan, contractState, gameWeekIndex, remainingWeeks, seasonWeekOfIndex, youngMarketFate } from './contract';
import { SEASON_ONE_START } from '@/lib/calendar/season';
import { ContractCard } from '@/components/rider/ContractCard';
import { CareerHistoryCard } from '@/components/rider/CareerHistoryCard';

(globalThis as unknown as { React: typeof React }).React = React;
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
const sk = JSON.parse(readFileSync('src/i18n/messages/sk.json', 'utf8')) as Record<string, string>;
const t = ((k: string, v?: Record<string, string | number>) => (sk[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(v?.[n] ?? `{${n}}`))) as never;
const fmt = (s: ReturnType<typeof contractSpan>) =>
  `S${s.start.seasonNumber}W${s.start.week}->S${s.end.seasonNumber}W${s.end.week} ${s.expiresAt.toISOString()}`;

// ---- the owner's table (same cases are asserted on the real database) ----
check('anchor is the SQL anchor (2026-08-17)', SEASON_ONE_START === '2026-08-17' && /date '2026-08-17'/.test(readFileSync('../../supabase/migrations/20261116_01_rider_contracts.sql', 'utf8')));
check('bought S2 week 1 -> ends S2 week 10', fmt(contractSpan(new Date('2026-10-28T12:00:00Z'))) === 'S2W1->S2W10 2027-01-04T00:00:00.000Z');
check('bought S2 week 4 -> ends S3 week 3', fmt(contractSpan(new Date('2026-11-18T08:30:00Z'))) === 'S2W4->S3W3 2027-01-25T00:00:00.000Z');
check('bought S2 week 10 -> ends S3 week 9', fmt(contractSpan(new Date('2027-01-03T23:00:00Z'))) === 'S2W10->S3W9 2027-03-08T00:00:00.000Z');
check('duration is always 10 weeks, the purchase week counts as week 1', CONTRACT_WEEKS === 10 && contractSpan(new Date('2026-11-18T08:30:00Z')).durationWeeks === 10);
check('a season change does not end the contract (S2W4 spans into season 3)', contractSpan(new Date('2026-11-18T08:30:00Z')).end.seasonNumber === 3);

// ---- week boundary ----
check('Sunday 23:59:59 UTC is still the same week', fmt(contractSpan(new Date('2026-11-22T23:59:59Z'))) === 'S2W4->S3W3 2027-01-25T00:00:00.000Z');
check('Monday 00:00:00 UTC is the next week', fmt(contractSpan(new Date('2026-11-23T00:00:00Z'))) === 'S2W5->S3W4 2027-02-01T00:00:00.000Z');
check('week index never depends on the time of day or a local zone', gameWeekIndex(new Date('2026-08-23T23:59:59Z')) === 0 && gameWeekIndex(new Date('2026-08-24T00:00:00Z')) === 1);
check('index <-> season/week', JSON.stringify(seasonWeekOfIndex(13)) === '{"seasonNumber":2,"week":4}' && JSON.stringify(seasonWeekOfIndex(9)) === '{"seasonNumber":1,"week":10}');
for (let d = 0; d < 400; d++) {   // every day: expiry is always a Monday 00:00 UTC, always exactly 10 weeks of weeks after the start week
  const at = new Date(Date.parse('2026-08-10T05:00:00Z') + d * 86_400_000);
  const s = contractSpan(at);
  if (s.expiresAt.getUTCDay() !== 1 || s.expiresAt.getUTCHours() !== 0 || (s.expiresAt.getTime() - Date.parse(`${at.toISOString().slice(0, 10)}T00:00:00Z`)) < 63 * 86_400_000 || (s.expiresAt.getTime() - at.getTime()) > 77 * 86_400_000) { check(`expiry shape for ${at.toISOString()}`, false); break; }
  if (d === 399) check('for 400 consecutive days: expiry = Monday 00:00 UTC, 63..77 days after purchase', true);
}

// ---- state + remaining (server time passed in) ----
const span = contractSpan(new Date('2026-11-18T08:30:00Z'));
check('running: active, 10 weeks remaining in the purchase week', contractState(span.expiresAt, new Date('2026-11-18T09:00:00Z')) === 'active' && remainingWeeks(span, new Date('2026-11-18T09:00:00Z')) === 10);
check('last counted week: 1 remaining', remainingWeeks(span, new Date('2027-01-20T10:00:00Z')) === 1);
check('exactly at the expiry instant it is expired, 0 remaining', contractState(span.expiresAt, span.expiresAt) === 'expired' && remainingWeeks(span, span.expiresAt) === 0);
check('one millisecond before expiry it is still active', contractState(span.expiresAt, new Date(span.expiresAt.getTime() - 1)) === 'active');
check('expiry has no other consequence in the rules (state only)', ['active', 'expired', 'ended'].includes(contractState(span.expiresAt, new Date('2030-01-01T00:00:00Z'))));

// ---- young market riders ----
check('market ages: enters at 17, stays up to 20', MARKET_ENTRY_AGE === 17 && MARKET_MAX_AGE === 20);
check('17, 18, 19 and 20 stay on the market', [17, 18, 19, 20].every((age) => youngMarketFate({ age, everHadManager: false }) === 'stays'));
check('never-bought rider over 20 retires and is deleted', youngMarketFate({ age: 21, everHadManager: false }) === 'retire-and-delete' && youngMarketFate({ age: 25, everHadManager: false }) === 'retire-and-delete');
check('rider who already had a manager is protected at any age', [17, 20, 21, 30].every((age) => youngMarketFate({ age, everHadManager: true }) === 'protected'));
check('younger than 17 has not entered the market yet', youngMarketFate({ age: 16, everHadManager: false }) === 'not-yet');
const sqlMig = readFileSync('../../supabase/migrations/20261116_01_rider_contracts.sql', 'utf8');
check('SQL purge uses the same max age (> 20), dry-run default, never granted to clients', /m\.age > 20/.test(sqlMig) && /p_apply boolean default false/.test(sqlMig) && /revoke all on function public\.purge_unsold_young_market_riders\(boolean\) from public, anon, authenticated/.test(sqlMig) && !/grant execute on function public\.purge_unsold/.test(sqlMig));

// ---- UI ----
const contract = { contractId: 'c', state: 'active' as const, startSeason: 2, startWeek: 4, endSeason: 3, endWeek: 3, durationWeeks: 10, remainingWeeks: 7, expiresAt: '2027-01-25T00:00:00Z' };
const cardHtml = renderToStaticMarkup(createElement(ContractCard, { t, contract }));
check('Kontrakt card: status, start, end, duration, remaining from the data', ['Aktívny', 'Sezóna 2 · Týždeň 4', 'Sezóna 3 · Týždeň 3', '>10<', '>7<'].every((s) => cardHtml.includes(s)) && (cardHtml.match(/<li /g) ?? []).length === 5);
check('Kontrakt card: teal title, no big icon, no button, no explanatory paragraph', cardHtml.includes('text-teal-dark') && !/<button|<a /.test(cardHtml) && !/<p /.test(cardHtml) && !/h-8 w-8|h-14/.test(cardHtml));
const none = renderToStaticMarkup(createElement(ContractCard, { t, contract: null }));
check('no contract: one quiet line, no invented dates or numbers', none.includes('Jazdec nemá evidovaný kontrakt.') && !/Sezóna|\d/.test(none.replace(/<[^>]+>/g, '')));
check('expired contract shows "Vypršal" and 0 remaining', (() => { const h = renderToStaticMarkup(createElement(ContractCard, { t, contract: { ...contract, state: 'expired' as const, remainingWeeks: 0 } })); return h.includes('Vypršal') && h.includes('>0<'); })());
const events = [
  { id: 'a', type: 'career_start' as const, season: 2, week: 4, league: 'rookie', divisionNumber: 1, durationWeeks: null },
  { id: 'b', type: 'contract_signed' as const, season: 2, week: 4, league: 'rookie', divisionNumber: 1, durationWeeks: 10 },
];
const hist = renderToStaticMarkup(createElement(CareerHistoryCard, { t, events }));
check('História: heading Sezóna 2 · Týždeň 4, career start, "Zakúpený do ligy Rookie 1.1", contract + duration', ['Sezóna 2 · Týždeň 4', 'Začiatok profesionálnej kariéry', 'Zakúpený do ligy Rookie 1.1', 'Vznik kontraktu', 'Kontrakt na 10 týždňov'].every((s) => hist.includes(s)));
check('História: both events of one week sit under ONE heading, career start first', (hist.match(/Sezóna 2 · Týždeň 4/g) ?? []).length === 1 && hist.indexOf('Začiatok profesionálnej kariéry') < hist.indexOf('Vznik kontraktu'));
check('História: the league shown is the stored one (never read from the current membership)', !/league_memberships|getMyLeague/.test(readFileSync('src/components/rider/CareerHistoryCard.tsx', 'utf8') + readFileSync('src/lib/contract/repository.ts', 'utf8')));
check('História: unknown league is simply omitted, not invented', !renderToStaticMarkup(createElement(CareerHistoryCard, { t, events: [{ ...events[0], league: null, divisionNumber: null }] })).includes('Zakúpený do ligy'));
check('História: empty state is one quiet line', renderToStaticMarkup(createElement(CareerHistoryCard, { t, events: [] })).includes('Zatiaľ nie sú zaznamenané žiadne udalosti kariéry.'));

// ---- the app can only READ contracts; translations ----
function walk(d: string): string[] { return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : []; }); }
const appSrc = walk('src').map((f) => [f, readFileSync(f, 'utf8')] as const);
check('no app code writes rider_contracts / rider_career_events / calls the internal start function', appSrc.every(([, s]) => !/from\('rider_(contracts|career_events)'\)\s*\.(insert|update|delete|upsert)/.test(s) && !/rpc\(\s*['"](start_rider_contract_internal|purge_unsold_young_market_riders)/.test(s)));
check('no purchase flow is faked: no code path sets riders.player_id for a market purchase', appSrc.every(([f, s]) => !/acquired_rider_id/.test(s) || /market\//.test(f) || /\.d\.ts/.test(f)));
const keys = ['contract.status', 'contract.state.active', 'contract.state.expired', 'contract.state.ended', 'contract.start', 'contract.end', 'contract.duration', 'contract.remaining', 'contract.seasonWeek', 'history.careerStart', 'history.purchasedInto', 'history.contractStart', 'history.contractDuration', 'profile.contractEmpty'];
check('all 14 contract/history keys exist in all 7 languages', ['sk', 'en', 'cs', 'de', 'es', 'fr', 'pl'].every((l) => { const m = JSON.parse(readFileSync(`src/i18n/messages/${l}.json`, 'utf8')); return keys.every((k) => typeof m[k] === 'string' && m[k].length > 0); }));
check('placeholders {season} {week} {league} {weeks} survive in every language', ['sk', 'en', 'cs', 'de', 'es', 'fr', 'pl'].every((l) => { const m = JSON.parse(readFileSync(`src/i18n/messages/${l}.json`, 'utf8')); return /\{season\}/.test(m['contract.seasonWeek']) && /\{week\}/.test(m['contract.seasonWeek']) && /\{league\}/.test(m['history.purchasedInto']) && /\{weeks\}/.test(m['history.contractDuration']); }));
check('old placeholder-only pages are gone (no empty-state icon blocks)', !/Icon name/.test(readFileSync('src/app/rider/contract/page.tsx', 'utf8') + readFileSync('src/app/rider/history/page.tsx', 'utf8')));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
