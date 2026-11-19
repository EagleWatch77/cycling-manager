# Podklad pre nezávislú kontrolu – Windows skripty zálohy (Supabase FREE) – verzia 3

**Stav testovania (otvorene):** Windows 11 stále NEBOL reálne testovaný. Skripty boli spustené iba v PowerShell 7.4.6 na Linuxe (Ubuntu, PostgreSQL 16) proti falošnej lokálnej databáze so schémami `public`, `auth`, `storage`. **Neboli spustené na Windows 11 ani Windows PowerShell 5.1 a nikdy sa nepripojili na Supabase ani na produkciu.** Pozri kapitolu „Netestované“.

## Obsah balíka
`00_over_nastroje`, `01_zaloha`, `02_over_zalohu`, `03_skusobna_obnova` (každý `.ps1` + dvojklikový `.cmd`), `lib/_spolocne.ps1`, `sql/inventory.sql`, `NAVOD_zaloha_Windows.md`. Žiadny súbor neobsahuje heslo, host ani connection string (grep na `supabase.co`, `postgresql://`, `PGPASSWORD=` v hodnotách: čisté).

## Zmeny vo verzii 3 (reakcia na druhú kontrolu)
1. **Nikdy neprepísať zálohu:** `New-UnikatnyPriecinok` (lib) vytvorí pre každé spustenie nový prázdny priečinok `RRRR-MM-DD_HHmmss_<8 náhodných hex>_pred-migraciou-A`. Vytvorenie je atómové (`New-Item` bez `-Force` zlyhá, ak priečinok existuje); pri kolízii skúsi nový náhodný kód (50 pokusov), potom STOP. `01` navyše odmietne pokračovať, ak `uplna_zaloha.dump` v cieli už existuje. `New-Item -Force` sa už nepoužíva.
2. **Rozsah auth/storage:** `sql/inventory.sql` teraz zahŕňa **všetky bežné tabuľky** (`relkind='r'`, mimo členov rozšírení) v schémach `public`, `auth`, `storage` (počet riadkov, zoznam stĺpcov pre COPY). Tabuľku, ktorú rola nemôže čítať, vypíše ako `ERR` (inventár kvôli tomu nezlyhá). `02` triedi tabuľky do kategórií **V ARCHÍVE / OBSAHOVO OVERENÉ / NEOVERENÉ** (`ROZSAH_OVERENIA.txt`); NEOVERENÉ = `ERR` pri zálohe, tabuľka menená počas zálohy, alebo tabuľka s `TABLE DATA` v archíve, ktorá nie je v odtlačku. Jedna neoverená tabuľka ⇒ stav `NEUPLNE_OVERENA`, nikdy `UPLNA_DATABAZA`. Chýbajúce dáta tabuľky v archíve (riadky v DB, v dumpe nič) ⇒ CHYBA ⇒ `NEPLATNA`. Schémy v archíve mimo `public/auth/storage` sa uvádzajú ako „obsah z princípu neoverovaný“. `03` používa rovnaké odtlačky pre všetky tieto tabuľky.
   **Dôsledok:** na živej databáze sa tabuľky `auth` pri prihlasovaní menia → obsah sa nedá porovnať → žltý výsledok. Konzistentný snímok (`pg_export_snapshot` + `pg_dump --snapshot` + `SET TRANSACTION SNAPSHOT`) by to vyriešil, ale nebolo to požadované ani schválené.

## Testy verzie 3 (Linux, PowerShell 7.4.6, PostgreSQL 16; falošná DB s auth: users, identities, sessions, refresh_tokens, audit_log_entries; storage: buckets, objects, migrations, s3_multipart_uploads; public; spúšťané aj priamo z rozbaleného ZIP-u)
- Kolízia názvu priečinka (rovnaký čas aj sufix, 3 volania): 3 rozdielne priečinky, prvý súbor `.dump` nezmenený (SHA256).
- Tri skutočné zálohy 01 (dve spustené naraz, tretia hneď po nich): 3 rôzne priečinky, všetky súbory prvej zálohy po tretej zálohe bajt po bajte rovnaké. (Dve naraz spustené zálohy skončili v rôznych sekundách; rovnaká sekunda je pokrytá testom kolízie vyššie.)
- 11 tabuliek v archíve, 11 obsahovo overených → `UPLNA_DATABAZA`; `03` → ÚPLNÁ ZHODA.
- Chýbajúce dáta ďalšej tabuľky: dump s `--exclude-table-data=auth.sessions` → NEPLATNA; to isté pre `storage.migrations` → NEPLATNA.
- Tabuľka nečitateľná pre rolu (reálne: rola bez `SELECT` na `auth.refresh_tokens`): `01` upozorní, `pg_dump` úplnej zálohy zlyhá, záloha prejde na čiastočnú (len `public`) → `CIASTOCNA`, tabuľky auth/storage uvedené ako „NIE SÚ V ARCHÍVE“. Podvrhnutý `ERR` v inventári pri tabuľke, ktorá v archíve je → `NEUPLNE_OVERENA` (tabuľka v zozname NEOVERENÉ).
- Tabuľka je v archíve, ale chýba v odtlačku databázy → `NEUPLNE_OVERENA`.
- Windows 11 a Windows PowerShell 5.1: **stále netestované.**

## Zmeny vo verzii 2 (reakcia na nezávislú kontrolu)
1. **03 – chyby pg_restore:** zelený výsledok vznikne len ak `pg_restore` skončí s kódom 0 a bez jedinej chyby. Chyby sa delia na *očakávané lokálne* (iba `extension "x" is not available`, `could not open extension control file`, `role "x" does not exist` a priamy dôsledok `extension "x" does not exist` len pre rozšírenie už hlásené ako nedostupné) a *nevyhodnotené* (všetko ostatné). Očakávané → **NEÚPLNE OVERENÝ** (žltá, kód 2); nevyhodnotené alebo nenulový kód bez chýb → **NEÚSPEŠNÁ** (červená, kód 1). Zoznamy sú v `chyby_obnovy.txt`, výsledok v `VYSLEDOK_OBNOVY.txt`. Neobnovujú sa len schémy graphql, graphql_public, vault, pgsodium, pgsodium_masks, realtime, _realtime, supabase_functions, net, pgbouncer (explicitný zoznam vypísaný v behu).
2. **Obsah a sekvencie (02 aj 03):** `01` robí pred a po zálohe odtlačok OBSAHU každej tabuľky z inventára: `COPY tabuľka (stĺpce bez generovaných) TO STDOUT` → MD5 každého riadku → 64-bitový súčet (nezávislý od poradia a collation) + počet. `02` počíta rovnaký odtlačok priamo z dumpu (`pg_restore --data-only`) aj z čitateľného `public_struktura_a_data.sql`; `03` z obnovenej DB (s nastavením timezone z produkcie, `datestyle ISO`, `extra_float_digits 1`). Rovnaký počet riadkov s inou hodnotou → CHYBA/NEÚSPEŠNÁ. Ak sa tabuľka počas zálohy menila (odtlačok pred ≠ po), obsah je *neoveriteľný* → stav NEUPLNE_OVERENA. Sekvencie (`public`): stav `posledná|použitá` z `pg_sequences` pred/po zálohe sa porovná so `setval` v dumpe (02) a s obnovenou DB (03); chýbajúci `setval` = CHYBA.
3. **Úplnosť a stav:** `02` pri ROZSAH=plna vyžaduje v odtlačku aj v dumpe `auth.users`, `auth.identities`, `storage.buckets`, `storage.objects` (chýbajú → CHYBA → NEPLATNA). Stavy: `UPLNA_DATABAZA` / `NEUPLNE_OVERENA` / `CIASTOCNA` / `NEPLATNA`; `STAV_ZALOHY.txt` obsahuje aj `DUMP_SHA256`. `03` vyžaduje známy stav a zhodu SHA256 dumpu so STAV (inak sa nespustí); NEPLATNA/neznámy/chýba → STOP; CIASTOCNA/NEUPLNE_OVERENA → obnova prebehne, ale výsledok nie je nikdy zelený.
4. **`Reset-PgProstredie`** maže aj `PGHOSTADDR` (a `PGPASSCOMMAND`).

## Testy verzie 2 (Linux, PowerShell 7.4.6, PostgreSQL 16, falošná DB: auth, storage, hstore, sekvencie, timestamptz s inou zónou než lokálny server, jsonb, špeciálne znaky)
Pozitívne: 01 → 02 „ÚPLNÁ A OVERENÁ“ (26 kontrol) → 03 „ÚPLNÁ ZHODA“ (39 kontrol, 0 chýb pg_restore).
Negatívne (všetky dopadli správne):
- rovnaký počet riadkov, zmenená jedna hodnota (dump z upravenej DB) → 02 NEPLATNA (obsah); 03 (STAV podvrhnutý ručne) → NEÚSPEŠNÁ (obsah `public.riders`);
- sekvencia: dump bez `setval` (`--exclude-table-data`) → 02 CHYBA; 03 → NEÚSPEŠNÁ (`seq|public.riders_id_seq`: produkcia `45|true`, obnovené `1|false`);
- dump bez schémy `storage` → 02 NEPLATNA; odtlačok bez `auth.users` → 02 NEPLATNA;
- tabuľka sa počas zálohy menila → 02 NEUPLNE_OVERENA (kód 2);
- 03: STAV chýba / NEPLATNA / neznámy / dump zmenený po overení → STOP; CIASTOČNÁ → NEÚPLNE OVERENÝ (nie zelená);
- 03: `pg_restore` s chybami — (a) iba očakávané (rozšírenie nedostupné) → NEÚPLNE OVERENÝ (kód 2); (b) neočakávané (kontaminovaný template1) → NEÚSPEŠNÁ (kód 1);
- `PGHOSTADDR` nastavený v prostredí je po `Reset-PgProstredie` prázdny.

## Požiadavky → kde sú splnené
| # | Požiadavka | Realizácia |
|---|---|---|
| 1 | Nástroje kompatibilné s verziou produkcie; najprv kontrola | `00` hľadá `pg_dump/pg_restore/psql` (PATH, `Program Files\PostgreSQL\*\bin`); `01` zistí `server_version_num` a **zastaví sa**, ak je `pg_dump` starší; `03` kontroluje lokálny server ≥ produkcia a `pg_restore` ≥ `pg_dump` zálohy |
| 2 | Heslo skryto, nie v argumentoch/histórii/logoch/stringu | `Read-Host -AsSecureString` → `PGPASSWORD` len v prostredí procesu; programy sa volajú cez `ProcessStartInfo` s argumentmi `-h -p -U -d -w` (bez hesla, bez URI); chyby sa prechádzajú `Mask-Text`; `finally` maže premennú; `Over-Udaj` odmietne vložený connection string |
| 3 | Mimo Gitu; bez prihlasovacích údajov v sprievodných súboroch | `Test-MiestoZalohy` odmietne cestu s `.git` v predkoch, OneDrive/Dropbox/Google Drive/iCloud/GitHub; ACL len pre používateľa (`icacls`); `POPIS_ZALOHY.txt` neobsahuje host ani user; `02` kapitola F skenuje sprievodné súbory na heslá a URI |
| 4 | Presne čo je zálohované; upozornenia, nie falošný úspech | Rozsah `plna` / `public` (fallback je označený ČIASTOČNÁ, `02` končí kódom 2 a žltým výsledkom); `01` zisťuje a vypisuje Storage súbory (počet, MB), Vault, cron, vlastné roly; záverečný zoznam „NEOBSAHUJE“; `STAV_ZALOHY.txt` |
| 5 | Integrita a obsah; prázdna tabuľka nie je chyba | SHA256; `pg_restore --list`; pre každú tabuľku z inventára (`public`, `auth.users/identities`, `storage.buckets/objects`) sa z **dumpu** (`pg_restore --data-only --schema`) spočítajú riadky `COPY` a porovnajú s inventárom pred/po zálohe (tolerancia, ak sa počas zálohy menili); tabuľka s riadkami v DB a bez dát v zálohe = CHYBA; prázdna tabuľka s definíciou = OK; rovnaká kontrola pre čitateľné `public_struktura_a_data.sql`; počty funkcií/triggerov/politík/indexov |
| 6 | Obnova striktne mimo produkcie | `03` nepýta nič od produkcie, akceptuje len `localhost/127.0.0.1/::1`, overí `inet_server_addr()` = loopback/socket, vyžaduje superusera, maže **iba** DB `zaloha_test_RRRRMMDD_HHMMSS`, ktorú sám vytvoril (regex). Žiadny skript neobnovuje/maže/mení produkciu; `01` používa `pg_dump` a `SELECT` (inventár začína `set default_transaction_read_only = on`) |
| 7 | Slovenský návod pre začiatočníka | `NAVOD_zaloha_Windows.md` |
| 8 | Oprava odkazu v `docs/DEPLOY_trh_start.md` | samostatný ZIP s dokumentmi; hernú logiku ani kód nemení |

## Čo som reálne spustil (Linux, PowerShell 7.4.6)
- `00`, `01`, `02`, `03` v poriadku na falošnej DB (3 tabuľky v `public`, `auth.users` 5 riadkov, storage 1 objekt, funkcia, trigger, RLS politika, práva): `02` = „ÚPLNÁ A OVERENÁ“ (22 kontrol), `03` = „ZHODA“ (18 kontrol), 0 chýb pg_restore.
- Negatívne: skrátený `.dump` → `NEPLATNÁ` (súčet + pg_restore); upravený inventár (46 vs 45 riadkov) → `NEPLATNÁ` (obe kontroly); `03` s hostom `aws-0-x.pooler.supabase.com` → odmietnutý **pred** zadaním hesla.
- Heslo testovacej DB sa po behu nenašlo v žiadnom súbore zálohy.

## Netestované (skontrolujte najmä toto)
1. Windows PowerShell 5.1 (syntax overená len parserom PS 7; vyhýbal som sa `?.`, `??`, ternárnemu operátoru, `&&`).
2. `icacls`, `Get-Service`, `Get-PSDrive`, cesty s medzerami a diakritikou na Windows; `.cmd` spúšťače (`chcp 65001`, `-ExecutionPolicy Bypass`).
3. Inštalátor EDB (rozloženie `C:\Program Files\PostgreSQL\NN\bin`) a pole „Command Line Tools“.
4. Skutočný Supabase: `pg_dump` cez Session pooler (Supavisor), práva roly `postgres` na schémy `auth`/`storage`/`vault`/`cron`, správanie RLS. Ak úplná záloha zlyhá, skript prejde na ČIASTOČNÚ (len `public`) a to hlasno uvedie.
5. Obnova celej zálohy v lokálnom Postgrese: skutočný Supabase dump pravdepodobne vyvolá chyby kvôli rozšíreniam (napr. `pg_graphql`, `pgsodium`, `supabase_vault`, `pg_net`); skript ich nikdy automaticky neignoruje – očakávané dá do žltého výsledku, ostatné do červeného. Zoznam očakávaných vzorov je zámerne krátky a má sa rozširovať iba na základe skutočného výpisu.
6. Výkon odtlačkov obsahu na veľkej databáze (jeden `psql` na tabuľku, dvakrát pri zálohe); formát `COPY` medzi `pg_dump` a `psql` cez Supavisor (rovnaké nastavenia relácie `datestyle/intervalstyle/extra_float_digits`; časová zóna sa nenastavuje, použije sa predvolená, ako pri pg_dump). Ak by sa text líšil, výsledok bude falošne NEPLATNA (bezpečná strana), nie falošne úspešný.

## Známe obmedzenia (zámerné)
Dump nezahŕňa Storage súbory, Vault tajomstvá (šifrované kľúčom projektu), Edge Functions, secrets, nastavenia projektu ani roly a ich heslá. Skript obnovy do produkcie neexistuje. Heslo je počas behu v premennej prostredia `PGPASSWORD` procesu (štandardný mechanizmus libpq; v argumentoch nie je).
