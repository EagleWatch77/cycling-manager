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
