# Supabase migrations — 2026-11-14 batch

None of these has been run on the live database yet. Run them by hand in the Supabase
SQL editor (Dashboard → SQL Editor → New query), **in this order**, each file in full:

| # | File | What it does |
|---|------|--------------|
| 1 | `20261114_01_tour_season_registrations.sql` | `season_id_at()` / `current_season_id()`; `tour_registrations.season_id`, new unique key, INSERT policy accepts only the current season |
| 2 | `20261114_02_league_divisions.sql` | `league_divisions`, `league_memberships`, triggers, `assign_my_league_division()`, `division_members` view; places existing accounts |
| 3 | `20261114_03_profiles_lockdown.sql` | Security fix O-007: players may update only `display_name` / `preferred_language`; league guard trigger |

All three are idempotent (safe to re-run). `supabase/schema.sql` already contains the same text
appended after the old schema — use it only for a brand-new database, never on the live one.

Order matters: 02 uses `current_season_id()` from 01; 03 assumes memberships from 02 exist
(profiles.league is then derived from them).

**Deploy the SQL FIRST, then push the code (GitHub Desktop).** The new SQL works with the old
code (old registrations get the current season by column default). The NEW code needs migration
01 (it reads/writes `tour_registrations.season_id`): pushed before the SQL, Tour selection would
show errors until migration 01 has run. Missing 02 only hides the "Rookie 1.x" label and the
"Moja podliga" list (the app falls back to the plain league).

Verify locally (real Postgres 16, run as a non-root OS user such as `postgres`):

    PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/league_divisions.test.sh


## 2026-11-15 — Training V1 E1 (security)

| # | File | What it does |
|---|------|--------------|
| 4 | `20261115_01_training_security.sql` | `training_plans` read-only for clients + `save_my_training_plan()`; `process_my_due_training()` / internal apply; `riders` locked down (no client writes, public columns only, 1-5 estimates via `my_rider_estimates()`); `create_my_starter_rider()`, admin-only `admin_generate_ai_riders()` / `admin_list_riders()`; `rider_training_progress` closed |

Run AFTER 01-03, whole file, idempotent. **Deploy the SQL, then push the code within minutes**: the
old code can no longer write `riders`/`training_plans`, the new code needs the new functions.
Verify locally: `PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/training_security.test.sh` (run as `postgres`).

| 5 | `20261115_02_training_calendar_rules.sql` | Approved planning rules: next-week planning (Sunday 24:00 UTC), confirmed plan final, week 1 prep / week 10 closed, no training in a Tour week (both directions, race-free), `tour_schedule` table |

Run 04 first (if not yet applied), then 05. 04 is never edited once applied; 05 only replaces/adds objects. Deploy the SQL, then push the code
(old code would still try to overwrite plans / does not know the new refusal reasons).

## 2026-11-15 — Vývoj jazdca (development tracking)

| # | File | What it does |
|---|------|--------------|
| 6 | `20261115_03_rider_development_tracking.sql` | `rider_acquisitions` (immutable baseline snapshot of the 19 public attributes) + `rider_attribute_history` (one row per real change, Premium-only read) + trigger `riders_track_development`; existing riders get a `tracking_start` baseline = current state |

Needs 04 (`20261115_01`) already applied (uses `season_id_at` / `season_week_at`); does NOT need 05. Whole file, idempotent, additive, never changes or deletes
riders/plans. Either deploy order is safe: without the SQL the new card simply does not render. Verify locally:
`PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/rider_development.test.sh` (as `postgres`).

## 2026-11-16 — Rider contracts V1 + career history

| 7 | `20261116_01_rider_contracts.sql` | `rider_contracts` (10 game weeks, exact `expires_at`), `rider_career_events`, league + sub-league frozen in `rider_acquisitions`, internal `start_rider_contract_internal()` (no client access; no purchase function exists yet, so nothing creates contracts today), `my_rider_contract()`, prepared-but-INACTIVE `purge_unsold_young_market_riders()` (dry run, not called, not granted) |
| 8 | `20261116_02_market_purchase_and_swap.sql` | market purchase = reservation (`reserved`), `rider_swaps` (one pending per manager / per market rider), weekly swap at Monday 00:00 UTC, riders third state `on_market`, permanent `market_riders.acquired_rider_id` link, `league_rider_limits` (all NULL), `rider_swap_settings` (**OFF by default**), `reserve_market_rider()`, `process_due_rider_swaps()`, `my_pending_swap()`, `process_season_aging()` patched (no double aging) |

Run AFTER 20261115_03 (which is itself still waiting to be applied), whole file, idempotent, additive: changes no rider data, deletes nothing.
The app code is safe before and after: without the migration the Kontrakt/História tabs show their empty line.
Verify locally: `PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/rider_contracts.test.sh` (run as `postgres`).

Migration 8 runs AFTER 20261116_01, whole file, idempotent, additive: deletes nothing and is OFF until `update public.rider_swap_settings set enabled = true`.
Verify locally: `PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/rider_swaps.test.sh` (as `postgres`).


## 2026-11-16 — Bike frame + wheels condition (NOT yet run)

| File | What it does |
|------|--------------|
| `20261116_03_bike_frame_wheels.sql` | Adds `bike_condition.frame` / `.wheels` (0-100, default 100 = new). Additive, idempotent, no UPDATE of existing values. The app works with or without it (dash until run). |

## 2026-11-16 — League standings (NOT yet run)

| File | What it does |
|------|--------------|
| `20261116_04_league_standings.sql` | `profiles.country_code`, `league_points` (manager + season + sub-league, unique per stage), `league_ms_status`, SECURITY DEFINER read functions `league_standing_managers/points/seasons` (public game data only). Idempotent. The app works without it (only the own manager, zero, dashes). |


## 2026-11-17 — Development V2, OVR F4, Rider State 1.0 (NOT RUN; run in this order)
| File | What it does |
|---|---|
| `20261117_01_development_model_v2.sql` | development model V2 (switch `development_model_settings`, default OFF) |
| `20261117_02_ovr_f4.sql` | `rider_overall_rating()` = model F4 (only the function body) |
| `20261117_03_rider_state_model.sql` | rider state: coefficients, continuous (time-proportional) Energy/Fatigue regeneration catch-up, Fitness/Form, history, Race Engine load interface, transfer carries the state (switch `rider_state_settings`, default OFF) |
| `20261117_04_training_plans_calendar.sql` | one calendar (odd weeks training, even race weeks, Tours 2/4/6/8/10, configurable season start `game_calendar_settings`), seven training plans with ONE shared progress budget, plan window Monday 18:00 UTC, training sessions in the state catch-up (Full Tue/Thu/Sat, Basic Tue/Fri 12:00 UTC), `league_race_days`, read-only `calendar_v2_conflicts()`, late stages deferred (never credited to another week), finished catch-up (`rider_state_catch_up_complete/many`); the Tour weeks move ONLY with `activate_game_calendar_v2()` (switches stay OFF; needs 01 + 03 first) |
Tests: `supabase/tests/development_v2.test.sh`, `ovr_f4.test.sh`, `rider_state.test.sh`, `rider_swaps_state.test.sh`, `training_plans_calendar.test.sh` (run as a non-root OS user).


## 2026-11-19 — Market start: hidden values closed (O-011) + 100 launch riders (NOT RUN)
| File | What it does |
|---|---|
| `20261119_01_market_hidden_columns_A.sql` | **Part A** — adds `market_riders.potential_stars` (database-computed 1-5 bucket) and the admin function `admin_market_riders(season)`. Changes no data, revokes nothing; safe BEFORE the code. |
| `20261119_02_market_hidden_columns_B.sql` | **Part B** — run ONLY after A and after the new code is deployed (green Vercel build). Players may then read only the public columns + `potential_stars`. Refuses to run when A is missing. |
| `20261119_03_market_hidden_columns_ROLLBACK.sql` | Only if needed: gives the old SELECT right back (undoes B). |
| `../seeds/20261119_launch_market_100.sql` | Seed (not a migration): exactly 100 new free riders, OVR 69–75 by the real F4 formula, age 17–20, Skúsenosti 1–20 of 200. Idempotent (fixed ids), verifies itself, rolls back on any mismatch. |
| `../diagnostics/` + deletion script (delivered separately) | Backup + removal of exactly the 45 old `starter-v1` test riders — run LAST, only after the Trh shows the new riders. |

Order: **A → deploy code → B → seed (100 riders) → check the Trh → deletion of the 45 old riders (with the checksum pasted in).**
Verify locally: `PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/market_launch.test.sh` (as `postgres`).
