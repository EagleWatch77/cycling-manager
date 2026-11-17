-- ============================================================================
-- Migration 20261117_01 — Development model V2 ("training 1.0" + rider development), PREPARED, NOT ACTIVE.
--
-- Run only after the owner approves. Nothing in this file turns the model on: the switch
-- public.development_model_settings.enabled defaults to FALSE, and while it is FALSE
--   * save_my_development_plan() refuses ('model_disabled'),
--   * process_season_aging() behaves exactly as before (the new hook is skipped),
--   * the old Unified Weekly Training V1 path (save_my_training_plan / apply_training_plan_internal) is untouched
--     (plans with plan_id IS NULL are still processed by it).
--
-- WHY A DATABASE CHANGE IS NECESSARY (the TypeScript is not authoritative — see lib/training/engine.ts):
--   * Growth of attributes is computed ONLY inside the security-definer SQL function; a TypeScript-only change would not
--     alter the live game, and moving the maths to the client would reopen the hole closed by migration 04.
--   * The model needs a fifth hidden trait (Vitality) and the plan (0..6) + mode (basic/full) of a week: neither exists.
--   * Ageing has to run at the season change, which is in process_season_aging().
--
-- Mirrors apps/web/src/lib/training/development/{config,core}.ts BY HAND (all constants are the `c_*` constants below).
-- supabase/tests/development_v2.test.sh compares the SQL results with the TypeScript results (same maths, same numbers).
-- Idempotent. Deletes nothing. Does not touch existing plans, attributes, progress or hidden values.
-- ============================================================================

-- ---- 1. switch (default OFF) -------------------------------------------------
create table if not exists public.development_model_settings (
  id         boolean primary key default true check (id),
  enabled    boolean not null default false,
  changed_at timestamptz not null default now()
);
insert into public.development_model_settings (id, enabled) values (true, false) on conflict (id) do nothing;
alter table public.development_model_settings enable row level security;
revoke all on public.development_model_settings from public, anon, authenticated;

create or replace function public.development_model_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.development_model_settings where id), false);
$$;
revoke all on function public.development_model_enabled() from public, anon;
grant execute on function public.development_model_enabled() to authenticated;

-- ---- 2. data: Vitality, ageing state, plan + mode of a week -----------------------
-- Vitality is hidden like the other four traits (riders/market_riders column grants list public columns explicitly,
-- a new column has no client access). Existing riders get the neutral 50 until the generator writes real values.
alter table public.riders        add column if not exists vitality int not null default 50 check (vitality between 1 and 100);
alter table public.market_riders add column if not exists vitality int not null default 50 check (vitality between 1 and 100);
alter table public.riders        add column if not exists decline_progress jsonb not null default '{}'::jsonb;
-- Individual aptitude profile (13 values -1..1, hidden, fixed at creation; '{}' = legacy rider without profile = neutral, no technique ceiling).
alter table public.riders        add column if not exists aptitude_profile jsonb not null default '{}'::jsonb;
alter table public.market_riders add column if not exists aptitude_profile jsonb not null default '{}'::jsonb;
alter table public.training_plans add column if not exists plan_id smallint check (plan_id between 0 and 6);
alter table public.training_plans add column if not exists mode text check (mode in ('basic', 'full'));

-- ---- 3. plan catalogue (mirror of PLANS / SHAPE_OF_PLAN in development/config.ts) ------
create or replace function public.dev_plan_phys(p_plan int) returns text[] language sql immutable as $$
  select case p_plan
    when 0 then array['climbing','endurance','hills']
    when 1 then array['sprint','acceleration','flat']
    when 2 then array['timeTrial','flat','endurance']
    when 3 then array['hills','acceleration','climbing']
    when 4 then array['flat','endurance','hills']
    when 5 then array['endurance','flat','acceleration']
    when 6 then array['endurance','hills','flat'] end;
$$;
create or replace function public.dev_plan_tech(p_plan int) returns text[] language sql immutable as $$
  select case p_plan
    when 0 then array['descending','cornering']
    when 1 then array['packRiding','bikeHandling']
    when 2 then array['cornering','bikeHandling']
    when 3 then array['cornering','descending']
    when 4 then array['roughSurface','wetHandling']
    when 5 then array['descending','bikeHandling']
    when 6 then array['packRiding','bikeHandling'] end;
$$;
create or replace function public.dev_shape_plan(p_shape text) returns int language sql immutable as $$
  select case p_shape when 'climber' then 0 when 'sprinter' then 1 when 'timeTrial' then 2 when 'puncheur' then 3
    when 'classics' then 4 when 'rouleur' then 5 when 'allrounder' then 6 else 6 end;
$$;
-- performance attributes in the production SHAPES (lib/rider/config.ts) — strong / weak
create or replace function public.dev_shape_strong(p_shape text) returns text[] language sql immutable as $$
  select case p_shape
    when 'climber' then array['climbing','hills','acceleration'] when 'sprinter' then array['sprint','flat','acceleration']
    when 'timeTrial' then array['flat','endurance','timeTrial'] when 'puncheur' then array['hills','acceleration']
    when 'classics' then array[]::text[] when 'rouleur' then array['flat','endurance'] else array['endurance'] end;
$$;
create or replace function public.dev_shape_weak(p_shape text) returns text[] language sql immutable as $$
  select case p_shape
    when 'climber' then array['flat','sprint'] when 'sprinter' then array['climbing','hills'] when 'timeTrial' then array['climbing','sprint']
    when 'puncheur' then array['flat','endurance'] when 'classics' then array['climbing','sprint'] when 'rouleur' then array['climbing','hills']
    else array[]::text[] end;
$$;
-- soft-cap gap of one performance attribute for a rider of natural shape p_shape
create or replace function public.dev_attribute_gap(p_shape text, p_attr text) returns int language sql immutable as $$
  select case
    when p_shape = 'allrounder' then 10
    when p_attr = any (public.dev_plan_phys(public.dev_shape_plan(p_shape))) or p_attr = any (public.dev_shape_strong(p_shape)) then 0
    when p_attr = any (public.dev_shape_weak(p_shape)) then 45
    else 20 end;
$$;
create or replace function public.dev_efficiency(p_readiness numeric, p_strict boolean default true) returns numeric language sql immutable as $$
  select case when p_readiness >= 80 then 1.0
    when p_readiness >= 60 then (case when p_strict then 0.90 else 0.95 end)
    when p_readiness >= 40 then (case when p_strict then 0.70 else 0.85 end)
    when p_readiness >= 20 then (case when p_strict then 0.45 else 0.70 end)
    else (case when p_strict then 0.25 else 0.50 end) end;
$$;
revoke all on function public.dev_plan_phys(int), public.dev_plan_tech(int), public.dev_shape_plan(text), public.dev_shape_strong(text),
  public.dev_shape_weak(text), public.dev_attribute_gap(text, text), public.dev_efficiency(numeric, boolean) from public, anon, authenticated;

-- ---- 4. saving a plan: plan 0..6 + mode, same calendar / Tour rules as save_my_training_plan ----------------
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

  v_season := public.season_id_at(v_now);
  v_week := public.training_plannable_week(v_now);
  if v_week is null then raise exception 'no_plannable_week'; end if;

  perform pg_advisory_xact_lock(hashtextextended('training-tour:' || v_rider::text, 0));
  if exists (
    select 1 from public.tour_registrations r join public.tour_schedule s on s.tour_id = r.tour_id
    where r.rider_id = v_rider and r.season_id = v_season and s.week_number = v_week
  ) then raise exception 'tour_conflict'; end if;

  -- week_type/focus/intensity keep their V1 constraints (placeholders describing the plan); plan_id + mode are the real input.
  insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity, plan_id, mode)
  values (v_rider, v_season, v_week, 'performance', v_lead[p_plan_id + 1], case p_mode when 'full' then 'hard' else 'normal' end, p_plan_id, p_mode)
  on conflict (rider_id, season_id, week_number) do nothing
  returning * into v_row;
  if v_row.id is null then raise exception 'already_planned'; end if;
  return v_row;
end;
$$;
revoke all on function public.save_my_development_plan(int, text) from public, anon, authenticated;
grant execute on function public.save_my_development_plan(int, text) to authenticated;

-- ---- 5. processing one V2 week -----------------------------------------------------------------------
create or replace function public.apply_development_plan_v2(p_plan_id uuid)
returns table(primary_gain int, secondary_gain int, already_processed boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  -- ---- constants: mirror DEV_CONFIG (development/config.ts) ----
  c_threshold constant float8 := 12;      c_max constant float8 := 200;
  c_cphys constant float8 := 1.8;         c_ctech constant float8 := 6.5;      c_share constant float8 := 0.8;
  c_coef constant float8[] := array[1.15, 0.95, 0.75]; c_other constant float8 := 0.35; c_coef_tech constant float8[] := array[0.85, 0.45];
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
  v_read := (v_e + (100 - v_f)) / 2;
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
    v_coef := case when v_i is null then c_other else c_coef[v_i] end;
    v_gap := public.dev_attribute_gap(v_shape, v_attr);
    v_cur := (v_attrs ->> v_attr)::float8;
    v_aptv := coalesce((v_apt ->> v_attr)::float8, 0);
    v_room := case when v_cur >= c_max then 0 else 1 / (1 + exp((v_cur - (v_cap0 - v_gap + c_apt_phys * v_aptv - c_soft_off)) / c_soft_w)) end;
    v_raw := c_threshold * v_coef * c_cphys * v_a * c_share * v_eff * v_g * v_al * v_room * v_fac_train;
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

  -- 2 technique attributes of the plan (weekly cap +4 each)
  for v_i in 1..2 loop
    v_attr := v_tech[v_i];
    v_cur := (v_attrs ->> v_attr)::float8;
    v_room := greatest(c_room_tech_min, least(1, (c_max - v_cur) / c_room_tech_span));
    if v_apt ? v_attr then
      v_techcap := c_tech_cap_base + c_tech_cap_spread * (v_apt ->> v_attr)::float8;
      v_room := case when v_cur >= c_max then 0 else v_room / (1 + exp((v_cur - (v_techcap - c_soft_off)) / c_soft_w)) end;
    end if;
    v_raw := c_threshold * c_coef_tech[v_i] * c_ctech * v_a * (1 - c_share) * v_eff * v_g * v_alt * v_room;
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

-- ---- 6. dispatch: V2 plans (plan_id set) go to the V2 function, everything else to the V1 function ----------
create or replace function public.process_my_due_training()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_v2 boolean;
  v_already boolean;
  v_done int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  for v_id, v_v2 in
    select tp.id, tp.plan_id is not null
    from public.training_plans tp join public.riders r on r.id = tp.rider_id
    where r.player_id = v_uid and tp.applied_at is null and public.training_plan_is_due(tp.season_id, tp.week_number, now())
    order by public.season_number_of(tp.season_id), tp.week_number
  loop
    if v_v2 then
      select a.already_processed into v_already from public.apply_development_plan_v2(v_id) a;
    else
      select a.already_processed into v_already from public.apply_training_plan_internal(v_id) a;
    end if;
    if not v_already then v_done := v_done + 1; end if;
  end loop;
  return v_done;
end;
$$;
revoke all on function public.process_my_due_training() from public, anon, authenticated;
grant execute on function public.process_my_due_training() to authenticated;

-- ---- 7. season start: offseason recovery + Vitality decline of the physical attributes ---------------------
create or replace function public.apply_development_season_start(p_rider uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c_floor constant int := 20;
  v_age int; v_attrs jsonb; v_cond jsonb; v_dec jsonb; v_vit int; v_onset int; v_loss float8; v_attr text; v_f float8; v_d float8; v_g int;
begin
  select age, attributes, condition, decline_progress, vitality into v_age, v_attrs, v_cond, v_dec, v_vit from public.riders where id = p_rider for update;
  if v_age is null then return; end if;
  v_cond := jsonb_set(jsonb_set(v_cond, '{energy}', to_jsonb(least(100, (v_cond ->> 'energy')::numeric + 50))),
                      '{fatigue}', to_jsonb(greatest(0, (v_cond ->> 'fatigue')::numeric - 50)));
  v_onset := 29 + floor((v_vit - 1) / 25.0)::int;
  if v_age >= v_onset then
    v_loss := 0.8 + 0.4 * (v_age - v_onset);
    foreach v_attr in array array['climbing','hills','flat','sprint','timeTrial','endurance','acceleration'] loop
      v_f := case v_attr when 'sprint' then 1.4 when 'acceleration' then 1.4 when 'endurance' then 0.7 else 1 end;
      v_d := coalesce((v_dec ->> v_attr)::float8, 0) + v_loss * v_f;
      v_g := floor(v_d)::int;
      if v_g > 0 then
        v_attrs := jsonb_set(v_attrs, array[v_attr], to_jsonb(greatest(c_floor, (v_attrs ->> v_attr)::int - v_g)));
        v_d := v_d - v_g;
      end if;
      v_dec := jsonb_set(v_dec, array[v_attr], to_jsonb(v_d));
    end loop;
  end if;
  update public.riders set attributes = v_attrs, condition = v_cond, decline_progress = v_dec where id = p_rider;
end;
$$;
revoke all on function public.apply_development_season_start(uuid) from public, anon, authenticated;

-- ---- 8. season change: the existing aging function + ONE hook (skipped while the switch is OFF) -------------------
create or replace function public.process_season_aging()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_anchor            date := date '2026-08-17'; -- SEASON_ONE_START
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
