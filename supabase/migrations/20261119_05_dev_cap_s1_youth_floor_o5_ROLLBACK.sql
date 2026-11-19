-- ROLLBACK of the working model S1 + O5 (20261119_04_dev_cap_s1_youth_floor_o5.sql). Run ONLY if the owner decides to go back.
-- It restores EXACTLY the function that production had before: apply_development_plan_v2 as defined in 20261117_04_training_plans_calendar.sql
-- (soft cap slope 1.25, no youth floor). It changes no stored data (riders, attributes, progress, plans stay as they are) and is idempotent.
-- Attributes already gained under S1+O5 are kept (training never lowers an attribute); only the FUTURE weekly steps follow the old model again.
-- After it, the TypeScript model (DEV_CONFIG capSlope 1.5 + youthRoomFloor 0.30 in apps/web/src/lib/training/development/config.ts) must be returned too
-- (capSlope 1.25, youthRoomFloor 0) by reverting the code commit, so that screen estimates and SQL stay the same.
-- Tested: supabase/tests/dev_s1o5_rollback.test.sh (function body after the rollback is byte-identical to the one before S1+O5).

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

-- the helper of S1+O5 is not used by anything any more
drop function if exists public.dev_phys_room(float8, float8, int);
