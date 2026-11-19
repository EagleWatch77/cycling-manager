-- 03_obnovenie_zo_zalohy_AK_TREBA.sql – iba ak by si chcel vrátiť zmazaných 45 jazdcov (vloží ich späť s pôvodnými ID, existujúce preskočí)
do $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ',' order by attnum) into cols
    from pg_attribute where attrelid = 'public.market_riders'::regclass and attnum > 0 and not attisdropped and attgenerated = '';
  execute format('insert into public.market_riders (%s) select %s from public.market_riders_backup_20261119 on conflict (id) do nothing', cols, cols);
end $$;
select count(*) as obnovenych_alebo_existujucich from public.market_riders m where exists (select 1 from public.market_riders_backup_20261119 b where b.id = m.id);
