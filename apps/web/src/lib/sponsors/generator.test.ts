/**
 * Wiring of the main-sponsor offer generator (migration 20261122_03) with the page, plus the rules the owner fixed (2026-11-22).
 * The behaviour itself (3 offers, no repeats, 21 days, Sunday refill, goals, no signing) is proven against real Postgres in
 * supabase/tests/sponsors_generator.test.sh. Run with: npx tsx src/lib/sponsors/generator.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { GOAL_TYPES, MAX_OFFERS, OFFER_VALID_DAYS } from './rules';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) pass++; else { fail++; console.log(`FAIL ${n} ${d}`); } };
const root = path.resolve(__dirname, '../../../../..');
const rd = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const nc = (s: string) => s.replace(/--.*$/gm, '');
const sql = rd('supabase/migrations/20261122_03_sponsor_offer_generator.sql'); const code = nc(sql);
const page = rd('apps/web/src/app/sponsors/page.tsx'); const repo = rd('apps/web/src/lib/sponsors/repository.ts'); const cards = rd('apps/web/src/components/sponsors/SponsorCards.tsx');

check('rules: at most 3 main + 3 secondary offers (6), 21 days', MAX_OFFERS.main === 3 && MAX_OFFERS.secondary === 3 && MAX_OFFERS.total === 6 && OFFER_VALID_DAYS === 21);
// the generator is server-side SQL, called from the server component, never from the browser
check('repository calls ensure_my_sponsor_offers on the server before reading', /rpc\('ensure_my_sponsor_offers'\)/.test(repo) && repo.indexOf("ensure_my_sponsor_offers") < repo.indexOf("from('sponsor_offers')"));
check('repository is server-only', /import 'server-only'/.test(repo));
check('a missing function (migration not run) is quiet, a generator error never breaks the page', /'42883'/.test(repo) && /console\.error\(`\[sponsors\] generator failed/.test(repo));
check('market reads both kinds of own open offers; page shows two sections (main / secondary) from the data', !/\.eq\('kind', 'main'\)\.eq\('status', 'open'\)/.test(repo) && /\.eq\('status', 'open'\)/.test(repo) && /offersOf\(kind\)/.test(page) && /sp\.section\.\$\{kind\}/.test(page) && /MAX_OFFERS\[kind\]/.test(page));
check('no filter and no ?type on the page; one finance notice above the sections', !/sp\.filter|type=|one\(sp\.type\)/.test(page) && /sp\.finance\.note/.test(page));
check('counter is x / 6 offers (unfiltered count)', /allOffers\.length[^`]*MAX_OFFERS\.total/.test(page));
check('active-secondary counter uses the league limit', /activeByKind\.secondary\} \/ \$\{limits\.secondary/.test(page));
check('no catalogue listing on the page', !/SponsorCatalog|getMainSponsorCatalog/.test(page));
check('no client-side generator code (page and cards are server components)', !/'use client'/.test(page) && !/ensure_my_sponsor_offers|sponsor_generate/.test(cards));
check('card shows the expiry date and the remaining time', /sp\.field\.expiresOn/.test(cards) && /sp\.expiresIn/.test(cards));
check('no money is rendered except through moneyText ("Zatiaľ neurčené")', /moneyText\(o\.weeklyIncomeCents/.test(cards));
// migration
check('goal catalogue lists all 12 approved goals', GOAL_TYPES.length === 12 && GOAL_TYPES.every((g) => sql.includes(`'${g}'`)));
check('goals the game cannot evaluate are not implemented (Worlds, promotion, season win)', ['winSeason', 'promotion', 'participateWorlds', 'top3Worlds', 'winWorlds'].every((g) => new RegExp(`\\('${g}',\\s*\\d+,\\s*(true|false),\\s*false`).test(sql)));
check('implemented goals are exactly the 7 evaluable ones', ['participateTour', 'finishTour', 'top50', 'top10', 'winStage', 'anyJersey', 'winTour'].every((g) => new RegExp(`\\('${g}',\\s*\\d+,\\s*true,\\s*true`).test(sql)));
check('offers are valid exactly 21 days', /p_now \+ interval '21 days'/.test(code) && !/interval '(2[02]|[0-9]|1[0-9]) days'/.test(code.replace(/p_now \+ interval '21 days'/g, '')));
check('generation never sets any money column', !/weekly_income_cents|goal1_bonus_cents|goal2_bonus_cents/.test(code));
check('migration creates no contract, payout or signing function and no scheduler job', !/insert into public\.sponsor_(contracts|payouts)/i.test(code) && !/cron\.schedule/.test(code) && !/create (or replace )?function public\.(accept|sign|terminate|pay)/i.test(code));
check('migration deletes no player data', !/\bdelete from\b/i.test(code) && !/\bdrop (table|column)\b/i.test(code) && !/\btruncate\b/i.test(code));
check('refuses to run without migrations 01 and 02', /Run 20261122_01_sponsors_foundation\.sql and 20261122_02_sponsor_catalog_main_30\.sql first/.test(sql));
check('generator functions are not callable by players except ensure_my_sponsor_offers', /grant execute on function public\.ensure_my_sponsor_offers\(\) to authenticated/.test(code) && (code.match(/grant execute/g) ?? []).length === 1);
check('config tables closed to players (RLS on, all revoked)', (code.match(/enable row level security/g) ?? []).length === 4 && /revoke all on public\.sponsor_goal_catalog/.test(code));
check('players see only their own companies (catalogue hidden)', /sponsor_companies_select_own/.test(code) && /o\.player_id = auth\.uid\(\)/.test(code));
check('registration trigger is exception-safe', /exception when others then/.test(code) && /after insert on public\.profiles/.test(code));
check('weekly update is idempotent per update period and uses the Bratislava Sunday key', /sponsor_week_key\(p_now\)/.test(code) && /last_fill_week_key >= v_key/.test(code));
check('unexpired offers are kept (only expired ones are touched, only missing ones added)', /expires_at <= p_now/.test(code) && /v_need := greatest\(0, 3 - v_open\)/.test(code));
check('"not twice in a row": last signed company excluded', /c\.id <> v_last/.test(code));
check('scheduler is documented as NOT configured', /SCHEDULER NOTE \(NOT CONFIGURED\)/.test(sql));
// ---- migration 20261122_04 (generator fixes) and transaction safety of all four sponsor migrations
const sql4 = rd('supabase/migrations/20261122_04_sponsor_generator_fixes.sql'); const code4 = nc(sql4);
for (const f of ['01_sponsors_foundation', '02_sponsor_catalog_main_30', '03_sponsor_offer_generator', '04_sponsor_generator_fixes', '05_sponsor_update_guards']) {
  const c = nc(rd(`supabase/migrations/20261122_${f}.sql`));
  check(`migration ${f}: one transaction (begin; ... commit;)`, /^begin;$/m.test(c) && /^commit;\s*$/m.test(c));
}
check('04 refuses without 01-03 and without the calendar table', /Run 20261122_01, _02 and _03 first/.test(sql4) && /public\.tour_schedule .* does not exist/.test(sql4));
check('04 database guards: offers and contracts, serialised per player', /sponsor_offers_company_guard_trg/.test(code4) && /sponsor_contracts_company_guard_trg/.test(code4) && /pg_advisory_xact_lock/.test(code4));
check('04 guard covers valid offer, active contract and last signed firm', /sponsor_company_already_offered/.test(code4) && /sponsor_company_has_active_contract/.test(code4) && /sponsor_same_company_twice/.test(code4));
check('04 guard is by company_id only (main and secondary alike), never by kind', !/c\.kind|o\.kind = new\.kind/.test(code4.slice(code4.indexOf('sponsor_offer_company_guard()'), code4.indexOf('sponsor_contract_company_guard()'))));
check('04 generator excludes ALL active contracts, not only the last signed', /k\.status = 'active'/.test(code4) && /c\.id <> v_last/.test(code4));
check('04 real calendar: tour_schedule + season start, not an estimate from the contract length', /from public\.tour_schedule/.test(code4) && /game_season_one_start/.test(code4) && !/3 \* \(p_weeks/.test(code4));
check('04 no calendar -> nothing generated and no state stored (retry)', /sponsor_reachable_tours\(p_now, 10\) = 0 then return 0/.test(code4));
check('04 existing duplicates: report + dry-run fixer, never delete, owner only', /sponsor_duplicate_report/.test(code4) && /p_apply boolean default false/.test(code4) && !/\bdelete from\b/i.test(code4) && !/\bdrop (table|column)\b/i.test(code4) && !/\btruncate\b/i.test(code4));
check('04 unique active-contract index is created only when no duplicate exists', /duplicate ACTIVE contracts[\s\S]*unique index NOT created/.test(code4) && /create unique index if not exists sponsor_contracts_one_active_per_company/.test(code4));
check('04 does not touch money, contracts data or payouts', !/insert into public\.sponsor_(contracts|payouts)/i.test(code4) && !/weekly_income_cents|goal1_bonus_cents|goal2_bonus_cents/.test(code4.replace(/sponsor_contracts \(player_id/g, '')));
check('04 keeps 21-day validity and no replacement after rejection', /p_now \+ interval '21 days'/.test(code4) && !/reject_my_sponsor_offer/.test(code4));
check('04 helpers are not callable by players', /revoke execute on function public\.sponsor_player_lock/.test(code4) && !/grant execute/i.test(code4));
// ---- migration 20261122_05 (UPDATE guards), order guards, the read-only diagnostic script
const sql5 = rd('supabase/migrations/20261122_05_sponsor_update_guards.sql'); const code5 = nc(sql5);
check('05 refuses without 01-04', /Run 20261122_01, _02, _03 and _04 first/.test(sql5));
check('05 guards UPDATE of offers (player/company/status) and of contracts (status)', /before update on public\.sponsor_offers/.test(code5) && /before update on public\.sponsor_contracts/.test(code5) && /old\.company_id is distinct from new\.company_id/.test(code5) && /old\.status is distinct from new\.status/.test(code5));
check('05 reuses the SAME guard functions (one rule, one lock) and creates no data change', /sponsor_offer_company_guard\(\)/.test(code5) && /sponsor_contract_company_guard\(\)/.test(code5) && !/\b(insert|delete from|update public)\b/i.test(code5.replace(/before update on public/g, '')));
for (const [f, what] of [['01_sponsors_foundation', 'newer'], ['02_sponsor_catalog_main_30', 'newer'], ['03_sponsor_offer_generator', 'older generator'], ['04_sponsor_generator_fixes', '_05']] as const)
  check(`migration ${f}: ORDER GUARD refuses a re-run after a newer migration (${what})`, /ORDER GUARD/.test(rd(`supabase/migrations/20261122_${f}.sql`)) && /must not be run again/.test(rd(`supabase/migrations/20261122_${f}.sql`)));
const allSql = ['01_sponsors_foundation', '02_sponsor_catalog_main_30', '03_sponsor_offer_generator', '04_sponsor_generator_fixes', '05_sponsor_update_guards'].map((f) => nc(rd(`supabase/migrations/20261122_${f}.sql`))).join('\n');
check('none of the five migrations deletes or rewrites player data', !/\bdelete from\b|\btruncate\b|\bdrop table\b|\bdrop column\b/i.test(allSql));
const diag = rd('supabase/diagnostics/sponsors_predeploy_check.sql'); const dcode = nc(diag);
check('diagnostic script is ONE read-only SELECT (no write/DDL keyword, single statement)', !/\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|vacuum|comment)\b/i.test(dcode.replace(/'[^']*'/g, "''").replace(/\$\$[\s\S]*?\$\$/g, '$$$$').replace(/"[^"]*"/g, '""')) && (dcode.match(/;/g) ?? []).length >= 1 && dcode.trim().endsWith(';') && /^\s*with\b/i.test(dcode.trim()));
check('diagnostic script checks the calendar content, not only the table (weeks, version, season start, reach scan)', /tour_schedule/.test(diag) && /week_number/.test(diag) && /game_season_one_start/.test(diag) && /generate_series\(0, 51\)/.test(diag));
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
