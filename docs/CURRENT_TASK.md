# Current task
Training V1: E1 security + approved planning rules implemented, awaiting deployment (2026-11-15). Nothing applied to production.
- SQL (run in order, each idempotent, whole file): 20261115_01_training_security.sql (E1, if not yet applied) then 20261115_02_training_calendar_rules.sql. Both are also appended to schema.sql.
- Rules: docs/DECISIONS.md C-039. Approved but NOT implemented designs (daily training, regeneration, Premium scouting, Rookie limits, contracts, season transition): C-040 / GAME_DESIGN.
- Tests: supabase/tests/training_security.test.sh (real Postgres), league_divisions.test.sh, web tests.
- Open: D4, D7, D8 (background mechanism), D9, D10, D12-D14; O-011 market hidden values; O-012 remaining direct writes (bike_condition, tour_registrations delete limits, starter generation).
- Next only after approval: daily training block (needs D8), regeneration, scouting, contracts, season transition.
- 2026-11-15: "Posledné tréningy" card removed from Tréning (C-041); history stays in DB. UI-only change.
- 2026-11-15: Tréning UI: removed locked-note text and the Energia/Únava/Pripravenosť strip, lock icon added to the confirmed card (C-042). UI-only.
