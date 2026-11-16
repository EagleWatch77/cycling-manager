-- ============================================================================
-- Bike condition: frame + wheels (Domov "Môj bicykel", docs/DECISIONS.md C-062).
--
-- NOT YET RUN on the live database - review first, then run by hand in the
-- Supabase SQL editor. Whole file, idempotent, additive.
--
-- Convention is UNCHANGED: like tires / brakes / drivetrain these two columns
-- store CONDITION (100 = new = 0 % wear; 0 = fully worn). The app shows
-- state = condition and wear = 100 - condition.
--
-- What it does
--   * adds bike_condition.frame and bike_condition.wheels (int 0-100, NOT NULL,
--     DEFAULT 100): every NEW bike starts with a new frame and new wheels
--     (0 % wear).
--   * rows that already exist get 100 for these two NEW columns only (frame and
--     wheels were never tracked before, so there is no real value to lose).
--
-- What it does NOT do
--   * it does not touch tires / brakes / drivetrain of any existing bike
--     (no UPDATE statement at all), nor any other table;
--   * it does not change wear processing, service prices or any RLS policy
--     (the existing row-level policies already cover the new columns);
--   * nothing in the code requires this migration to be run first: until it is,
--     the app shows a dash for frame and wheels instead of an invented value.
-- ============================================================================

alter table public.bike_condition
  add column if not exists frame  int not null default 100 check (frame  between 0 and 100),
  add column if not exists wheels int not null default 100 check (wheels between 0 and 100);

comment on column public.bike_condition.frame  is 'Frame condition 0-100 (100 = new, wear = 100 - condition).';
comment on column public.bike_condition.wheels is 'Wheels condition 0-100 (100 = new, wear = 100 - condition).';
