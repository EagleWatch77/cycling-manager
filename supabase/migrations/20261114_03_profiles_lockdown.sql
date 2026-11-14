-- ============================================================================
-- Migration 03 — security fix O-007: a player must not edit their own league.
--
-- Before: `grant select, update on public.profiles to authenticated` plus an
-- UPDATE policy without WITH CHECK let any signed-in player run
-- `update profiles set league = 'elite'` from the browser (the anon key is
-- public). league_memberships (migration 02) is now the authoritative source
-- of a player's league and sub-league; profiles.league is a copy kept in sync
-- by the trusted trigger league_membership_sync_profile.
--
-- After:
--   * players may UPDATE only display_name and preferred_language (their own row);
--   * no INSERT/DELETE for players at all (rows come from the sign-up trigger);
--   * a guard trigger rejects any change of league made by a client role, so a
--     future careless GRANT cannot reopen the hole;
--   * the sync trigger (SECURITY DEFINER, runs as the table owner) still works.
--
-- Run AFTER migrations 01 and 02. Idempotent. The app never writes profiles
-- from the browser (sign-up passes metadata to the trigger), so nothing breaks.
-- ============================================================================

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, preferred_language) on public.profiles to authenticated;

create or replace function public.profiles_league_guard_trg()
returns trigger
language plpgsql
as $$
begin
  -- current_user is the CALLER's role for a plain UPDATE (a client) and the
  -- function owner inside the SECURITY DEFINER sync trigger.
  if new.league is distinct from old.league and current_user in ('anon', 'authenticated') then
    raise exception 'league_is_server_controlled' using errcode = '42501';
  end if;
  if new.id is distinct from old.id and current_user in ('anon', 'authenticated') then
    raise exception 'profile_id_is_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_league_guard on public.profiles;
create trigger profiles_league_guard
  before update on public.profiles
  for each row execute function public.profiles_league_guard_trg();
