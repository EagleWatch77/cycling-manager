# Manual deployment — Market start (step by step, slowly)

Rule: after each step stop, check, and only then continue. Nothing here runs by itself. Run SQL in Supabase → SQL Editor.
**Back up first** (Supabase → Database → Backups, or a manual dump) before step 1.

| # | Step | What it does | Check | Rollback |
|---|------|--------------|-------|----------|
| 1 | Run `supabase/migrations/20261119_01_market_hidden_columns_A.sql` | adds star function/column + admin function. Changes no data, revokes nothing | Trh and the game still work as before | nothing to undo (additive) |
| 2 | Commit + push the ZIP contents with GitHub Desktop (text below) → Vercel builds | new code: 1–200 radar, permanent market, public columns only | Vercel build is GREEN; open /transfers and /rider | revert the commit in GitHub Desktop |
| 3 | Run `…_02_market_hidden_columns_B.sql` (ONLY after step 2 is green) | players can no longer read hidden values of market riders | /transfers still lists riders; admin market page shows hidden values | `…_03_…ROLLBACK.sql` |
| 4 | Run `…_04_dev_cap_s1_youth_floor_o5.sql` (working model S1+O5) | training uses the new cap + youth floor from the next processed week. No stored data changes | open the training page; plan can still be saved | re-run the function `apply_development_plan_v2` from `20261117_04_training_plans_calendar.sql` |
| 5 | Run `supabase/seeds/20261119_launch_market_100.sql` | inserts exactly 100 new free riders (idempotent, self-checking, rolls back on mismatch). Message "launch market OK: 100 riders" | Trh shows the new riders (OVR 69–75, age 17–20) | none needed; they are normal available rows |
| 6 | Run `supabase/diagnostics/market_launch/01_stare_trhove_kontrola.sql` | read-only check of the 45 old riders | expected count 45, checksum f8830b1336a1a3a025dccac1619b5d13 | — |
| 7 | LAST: run `…/02_stare_trhove_zaloha_a_zmazanie.sql` | backs up then deletes exactly the 45 old `starter-v1` riders in one transaction; aborts if count/checksum differ | Trh shows only the new riders | `…/03_obnovenie_zo_zalohy_AK_TREBA.sql` |

Notes
- Steps 4 and 2 belong together: the TypeScript model (code) and SQL (migration 04) must be the same; do step 4 right after step 2/3.
- S1+O5 is a WORKING balance. The ×1,5 Experience/Tactics growth is not part of it.
- Existing riders and their histories are not changed by any step. Potential stars of existing riders may display differently (new bands), data stay the same.
- The admin "reset" of the current season deletes never-owned available riders of that season (including the new 100) — returned, reserved and owned riders are protected.
