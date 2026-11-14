# CURRENT_TASK

## Status (2026-11-14)
Leagues & sub-leagues V1 implemented (uncommitted until the owner commits via GitHub Desktop). World Championships (MS) are an APPROVED CONCEPT only — see DECISIONS C-015..C-021, GAME_DESIGN §11; not implemented.

## Done today
- Dashboard layout, compact top bar (next Tour / page title, season+week, bell, language, profile menu), calendar card with 10-week axis + Tour 1..3 slots.
- Tour schedule = weekly template for every season; `tour_registrations.season_id` (migration at end of schema.sql — already needed before deploy of that change).
- Sub-leagues: `league_divisions`, `league_memberships`, `assign_my_league_division(season_id)`, `division_members` view. Real "Rookie 1.1" in top bar profile menu and dashboard standings card; Rankings → tab "Moja podliga" (members only, no points/ranks).
- Started Tours cannot be joined (state `started`).

## MUST deploy (Supabase SQL editor, in order) — see supabase/migrations/README.md
1. `supabase/migrations/20261114_01_tour_season_registrations.sql`
2. `supabase/migrations/20261114_02_league_divisions.sql`
3. `supabase/migrations/20261114_03_profiles_lockdown.sql` (security fix O-007)
Idempotent. `schema.sql` holds the same text for fresh databases only.

## Tests
- `npx tsx` on every `*.test.ts` (web) — all pass.
- SQL (real Postgres, concurrency): `PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/league_divisions.test.sh` (needs non-root OS user) — 84 checks: A = production schema + legacy rows + 3 migrations (twice), B = fresh schema.sql, catalogs equal; placement, concurrency, security).

## Not wired / open
- No promotion/relegation, inactivity rules, scoring, tie-breaks, cron, MS (DECISIONS O-006).
- O-007 fixed in migration 03 (deploy it). O-008: other tables are owner-writable under RLS (riders, bike_condition, training_plans, tour_registrations) — needs hardening.
- Sub-league balancing at season end = approved concept only (C-027); activity definition (28 days?) NOT approved (P-005).
- Existing accounts get joined_season_id 'season-1' (placeholder; progress reset before launch).
- Sidebar is not responsive on mobile; bell has no notification system.
