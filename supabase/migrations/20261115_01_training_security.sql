-- ============================================================================
-- Migration 04 — Training V1, stage E1: security (audit O-008 + hidden values).
--
-- Closes the holes found in docs/TRAINING_AUDIT.md §4. Training mechanics,
-- growth formula and the accumulator threshold (12) are NOT changed: the body
-- of the old process_training_plan() is moved verbatim into an internal
-- function; only its identity source (the rider's owner instead of auth.uid())
-- and a "week really ended" guard differ.
--
--  1. training_plans: players can only READ. All writes go through
--     save_my_training_plan() (identity from auth.uid(), season + plannable week
--     from the SQL calendar, focus/type/intensity validated). A plan that is
--     already processed can never be changed; an unprocessed one may be
--     overwritten exactly as before (decision D11 still open).
--  2. Processing: apply_training_plan_internal() is not callable by any client
--     role. process_my_due_training() (owner only) applies only plans whose
--     week has ended according to the SQL calendar, oldest first, atomically
--     (one transaction, plan + rider rows locked) and idempotently.
--     The old public.process_training_plan(uuid) is dropped.
--  3. riders: no client INSERT/UPDATE/DELETE. Starter rider is created by
--     create_my_starter_rider() (range-validated), AI fillers by the
--     admin-only admin_generate_ai_riders(). Client SELECT is limited to the
--     public columns — potential, trainability, professionalism and recovery
--     are no longer readable through the API; the player gets only the 1-5
--     estimates via my_rider_estimates(). Admins read raw rows through
--     admin_list_riders().
--  4. rider_training_progress: no client access at all (the app never reads it;
--     it would let a player infer hidden values).
--
-- Run AFTER migrations 01-03. Idempotent. Deploy SQL FIRST, then the new code
-- (the old code cannot write riders/training_plans any more).
-- ============================================================================

-- ---- SQL calendar (mirrors lib/calendar/season.ts; anchor 2026-08-17, 10 weeks = 70 days) ----
create or replace function public.season_id_at(p_at timestamptz)
returns text
language sql
immutable
as $$
  select 'season-' || (greatest(0, floor(((p_at at time zone 'utc')::date - date '2026-08-17')::numeric / 70)) + 1)::int;
$$;

create or replace function public.current_season_id()
returns text
language sql
stable
as $$
  select public.season_id_at(now());
$$;

-- 1-based season number of "season-N" (null for anything else).
create or replace function public.season_number_of(p_season_id text)
returns int
language sql
immutable
as $$
  select case when p_season_id ~ '^season-[0-9]{1,6}$' then substring(p_season_id from 8)::int end;
$$;

-- Week 1..10 of the season that contains p_at (before the anchor: week 1).
create or replace function public.season_week_at(p_at timestamptz)
returns int
language sql
immutable
as $$
  select (mod(greatest(0, (p_at at time zone 'utc')::date - date '2026-08-17'), 70) / 7) + 1;
$$;

-- True only when the plan's week has fully ended: an earlier season, or an earlier week of the current one.
create or replace function public.training_plan_is_due(p_season_id text, p_week int, p_at timestamptz)
returns boolean
language sql
immutable
as $$
  select coalesce(public.season_number_of(p_season_id), 0) >= 1
     and p_week between 1 and 10
     and (
       public.season_number_of(p_season_id) < public.season_number_of(public.season_id_at(p_at))
       or (public.season_number_of(p_season_id) = public.season_number_of(public.season_id_at(p_at))
           and p_week < public.season_week_at(p_at))
     );
$$;

grant execute on function public.season_id_at(timestamptz) to authenticated;
grant execute on function public.current_season_id() to authenticated;
grant execute on function public.season_number_of(text) to authenticated;
grant execute on function public.season_week_at(timestamptz) to authenticated;
grant execute on function public.training_plan_is_due(text, int, timestamptz) to authenticated;

-- ---- 1. Plans: read-only for clients, one trusted write path ----
drop policy if exists "training_plans_insert_own" on public.training_plans;
drop policy if exists "training_plans_update_own" on public.training_plans;
drop policy if exists "training_plans_delete_own" on public.training_plans;
revoke all on public.training_plans from anon, authenticated;
grant select on public.training_plans to authenticated;

create or replace function public.save_my_training_plan(p_week_type text, p_focus text, p_intensity text)
returns public.training_plans
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rider uuid;
  v_intensity text;
  v_season text;
  v_week int;
  v_row public.training_plans;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_rider from public.riders where player_id = v_uid;
  if v_rider is null then
    raise exception 'no_rider';
  end if;

  -- Type / focus / intensity pairing — mirrors lib/training/repository.ts (kept in sync by hand).
  if p_week_type = 'performance' then
    if p_intensity is null or p_intensity not in ('light', 'normal', 'hard')
       or p_focus is null or not public.is_performance_attribute(p_focus) then
      raise exception 'invalid_focus';
    end if;
    v_intensity := p_intensity;
  elsif p_week_type = 'technical' then
    if p_focus is null or not public.is_technical_attribute(p_focus) then
      raise exception 'invalid_focus';
    end if;
    v_intensity := 'light'; -- TECHNICAL_INTENSITY_PLACEHOLDER, no player-facing meaning
  else
    raise exception 'invalid_focus';
  end if;

  -- The ONE plannable week: current week + 1, capped at the season's last week (never client-supplied).
  v_season := public.current_season_id();
  v_week := least(public.season_week_at(now()) + 1, 10);

  -- A processed plan is history. The WHERE keeps that true even if processing
  -- commits between statements (the row lock makes this re-check the latest row).
  insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity)
  values (v_rider, v_season, v_week, p_week_type, p_focus, v_intensity)
  on conflict (rider_id, season_id, week_number) do update
    set week_type = excluded.week_type,
        focus = excluded.focus,
        intensity = excluded.intensity,
        updated_at = now()
    where public.training_plans.applied_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'already_processed';
  end if;
  return v_row;
end;
$$;

revoke all on function public.save_my_training_plan(text, text, text) from public, anon, authenticated;
grant execute on function public.save_my_training_plan(text, text, text) to authenticated;

-- ---- 2. Processing ----
drop function if exists public.process_training_plan(uuid);

create or replace function public.apply_training_plan_internal(p_plan_id uuid)
returns table(primary_gain int, secondary_gain int, already_processed boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  -- ---- Kept in sync by hand with lib/training/config.ts ----
  v_base_training constant numeric := 3;
  v_technical_base constant numeric := 2.0;
  v_secondary_gain_share constant numeric := 0.35;
  v_threshold constant numeric := 12; -- TRAINING_GAIN_THRESHOLD
  v_technical_weekly_gain_cap constant int := 1; -- TECHNICAL_WEEKLY_GAIN_CAP
  v_recovery_day_energy constant numeric := 5; -- RECOVERY_DAY_ENERGY
  v_recovery_day_fatigue constant numeric := 4; -- RECOVERY_DAY_FATIGUE
  v_technical_energy_cost constant numeric := 5; -- TECHNICAL_ENERGY_COST
  v_technical_fatigue_gain constant numeric := 5; -- TECHNICAL_FATIGUE_GAIN
  v_technical_recovery_days constant numeric := 6; -- TECHNICAL_RECOVERY_DAYS
  -- ---- Kept in sync by hand with lib/facilities/config.ts (trainingCenterMultiplier()/recoveryCenterMultiplier()) ----
  -- ---- Kept in sync by hand with lib/leagues.ts (maxFacilityLevel) ----

  v_plan_applied_at timestamptz;
  v_plan_season text;
  v_plan_week int;
  v_rider_id uuid;
  v_week_type text;
  v_focus text;
  v_intensity text;
  v_primary_attr text;
  v_secondary_attr text;

  v_owner_id uuid;
  v_age int;
  v_trainability numeric;
  v_professionalism numeric;
  v_potential numeric;
  v_attrs jsonb;
  v_condition jsonb;
  v_condition_previous jsonb;
  v_current_value numeric;

  v_league text;
  v_is_admin boolean;
  v_league_cap int;
  v_team_center_level int;
  v_team_center_cap int;
  v_training_cap int;
  v_training_level int;
  v_recovery_level int;
  v_effective_training_level int;
  v_effective_recovery_level int;
  v_training_bonus numeric;
  v_recovery_multiplier numeric;

  v_session_count numeric;
  v_trainability_factor numeric;
  v_professionalism_factor numeric;
  v_age_factor numeric;
  v_facility_multiplier numeric;
  v_base numeric;

  v_energy numeric;
  v_fatigue numeric;
  v_readiness_score numeric;
  v_readiness_factor numeric;
  v_training_energy_cost numeric;
  v_training_fatigue_gain numeric;
  v_recovery_days numeric;
  v_energy_delta numeric;
  v_fatigue_delta numeric;
  v_new_energy numeric;
  v_new_fatigue numeric;

  v_overall_performance numeric;
  v_secondary_current_value numeric;
  v_primary_dev_factor numeric;
  v_secondary_dev_factor numeric;
  v_primary_at_cap boolean;
  v_max_primary_gain int;

  v_primary_raw numeric;
  v_secondary_raw numeric;
  v_progress numeric;
  v_total numeric;
  v_uncapped_gain int;
  v_primary_gain int := 0;
  v_secondary_gain int := 0;
begin
  select applied_at, rider_id, week_type, focus, intensity, season_id, week_number
  into v_plan_applied_at, v_rider_id, v_week_type, v_focus, v_intensity, v_plan_season, v_plan_week
  from public.training_plans
  where id = p_plan_id
  for update;

  if v_rider_id is null then
    raise exception 'plan_not_found';
  end if;

  select player_id, age, attributes, condition, trainability, professionalism, potential
  into v_owner_id, v_age, v_attrs, v_condition, v_trainability, v_professionalism, v_potential
  from public.riders
  where id = v_rider_id
  for update;

  -- AI fillers (no owner) never train; everything below keys off the rider's
  -- OWNER, never off the caller (this function has no caller identity).
  if v_owner_id is null then
    raise exception 'no_owner';
  end if;

  -- Idempotency: already processed => no-op (the plan row is locked above, so
  -- a concurrent run waits here and then sees applied_at set).
  if v_plan_applied_at is not null then
    return query select 0, 0, true;
    return;
  end if;

  -- Only a plan whose week has really ended (per the SQL calendar) may be applied.
  if not public.training_plan_is_due(v_plan_season, v_plan_week, now()) then
    raise exception 'not_due';
  end if;

  -- Primary attribute comes ONLY from the plan's own persisted focus —
  -- never a parameter. week_type decides which focus family is valid; a
  -- plan can never mix technical+climbing or performance+descending
  -- (item 24) because saveTrainingPlan() already validates this pairing at
  -- save time — this is defense-in-depth, not the only guard.
  v_primary_attr := v_focus;

  if v_week_type = 'performance' then
    if not public.is_performance_attribute(v_primary_attr) then
      raise exception 'invalid_focus';
    end if;

    -- Fixed SECONDARY_ATTRIBUTE mapping — kept in sync by hand with
    -- lib/training/config.ts. Never accepted as a parameter. Performance
    -- training must never be a backdoor way to raise Tactics/Technique —
    -- every one of these 7 active pairs is Performance-only (see
    -- lib/training/secondaryMapping.test.ts).
    v_secondary_attr := case v_primary_attr
      when 'climbing' then 'endurance'
      when 'hills' then 'acceleration'
      when 'flat' then 'timeTrial'
      when 'sprint' then 'acceleration'
      when 'timeTrial' then 'endurance'
      when 'endurance' then 'timeTrial'
      when 'acceleration' then 'sprint'
      else null
    end;

    v_session_count := case v_intensity
      when 'light' then 1
      when 'normal' then 2
      when 'hard' then 3
      else 1
    end;
    v_training_energy_cost := case v_intensity when 'light' then 5 when 'normal' then 10 when 'hard' then 15 else 5 end;
    v_training_fatigue_gain := case v_intensity when 'light' then 5 when 'normal' then 10 when 'hard' then 18 else 5 end;
    v_recovery_days := case v_intensity when 'light' then 6 when 'normal' then 5 when 'hard' then 4 else 6 end;
    v_max_primary_gain := 2147483647; -- effectively unlimited — Performance has no weekly cap
  elsif v_week_type = 'technical' then
    if not public.is_technical_attribute(v_primary_attr) then
      raise exception 'invalid_focus';
    end if;

    -- Technical training has no secondary gain at all (item 10) — trains
    -- ONLY the chosen focus.
    v_secondary_attr := null;

    v_session_count := 1; -- always exactly 1 technical session/week — no player-facing intensity
    v_training_energy_cost := v_technical_energy_cost;
    v_training_fatigue_gain := v_technical_fatigue_gain;
    v_recovery_days := v_technical_recovery_days;
    v_max_primary_gain := v_technical_weekly_gain_cap; -- item 9: hard cap, +1/week, never more
  else
    raise exception 'invalid_week_type';
  end if;

  -- ---- Effective Training Center / Recovery Center level (mirrors lib/facilities/capMath.ts — both share the same "otherCap" formula) ----
  select coalesce(training_level, 1), coalesce(recovery_level, 1), coalesce(team_center_level, 1)
  into v_training_level, v_recovery_level, v_team_center_level
  from public.player_facilities
  where player_id = v_owner_id;
  v_training_level := coalesce(v_training_level, 1);
  v_recovery_level := coalesce(v_recovery_level, 1);
  v_team_center_level := coalesce(v_team_center_level, 1);

  select exists(select 1 from public.admin_users a where a.user_id = v_owner_id) into v_is_admin;

  select league into v_league from public.profiles where id = v_owner_id;
  v_league := coalesce(v_league, 'rookie');

  v_league_cap := case v_league
    when 'rookie' then 1
    when 'amateur' then 2
    when 'continental' then 3
    when 'pro' then 4
    when 'elite' then 5
    else 1
  end;
  if v_is_admin then
    v_league_cap := 5;
  end if;

  v_team_center_cap := least(5, v_team_center_level + 1);
  v_training_cap := least(v_league_cap, v_team_center_cap); -- shared "otherCap" — training/recovery/scouting/technical all use this same cap
  v_effective_training_level := least(v_training_level, v_training_cap);
  v_effective_recovery_level := least(v_recovery_level, v_training_cap);

  -- Training Center V1 FINAL model (see the chat report, "TRAINING CENTER
  -- CLOSE-OUT"): age-banded, non-additive. Each level unlocks ONE more age
  -- band's bonus but a rider only ever gets the single multiplier for
  -- their OWN age band — bands never stack/sum even at L5, where the
  -- facility has "unlocked" all four. Mirrors
  -- lib/facilities/config.ts's trainingCenterMultiplier() exactly (own age
  -- bands: 17-23/24-27/28-31/32+ — deliberately DIFFERENT boundaries from
  -- v_age_factor's biological-age bands above; this is a separate
  -- multiplicative layer, never merged with it — item 3 of the request).
  v_training_bonus := case
    when v_age <= 23 then case when v_effective_training_level >= 2 then 0.15 else 0 end
    when v_age <= 27 then case when v_effective_training_level >= 3 then 0.10 else 0 end
    when v_age <= 31 then case when v_effective_training_level >= 4 then 0.05 else 0 end
    else case when v_effective_training_level >= 5 then 0.03 else 0 end
  end;
  -- Technical training deliberately has NO facility multiplier at all
  -- (item 5/11 — Training Center only ever affects Performance training;
  -- Technical Center, a completely different facility, is the one that
  -- handles bike technical risk/service — never confuse the two).
  v_facility_multiplier := case when v_week_type = 'performance' then 1 + v_training_bonus else 1 end;

  v_recovery_multiplier := case v_effective_recovery_level
    when 1 then 1.00
    when 2 then 1.05
    when 3 then 1.10
    when 4 then 1.15
    when 5 then 1.20
    else 1.00
  end;

  -- ---- Readiness (item 17) — computed from CURRENT (pre-this-week) condition, never from a client-supplied value ----
  v_energy := (v_condition ->> 'energy')::numeric;
  v_fatigue := (v_condition ->> 'fatigue')::numeric;
  v_readiness_score := public.readiness_score(v_energy, v_fatigue);
  v_readiness_factor := public.readiness_effectiveness(v_readiness_score);

  v_trainability_factor := 0.5 + v_trainability / 200;
  v_professionalism_factor := 0.8 + v_professionalism / 500;
  v_age_factor := case
    when v_age <= 19 then 1.30
    when v_age <= 22 then 1.20
    when v_age <= 25 then 1.10
    when v_age <= 28 then 1.00
    when v_age <= 31 then 0.80
    when v_age <= 34 then 0.55
    else 0.30
  end;

  v_current_value := (v_attrs ->> v_primary_attr)::numeric;

  if v_week_type = 'performance' then
    -- ---- Development Model V2 (see the chat report) ----
    -- Replaces potentialCeiling()/potentialRoomFactor(): Potential no
    -- longer implies a per-attribute ceiling. developmentRoomFactor is
    -- keyed to overallPerformance (all 7 Performance attributes together)
    -- and the attribute's own value — see
    -- public.development_room_factor() above. NOT used for Technical
    -- training at all (item 11) — Technique has no Performance ceiling.
    v_overall_performance := public.overall_performance(v_attrs);
    v_primary_at_cap := v_current_value >= 200;

    -- base = everything EXCEPT the development-room factor — shared
    -- between primary and secondary, exactly mirroring
    -- lib/training/growth.ts's calculatePerformanceRawGrowth() `base`.
    -- v_session_count REPLACES the old flat intensity multiplier.
    v_base := v_base_training * v_session_count * v_trainability_factor
      * v_professionalism_factor * v_age_factor * v_facility_multiplier * v_readiness_factor;

    if v_primary_at_cap then
      -- At/above the Performance ceiling (200), no further accumulator
      -- progress at all for this attribute — not just raw=0.
      v_primary_dev_factor := 0;
      v_primary_raw := 0;
    else
      v_primary_dev_factor := public.development_room_factor(v_current_value, v_overall_performance, v_potential);
      v_primary_raw := greatest(0, v_base * v_primary_dev_factor);
    end if;

    -- Secondary attribute: developmentRoomFactor only applies when it is
    -- ALSO one of the 7 Performance attributes — which, since Weekly
    -- Training V1 is Performance-only, is always true for every reachable
    -- focus today (see growth.ts's own doc comment on why the
    -- non-Performance branch is kept as a safety net, not removed).
    if v_secondary_attr is not null then
      v_secondary_current_value := (v_attrs ->> v_secondary_attr)::numeric;
      if public.is_performance_attribute(v_secondary_attr) then
        if v_secondary_current_value >= 200 then
          v_secondary_dev_factor := 0;
        else
          v_secondary_dev_factor := public.development_room_factor(v_secondary_current_value, v_overall_performance, v_potential);
        end if;
      else
        v_secondary_dev_factor := 1;
      end if;
      v_secondary_raw := greatest(0, v_base * v_secondary_dev_factor * v_secondary_gain_share);
    end if;
  else
    -- ---- Technical training (item 11): no facility bonus, no
    -- Development Model V2 — Technique stays on the canonical 100-160
    -- scale, Potential does not govern it. No secondary gain at all
    -- (v_secondary_attr is null, so the secondary block below no-ops).
    v_primary_at_cap := false;
    v_base := v_technical_base * v_trainability_factor * v_professionalism_factor * v_age_factor * v_readiness_factor;
    v_primary_raw := greatest(0, v_base);
  end if;

  -- Primary attribute — v_primary_attr came from training_plans.focus
  -- itself, never from a caller-supplied parameter. At the Performance
  -- ceiling, skip progress accumulation entirely (not merely add a raw=0
  -- no-op) — there is nothing left to accumulate. v_max_primary_gain caps
  -- Technical training at +1/week (item 9) — any progress beyond that
  -- stays banked in rider_training_progress for a future week, never lost.
  if not v_primary_at_cap then
    insert into public.rider_training_progress (rider_id, attribute, progress)
    values (v_rider_id, v_primary_attr, 0)
    on conflict (rider_id, attribute) do nothing;

    select progress into v_progress
    from public.rider_training_progress
    where rider_id = v_rider_id and attribute = v_primary_attr
    for update;

    -- 0.000000001 epsilon before floor(): mirrors accumulateProgress()'s own
    -- (see lib/training/accumulator.ts) — guards the same threshold-crossing
    -- edge as there, kept in sync by hand.
    v_total := v_progress + v_primary_raw;
    v_uncapped_gain := floor((v_total + 0.000000001) / v_threshold)::int;
    v_primary_gain := least(v_uncapped_gain, v_max_primary_gain);

    update public.rider_training_progress
    set progress = greatest(0, v_total - v_primary_gain * v_threshold), updated_at = now()
    where rider_id = v_rider_id and attribute = v_primary_attr;

    if v_primary_gain > 0 then
      v_attrs := jsonb_set(v_attrs, array[v_primary_attr],
        to_jsonb(least(public.attribute_clamp_max(v_primary_attr), greatest(100, (v_attrs ->> v_primary_attr)::int + v_primary_gain))));
    end if;
  end if;

  -- Secondary attribute (optional, Performance only) — its own, separate
  -- progress row: never a shared pool with the primary attribute. Same
  -- ceiling-skip rule applies if the secondary itself is a Performance
  -- attribute already at 200. Never capped (Technical training never
  -- reaches here — v_secondary_attr is always null for it).
  if v_secondary_attr is not null and v_secondary_dev_factor is distinct from 0 then
    insert into public.rider_training_progress (rider_id, attribute, progress)
    values (v_rider_id, v_secondary_attr, 0)
    on conflict (rider_id, attribute) do nothing;

    select progress into v_progress
    from public.rider_training_progress
    where rider_id = v_rider_id and attribute = v_secondary_attr
    for update;

    v_total := v_progress + v_secondary_raw;
    v_secondary_gain := floor((v_total + 0.000000001) / v_threshold)::int;

    update public.rider_training_progress
    set progress = greatest(0, v_total - v_secondary_gain * v_threshold), updated_at = now()
    where rider_id = v_rider_id and attribute = v_secondary_attr;

    if v_secondary_gain > 0 then
      v_attrs := jsonb_set(v_attrs, array[v_secondary_attr],
        to_jsonb(least(public.attribute_clamp_max(v_secondary_attr), greatest(100, (v_attrs ->> v_secondary_attr)::int + v_secondary_gain))));
    end if;
  end if;

  -- ---- Condition (item 25: SQL owns this now, not the TS app) ----
  -- Training cost applied ONCE per plan (item 13/14); passive weekly
  -- recovery (item 15) boosted by the Recovery Center multiplier (item 16,
  -- applied only here, never to raw growth or to the training cost).
  v_energy_delta := -v_training_energy_cost + v_recovery_days * v_recovery_day_energy * v_recovery_multiplier;
  v_fatigue_delta := v_training_fatigue_gain - v_recovery_days * v_recovery_day_fatigue * v_recovery_multiplier;
  -- Rounding audit (see the chat report, "REGENERAČNÉ CENTRUM CLOSE-OUT",
  -- item 12): the Recovery Center multiplier (1.05-1.20) makes this
  -- genuinely fractional (e.g. 5 * 5 * 1.15 = 28.75) — round the new total
  -- to the nearest whole number FIRST, THEN clamp, exactly mirroring
  -- lib/training/condition.ts's applyConditionDelta() (Math.round then
  -- clamp100) so the two can never diverge — see recoveryCenterSql.test.ts.
  v_new_energy := least(100, greatest(0, round(v_energy + v_energy_delta)));
  v_new_fatigue := least(100, greatest(0, round(v_fatigue + v_fatigue_delta)));

  v_condition_previous := v_condition;
  v_condition := jsonb_set(jsonb_set(v_condition, '{energy}', to_jsonb(v_new_energy)), '{fatigue}', to_jsonb(v_new_fatigue));

  update public.riders set attributes = v_attrs, condition = v_condition, condition_previous = v_condition_previous where id = v_rider_id;

  update public.training_plans set
    applied_at = now(),
    primary_attr = v_primary_attr,
    primary_gain = v_primary_gain,
    secondary_attr = v_secondary_attr,
    secondary_gain = case when v_secondary_attr is not null then v_secondary_gain else null end
  where id = p_plan_id;

  return query select v_primary_gain, v_secondary_gain, false;
end;
$$;

revoke all on function public.apply_training_plan_internal(uuid) from public, anon, authenticated;

-- Applies every due plan of the CALLER's own rider, oldest (season, week) first.
-- Takes no parameters: nothing here can be influenced by the client. Safe to
-- call repeatedly and concurrently — the plan row is locked and re-checked
-- inside apply_training_plan_internal().
create or replace function public.process_my_due_training()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_done int := 0;
  v_already boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  for v_id in
    select tp.id
    from public.training_plans tp
    join public.riders r on r.id = tp.rider_id
    where r.player_id = v_uid
      and tp.applied_at is null
      and public.training_plan_is_due(tp.season_id, tp.week_number, now())
    order by public.season_number_of(tp.season_id), tp.week_number
  loop
    select a.already_processed into v_already from public.apply_training_plan_internal(v_id) a;
    if not v_already then
      v_done := v_done + 1;
    end if;
  end loop;

  return v_done;
end;
$$;

revoke all on function public.process_my_due_training() from public, anon, authenticated;
grant execute on function public.process_my_due_training() to authenticated;

-- ---- 3. riders ----
drop policy if exists "riders_insert_own" on public.riders;
drop policy if exists "riders_update_own" on public.riders;
revoke all on public.riders from anon, authenticated;
-- Public columns ONLY (a column added later has no client access until granted).
-- Hidden: potential, trainability, professionalism, recovery.
grant select (id, player_id, first_name, surname, country_name, country_iso2, age,
              attributes, condition, condition_previous, inferred_archetype,
              generator_version, is_ai, created_at)
  on public.riders to authenticated;

-- The player's own estimates (1-5), never the raw values. Mirrors
-- lib/rider/development.ts scoreToLevel() (range 55-95 for all four fields).
create or replace function public.rider_score_to_level(p_value int)
returns int
language sql
immutable
as $$
  select greatest(1, least(5, ceil(((p_value - 55)::float8 / 40::float8) * 5::float8)))::int;
$$;

create or replace function public.my_rider_estimates()
returns table (potential_stars int, trainability_level int, professionalism_level int, recovery_level int)
language sql
stable
security definer set search_path = public
as $$
  select public.rider_score_to_level(r.potential), public.rider_score_to_level(r.trainability),
         public.rider_score_to_level(r.professionalism), public.rider_score_to_level(r.recovery)
  from public.riders r
  where r.player_id = auth.uid();
$$;

revoke all on function public.rider_score_to_level(int) from public, anon, authenticated;
revoke all on function public.my_rider_estimates() from public, anon, authenticated;
grant execute on function public.my_rider_estimates() to authenticated;

-- Starter rider: the app still generates it (lib/rider/generate.ts), the DB now
-- validates it against the same bounds and owns the insert. Idempotent: a player
-- who already has a rider gets that rider's id and nothing is written.
create or replace function public.create_my_starter_rider(p_rider jsonb)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_key text;
  v_val numeric;
  v_attrs jsonb := p_rider -> 'attributes';
  v_cond jsonb := p_rider -> 'condition';
  v_keys constant text[] := array[
    'climbing','hills','flat','sprint','timeTrial','endurance','acceleration',
    'positioning','attackTiming','reaction','energyManagement','breakawaySkill',
    'descending','bikeHandling','cornering','packRiding','roughSurface','wetHandling','experience'];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_id from public.riders where player_id = v_uid;
  if v_id is not null then
    return v_id;
  end if;

  -- Bounds mirror lib/rider/config.ts (ROOKIE_BASE 130 +/- 5, shape +/- 10, noise +/- 3 => 112..148; ages 18-22; hidden 55-95).
  if jsonb_typeof(v_attrs) <> 'object' or (select count(*) from jsonb_object_keys(v_attrs)) <> array_length(v_keys, 1) then
    raise exception 'invalid_rider';
  end if;
  foreach v_key in array v_keys loop
    if jsonb_typeof(v_attrs -> v_key) <> 'number' then raise exception 'invalid_rider'; end if;
    v_val := (v_attrs ->> v_key)::numeric;
    if v_val <> trunc(v_val) or v_val < 112 or v_val > 148 then raise exception 'invalid_rider'; end if;
  end loop;

  if v_cond is distinct from '{"energy":100,"fatigue":0,"form":50,"fitness":60,"morale":70}'::jsonb then
    raise exception 'invalid_rider';
  end if;
  if coalesce((p_rider ->> 'age')::int, 0) not between 18 and 22
     or coalesce((p_rider ->> 'potential')::int, 0) not between 55 and 95
     or coalesce((p_rider ->> 'trainability')::int, 0) not between 55 and 95
     or coalesce((p_rider ->> 'professionalism')::int, 0) not between 55 and 95
     or coalesce((p_rider ->> 'recovery')::int, 0) not between 55 and 95
     or coalesce(p_rider ->> 'generator_version', '') <> 'starter-v1'
     or coalesce(p_rider ->> 'inferred_archetype', '') not in ('allrounder','rouleur','climber','puncheur','sprinter','timeTrial','classics')
     or char_length(coalesce(p_rider ->> 'first_name', '')) not between 1 and 40
     or char_length(coalesce(p_rider ->> 'surname', '')) not between 1 and 40
     or char_length(coalesce(p_rider ->> 'country_name', '')) not between 1 and 60
     or char_length(coalesce(p_rider ->> 'country_iso2', '')) <> 2 then
    raise exception 'invalid_rider';
  end if;

  begin
    insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes,
                               condition, condition_previous, inferred_archetype, potential, trainability,
                               professionalism, recovery, generator_version)
    values (v_uid, p_rider ->> 'first_name', p_rider ->> 'surname', p_rider ->> 'country_name',
            p_rider ->> 'country_iso2', (p_rider ->> 'age')::int, v_attrs, v_cond, v_cond,
            p_rider ->> 'inferred_archetype', (p_rider ->> 'potential')::int, (p_rider ->> 'trainability')::int,
            (p_rider ->> 'professionalism')::int, (p_rider ->> 'recovery')::int, 'starter-v1')
    returning id into v_id;
  exception when unique_violation then
    -- A concurrent request created it first.
    select id into v_id from public.riders where player_id = v_uid;
    return v_id;
  end;

  insert into public.bike_condition (rider_id) values (v_id) on conflict do nothing;
  return v_id;
end;
$$;

revoke all on function public.create_my_starter_rider(jsonb) from public, anon, authenticated;
grant execute on function public.create_my_starter_rider(jsonb) to authenticated;

-- Admin/test tooling only (admin_users). AI fillers and the raw read for the admin pages.
create or replace function public.admin_generate_ai_riders(p_rows jsonb)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_row jsonb;
  v_id uuid;
  v_n int := 0;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'not_admin';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_rows';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into public.riders (player_id, is_ai, first_name, surname, country_name, country_iso2, age, attributes,
                               condition, condition_previous, inferred_archetype, potential, trainability,
                               professionalism, recovery, generator_version)
    values (null, true, v_row ->> 'first_name', v_row ->> 'surname', v_row ->> 'country_name', v_row ->> 'country_iso2',
            (v_row ->> 'age')::int, v_row -> 'attributes', v_row -> 'condition', v_row -> 'condition_previous',
            v_row ->> 'inferred_archetype', (v_row ->> 'potential')::int, (v_row ->> 'trainability')::int,
            (v_row ->> 'professionalism')::int, (v_row ->> 'recovery')::int, v_row ->> 'generator_version')
    returning id into v_id;
    insert into public.bike_condition (rider_id) values (v_id) on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.admin_list_riders(p_id uuid default null)
returns setof public.riders
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'not_admin';
  end if;
  return query select * from public.riders r where p_id is null or r.id = p_id order by r.created_at desc;
end;
$$;

revoke all on function public.admin_generate_ai_riders(jsonb) from public, anon, authenticated;
revoke all on function public.admin_list_riders(uuid) from public, anon, authenticated;
grant execute on function public.admin_generate_ai_riders(jsonb) to authenticated;
grant execute on function public.admin_list_riders(uuid) to authenticated;

-- ---- 4. rider_training_progress: no client access ----
revoke all on public.rider_training_progress from anon, authenticated;
