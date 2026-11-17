-- ============================================================================
-- Rider State model 1.0 (Energy / Fatigue / Form / Fitness / Morale) - stages A-C: storage, daily regeneration, Fitness and Form.
-- NOT RUN ON ANY DATABASE. Requires 20261117_01 (vitality, plan_id/mode) first. Behaviour is gated by rider_state_settings.enabled (default FALSE):
-- while it is FALSE nothing changes except new nullable/defaulted columns, the deterministic backfill below and the tables that stay empty.
--
-- Why each part is needed (owner brief 2026-11-17):
--  * three hidden individual coefficients (energy economy, fatigue resistance, recovery) - stored, derived once from the rider id, copied on transfer;
--  * condition corrected ONCE for riders still holding the old defaults (Form 50 / Fitness 60 / Morale 70): Form 75, Fitness 65-85, Morale 60-90;
--    real Energy / Fatigue and every value that is not the untouched default stay as they are;
--  * state_day = last completed (UTC) day whose regeneration is included, so catching up is idempotent (never twice for the same day);
--  * rider_weekly_state = the history behind the 3-week preparedness and Fitness; rider_load_events = the interface through which the future Race
--    Engine reports stage load (nothing writes there yet);
--  * rider_state_catch_up_internal() = the single chronological loop (load -> regeneration -> weekly evaluation, day by day). It is called before
--    training, before a transfer, and (by the future engine) before a race; refresh_my_rider_state() lets the owner's profile read current values.
-- Chronology for the training plan: its load is applied on the LAST day (Sunday) of its week, before that day's regeneration. The old plan functions
-- still compute their weekly Energy/Fatigue delta (with recovery days); the loop restores Energy/Fatigue right after calling them and applies the new
-- load instead - so the old weekly recovery days are never counted. Attribute training (and its readiness input) is untouched.
-- ============================================================================

-- ---- 1. switch (OFF) ----
create table if not exists public.rider_state_settings (
  singleton boolean primary key default true check (singleton),
  enabled   boolean not null default false
);
insert into public.rider_state_settings (singleton, enabled) values (true, false) on conflict (singleton) do nothing;
alter table public.rider_state_settings enable row level security;
revoke all on public.rider_state_settings from public, anon, authenticated;

create or replace function public.rider_state_enabled()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select enabled from public.rider_state_settings where singleton), false); $$;
grant execute on function public.rider_state_enabled() to authenticated;

-- ---- 2. columns (hidden: no client grant is added) ----
alter table public.riders        add column if not exists vitality int not null default 50 check (vitality between 1 and 100);
alter table public.market_riders add column if not exists vitality int not null default 50 check (vitality between 1 and 100);
alter table public.riders        add column if not exists aptitude_profile jsonb not null default '{}'::jsonb;
alter table public.market_riders add column if not exists aptitude_profile jsonb not null default '{}'::jsonb;
alter table public.riders        add column if not exists energy_efficiency  float8 check (energy_efficiency  between 0.70 and 1.30);
alter table public.riders        add column if not exists fatigue_resistance float8 check (fatigue_resistance between 0.70 and 1.30);
alter table public.riders        add column if not exists recovery_coef      float8 check (recovery_coef      between 0.90 and 1.10);
alter table public.riders        add column if not exists fitness_peak       float8 check (fitness_peak between 0 and 100);
alter table public.riders        add column if not exists state_day          date;
alter table public.riders        add column if not exists state_model_version int not null default 0;
alter table public.market_riders add column if not exists energy_efficiency  float8 check (energy_efficiency  between 0.70 and 1.30);
alter table public.market_riders add column if not exists fatigue_resistance float8 check (fatigue_resistance between 0.70 and 1.30);
alter table public.market_riders add column if not exists recovery_coef      float8 check (recovery_coef      between 0.90 and 1.10);
alter table public.market_riders add column if not exists fitness_peak       float8 check (fitness_peak between 0 and 100);

-- ---- 3. deterministic helpers (pure functions of the rider id; TypeScript twin: coefficientsFromUniforms()) ----
create or replace function public.rst_unit(p_id uuid, p_salt text)
returns float8 language sql immutable
as $$ select (('x' || substr(md5(p_id::text || ':' || p_salt), 1, 8))::bit(32)::bigint)::float8 / 4294967296.0; $$;

create or replace function public.rst_energy_eff(p_id uuid)  returns float8 language sql immutable
as $$ select 0.70 + 0.60 * (public.rst_unit(p_id, 'ee1') + public.rst_unit(p_id, 'ee2')) / 2; $$;
create or replace function public.rst_fatigue_res(p_id uuid) returns float8 language sql immutable
as $$ select 0.70 + 0.60 * (public.rst_unit(p_id, 'fr1') + public.rst_unit(p_id, 'fr2')) / 2; $$;
create or replace function public.rst_recovery_coef(p_id uuid) returns float8 language sql immutable
as $$ select 0.90 + 0.20 * (public.rst_unit(p_id, 'rc1') + public.rst_unit(p_id, 'rc2')) / 2; $$;

-- the old untouched defaults (nothing ever changed Form / Fitness / Morale, so a rider with exactly 50/60/70 never had them set by the game)
create or replace function public.rst_condition_is_legacy(p_cond jsonb)
returns boolean language sql immutable
as $$ select (p_cond ->> 'form')::numeric = 50 and (p_cond ->> 'fitness')::numeric = 60 and (p_cond ->> 'morale')::numeric = 70; $$;

create or replace function public.rst_fresh_condition(p_id uuid, p_cond jsonb)
returns jsonb language sql immutable
as $$ select jsonb_set(jsonb_set(jsonb_set(p_cond, '{form}', to_jsonb(75)),
                                 '{fitness}', to_jsonb(65 + floor(public.rst_unit(p_id, 'fit') * 21)::int)),
                       '{morale}', to_jsonb(60 + floor(public.rst_unit(p_id, 'mor') * 31)::int)); $$;

-- ---- 4. new rows (any insert path: starter rider, admin, AI, market) get the model's start values; explicit values are respected ----
create or replace function public.riders_state_init()
returns trigger language plpgsql
as $$
begin
  new.energy_efficiency  := coalesce(new.energy_efficiency,  public.rst_energy_eff(new.id));
  new.fatigue_resistance := coalesce(new.fatigue_resistance, public.rst_fatigue_res(new.id));
  new.recovery_coef      := coalesce(new.recovery_coef,      public.rst_recovery_coef(new.id));
  if new.state_model_version = 0 then
    if public.rst_condition_is_legacy(new.condition) then
      new.condition := public.rst_fresh_condition(new.id, new.condition);
      new.condition_previous := new.condition;
    end if;
    new.state_model_version := 1;
  end if;
  new.fitness_peak := coalesce(new.fitness_peak, (new.condition ->> 'fitness')::float8);
  new.state_day    := coalesce(new.state_day, (now() at time zone 'utc')::date);
  return new;
end;
$$;
drop trigger if exists riders_state_init on public.riders;
create trigger riders_state_init before insert on public.riders for each row execute function public.riders_state_init();

create or replace function public.market_riders_state_init()
returns trigger language plpgsql
as $$
begin
  new.energy_efficiency  := coalesce(new.energy_efficiency,  public.rst_energy_eff(new.id));
  new.fatigue_resistance := coalesce(new.fatigue_resistance, public.rst_fatigue_res(new.id));
  new.recovery_coef      := coalesce(new.recovery_coef,      public.rst_recovery_coef(new.id));
  if public.rst_condition_is_legacy(new.condition) then new.condition := public.rst_fresh_condition(new.id, new.condition); end if;
  new.fitness_peak := coalesce(new.fitness_peak, (new.condition ->> 'fitness')::float8);
  return new;
end;
$$;
drop trigger if exists market_riders_state_init on public.market_riders;
create trigger market_riders_state_init before insert on public.market_riders for each row execute function public.market_riders_state_init();

-- ---- 5. one-time backfill of existing rows (idempotent: only fills what is NULL / still version 0) ----
update public.riders set
  energy_efficiency  = coalesce(energy_efficiency,  public.rst_energy_eff(id)),
  fatigue_resistance = coalesce(fatigue_resistance, public.rst_fatigue_res(id)),
  recovery_coef      = coalesce(recovery_coef,      public.rst_recovery_coef(id))
where energy_efficiency is null or fatigue_resistance is null or recovery_coef is null;

update public.riders set
  condition = case when public.rst_condition_is_legacy(condition) then public.rst_fresh_condition(id, condition) else condition end,
  state_model_version = 1
where state_model_version = 0;
update public.riders set fitness_peak = (condition ->> 'fitness')::float8 where fitness_peak is null;
-- existing riders: the days up to and including yesterday are NOT back-filled with regeneration (nothing is credited retroactively)
update public.riders set state_day = (now() at time zone 'utc')::date - 1 where state_day is null;

update public.market_riders set
  energy_efficiency  = coalesce(energy_efficiency,  public.rst_energy_eff(id)),
  fatigue_resistance = coalesce(fatigue_resistance, public.rst_fatigue_res(id)),
  recovery_coef      = coalesce(recovery_coef,      public.rst_recovery_coef(id)),
  condition = case when public.rst_condition_is_legacy(condition) then public.rst_fresh_condition(id, condition) else condition end
where energy_efficiency is null or fatigue_resistance is null or recovery_coef is null or public.rst_condition_is_legacy(condition);
update public.market_riders set fitness_peak = (condition ->> 'fitness')::float8 where fitness_peak is null;

alter table public.riders        alter column energy_efficiency set not null, alter column fatigue_resistance set not null,
                                 alter column recovery_coef set not null, alter column fitness_peak set not null, alter column state_day set not null;
alter table public.market_riders alter column energy_efficiency set not null, alter column fatigue_resistance set not null,
                                 alter column recovery_coef set not null, alter column fitness_peak set not null;

-- ---- 6. history + Race Engine load interface ----
create table if not exists public.rider_weekly_state (
  rider_id       uuid not null references public.riders (id) on delete cascade,
  week_start     date not null,
  training_units float8 not null,
  race_units     float8 not null,
  stimulus       float8 not null,
  energy_end     float8 not null,
  fatigue_end    float8 not null,
  fitness_end    float8 not null,
  form_end       float8 not null,
  primary key (rider_id, week_start)
);
alter table public.rider_weekly_state enable row level security;
revoke all on public.rider_weekly_state from public, anon, authenticated;

create table if not exists public.rider_load_events (
  id           bigserial primary key,
  rider_id     uuid not null references public.riders (id) on delete cascade,
  day          date not null,
  energy_base  float8 not null check (energy_base >= 0),
  fatigue_base float8 not null check (fatigue_base >= 0),
  race_units   float8 not null default 0 check (race_units >= 0),
  source_key   text not null,
  applied_at   timestamptz,
  unique (rider_id, source_key)
);
create index if not exists rider_load_events_open_idx on public.rider_load_events (rider_id, day) where applied_at is null;
alter table public.rider_load_events enable row level security;
revoke all on public.rider_load_events from public, anon, authenticated;

-- Trusted callers only (the future Race Engine / admin tooling): the BASE load of a stage; the rider's own coefficients scale it when it is applied.
-- Idempotent per source_key (the same stage reported twice is stored once).
create or replace function public.record_rider_stage_load(p_rider uuid, p_day date, p_energy float8, p_fatigue float8, p_race_units float8, p_source_key text)
returns void language sql security definer set search_path = public
as $$
  insert into public.rider_load_events (rider_id, day, energy_base, fatigue_base, race_units, source_key)
  values (p_rider, p_day, p_energy, p_fatigue, p_race_units, p_source_key)
  on conflict (rider_id, source_key) do nothing;
$$;
revoke all on function public.record_rider_stage_load(uuid, date, float8, float8, float8, text) from public, anon, authenticated;

-- ---- 7. the chronological catch-up (SQL twin of lib/training/state/core.ts catchUp(); parity test: supabase/tests/rider_state.test.sh) ----
create or replace function public.rider_state_catch_up_internal(p_rider uuid, p_now timestamptz)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c_anchor constant date := date '2026-08-17';            -- SEASON_ONE_START, a Monday = day 0
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
  c_max_days constant int := 800;
  r public.riders;
  pl public.training_plans;
  ev record;
  v_cond jsonb;
  v_day date; v_through date; v_n int := 0; v_weekend boolean; v_rel int;
  e float8; f float8; k float8; peak float8; form float8;
  v_units float8; v_race float8; v_s float8; v_raw float8; v_o float8; v_l float8; v_prep float8; v_target float8;
  v_onset int; v_growth float8; v_ret float8; v_regain float8; v_inact float8; v_ageloss float8; v_over float8; v_ws date;
  s0 float8; s1 float8; s2 float8; v_season text; v_week int; v_plan_applied boolean;
begin
  if not public.rider_state_enabled() then return; end if;
  select * into r from public.riders where id = p_rider for update;
  if r.id is null then return; end if;
  v_through := (p_now at time zone 'utc')::date - 1;          -- only COMPLETED days are processed
  v_day := r.state_day;

  v_cond := r.condition;
  e := (v_cond ->> 'energy')::float8; f := (v_cond ->> 'fatigue')::float8; k := (v_cond ->> 'fitness')::float8; form := (v_cond ->> 'form')::float8;
  peak := r.fitness_peak;

  -- plans of weeks that ended on or before state_day and were never applied: attributes only (the days are already behind us);
  -- Energy / Fatigue are restored after the call, no load is added (nothing is credited or charged retroactively).
  for pl in
    select tp.* from public.training_plans tp
     where tp.rider_id = p_rider and tp.applied_at is null
       and public.training_plan_is_due(tp.season_id, tp.week_number, p_now)
       and (c_anchor + (public.season_number_of(tp.season_id) - 1) * 70 + tp.week_number * 7 - 1) <= v_day
     order by public.season_number_of(tp.season_id), tp.week_number
  loop
    update public.riders set condition = jsonb_set(jsonb_set(v_cond, '{energy}', to_jsonb(e)), '{fatigue}', to_jsonb(f)) where id = p_rider;
    if pl.plan_id is not null then perform public.apply_development_plan_v2(pl.id); else perform public.apply_training_plan_internal(pl.id); end if;
    select condition into v_cond from public.riders where id = p_rider;
  end loop;

  while v_day < v_through and v_n < c_max_days loop
    v_day := v_day + 1; v_n := v_n + 1;
    v_rel := v_day - c_anchor;
    v_weekend := mod(v_rel, 7) = 6;

    -- (1) loads of this day: stage events first (anything reported late is applied at the first processed day)
    for ev in select * from public.rider_load_events where rider_id = p_rider and day <= v_day and applied_at is null order by day, id for update loop
      e := greatest(0, e - ev.energy_base * r.energy_efficiency);
      f := least(100, f + ev.fatigue_base * r.fatigue_resistance);
      update public.rider_load_events set applied_at = p_now where id = ev.id;
    end loop;

    v_units := 0;
    if v_weekend then
      v_season := 'season-' || (v_rel / 70 + 1);
      v_week := (mod(v_rel, 70) / 7) + 1;
      select * into pl from public.training_plans tp where tp.rider_id = p_rider and tp.season_id = v_season and tp.week_number = v_week;
      if pl.id is not null then
        v_units := case when pl.plan_id is not null then (case pl.mode when 'full' then 1.0 else 0.6 end)
                        when pl.week_type = 'technical' then 0.4
                        else (case pl.intensity when 'hard' then 1.0 when 'normal' then 0.7 else 0.4 end) end;
        if pl.applied_at is null then
          -- attribute training with the state as it is right now; the old weekly Energy/Fatigue delta of that function is thrown away
          update public.riders set condition = jsonb_set(jsonb_set(v_cond, '{energy}', to_jsonb(e)), '{fatigue}', to_jsonb(f)) where id = p_rider;
          if pl.plan_id is not null then perform public.apply_development_plan_v2(pl.id); else perform public.apply_training_plan_internal(pl.id); end if;
          select condition into v_cond from public.riders where id = p_rider;
        end if;
        e := greatest(0, e - v_units * c_train_e * r.energy_efficiency);
        f := least(100, f + v_units * c_train_f * r.fatigue_resistance);
      end if;
    end if;

    -- (2) the day's regeneration (every calendar day, race day or not)
    e := least(100, e + (c_regen_e_base + c_regen_e_slope * r.recovery) * r.recovery_coef);
    f := greatest(0, f - (c_regen_f_base + c_regen_f_slope * r.recovery) * r.recovery_coef);

    -- (3) weekly evaluation on the week's last day: Fitness, then Form
    if v_weekend then
      v_ws := v_day - 6;
      select coalesce(sum(race_units), 0) into v_race from public.rider_load_events where rider_id = p_rider and day between v_ws and v_day;
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
    end if;
  end loop;

  update public.riders
     set condition = jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_cond, '{energy}', to_jsonb(e)), '{fatigue}', to_jsonb(f)), '{fitness}', to_jsonb(k)), '{form}', to_jsonb(form)),
         fitness_peak = peak, state_day = v_day
   where id = p_rider;
end;
$$;
revoke all on function public.rider_state_catch_up_internal(uuid, timestamptz) from public, anon, authenticated;

-- many riders (race start list, admin): one call, only riders that are actually behind are written
create or replace function public.rider_state_catch_up_many(p_riders uuid[], p_now timestamptz)
returns int language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_n int := 0;
begin
  for v_id in select id from public.riders where id = any (p_riders) and state_day < (p_now at time zone 'utc')::date - 1 loop
    perform public.rider_state_catch_up_internal(v_id, p_now); v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.rider_state_catch_up_many(uuid[], timestamptz) from public, anon, authenticated;

-- the owner's profile / any screen that needs the current state of the player's own rider
create or replace function public.refresh_my_rider_state()
returns void language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select id into v_id from public.riders where player_id = auth.uid();
  if v_id is not null then perform public.rider_state_catch_up_internal(v_id, now()); end if;
end;
$$;
revoke all on function public.refresh_my_rider_state() from public, anon, authenticated;
grant execute on function public.refresh_my_rider_state() to authenticated;

-- ---- 8. weekly training: ONE path. Switch ON -> the catch-up applies the plans in chronological order together with loads and regeneration;
--         switch OFF -> exactly the previous behaviour (copy of the 20261117_01 version). ----
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
  v_rider uuid;
  v_before int;
  v_after int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.rider_state_enabled() then
    select id into v_rider from public.riders where player_id = v_uid;
    if v_rider is null then return 0; end if;
    select count(*) into v_before from public.training_plans tp where tp.rider_id = v_rider and tp.applied_at is null and public.training_plan_is_due(tp.season_id, tp.week_number, now());
    perform public.rider_state_catch_up_internal(v_rider, now());
    select count(*) into v_after from public.training_plans tp where tp.rider_id = v_rider and tp.applied_at is null and public.training_plan_is_due(tp.season_id, tp.week_number, now());
    return v_before - v_after;
  end if;
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

-- ---- 9. season start: the +50 Energy / -50 Fatigue offseason shortcut is skipped while the daily regeneration is ON ----
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
  -- the +50 Energy / -50 Fatigue offseason shortcut only exists while the daily regeneration is off (otherwise it would count recovery twice)
  if not public.rider_state_enabled() then
    v_cond := jsonb_set(jsonb_set(v_cond, '{energy}', to_jsonb(least(100, (v_cond ->> 'energy')::numeric + 50))),
                        '{fatigue}', to_jsonb(greatest(0, (v_cond ->> 'fatigue')::numeric - 50)));
  end if;
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

-- ---- 10. transfer: the rider's state is brought up to date BEFORE it is copied; the coefficients, Vitality, aptitude profile and Fitness peak travel with him (nothing is reset) ----
create or replace function public.complete_rider_swap_internal(p_swap_id uuid, p_now timestamptz)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_swap public.rider_swaps;
  v_old public.riders;
  v_mk public.market_riders;
  v_plan uuid;
  v_new uuid;
  v_contract public.rider_contracts;
  v_old_contract public.rider_contracts;
  v_acq uuid;
begin
  select * into v_swap from public.rider_swaps where id = p_swap_id for update;
  if v_swap.id is null then
    raise exception 'swap_not_found';
  end if;
  if v_swap.status <> 'pending' then
    return 'already_' || v_swap.status;
  end if;
  if not public.rider_swap_enabled() then
    return 'disabled';
  end if;
  if v_swap.takeover_at > p_now then
    return 'not_due';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rider-swap:' || v_swap.manager_id::text, 0));

  select * into v_old from public.riders where id = v_swap.old_rider_id for update;
  select * into v_mk from public.market_riders where id = v_swap.market_rider_id for update;

  if v_old.id is null or v_old.player_id is distinct from v_swap.manager_id then
    -- the manager no longer has that rider: nothing to swap; release the reservation
    update public.market_riders set status = 'available' where id = v_mk.id and status = 'reserved';
    update public.rider_swaps set status = 'cancelled', cancel_reason = 'old_rider_changed', closed_at = p_now where id = v_swap.id;
    return 'cancelled';
  end if;
  if v_mk.status <> 'reserved' then
    raise exception 'inconsistent_reservation';
  end if;

  -- (4) close the OLD rider first -------------------------------------------------
  -- Trainings of every finished week are applied now (idempotent per plan).
  if public.rider_state_enabled() then
    perform public.rider_state_catch_up_internal(v_old.id, p_now);   -- state is current before it is copied: nothing is reset, nothing stale travels
  else
  for v_plan in
      select tp.id from public.training_plans tp
       where tp.rider_id = v_old.id and tp.applied_at is null
         and public.training_plan_is_due(tp.season_id, tp.week_number, p_now)
       order by public.season_number_of(tp.season_id), tp.week_number
    loop
      perform public.apply_training_plan_internal(v_plan);
    end loop;
  end if;

  -- Races: a finished Tour the rider was registered for must have its result stored.
  -- (There is no race processing yet: such a swap WAITS instead of losing the result.)
  if exists (
    select 1 from public.tour_registrations r
      join public.tour_schedule s on s.tour_id = r.tour_id
     where r.rider_id = v_old.id
       and public.training_plan_is_due(r.season_id, s.week_number, p_now)
       and not exists (select 1 from public.race_results rr
                        where rr.rider_id = v_old.id and rr.season_id = r.season_id and rr.tour_id = r.tour_id)
  ) then
    update public.rider_swaps set blocked_reason = 'races_not_closed' where id = v_swap.id;
    return 'deferred';
  end if;

  -- Eligibility is decided for the league the manager has NOW (after any season change).
  select * into v_old from public.riders where id = v_swap.old_rider_id;   -- after training
  if not public.rider_league_eligible(public.manager_league_now(v_swap.manager_id), v_mk.attributes, 'acquire') then
    update public.market_riders set status = 'available' where id = v_mk.id;
    update public.rider_swaps set status = 'cancelled', cancel_reason = 'not_eligible', closed_at = p_now, blocked_reason = null where id = v_swap.id;
    return 'cancelled';
  end if;

  -- (5) the old rider leaves ----------------------------------------------------
  -- Plans / registrations for weeks that have not happened can no longer be honoured by
  -- him and must not apply to a later manager: plans are closed WITHOUT effect
  -- (applied_at set, gains stay NULL — nothing is deleted), future registrations are removed.
  update public.training_plans set applied_at = p_now where rider_id = v_old.id and applied_at is null;
  delete from public.tour_registrations r
   using public.tour_schedule s
   where r.rider_id = v_old.id and s.tour_id = r.tour_id
     and not public.training_plan_is_due(r.season_id, s.week_number, p_now);

  select * into v_old_contract from public.rider_contracts where rider_id = v_old.id and status = 'active';
  if v_old_contract.id is not null then
    update public.rider_contracts set status = 'ended' where id = v_old_contract.id;
    insert into public.rider_career_events (rider_id, manager_id, acquisition_id, contract_id, event_type, season_id, season_week, league, division_number, occurred_at)
    select v_old.id, v_old.player_id, v_old_contract.acquisition_id, v_old_contract.id, 'contract_ended',
           v_swap.takeover_season_id, v_swap.takeover_week, a.league, a.division_number, v_swap.takeover_at
      from public.rider_acquisitions a where a.id = v_old_contract.acquisition_id
    on conflict do nothing;
  end if;

  update public.riders set player_id = null, on_market = true where id = v_old.id;
  select * into v_old from public.riders where id = v_old.id;

  update public.market_riders
     set status = 'available', acquired_by_player_id = null, acquired_at = null,
         season_id = public.season_id_at(p_now), age = v_old.age, attributes = v_old.attributes, condition = v_old.condition,
         inferred_archetype = v_old.inferred_archetype, potential = v_old.potential, trainability = v_old.trainability,
         professionalism = v_old.professionalism, recovery = v_old.recovery,
         vitality = v_old.vitality, aptitude_profile = v_old.aptitude_profile,
         energy_efficiency = v_old.energy_efficiency, fatigue_resistance = v_old.fatigue_resistance, recovery_coef = v_old.recovery_coef, fitness_peak = v_old.fitness_peak
   where acquired_rider_id = v_old.id;
  if not found then
    insert into public.market_riders (season_id, tier, status, first_name, surname, country_name, country_iso2, age, attributes, condition,
                                      inferred_archetype, potential, trainability, professionalism, recovery, generator_version, source,
                                      generated_at, acquired_rider_id,
                                      vitality, aptitude_profile, energy_efficiency, fatigue_resistance, recovery_coef, fitness_peak)
    values (public.season_id_at(p_now), 'free', 'available', v_old.first_name, v_old.surname, v_old.country_name, v_old.country_iso2,
            v_old.age, v_old.attributes, v_old.condition, v_old.inferred_archetype, v_old.potential, v_old.trainability,
            v_old.professionalism, v_old.recovery, v_old.generator_version, 'released', p_now, v_old.id,
            v_old.vitality, v_old.aptitude_profile, v_old.energy_efficiency, v_old.fatigue_resistance, v_old.recovery_coef, v_old.fitness_peak);
  end if;

  -- (8) the new rider becomes active --------------------------------------------
  if v_mk.acquired_rider_id is null then
    insert into public.riders (player_id, is_ai, on_market, first_name, surname, country_name, country_iso2, age, attributes, condition,
                               condition_previous, inferred_archetype, potential, trainability, professionalism, recovery, generator_version,
                               vitality, aptitude_profile, energy_efficiency, fatigue_resistance, recovery_coef, fitness_peak)
    values (v_swap.manager_id, false, false, v_mk.first_name, v_mk.surname, v_mk.country_name, v_mk.country_iso2, v_mk.age, v_mk.attributes,
            v_mk.condition, v_mk.condition, v_mk.inferred_archetype, v_mk.potential, v_mk.trainability, v_mk.professionalism, v_mk.recovery,
            v_mk.generator_version,
            v_mk.vitality, v_mk.aptitude_profile, v_mk.energy_efficiency, v_mk.fatigue_resistance, v_mk.recovery_coef, v_mk.fitness_peak)
    returning id into v_new;
  else
    v_new := v_mk.acquired_rider_id;
    update public.riders set player_id = v_swap.manager_id, on_market = false
     where id = v_new and on_market and player_id is null;
    if not found then
      raise exception 'rider_not_on_market';
    end if;
  end if;
  -- (the riders trigger has just written the 'acquired' snapshot with the manager's league)

  update public.market_riders
     set status = 'acquired', acquired_by_player_id = v_swap.manager_id, acquired_at = p_now, acquired_rider_id = v_new
   where id = v_mk.id;

  -- (9) the contract counts from the takeover week (the closure instant), not the reservation
  select * into v_contract from public.start_rider_contract_internal(v_new, v_swap.manager_id, v_swap.takeover_at);

  update public.rider_swaps
     set status = 'completed', new_rider_id = v_new, new_contract_id = v_contract.id, closed_at = p_now, blocked_reason = null
   where id = v_swap.id;
  return 'completed';
end;
$$;

-- ---- 9. closure entry point (lazy, like season aging) -----------------------
