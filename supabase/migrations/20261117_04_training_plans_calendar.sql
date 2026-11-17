-- ============================================================================
-- Migration 20261117_04 — Training plans (seven plans, shared progress budget, sessions) + ONE game calendar. PREPARED, NOT RUN.
--
-- Run only after the owner approves, AFTER 20261117_01, _02 and _03 (it replaces functions of _01 and _03 by CREATE OR REPLACE; those files are not edited).
-- Idempotent. Deletes nothing: no plan, registration, rider or result is removed or rewritten.
-- New training behaviour stays behind the EXISTING switches (development_model_settings, rider_state_settings: both default OFF); the calendar
-- part (section 2) is global and takes effect when this migration runs.
--
--  1. The season start becomes ONE setting (public.game_calendar_settings), read by every calendar function (no date inside the calculations any more).
--  2. ONE calendar for every season: odd weeks = training weeks, even weeks = race weeks; Tours in weeks 2/4/6/8/10; stages per league 3/4/4/4/5.
--     Existing test data (seasons 1-2) is NOT modified; a read-only report lists what the new calendar touches (see calendar_v2_conflicts()).
--  3. Plan window: a plan for training week W is chosen / changed from Monday 18:00 UTC of week W-1 until Monday 18:00 UTC of week W.
--  4. Progress of a training week: ONE shared budget spread 58 / 18 / 14 / 10 % (main / supplementary / other performance / other technique).
--  5. Sessions: Full = Tue, Thu, Sat; Basic = Tue, Fri; 12:00 UTC; equal parts of the weekly load (Full 30 E / 22 F, Basic 18 E / 13.2 F), individual
--     coefficients at every session, applied by the existing chronological Rider State loop (regeneration continuous, every item applied once).
--  6. A very long offline period never skips items: one pass is limited, the state is saved at the cursor and the next call continues.
-- Mirrors apps/web/src/lib/{calendar,training/development,training/state}/*.ts; supabase/tests/training_plans_calendar.test.sh compares both.
-- ============================================================================

-- ---- 1. the season start: ONE setting ----------------------------------------------------------------------
create table if not exists public.game_calendar_settings (
  id               boolean primary key default true check (id),
  season_one_start date not null check (extract(isodow from season_one_start) = 1),   -- a Monday
  changed_at       timestamptz not null default now()
);
insert into public.game_calendar_settings (id, season_one_start) values (true, date '2026-08-17') on conflict (id) do nothing;
alter table public.game_calendar_settings enable row level security;
revoke all on public.game_calendar_settings from public, anon, authenticated;

-- To move the start: update public.game_calendar_settings set season_one_start = date 'YYYY-MM-DD', changed_at = now();   (and SEASON_ONE_START in
-- apps/web/src/lib/calendar/season.ts; a test compares the two). Nothing else has to change.
create or replace function public.game_season_one_start()
returns date language sql stable security definer set search_path = public as $$
  select coalesce((select season_one_start from public.game_calendar_settings where id), date '2026-08-17');
$$;
revoke all on function public.game_season_one_start() from public, anon;
grant execute on function public.game_season_one_start() to authenticated;

-- the calendar functions of the earlier migrations, now reading the setting (they were IMMUTABLE with the date inside)
create or replace function public.season_id_at(p_at timestamptz)
returns text language sql stable as $$
  select 'season-' || (greatest(0, floor(((p_at at time zone 'utc')::date - public.game_season_one_start())::numeric / 70)) + 1)::int;
$$;
create or replace function public.season_week_at(p_at timestamptz)
returns int language sql stable as $$
  select (mod(greatest(0, (p_at at time zone 'utc')::date - public.game_season_one_start()), 70) / 7) + 1;
$$;
create or replace function public.game_week_index(p_at timestamptz)
returns int language sql stable as $$
  select (greatest(0, (p_at at time zone 'utc')::date - public.game_season_one_start()) / 7)::int;
$$;
create or replace function public.contract_expiry_at(p_start timestamptz, p_weeks int default 10)
returns timestamptz language sql stable as $$
  select ((public.game_season_one_start() + (public.game_week_index(p_start) + p_weeks) * 7)::timestamp at time zone 'utc');
$$;
create or replace function public.training_plannable_week(p_at timestamptz)
returns int language sql stable as $$
  select case when public.season_week_at(p_at) >= 10 then null else public.season_week_at(p_at) + 1 end;
$$;
create or replace function public.training_plan_is_due(p_season_id text, p_week int, p_at timestamptz)
returns boolean language sql stable as $$
  select coalesce(public.season_number_of(p_season_id), 0) >= 1
     and p_week between 1 and 10
     and (
       public.season_number_of(p_season_id) < public.season_number_of(public.season_id_at(p_at))
       or (public.season_number_of(p_season_id) = public.season_number_of(public.season_id_at(p_at))
           and p_week < public.season_week_at(p_at))
     );
$$;

-- season change (the 20261117_01 version, with the season start taken from the setting)
create or replace function public.process_season_aging()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_anchor            date := public.game_season_one_start(); -- the ONE configurable season start
  v_season_length_days int  := 70;                -- SEASON_LENGTH_DAYS
  v_days_since_start  int;
  v_current_season    int;
  v_last_processed    int;
  v_season_number     int;
  v_season_id         text;
  v_season_start      date;
  v_next_season_start date;
  v_claimed_id        text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_days_since_start := greatest(0, current_date - v_anchor);
  v_current_season := floor(v_days_since_start::numeric / v_season_length_days) + 1;

  select coalesce(max(season_number), 0) into v_last_processed from public.season_transition_processing;

  for v_season_number in (v_last_processed + 1)..(v_current_season - 1) loop
    v_season_id := 'season-' || v_season_number;
    v_season_start := v_anchor + (v_season_number - 1) * v_season_length_days;
    v_next_season_start := v_season_start + v_season_length_days;

    insert into public.season_transition_processing (season_id, season_number)
    values (v_season_id, v_season_number)
    on conflict (season_id) do nothing
    returning season_id into v_claimed_id;

    if v_claimed_id is not null then
      update public.riders set age = age + 1 where created_at < v_next_season_start;

      -- Development model V2 (only while the switch is ON): offseason recovery + Vitality decline for the riders just aged.
      if public.development_model_enabled() then
        perform public.apply_development_season_start(r.id) from public.riders r where r.created_at < v_next_season_start;
      end if;

      update public.market_riders set age = age + 1
      where generated_at < v_next_season_start and status = 'available' and acquired_rider_id is null;

      -- Returned riders: copy the aged identity, keep them in the current season's pool.
      update public.market_riders m
         set age = r.age, season_id = 'season-' || v_current_season
        from public.riders r
       where m.acquired_rider_id = r.id and m.status = 'available' and r.on_market;
    end if;
  end loop;
end;
$$;

revoke all on function public.process_season_aging() from public;
grant execute on function public.process_season_aging() to authenticated;

-- ---- 2. ONE calendar: week kinds, Tours, stages per league -------------------------------------------------
create or replace function public.game_week_kind(p_week int)
returns text language sql immutable as $$ select case when p_week % 2 = 1 then 'training' else 'race' end; $$;
grant execute on function public.game_week_kind(int) to authenticated;

-- Tour weeks: 2 Highlands, 4 Danube, 6 Coastal, 8 Northern Crown, 10 Silver Horizon (mirror of data/tourSchedule.ts; same for every season).
-- Only the WEEK of each Tour changes; no registration or plan row is touched.
insert into public.tour_schedule (tour_id, week_number) values
  ('highlands-tour', 2), ('danube-tour', 4), ('coastal-tour', 6), ('northern-crown-tour', 8), ('silver-horizon-tour', 10)
on conflict (tour_id) do update set week_number = excluded.week_number;

-- stage days of a race week per league (0 = Monday .. 6 = Sunday); their number is the number of stages (mirror of LEAGUE_RACE_DAYS in lib/leagues.ts)
create or replace function public.league_race_days(p_league text)
returns int[] language sql immutable as $$
  select case p_league when 'rookie' then array[0,2,4] when 'amateur' then array[0,1,3,4] when 'continental' then array[0,1,3,4]
                       when 'pro' then array[0,1,3,4] when 'elite' then array[0,1,2,3,4] end;
$$;
grant execute on function public.league_race_days(text) to authenticated;

-- READ-ONLY report of what the new calendar touches in existing (test) data. Works before and after this migration. Not granted to clients:
-- run it as the database owner (select * from public.calendar_v2_conflicts();). Nothing is changed by it, and nothing is deleted automatically.
create or replace function public.calendar_v2_conflicts()
returns table (kind text, rider_id uuid, season_id text, week_number int, detail text)
language sql stable security definer set search_path = public as $$
  with old_t(tour_id, w) as (values ('highlands-tour', 2), ('danube-tour', 5), ('coastal-tour', 5), ('northern-crown-tour', 7), ('silver-horizon-tour', 9)),
       new_t(tour_id, w) as (values ('highlands-tour', 2), ('danube-tour', 4), ('coastal-tour', 6), ('northern-crown-tour', 8), ('silver-horizon-tour', 10))
  select 'registration_moves_to_another_week', r.rider_id, r.season_id, n.w, r.tour_id || ': week ' || o.w || ' -> week ' || n.w
    from public.tour_registrations r join old_t o on o.tour_id = r.tour_id join new_t n on n.tour_id = r.tour_id where o.w <> n.w
  union all
  select 'unprocessed_plan_in_a_race_week', tp.rider_id, tp.season_id, tp.week_number, 'week ' || tp.week_number || ' is a race week; the plan is kept but a V2 plan cannot be created there'
    from public.training_plans tp where tp.applied_at is null and tp.week_number % 2 = 0
  union all
  select 'plan_collides_with_new_tour_week', tp.rider_id, tp.season_id, tp.week_number, r.tour_id || ' now runs in the week of this plan'
    from public.training_plans tp join public.tour_registrations r on r.rider_id = tp.rider_id and r.season_id = tp.season_id
    join new_t n on n.tour_id = r.tour_id and n.w = tp.week_number;
$$;
revoke all on function public.calendar_v2_conflicts() from public, anon, authenticated;

do $$ declare n int; begin
  select count(*) into n from public.calendar_v2_conflicts();
  if n > 0 then raise notice 'calendar_v2_conflicts(): % rows - nothing was changed or deleted; review them with: select * from public.calendar_v2_conflicts();', n; end if;
end $$;

-- ---- 3. plan window: Monday 18:00 UTC ------------------------------------------------------------------------
-- The training week a plan saved at p_at is for: the week that contains (p_at - 18 h + 7 days). No row = that week is a race week (nothing to plan).
create or replace function public.training_target_week(p_at timestamptz)
returns table (season_id text, week_number int) language sql stable as $$
  select public.season_id_at(x.t), public.season_week_at(x.t)
    from (select p_at - interval '18 hours' + interval '168 hours' as t) x
   where public.game_week_kind(public.season_week_at(x.t)) = 'training';
$$;
grant execute on function public.training_target_week(timestamptz) to authenticated;

-- sessions of a V2 plan (0 = Monday): Full Tue/Thu/Sat, Basic Tue/Fri, at 12:00 UTC (mirror of STATE_CONFIG.training.sessionDays)
create or replace function public.rst_session_days(p_mode text)
returns int[] language sql immutable as $$ select case p_mode when 'full' then array[1,3,5] else array[1,4] end; $$;

-- average readiness measured just before the sessions of the week (efficiency of the week's progress) and the number of sessions done
alter table public.training_plans add column if not exists readiness_sum float8 not null default 0;
alter table public.training_plans add column if not exists readiness_n   int    not null default 0;

-- saving a plan: the open window only; the plan can be changed until the deadline, never after it, never once processed
create or replace function public.save_my_development_plan(p_plan_id int, p_mode text)
returns public.training_plans
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rider uuid;
  v_now timestamptz := clock_timestamp();
  v_season text;
  v_week int;
  v_row public.training_plans;
  v_lead text[] := array['climbing','sprint','timeTrial','hills','flat','endurance','endurance'];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.development_model_enabled() then raise exception 'model_disabled'; end if;
  select id into v_rider from public.riders where player_id = v_uid;
  if v_rider is null then raise exception 'no_rider'; end if;
  if p_plan_id is null or p_plan_id not between 0 and 6 or p_mode is null or p_mode not in ('basic', 'full') then
    raise exception 'invalid_focus';
  end if;

  select t.season_id, t.week_number into v_season, v_week from public.training_target_week(v_now) t;
  if v_week is null then raise exception 'no_plannable_week'; end if;

  perform pg_advisory_xact_lock(hashtextextended('training-tour:' || v_rider::text, 0));
  if exists (
    select 1 from public.tour_registrations r join public.tour_schedule s on s.tour_id = r.tour_id
    where r.rider_id = v_rider and r.season_id = v_season and s.week_number = v_week
  ) then raise exception 'tour_conflict'; end if;

  -- week_type/focus/intensity keep their V1 constraints (placeholders describing the plan); plan_id + mode are the real input.
  insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity, plan_id, mode)
  values (v_rider, v_season, v_week, 'performance', v_lead[p_plan_id + 1], case p_mode when 'full' then 'hard' else 'normal' end, p_plan_id, p_mode)
  on conflict (rider_id, season_id, week_number) do update
    set week_type = 'performance', focus = excluded.focus, intensity = excluded.intensity, plan_id = excluded.plan_id, mode = excluded.mode, updated_at = now()
    where public.training_plans.applied_at is null
  returning * into v_row;
  if v_row.id is null then raise exception 'already_processed'; end if;
  return v_row;
end;
$$;
revoke all on function public.save_my_development_plan(int, text) from public, anon, authenticated;
grant execute on function public.save_my_development_plan(int, text) to authenticated;

-- ---- 4. weekly progress: ONE shared budget (58 / 18 / 14 / 10 %) -----------------------------------------------
create or replace function public.apply_development_plan_v2(p_plan_id uuid)
returns table(primary_gain int, secondary_gain int, already_processed boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  -- ---- constants: mirror DEV_CONFIG (development/config.ts); the weekly progress is ONE shared budget (58/18/14/10 %) ----
  c_threshold constant float8 := 12;      c_max constant float8 := 200;
  c_budget constant float8 := 93.72;
  c_sh_main constant float8 := 0.58;      c_sh_supp constant float8 := 0.18;   c_sh_op constant float8 := 0.14;   c_sh_ot constant float8 := 0.10;
  c_ratio_main constant float8[] := array[1.15, 0.95, 0.75]; c_ratio_supp constant float8[] := array[0.85, 0.45];
  c_tech_all constant text[] := array['descending','bikeHandling','cornering','packRiding','wetHandling','roughSurface'];
  c_tech_weekly_max constant int := 4;
  c_w_tr constant float8 := 0.30;         c_w_pr constant float8 := 0.15;      c_gmin constant float8 := 0.6; c_gmax constant float8 := 1.5;
  c_cap_base constant float8 := 80;       c_cap_slope constant float8 := 1.25; c_cap_exp constant float8 := 2;
  c_soft_off constant float8 := 10;       c_soft_w constant float8 := 7;
  c_room_tech_span constant float8 := 60; c_room_tech_min constant float8 := 0.1;
  c_rec_day_e constant float8 := 5;       c_rec_day_f constant float8 := 4;    c_rec_base constant float8 := 0.75; c_rec_slope constant float8 := 0.5;

  v_applied timestamptz; v_rider uuid; v_season text; v_week int; v_plan int; v_mode text;
  v_owner uuid; v_age int; v_attrs jsonb; v_cond jsonb; v_shape text; v_apt jsonb; v_aptv float8; v_techcap float8;
  c_apt_phys constant float8 := 30; c_tech_cap_base constant float8 := 160; c_tech_cap_spread constant float8 := 40;
  v_po float8; v_tr float8; v_pr float8; v_rec float8;
  v_league text; v_is_admin boolean; v_league_cap int; v_team_cap int; v_cap int; v_tl int; v_rl int; v_tcl int; v_etl int; v_erl int;
  v_fac_train float8; v_fac_rec float8;
  v_g float8; v_al float8; v_alt float8; v_cap0 float8; v_a float8; v_e float8; v_f float8; v_read float8; v_eff float8;
  v_phys text[]; v_tech text[]; v_attr text; v_i int; v_coef float8; v_gap int; v_cur float8; v_room float8; v_raw float8;
  v_prog float8; v_total float8; v_gain int; v_new float8; v_first_gain int := 0; v_tech_gain int := 0;
  v_cost float8; v_fat float8; v_days float8; v_rm float8; v_ne numeric; v_nf numeric;
  v_share float8; v_rsum float8; v_rn int; v_rs float8;
begin
  select applied_at, rider_id, season_id, week_number, plan_id, mode
    into v_applied, v_rider, v_season, v_week, v_plan, v_mode
  from public.training_plans where id = p_plan_id for update;
  if v_rider is null then raise exception 'plan_not_found'; end if;
  if v_plan is null or v_mode is null then raise exception 'not_a_v2_plan'; end if;

  select player_id, age, attributes, condition, inferred_archetype, potential, trainability, professionalism, recovery, aptitude_profile
    into v_owner, v_age, v_attrs, v_cond, v_shape, v_po, v_tr, v_pr, v_rec, v_apt
  from public.riders where id = v_rider for update;
  if v_owner is null then raise exception 'no_owner'; end if;
  if v_applied is not null then return query select 0, 0, true; return; end if;
  if not public.training_plan_is_due(v_season, v_week, now()) then raise exception 'not_due'; end if;

  -- Training Center / Recovery Center multipliers of the existing facility system (same maths as V1)
  select coalesce(training_level, 1), coalesce(recovery_level, 1), coalesce(team_center_level, 1) into v_tl, v_rl, v_tcl
    from public.player_facilities where player_id = v_owner;
  v_tl := coalesce(v_tl, 1); v_rl := coalesce(v_rl, 1); v_tcl := coalesce(v_tcl, 1);
  select exists(select 1 from public.admin_users a where a.user_id = v_owner) into v_is_admin;
  select league into v_league from public.profiles where id = v_owner;
  v_league_cap := case coalesce(v_league, 'rookie') when 'rookie' then 1 when 'amateur' then 2 when 'continental' then 3 when 'pro' then 4 when 'elite' then 5 else 1 end;
  if v_is_admin then v_league_cap := 5; end if;
  v_team_cap := least(5, v_tcl + 1); v_cap := least(v_league_cap, v_team_cap);
  v_etl := least(v_tl, v_cap); v_erl := least(v_rl, v_cap);
  v_fac_train := 1 + case
    when v_age <= 23 then case when v_etl >= 2 then 0.15 else 0 end
    when v_age <= 27 then case when v_etl >= 3 then 0.10 else 0 end
    when v_age <= 31 then case when v_etl >= 4 then 0.05 else 0 end
    else case when v_etl >= 5 then 0.03 else 0 end end;
  v_fac_rec := case v_erl when 1 then 1.00 when 2 then 1.05 when 3 then 1.10 when 4 then 1.15 when 5 then 1.20 else 1.00 end;

  v_e := (v_cond ->> 'energy')::float8; v_f := (v_cond ->> 'fatigue')::float8;
  -- readiness: the average measured just before the week's training sessions (Rider State loop); without sessions the current Energy / Fatigue
  select readiness_sum, readiness_n into v_rs, v_rn from public.training_plans where id = p_plan_id;
  v_read := case when v_rn > 0 then v_rs / v_rn else (v_e + (100 - v_f)) / 2 end;
  v_eff := public.dev_efficiency(v_read::numeric, true)::float8;
  v_a := case v_mode when 'full' then 1.0 else 0.75 end;
  v_g := greatest(c_gmin, least(c_gmax, 1 + c_w_tr * (v_tr - 50) / 50 + c_w_pr * (v_pr - 50) / 50));
  v_al := case when v_age <= 19 then 1.30 when v_age <= 22 then 1.20 when v_age <= 25 then 1.10 when v_age <= 28 then 1.00 when v_age <= 31 then 0.80 when v_age <= 34 then 0.55 else 0.30 end;
  v_alt := (1 + v_al) / 2;
  v_cap0 := c_cap_base + c_cap_slope * 100 * power(v_po / 100, c_cap_exp);
  v_phys := public.dev_plan_phys(v_plan); v_tech := public.dev_plan_tech(v_plan);

  -- 7 performance attributes
  foreach v_attr in array array['climbing','hills','flat','sprint','timeTrial','endurance','acceleration'] loop
    v_i := array_position(v_phys, v_attr);
    select sum(x) into v_rsum from unnest(c_ratio_main) x;
    v_share := case when v_i is null then c_sh_op / 4 else c_sh_main * c_ratio_main[v_i] / v_rsum end;
    v_gap := public.dev_attribute_gap(v_shape, v_attr);
    v_cur := (v_attrs ->> v_attr)::float8;
    v_aptv := coalesce((v_apt ->> v_attr)::float8, 0);
    v_room := case when v_cur >= c_max then 0 else 1 / (1 + exp((v_cur - (v_cap0 - v_gap + c_apt_phys * v_aptv - c_soft_off)) / c_soft_w)) end;
    v_raw := c_budget * v_a * v_share * v_eff * v_g * v_al * v_room * v_fac_train;
    insert into public.rider_training_progress (rider_id, attribute, progress) values (v_rider, v_attr, 0) on conflict (rider_id, attribute) do nothing;
    select progress into v_prog from public.rider_training_progress where rider_id = v_rider and attribute = v_attr for update;
    v_total := v_prog + v_raw;
    v_gain := least(floor((v_total + 1e-9) / c_threshold)::int, greatest(0, c_max - v_cur)::int);
    v_new := v_cur + v_gain;
    update public.rider_training_progress set progress = case when v_new >= c_max then 0 else greatest(0, v_total - v_gain * c_threshold) end, updated_at = now()
      where rider_id = v_rider and attribute = v_attr;
    v_attrs := jsonb_set(v_attrs, array[v_attr], to_jsonb(v_new::int));
    v_first_gain := v_first_gain + v_gain;
  end loop;

  -- the 6 technique attributes: the plan's 2 supplementary ones get 18 %, the other 4 share 10 % (weekly cap +4 each)
  foreach v_attr in array c_tech_all loop
    v_i := array_position(v_tech, v_attr);
    select sum(x) into v_rsum from unnest(c_ratio_supp) x;
    v_share := case when v_i is null then c_sh_ot / 4 else c_sh_supp * c_ratio_supp[v_i] / v_rsum end;
    v_cur := (v_attrs ->> v_attr)::float8;
    v_room := greatest(c_room_tech_min, least(1, (c_max - v_cur) / c_room_tech_span));
    if v_apt ? v_attr then
      v_techcap := c_tech_cap_base + c_tech_cap_spread * (v_apt ->> v_attr)::float8;
      v_room := case when v_cur >= c_max then 0 else v_room / (1 + exp((v_cur - (v_techcap - c_soft_off)) / c_soft_w)) end;
    end if;
    v_raw := c_budget * v_a * v_share * v_eff * v_g * v_alt * v_room;
    insert into public.rider_training_progress (rider_id, attribute, progress) values (v_rider, v_attr, 0) on conflict (rider_id, attribute) do nothing;
    select progress into v_prog from public.rider_training_progress where rider_id = v_rider and attribute = v_attr for update;
    v_total := v_prog + v_raw;
    v_gain := least(floor((v_total + 1e-9) / c_threshold)::int, greatest(0, c_max - v_cur)::int, c_tech_weekly_max);
    v_new := v_cur + v_gain;
    update public.rider_training_progress set progress = case when v_new >= c_max then 0 else greatest(0, v_total - v_gain * c_threshold) end, updated_at = now()
      where rider_id = v_rider and attribute = v_attr;
    v_attrs := jsonb_set(v_attrs, array[v_attr], to_jsonb(v_new::int));
    v_tech_gain := v_tech_gain + v_gain;
  end loop;

  -- condition: full = -15 E / +18 F / 4 recovery days, basic = -10 / +10 / 5 days; recovery day +5 E / -4 F x recovery multiplier
  v_cost := case v_mode when 'full' then 15 else 10 end; v_fat := case v_mode when 'full' then 18 else 10 end; v_days := case v_mode when 'full' then 4 else 5 end;
  v_rm := (c_rec_base + c_rec_slope * v_rec / 100) * v_fac_rec;
  v_ne := least(100, greatest(0, round((v_e - v_cost + v_days * c_rec_day_e * v_rm)::numeric)));
  v_nf := least(100, greatest(0, round((v_f + v_fat - v_days * c_rec_day_f * v_rm)::numeric)));
  update public.riders set attributes = v_attrs,
    condition = jsonb_set(jsonb_set(v_cond, '{energy}', to_jsonb(v_ne)), '{fatigue}', to_jsonb(v_nf)), condition_previous = v_cond
   where id = v_rider;
  update public.training_plans set applied_at = now(), primary_attr = v_phys[1], primary_gain = v_first_gain, secondary_attr = v_tech[1], secondary_gain = v_tech_gain
   where id = p_plan_id;
  return query select v_first_gain, v_tech_gain, false;
end;
$$;

revoke all on function public.apply_development_plan_v2(uuid) from public, anon, authenticated;

-- ---- 5. sessions + configurable calendar + no skipped items in the Rider State loop --------------------------------
create or replace function public.rider_state_catch_up_internal(p_rider uuid, p_now timestamptz)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  -- ---- configuration (mirrors lib/training/state/config.ts STATE_CONFIG; tunable working values) ----
  c_regen_e_base constant float8 := 9;     c_regen_e_slope constant float8 := 0.04;
  c_regen_f_base constant float8 := 6;     c_regen_f_slope constant float8 := 0.04;
  c_train_e constant float8 := 30;         c_train_f constant float8 := 22;
  c_sat constant float8 := 1.0;            c_ov_f_from constant float8 := 60;  c_ov_f_span constant float8 := 40;  c_ov_e_below constant float8 := 25;  c_ov_cut constant float8 := 0.6;
  c_g_base constant float8 := 0.30;        c_g_max constant float8 := 4;
  c_age_mid constant float8 := 24;         c_age_w constant float8 := 2.5;     c_age_floor constant float8 := 0.35;  c_age_span constant float8 := 1.15;
  c_vit_base constant float8 := 0.85;      c_vit_slope constant float8 := 0.30;
  c_tr_w constant float8 := 0.30;          c_pr_w constant float8 := 0.15;     c_g_min constant float8 := 0.6;       c_g_hi constant float8 := 1.5;
  c_rebuild constant float8 := 0.12;       c_rebuild_age constant float8 := 0.15;  c_rebuild_ret_min constant float8 := 0.3;
  c_inact_below constant float8 := 0.30;   c_inact_loss constant float8 := 0.6;
  c_age_loss constant float8 := 0.05;      c_age_relief constant float8 := 0.5;  c_over_loss constant float8 := 0.5;
  c_onset_base constant int := 29;         c_onset_step constant float8 := 25;
  c_w_fit constant float8 := 0.35;         c_w_en constant float8 := 0.20;     c_w_fat constant float8 := 0.20;      c_w_prep constant float8 := 0.25;
  c_prep_neutral constant float8 := 0.45;  c_gamma constant float8 := 1.2;     c_smooth constant float8 := 0.5;
  c_max_items constant int := 4000;
  c_sess_hour constant int := 12;          -- training sessions at 12:00 UTC (STATE_CONFIG.training.sessionHourUtc); days: rst_session_days()
  r public.riders;
  pl public.training_plans;
  v_cond jsonb;
  v_cursor timestamptz; v_t timestamptz; v_boundary timestamptz; v_ev_at timestamptz; v_ev_time timestamptz; v_ev_id bigint; v_ev_e float8; v_ev_f float8;
  v_week bigint; v_take_boundary boolean; v_secs float8; v_i int;
  e float8; f float8; k float8; peak float8; form float8;
  v_units float8; v_race float8; v_s float8; v_raw float8; v_o float8; v_l float8; v_prep float8; v_target float8;
  v_onset int; v_growth float8; v_ret float8; v_regain float8; v_inact float8; v_ageloss float8; v_over float8; v_ws date;
  s1 float8; s2 float8; v_season text; v_wk int;
  v_anchor timestamptz; v_sess_floor timestamptz; v_sess_t timestamptz; v_sess_time timestamptz; v_complete boolean := false;
  v_take_event boolean; v_take_session boolean; v_days int[]; v_n_sess int := 0; v_unit float8;
begin
  if not public.rider_state_enabled() then return; end if;
  select * into r from public.riders where id = p_rider for update;
  if r.id is null then return; end if;
  if p_now <= r.state_at then return; end if;                 -- nothing new has elapsed: reading the profile again credits nothing
  v_cursor := r.state_at;
  v_sess_floor := r.state_at;                                     -- a session at or before the processed-up-to instant counts as done
  v_anchor := (public.game_season_one_start())::timestamp at time zone 'utc';   -- the ONE configurable season start (a Monday, 00:00 UTC)

  v_cond := r.condition;
  e := (v_cond ->> 'energy')::float8; f := (v_cond ->> 'fatigue')::float8; k := (v_cond ->> 'fitness')::float8; form := (v_cond ->> 'form')::float8;
  peak := r.fitness_peak;

  -- plans of weeks that ended on or before state_at and were never applied: attributes only (that time is already behind us);
  -- Energy / Fatigue are restored after the call, no load is added (nothing is credited or charged retroactively).
  for pl in
    select tp.* from public.training_plans tp
     where tp.rider_id = p_rider and tp.applied_at is null
       and public.training_plan_is_due(tp.season_id, tp.week_number, p_now)
       and v_anchor + (((public.season_number_of(tp.season_id) - 1) * 10 + tp.week_number) * 7) * interval '24 hours' <= r.state_at
     order by public.season_number_of(tp.season_id), tp.week_number
  loop
    update public.riders set condition = jsonb_set(jsonb_set(v_cond, '{energy}', to_jsonb(e)), '{fatigue}', to_jsonb(f)) where id = p_rider;
    if pl.plan_id is not null then perform public.apply_development_plan_v2(pl.id); else perform public.apply_training_plan_internal(pl.id); end if;
    select condition into v_cond from public.riders where id = p_rider;
  end loop;

  for v_i in 1..c_max_items loop
    v_week := floor(extract(epoch from (v_cursor - v_anchor)) / 604800)::bigint;       -- the game week the cursor is in
    v_boundary := v_anchor + (v_week + 1) * interval '168 hours';                          -- its end
    v_season := 'season-' || (v_week / 10 + 1);
    v_wk := (mod(v_week, 10) + 1)::int;
    select * into pl from public.training_plans tp where tp.rider_id = p_rider and tp.season_id = v_season and tp.week_number = v_wk;
    select ev.id, ev.at, ev.energy_base, ev.fatigue_base into v_ev_id, v_ev_at, v_ev_e, v_ev_f
      from public.rider_load_events ev where ev.rider_id = p_rider and ev.applied_at is null and ev.at <= p_now order by ev.at, ev.id limit 1;
    v_ev_time := case when v_ev_id is null then null else greatest(v_ev_at, v_cursor) end;   -- a load reported late is applied at the cursor
    -- the next training session of a V2 plan of this week (legacy V1 plans have none: their load is applied at the week end)
    v_sess_time := null; v_n_sess := 0;
    if pl.id is not null and pl.plan_id is not null then
      v_days := public.rst_session_days(pl.mode); v_n_sess := cardinality(v_days);
      select min(s.t) into v_sess_t from (
        select v_anchor + v_week * interval '168 hours' + d * interval '24 hours' + c_sess_hour * interval '1 hour' as t from unnest(v_days) d) s
       where s.t > v_sess_floor and s.t <= p_now;
      v_sess_time := case when v_sess_t is null then null else greatest(v_sess_t, v_cursor) end;
    end if;
    -- order at equal times: week end, then load event, then session
    v_take_boundary := v_boundary <= p_now and (v_ev_time is null or v_boundary <= v_ev_time) and (v_sess_time is null or v_boundary <= v_sess_time);
    v_take_event := not v_take_boundary and v_ev_id is not null and (v_sess_time is null or v_ev_time <= v_sess_time);
    v_take_session := not v_take_boundary and not v_take_event and v_sess_time is not null;
    if not (v_take_boundary or v_take_event or v_take_session) then v_complete := true; exit; end if;
    v_t := case when v_take_boundary then v_boundary when v_take_event then v_ev_time else v_sess_time end;

    -- regeneration for exactly the elapsed time up to the next item
    v_secs := extract(epoch from (v_t - v_cursor))::float8;
    e := least(100, e + (c_regen_e_base + c_regen_e_slope * r.recovery) * r.recovery_coef * (v_secs / 86400.0));
    f := greatest(0, f - (c_regen_f_base + c_regen_f_slope * r.recovery) * r.recovery_coef * (v_secs / 86400.0));
    v_cursor := v_t;

    if v_take_boundary then
      -- the game week ends: the plan's load, then Fitness and Form
      v_units := 0;
      if pl.id is not null then
        v_units := case when pl.plan_id is not null then (case pl.mode when 'full' then 1.0 else 0.6 end) * pl.readiness_n / v_n_sess   -- V2: only the sessions really processed count
                        when pl.week_type = 'technical' then 0.4
                        else (case pl.intensity when 'hard' then 1.0 when 'normal' then 0.7 else 0.4 end) end;
        if pl.applied_at is null then
          -- attribute training with the state as it is right now (the plan row carries the average readiness measured before its sessions);
          -- the old weekly Energy/Fatigue delta of that function is thrown away
          update public.riders set condition = jsonb_set(jsonb_set(v_cond, '{energy}', to_jsonb(e)), '{fatigue}', to_jsonb(f)) where id = p_rider;
          if pl.plan_id is not null then perform public.apply_development_plan_v2(pl.id); else perform public.apply_training_plan_internal(pl.id); end if;
          select condition into v_cond from public.riders where id = p_rider;
        end if;
        if pl.plan_id is null then          -- legacy V1 plan: the whole load once at the week end (V2 load was applied at the sessions)
          e := greatest(0, e - v_units * c_train_e * r.energy_efficiency);
          f := least(100, f + v_units * c_train_f * r.fatigue_resistance);
        end if;
      end if;

      v_ws := ((v_boundary - interval '168 hours') at time zone 'utc')::date;
      select coalesce(sum(ev.race_units), 0) into v_race from public.rider_load_events ev
       where ev.rider_id = p_rider and ev.at >= v_boundary - interval '168 hours' and ev.at < v_boundary;
      v_l := v_units + v_race;
      v_raw := 1 - exp(-v_l / c_sat);
      v_o := greatest(least(greatest((f - c_ov_f_from) / c_ov_f_span, 0), 1), least(greatest((c_ov_e_below - e) / c_ov_e_below, 0), 1));
      v_s := v_raw * (1 - c_ov_cut * v_o);

      v_onset := c_onset_base + floor((r.vitality - 1) / c_onset_step)::int;
      v_growth := c_g_base * v_s * least(power((100 - k) / 20, 2), c_g_max)
                  * (c_age_floor + c_age_span / (1 + exp((r.age - c_age_mid) / c_age_w)))
                  * least(greatest(1 + c_tr_w * (r.trainability - 50) / 50 + c_pr_w * (r.professionalism - 50) / 50, c_g_min), c_g_hi)
                  * (c_vit_base + c_vit_slope * r.vitality / 100);
      v_ret := greatest(c_rebuild_ret_min, 1 / (1 + c_rebuild_age * greatest(0, r.age - v_onset)));
      v_regain := least(greatest(0, peak - k), c_rebuild * greatest(0, peak - k) * v_s * v_ret);
      v_inact := c_inact_loss * greatest(0, 1 - v_s / c_inact_below);
      v_ageloss := case when r.age >= v_onset then c_age_loss * (r.age - v_onset + 1) * (1 - c_age_relief * least(1, v_s)) else 0 end;
      v_over := c_over_loss * greatest(least(greatest((f - c_ov_f_from) / c_ov_f_span, 0), 1), least(greatest((c_ov_e_below - e) / c_ov_e_below, 0), 1));
      k := least(greatest(k + v_growth + v_regain - v_inact - v_ageloss - v_over, 0), 100);
      peak := greatest(peak, k);

      select stimulus into s1 from public.rider_weekly_state where rider_id = p_rider and week_start = v_ws - 7;
      select stimulus into s2 from public.rider_weekly_state where rider_id = p_rider and week_start = v_ws - 14;
      v_prep := 100 * (0.5 * v_s + 0.3 * coalesce(s1, c_prep_neutral) + 0.2 * coalesce(s2, c_prep_neutral));
      v_raw := c_w_fit * k + c_w_en * e + c_w_fat * (100 - f) + c_w_prep * v_prep;
      v_target := 100 * power(least(greatest(v_raw, 0), 100) / 100, c_gamma);
      form := least(greatest(form + c_smooth * (v_target - form), 0), 100);

      insert into public.rider_weekly_state (rider_id, week_start, training_units, race_units, stimulus, energy_end, fatigue_end, fitness_end, form_end)
      values (p_rider, v_ws, v_units, v_race, v_s, e, f, k, form)
      on conflict (rider_id, week_start) do update set training_units = excluded.training_units, race_units = excluded.race_units, stimulus = excluded.stimulus,
        energy_end = excluded.energy_end, fatigue_end = excluded.fatigue_end, fitness_end = excluded.fitness_end, form_end = excluded.form_end;
    elsif v_take_event then
      -- a stage / other load at its exact time, applied exactly once
      e := greatest(0, e - v_ev_e * r.energy_efficiency);
      f := least(100, f + v_ev_f * r.fatigue_resistance);
      update public.rider_load_events set applied_at = p_now where id = v_ev_id;
    else
      -- a training session of a V2 plan: readiness BEFORE it is recorded (efficiency of the week's progress), then its equal part of the weekly load,
      -- scaled by this rider's individual coefficients
      update public.training_plans set readiness_sum = readiness_sum + (e + (100 - f)) / 2, readiness_n = readiness_n + 1 where id = pl.id;
      v_unit := (case pl.mode when 'full' then 1.0 else 0.6 end) / v_n_sess;
      e := greatest(0, e - v_unit * c_train_e * r.energy_efficiency);
      f := least(100, f + v_unit * c_train_f * r.fatigue_resistance);
      v_sess_floor := v_t;
    end if;
  end loop;

  -- the rest of the time up to now. A very long offline period can exceed one pass (4000 items): then the state is saved at the cursor, nothing is
  -- skipped, and the next call continues from there.
  if v_complete then
    v_secs := extract(epoch from (p_now - v_cursor))::float8;
    e := least(100, e + (c_regen_e_base + c_regen_e_slope * r.recovery) * r.recovery_coef * (v_secs / 86400.0));
    f := greatest(0, f - (c_regen_f_base + c_regen_f_slope * r.recovery) * r.recovery_coef * (v_secs / 86400.0));
    v_cursor := p_now;
  end if;

  update public.riders
     set condition = jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_cond, '{energy}', to_jsonb(e)), '{fatigue}', to_jsonb(f)), '{fitness}', to_jsonb(k)), '{form}', to_jsonb(form)),
         fitness_peak = peak, state_at = v_cursor
   where id = p_rider;
end;
$$;

revoke all on function public.rider_state_catch_up_internal(uuid, timestamptz) from public, anon, authenticated;
