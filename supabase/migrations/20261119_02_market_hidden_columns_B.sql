-- O-011, part B of 2 — RUN ONLY AFTER part A has run AND the new code is deployed (green Vercel build).
-- Closes the API leak: a player's session may read ONLY the public columns of market_riders (+ the star bucket).
-- Hidden: potential, trainability, professionalism, recovery, vitality, aptitude_profile, energy_efficiency, fatigue_resistance,
--         recovery_coef, fitness_peak, condition, generator_version, source, generated_at, acquired_by_player_id, acquired_at.
-- Row-level security policies stay exactly as they are; INSERT / UPDATE / DELETE rights stay as they are (RLS: admin only).
-- Changes no data. Idempotent. If anything in the Trh breaks after this file: run 20261119_03_market_hidden_columns_ROLLBACK.sql.
do $guard$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'market_riders' and column_name = 'potential_stars')
     or to_regprocedure('public.admin_market_riders(text)') is null then
    raise exception 'Part A (20261119_01_market_hidden_columns_A.sql) has not been run yet - nothing was changed.';
  end if;
end
$guard$;

revoke select on public.market_riders from public, anon, authenticated;
grant select (id, season_id, tier, status, first_name, surname, country_name, country_iso2, age, attributes, inferred_archetype, potential_stars, acquired_rider_id)
  on public.market_riders to authenticated;
