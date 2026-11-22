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

check('rules: at most 3 main offers, 21 days', MAX_OFFERS.main === 3 && OFFER_VALID_DAYS === 21);
// the generator is server-side SQL, called from the server component, never from the browser
check('repository calls ensure_my_sponsor_offers on the server before reading', /rpc\('ensure_my_sponsor_offers'\)/.test(repo) && repo.indexOf("ensure_my_sponsor_offers") < repo.indexOf("from('sponsor_offers')"));
check('repository is server-only', /import 'server-only'/.test(repo));
check('a missing function (migration not run) is quiet, a generator error never breaks the page', /'42883'/.test(repo) && /console\.error\(`\[sponsors\] generator failed/.test(repo));
check('market lists main offers only (query + page filter)', /\.eq\('kind', 'main'\)\.eq\('status', 'open'\)/.test(repo) && /filter\(\(o\) => o\.kind === 'main'\)/.test(page));
check('counter is x / 3 main offers', /MAX_OFFERS\.main/.test(page) && !/MAX_OFFERS\.total/.test(page));
check('no catalogue on the page, no type filter, no secondary market', !/SponsorCatalog|getMainSponsorCatalog|sp\.filter|type=/.test(page));
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
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
