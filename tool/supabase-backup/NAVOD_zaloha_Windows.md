# Záloha databázy Supabase – návod pre Windows 11 (pre úplného začiatočníka)

> **Dôležité hneď na začiatku**
> - Tieto skripty som **vyskúšal len na Linuxe** (PowerShell 7) proti falošnej lokálnej databáze. **Na Windows 11 a so skutočným Supabase ich nikto neskúšal.** Preto je prvý beh vždy opatrný: čítaj, čo skript hlási, a pri akejkoľvek `CHYBA` sa zastav.
> - Skripty **iba čítajú** z produkcie. Nič v produkčnej databáze nemenia, nemažú ani neobnovujú.
> - **Heslo píš iba do čierneho okna skriptu.** Nikdy do chatu, do e-mailu ani do súboru.

## 1. Čo budeš robiť (v skratke)
1. Raz nainštaluješ PostgreSQL (pre programy `pg_dump`, `pg_restore`, `psql`).
2. Rozbalíš tento ZIP do **vlastného priečinka mimo projektu hry**.
3. Dvojklikom spustíš 4 súbory po poradí: `00` → `01` → `02` → (odporúčané) `03`.
4. Záloha sa uloží do `C:\Users\TVOJE_MENO\SupabaseZalohy\cycling-manager\`. To je **mimo GitHubu**.

## 2. Čo stiahnuť a nainštalovať (PostgreSQL)
1. Otvor v prehliadači **postgresql.org/download/windows** a klikni na **Download the installer** (odkaz na EDB). Stiahni **najnovšiu verziu** pre Windows x86-64 (musí byť **rovnaká alebo novšia** než verzia tvojej Supabase databázy, zvyčajne 15 alebo 17; skript 01 to presne skontroluje a zastaví sa, ak je tvoja verzia stará).
2. Spusti stiahnutý súbor (Windows sa opýta na povolenie – **Áno**).
3. V okne **Select Components** nechaj zaškrtnuté: **PostgreSQL Server** a **Command Line Tools**. (pgAdmin a Stack Builder nie sú potrebné.)
4. Pri **Password** si vymysli heslo pre lokálneho používateľa `postgres` a **zapíš si ho** do správcu hesiel. Je to heslo **iba pre tvoj počítač**, nie pre Supabase. Potrebuješ ho len pri skripte 03.
5. Port nechaj **5432**, zvyšok **Next** → **Finish**.
6. Ak instalátor nechá zaškrtnuté „Launch Stack Builder“, odškrtni to.

## 3. Rozbalenie skriptov
1. Pravý klik na `zaloha-supabase-windows.zip` → **Extract All…** (Rozbaliť všetko).
2. Vyber napr. `C:\Users\TVOJE_MENO\Downloads\zaloha-windows`. **Nerozbaľuj** do priečinka s hrou ani do priečinka GitHub Desktop (`Documents\GitHub`) a ani do OneDrive.
3. Ak Windows ukáže modré okno **„Windows protected your PC“** → **More info** → **Run anyway**. (Súbory sú čistý text; môžeš ich pred spustením otvoriť v Poznámkovom bloku.)

## 4. Krok 00 – kontrola nástrojov (nič sa nepripája)
Dvojklik na **`00_over_nastroje.cmd`**. Očakávaný výsledok:
- zelené `OK  PostgreSQL nástroje verzie XX v: C:\Program Files\PostgreSQL\XX\bin`
- zelené `OK  Záloha sa uloží do: C:\Users\...\SupabaseZalohy\cycling-manager`
- na konci **„VÝSLEDOK: nástroje na zálohu sú v poriadku.“**

Ak je červené `CHYBA`, vráť sa na kapitolu 2. Okno zavrieš klávesom Enter.

## 5. Zisti údaje zo Supabase (iba ty, nikam ich neposielaj)
1. Prihlás sa do Supabase a otvor produkčný projekt.
2. Hore klikni na tlačidlo **Connect**.
3. Vyber spôsob **Session pooler** (nie „Direct connection“ a nie „Transaction pooler“). Zobrazí sa reťazec v tvare  
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-xxxx.pooler.supabase.com:5432/postgres`
4. Z neho si **prečítaj po častiach** (nekopíruj celé):
   - **Host**: časť za `@` po `:5432` → `aws-0-xxxx.pooler.supabase.com`
   - **Port**: `5432`
   - **Používateľ**: časť za `postgresql://` po `:` → `postgres.abcdefgh`
   - **Databáza**: `postgres`
5. **Heslo databázy** si pamätáš alebo máš v správcovi hesiel. Ak ho nepoznáš, môžeš ho v Supabase (Project Settings → Database) obnoviť. **Pozor:** nové heslo platí aj pre všetko ostatné, čo ho používa. Ak si nie si istý, najprv sa spýtaj.

## 6. Krok 01 – záloha
Dvojklik na **`01_zaloha.cmd`**. Skript sa spýta postupne na: Host, Port, Používateľ, Databázu a **Heslo**.
- Pri hesle sa **nezobrazuje nič** (ani hviezdičky) – je to v poriadku. Napíš alebo vlož heslo a stlač Enter.
- Do poľa Host nevkladaj celý reťazec s `postgresql://` – skript to odmietne.

**Každé spustenie vytvorí úplne nový priečinok** (dátum, čas na sekundy a náhodný kód v názve). Existujúca záloha sa nikdy neprepíše ani nezmení – ani keď skript spustíš dvakrát po sebe.

Očakávaný priebeh: kroky **1 až 7**, pri každom zelené `OK`. Skript okrem dumpu spraví aj „odtlačok obsahu“ každej tabuľky (pred zálohou a po nej; iba čítanie), preto to trvá dlhšie – od minúty po desiatky minút podľa veľkosti databázy. **Spúšťaj ho v čase, keď nikto nehrá**, inak sa nebude dať obsah overiť (pozri nižšie). Na konci je **žltý** text:
> ZÁLOHA VYTVORENÁ, ale ešte NIE JE OVERENÁ.

To je správne – overenie robí krok 02. Skript tiež vypíše, čo sa dumpom **nedá** zálohovať (Storage súbory, Vault, Edge Functions, secrets, roly). Ak Storage obsahuje súbory, uvidíš žlté `POZOR` s počtom.

Ak úplná záloha zlyhá (napr. kvôli právam), skript skúsi **čiastočnú** zálohu len schémy `public` a **hlasno** to napíše; takú zálohu nepovažuj za úplnú.

## 7. Krok 02 – overenie zálohy
Dvojklik na **`02_over_zalohu.cmd`**. Nepýta heslo ani sa nepripája na internet. Kontroluje:
- súbory sú neporušené (kontrolné súčty),
- `pg_restore` záložný súbor prečíta,
- **povinné tabuľky** `auth.users`, `auth.identities`, `storage.buckets`, `storage.objects` sú v databáze aj v zálohe (ak chýbajú, záloha nikdy nie je „úplná“),
- **všetky bežné tabuľky v schémach `public`, `auth` a `storage`** (nie len niekoľko vybraných) sú v zálohe, majú **presne toľko riadkov** a zároveň **rovnaké hodnoty**: každý riadok sa zhashuje a porovná s databázou (rovnaký počet riadkov, ale zmenená hodnota sa odhalí; prázdna tabuľka nie je chyba),
- **stavy sekvencií** (automatické ID) sú v zálohe správne, aby po obnove nevznikli duplicitné ID,
- počty funkcií, triggerov, politík a indexov sedia,
- v sprievodných súboroch nie je heslo ani connection string.

Možné výsledky (posledný riadok):
| Výsledok | Čo to znamená | Čo robiť |
|---|---|---|
| zelené **ZÁLOHA DATABÁZY JE ÚPLNÁ A OVERENÁ** | public, auth aj storage metadáta sú v poriadku | môžeš pokračovať krokom 03 |
| žlté **ZÁLOHA JE ČIASTOČNÁ** | overené je len `public`; používatelia (auth) v zálohe nie sú | migráciu A zatiaľ nespúšťaj; napíš mi |
| žlté **ZÁLOHA JE NEÚPLNE OVERENÁ** | chyby sa nenašli, ale niečo sa nedalo porovnať (databáza sa menila, tabuľku nebolo možné čítať, alebo nebola v odtlačku) | zopakuj 01, keď nikto nehrá; kým nedostaneš zelený výsledok, zálohu nepovažuj za úplnú |
| červené **ZÁLOHA JE NEPLATNÁ** | niečo nesedí | migráciu A **nespúšťaj**; zopakuj 01 a pošli mi výpis |

Skript vždy vypíše **rozsah overenia** v troch kategóriách (uložené aj v `ROZSAH_OVERENIA.txt`):
- **V ARCHÍVE** – koľko tabuliek (po schémach) v zálohovom súbore je,
- **OBSAHOVO OVERENÉ** – tabuľky, ktorých každý riadok sa preukázateľne zhoduje s databázou,
- **NEOVERENÉ** – tabuľky, ktoré sú v archíve, ale ich obsah sa nepreukázal (rola ich nemohla čítať, tabuľka sa počas zálohy menila, alebo nebola v odtlačku databázy). Ak je čo i len jedna, výsledok **nikdy** nie je „ÚPLNÁ“, ale „NEÚPLNE OVERENÁ“.
Okrem toho vypíše schémy, ktoré sú v archíve, ale ich obsah sa z princípu neoveruje (napr. `realtime`, `supabase_migrations`), a zoznam vecí, ktoré sa neoverujú nikdy (sekvencie, funkcie a politiky mimo `public`, Storage súbory, Vault, Edge Functions…).
**Dôležité:** v živej databáze sa tabuľky `auth` (sessions, refresh tokeny, audit log) menia aj pri bežnom prihlasovaní hráčov. Ak sa tabuľka počas zálohy zmení, jej obsah sa nedá porovnať a výsledok bude „NEÚPLNE OVERENÁ“. Zálohuj v čase, keď sa nikto neprihlasuje (napr. v noci); ak výsledok zostane žltý, napíš mi – dá sa to riešiť konzistentným snímkom databázy, ale nerobil som to bez tvojho schválenia.

Aj pri „ÚPLNÁ“ skript pripomenie, čo v zálohe **nie je** (Storage súbory, Vault, Edge Functions, secrets, nastavenia Auth/SMTP/URL, roly a heslá).

## 8. Krok 03 – skúšobná obnova (odporúčané)
Dokáže, že sa záloha dá skutočne obnoviť. Robí sa **iba na tvojom počítači** (localhost), nikdy na Supabase.
1. Musí bežať lokálny PostgreSQL z kapitoly 2 (verzia rovnaká alebo novšia ako produkcia).
2. Dvojklik na **`03_skusobna_obnova.cmd`**. Odpovedz: Host `localhost` (stačí Enter), Port `5432` (Enter), Používateľ `postgres` (Enter), **Heslo = tvoje LOKÁLNE heslo z inštalácie** (nie Supabase).
3. Skript najprv skontroluje, že záloha má po kroku 02 stav **UPLNA_DATABAZA** (pri inom stave sa neutvorí zelený výsledok; pri neplatnom alebo neznámom sa obnova vôbec nespustí). Potom vytvorí dočasnú databázu `zaloha_test_…`, obnoví do nej zálohu a **porovná** ju s produkciou v čase zálohy (počty, hodnoty riadkov, sekvencie, funkcie, triggery, politiky, indexy, práva). Skript **odmietne** akýkoľvek iný host než localhost. Neobnovujú sa len schémy Supabase závislé od rozšírení, ktoré lokálny server nemá (graphql, vault, pgsodium, realtime…).
4. Možné výsledky:
   - zelené **SKÚŠOBNÁ OBNOVA: ÚPLNÁ ZHODA** – vzniká **iba** keď `pg_restore` skončil s kódom 0 **bez jedinej chyby** a všetko sedí;
   - žlté **NEÚPLNE OVERENÝ** – všetko dôležité sedí, ale `pg_restore` hlásil chyby, ktoré sú **výlučne** očakávané rozdiely lokálny PostgreSQL vs Supabase (chýbajúce rozšírenie), alebo sa niečo nedalo porovnať, alebo má záloha stav ČIASTOČNÁ/NEÚPLNE OVERENÁ. Nie je to úspech;
   - červené **NEÚSPEŠNÁ** – rozdiel v hodnotách, sekvenciách či objektoch v `public`, alebo chyba obnovy, ktorú skript nevie označiť za očakávanú. Žiadne chyby sa automaticky neignorujú; zoznam je v `chyby_obnovy.txt` (v dvoch častiach: očakávané / nevyhodnotené).
   Pri prvom behu so skutočným Supabase je pravdepodobné, že výsledok nebude zelený (rozšírenia Supabase). Pošli mi `chyby_obnovy.txt` (obsahuje len texty chýb, nie heslá) a spolu posúdime, či sú naozaj len lokálnym rozdielom.
5. Nakoniec sa opýta, či má dočasnú databázu zmazať – odpovedz `a`. Zmaže **iba** databázu, ktorú si sám vytvoril.

## 9. Ulož zálohu bezpečne
- Skopíruj celý priečinok `C:\Users\TVOJE_MENO\SupabaseZalohy\cycling-manager\RRRR-MM-DD_…` aj na **USB disk** alebo do osobného šifrovaného úložiska. Záloha obsahuje e-maily hráčov, takže je to citlivý súbor.
- **Nikdy** ju nepridávaj do GitHub Desktop, do repozitára ani do ZIP-u s projektom. Skripty odmietnu uložiť zálohu do Git repozitára, do OneDrive ani do priečinka GitHub.
- V GitHub Desktop po zálohe **nesmie** pribudnúť žiadna zmena. Ak pribudla, zálohu tam nepridávaj a napíš mi.

## 10. Ako by sa záloha obnovila (vysvetlenie; nič z toho teraz nerobíme)
Supabase FREE nemá tlačidlo na obnovu. Záloha je súbor `uplna_zaloha.dump`; obnova znamená:
1. Vytvoriť **nový prázdny** Supabase projekt (alebo lokálny Postgres).
2. Programom `pg_restore` do neho nahrať `public` (a podľa potreby `auth`/`storage` metadáta).
3. Porovnať výsledok s `inventar_pred.txt` (rovnaká kontrola ako v kroku 03).
4. Až po overení prepnúť aplikáciu (premenné prostredia vo Vercel) na nový projekt.
Pozor: súbory zo Storage, Vault tajomstvá, Edge Functions a nastavenia projektu sa takto **neobnovia**. **Skript na obnovu do produkcie schválne neexistuje.** Ak by to raz bolo treba, pripravím ho zvlášť a spustíme ho spolu s tvojím výslovným súhlasom.

## 11. Ak niečo zlyhá
| Hlásenie | Čo to znamená |
|---|---|
| `Nenašiel som pg_dump…` | nie je nainštalovaný PostgreSQL (kapitola 2) |
| `Nepodarilo sa pripojiť` + `Network is unreachable` / `could not translate host name` | použil si „Direct connection“; použi **Session pooler** |
| `password authentication failed` | zlé heslo alebo zlý Používateľ (musí byť `postgres.xxxxxxxx`) |
| `Tvoj pg_dump (X) je starší než databáza (Y)` | nainštaluj novší PostgreSQL (kapitola 2) |
| `Port 6543 je Transaction pooler` | použi Session pooler, port 5432 |
| `Priečinok … je v cloudovom … alebo GitHub` | nastav inú cestu (pozri nižšie) |
Iné miesto zálohy: v PowerShelli pred spustením `$env:ZALOHY_KOREN = 'D:\SupabaseZalohy'` (nepoužívaj OneDrive ani priečinok s `.git`).
Keď mi budeš posielať chybu, pošli **iba** text z okna a skontroluj, že v ňom nie je heslo. Hesla sa v hláseniach maskujú, ale aj tak ich nikdy neposielaj.

## 12. Čo je a nie je bezpečné (otvorene)
- Heslo sa zadáva v skrytom poli, nie je v príkazovom riadku programov, v histórii PowerShellu, v logoch ani v súboroch. Počas behu je **iba v premennej prostredia** `PGPASSWORD` toho okna (to je štandardný spôsob pre `pg_dump`); po skončení skriptu sa zmaže. Počas behu ho teoreticky vidia procesy toho istého používateľa s administrátorskými právami.
- Host a používateľ sa tiež nikam neukladajú (v zálohe nie je ani názov projektu).
- Súbory `obsah_*.txt` obsahujú len počty riadkov a kontrolné čísla (hashe), nie samotné údaje.
