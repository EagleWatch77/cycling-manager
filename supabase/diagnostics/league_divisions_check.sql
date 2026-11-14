-- READ-ONLY diagnostics for migrations 01-03 (nothing is changed).
-- Paste into Supabase -> SQL Editor of the SAME project the production app uses,
-- run it and send back the single JSON result.
select jsonb_pretty(jsonb_build_object(
  'database', current_database(),
  'now_utc', now() at time zone 'utc',
  'current_season_id', public.current_season_id(),
  'tables', (select coalesce(jsonb_agg(table_name order by table_name), '[]') from information_schema.tables
             where table_schema = 'public' and table_name in ('league_divisions', 'league_memberships')),
  'view_division_members', exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'division_members'),
  'tour_registrations_has_season_id', exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'tour_registrations' and column_name = 'season_id'),
  'functions', (select coalesce(jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by p.proname), '[]')
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname in ('assign_my_league_division', 'allocate_league_division', 'current_season_id', 'season_id_at')),
  'divisions', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'number', number, 'members', member_count, 'capacity', capacity) order by league, number), '[]')
             from public.league_divisions),
  'profiles_total', (select count(*) from public.profiles),
  'memberships_total', (select count(*) from public.league_memberships),
  'profiles_without_membership', (select count(*) from public.profiles p
             where not exists (select 1 from public.league_memberships m where m.player_id = p.id)),
  'accounts', (select coalesce(jsonb_agg(jsonb_build_object(
                 'name', p.display_name, 'email_start', left(u.email, 3) || '***',
                 'profiles_league', p.league,
                 'membership', d.league || ' 1.' || d.number,
                 'joined_season', m.joined_season_id) order by p.created_at), '[]')
             from public.profiles p
             join auth.users u on u.id = p.id
             left join public.league_memberships m on m.player_id = p.id
             left join public.league_divisions d on d.id = m.division_id),
  'policies', (select coalesce(jsonb_agg(tablename || ':' || policyname || ':' || cmd || ':' || roles::text order by tablename, policyname), '[]')
             from pg_policies where schemaname = 'public' and tablename in ('league_divisions', 'league_memberships', 'profiles')),
  'grants_authenticated', (select coalesce(jsonb_agg(table_name || ':' || privilege_type order by table_name, privilege_type), '[]')
             from information_schema.table_privileges
             where table_schema = 'public' and grantee = 'authenticated'
               and table_name in ('league_divisions', 'league_memberships', 'profiles', 'division_members')),
  'profiles_triggers', (select coalesce(jsonb_agg(tgname order by tgname), '[]') from pg_trigger
             where tgrelid = 'public.profiles'::regclass and not tgisinternal),
  'membership_triggers', (select coalesce(jsonb_agg(tgname order by tgname), '[]') from pg_trigger
             where tgrelid = 'public.league_memberships'::regclass and not tgisinternal),
  'event_triggers', (select coalesce(jsonb_agg(evtname order by evtname), '[]') from pg_event_trigger)
)) as league_check;
