# Current task
Training V1 / E1 (security) implemented, awaiting deployment + owner review (2026-11-15).
- SQL: supabase/migrations/20261115_01_training_security.sql (also appended to schema.sql). NOT run on production.
- DB tests (real Postgres): supabase/tests/training_security.test.sh (+ league_divisions.test.sh still green).
- Open: decisions D1-D14 (docs/TRAINING_AUDIT.md §5.5) not approved; O-011 market hidden values; O-012 remaining direct writes.
- Next after deploy: E2 (authoritative processing order/history), E3 (pg_cron) — only after D3/D8 approved.
