# Manual deployment — Market start (step by step, slowly)

Rule: after each step stop, check, and only then continue. Nothing here runs by itself. Run SQL in Supabase → SQL Editor.
**Back up first** (Supabase → Database → Backups, or a manual dump) before step 1.

| # | Step | What it does | Check | Rollback |
|---|------|--------------|-------|----------|
| 0 | Run `supabase/diagnostics/market_launch/00_predeploy_kontrola_LEN_CITANIE.sql` (read-only) | verifies OVR F4 (probe rider must give 102), the V2 functions (migrations 20261117_01..04), switches, counts | no row with status `CHYBA`; send me the result | — (changes nothing) |
| 1 | Run `supabase/migrations/20261119_01_market_hidden_columns_A.sql` | adds star function/column + admin function. Changes no data, revokes nothing | Trh and the game still work as before | nothing to undo (additive) |
| 2 | Commit + push the ZIP contents with GitHub Desktop (text in `docs/COMMIT_trh_start.txt`) → Vercel builds | new code: 1–200 radar, permanent market, public columns only, old admin generator OFF, exact reset count | Vercel build is GREEN; open /transfers, /rider, /admin/market | revert the commit in GitHub Desktop |
| 3 | Run `…_02_market_hidden_columns_B.sql` (ONLY after step 2 is green) | players can no longer read hidden values of market riders | /transfers still lists riders; admin market page shows hidden values | see "If something goes wrong with B" below |
| 4 | Run `…_04_dev_cap_s1_youth_floor_o5.sql` (working model S1+O5) | training uses the new cap + youth floor from the next processed week. No stored data changes | open the training page; plan can still be saved | `…_05_dev_cap_s1_youth_floor_o5_ROLLBACK.sql` (small, one function) + revert the code commit |
| 5 | Run `supabase/seeds/20261119_launch_market_100.sql` | inserts exactly 100 new free riders (idempotent, self-checking, rolls back on mismatch). Message "launch market OK: 100 riders" | Trh shows the new riders (OVR 69–75, age 17–20) | none needed; they are normal available rows |
| 6 | Run `…/market_launch/01_stare_trhove_kontrola.sql` | read-only check of the 45 old riders | expected count 45, checksum f8830b1336a1a3a025dccac1619b5d13 | — |
| 7 | LAST: run `…/02_stare_trhove_zaloha_a_zmazanie.sql` | backs up then deletes exactly the 45 old `starter-v1` riders in one transaction; aborts if count/checksum differ | Trh shows only the new riders | `…/03_obnovenie_zo_zalohy_AK_TREBA.sql` |

## If something goes wrong with B (read this before step 3)
- **`20261119_03_market_hidden_columns_ROLLBACK.sql` gives players the right to read ALL columns of `market_riders` again — including the hidden Potential, Trainability, Professionalism and Recovery.** While it is in place, any logged-in player can read the hidden values of every market rider (the leak that B closes). Use it only as an emergency switch, and only for as long as needed.
- Safe procedure: (1) first check whether the problem is really B (does /transfers fail with "permission denied for table market_riders"? is the deployed code the NEW one from step 2?). The most common cause is OLD code still running (Vercel build not finished/green) — then wait for/redeploy the new code instead of rolling back. (2) If B must be rolled back, run the ROLLBACK file, tell me, and keep the market closed to players if you can (the Trh page is the only place the leak is reachable from a browser). (3) Fix the code, deploy it, check /transfers, then run B again. (4) After B is run again, run step 0 once more: row "migrácia B" must say that the hidden columns are closed.
- Never run the ROLLBACK and then forget it: step 0 shows "B ešte NIE JE spustená" while the hidden values are readable.

## S1+O5 rollback (step 4)
`…_05_…_ROLLBACK.sql` is small (restores one function, drops one helper) and changes no data. Attributes already gained stay (training never lowers attributes). After it, revert the code commit so that the TypeScript model matches (cap slope 1.25, no youth floor).

Notes
- Steps 4 and 2 belong together: the TypeScript model (code) and SQL (migration 04) must be the same; do step 4 right after step 2/3.
- S1+O5 is a WORKING balance. The ×1,5 Experience/Tactics growth is not part of it.
- Existing riders and their histories are not changed by any step. Potential stars of existing riders may display differently (new bands), data stay the same.
- The old admin generator ("Vygenerovať market pool") is OFF; the admin reset deletes only never-owned available riders of the shown season (the exact number is in the button). The new 100 riders count as never-owned until someone buys them.
