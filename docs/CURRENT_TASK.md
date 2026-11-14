# CURRENT_TASK

## Status (2026-11-14)
Leagues & sub-leagues V1 implemented (uncommitted until the owner commits via GitHub Desktop). World Championships (MS) are an APPROVED CONCEPT only — see DECISIONS C-015..C-021, GAME_DESIGN §11; not implemented.

## Done today
- Dashboard layout, compact top bar (next Tour / page title, season+week, bell, language, profile menu), calendar card with 10-week axis + Tour 1..3 slots.
- Tour schedule = weekly template for every season; `tour_registrations.season_id` (migration at end of schema.sql — already needed before deploy of that change).
- Sub-leagues: `league_divisions`, `league_memberships`, `assign_my_league_division(season_id)`, `division_members` view. Real "Rookie 1.1" in top bar profile menu and dashboard standings card; Rankings → tab "Moja podliga" (members only, no points/ranks).
- Started Tours cannot be joined (state `started`).

## MUST deploy (Supabase SQL editor), in this order
1. last block of `supabase/schema.sql` titled "Tour schedule as a weekly template + per-season registrations" (adds tour_registrations.season_id).
2. `supabase/migrations/20261114_league_divisions.sql` (same text is appended to schema.sql). Idempotent. Without it the app degrades: no sub-league label, Rankings tab shows "not placed yet".

## Tests
- `npx tsx` on every `*.test.ts` (web) — all pass.
- SQL (real Postgres, concurrency): `PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/league_divisions.test.sh` (needs non-root OS user) — 44 checks pass.

## Not wired / open
- No promotion/relegation, inactivity rules, scoring, tie-breaks, cron, MS (DECISIONS O-006).
- `profiles.league` is player-updatable under RLS (O-007) — must become server-only.
- Existing accounts get joined_season_id 'season-1' (placeholder; progress reset before launch).
- Sidebar is not responsive on mobile; bell has no notification system.
