-- IBA ČÍTANIE. Vypíše riadky "druh|názov|hodnota" (počty riadkov tabuliek + odtlačky funkcií, triggerov, politík, indexov, práv...).
-- Použije sa na produkcii pri zálohe a na skúšobne obnovenej (lokálnej) databáze; výpisy sa potom porovnajú.
set default_transaction_read_only = on;
-- Všetky bežné tabuľky v schémach public, auth a storage. Ak ich rola nemôže čítať, počet je 'ERR' (a overenie ich NEPOVAŽUJE za overené).
select 'table|' || n.nspname || '.' || c.relname || '|' ||
       case when has_table_privilege(c.oid, 'select') then (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text else 'ERR' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and n.nspname in ('public', 'auth', 'storage') and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
 order by 1;
select 'columns|public|' || count(*) || '|' || coalesce(md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable, ',' order by table_name, column_name)), '-')
  from information_schema.columns where table_schema = 'public';
select 'functions|public|' || count(*) || '|' || coalesce(md5(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text)), '-')
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
select 'function_rights|public|' || coalesce(md5(string_agg(p.oid::regprocedure::text || ':' || coalesce(regexp_replace(p.proacl::text, '/[^,}]*', '', 'g'), ''), ',' order by p.oid::regprocedure::text)), '-')
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
select 'triggers|public|' || count(*) || '|' || coalesce(md5(string_agg(pg_get_triggerdef(t.oid), E'\n' order by c.relname, t.tgname)), '-')
  from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal;
select 'policies|public|' || count(*) || '|' || coalesce(md5(string_agg(tablename || ':' || policyname || ':' || cmd || ':' || roles::text || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), E'\n' order by tablename, policyname)), '-')
  from pg_policies where schemaname = 'public';
select 'indexes|public|' || count(*) || '|' || coalesce(md5(string_agg(indexdef, E'\n' order by indexname)), '-') from pg_indexes where schemaname = 'public';
select 'constraints|public|' || count(*) || '|' || coalesce(md5(string_agg(c.relname || ':' || pg_get_constraintdef(k.oid), E'\n' order by c.relname, k.conname)), '-')
  from pg_constraint k join pg_class c on c.oid = k.conrelid where c.relnamespace = 'public'::regnamespace;
select 'views|public|' || count(*) || '|' || coalesce(md5(string_agg(c.relname || ':' || pg_get_viewdef(c.oid), E'\n' order by c.relname)), '-')
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm');
select 'row_security|public|' || coalesce(md5(string_agg(c.relname || ':' || c.relrowsecurity::text, ',' order by c.relname)), '-')
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p');
select 'table_rights|public|' || coalesce(md5(string_agg(c.relname || ':' || coalesce(regexp_replace(c.relacl::text, '/[^,}]*', '', 'g'), ''), ',' order by c.relname)), '-')
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S');
select 'column_rights|public|' || coalesce(md5(string_agg(c.relname || '.' || a.attname || ':' || regexp_replace(a.attacl::text, '/[^,}]*', '', 'g'), ',' order by c.relname, a.attname)), '-')
  from pg_attribute a join pg_class c on c.oid = a.attrelid where c.relnamespace = 'public'::regnamespace and a.attacl is not null and not a.attisdropped;
-- Stĺpce, ktoré pg_dump zapisuje do COPY (bez generovaných stĺpcov) – podľa nich sa robí odtlačok OBSAHU tabuliek.
select 'copycols|' || n.nspname || '.' || c.relname || '|' || string_agg(quote_ident(a.attname), ',' order by a.attnum)
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
   and n.nspname in ('public', 'auth', 'storage') and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
 group by n.nspname, c.relname order by 1;
-- Stav sekvencií (posledná hodnota; ak sa ešte nepoužila, začiatočná hodnota a "false"). Po obnove musí sedieť, inak hrozia duplicitné ID.
select 'seq|' || schemaname || '.' || sequencename || '|' || coalesce(last_value, start_value)::text || '|' || (last_value is not null)::text
  from pg_sequences where schemaname = 'public' order by 1;
