-- 02_stare_trhove_zaloha_a_zmazanie.sql
-- NEspúšťaj, kým si nespustil 01 a neoveril, že pocet = 45 a zoznam sedí.
-- Postup: 1) do dvoch riadkov nižšie vlož hodnoty z kroku 01/B (pocet a kontrolny_sucet), 2) spusti CELÝ súbor naraz.
-- Všetko je jedna transakcia: ak čokoľvek nesedí (iný počet, iný súčet, zostalo niečo nezmazané), VÝJDE CHYBA A NIČ SA NEZMENÍ.

-- 1. záloha (tabuľka je pred hráčmi uzamknutá, hráči ju cez API nevidia)
create table if not exists public.market_riders_backup_20261119 (like public.market_riders including defaults including indexes);
alter table public.market_riders_backup_20261119 add column if not exists backed_up_at timestamptz not null default now();
alter table public.market_riders_backup_20261119 enable row level security;
revoke all on public.market_riders_backup_20261119 from public, anon, authenticated;

-- 2. záloha + zmazanie v jednej atomickej transakcii
do $$
declare
  v_expected_count constant int  := 45;
  v_expected_md5   constant text := 'f8830b1336a1a3a025dccac1619b5d13';   -- <<< uprav
  v_cols text; v_count int; v_md5 text; v_backed int; v_deleted int;
begin
  create temp table _cand on commit drop as
    select m.id from public.market_riders m
    where m.generator_version = 'starter-v1' and m.status = 'available'
      and m.acquired_rider_id is null and m.acquired_by_player_id is null and m.acquired_at is null
      and m.source in ('admin', 'week6')
      and not exists (select 1 from public.rider_swaps s where s.market_rider_id = m.id);
  select count(*), md5(string_agg(id::text, ',' order by id)) into v_count, v_md5 from _cand;
  if v_count <> v_expected_count then raise exception 'ZASTAVENÉ: nájdených % jazdcov, očakávaných %. Nič sa nezmazalo.', v_count, v_expected_count; end if;
  if v_md5 is distinct from v_expected_md5 then raise exception 'ZASTAVENÉ: kontrolný súčet nesedí (%). Zoznam sa zmenil od kroku 01. Nič sa nezmazalo.', v_md5; end if;

  -- stĺpce, ktoré existujú v oboch tabuľkách (odolné voči neskoršiemu pridaniu stĺpca do trhu)
  select string_agg(quote_ident(a.attname), ',' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = 'public.market_riders'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
     and exists (select 1 from pg_attribute b where b.attrelid = 'public.market_riders_backup_20261119'::regclass and b.attname = a.attname and not b.attisdropped);
  execute format('insert into public.market_riders_backup_20261119 (%1$s) select %1$s from public.market_riders where id in (select id from _cand) on conflict (id) do nothing', v_cols);
  select count(*) into v_backed from public.market_riders_backup_20261119 where id in (select id from _cand);
  if v_backed <> v_expected_count then raise exception 'ZASTAVENÉ: záloha obsahuje % z % riadkov. Nič sa nezmazalo.', v_backed, v_expected_count; end if;

  delete from public.market_riders m where m.id in (select id from _cand)
    and m.status = 'available' and m.acquired_rider_id is null and m.acquired_by_player_id is null;
  get diagnostics v_deleted = row_count;
  if v_deleted <> v_expected_count then raise exception 'ZASTAVENÉ: zmazaných % z %. Všetko sa vráti späť.', v_deleted, v_expected_count; end if;
  raise notice 'HOTOVO: zálohovaných % a zmazaných % jazdcov.', v_backed, v_deleted;
end $$;

-- 3. kontrola po zmazaní
select (select count(*) from public.market_riders where generator_version = 'starter-v1') as zostalo_starter_v1,
       (select count(*) from public.market_riders_backup_20261119) as v_zalohe,
       (select count(*) from public.riders where player_id is not null) as jazdci_hracov_nedotknuti;
