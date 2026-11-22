# Prednasadzovací kontrolný zoznam — Sponzori (kroky po poradí)

Pravidlo: **nič z toho sa nespúšťa samo.** Každý krok robíš ručne a po každom sa zastavíš, ak niečo nesedí. Nič nespúšťaj bez toho, aby si prečítal výsledok predošlého kroku. Heslo ani connection string nikdy nepíš do chatu ani do súborov.

## A. Pred čímkoľvek (na tvojom počítači)
- [ ] **A1. Záloha.** Spusti `02_over_zalohu` (balík `zaloha-supabase-windows`, návod `NAVOD_zaloha_Windows.md`). Pokračuj, až keď hlási **„ZÁLOHA DATABÁZY JE ÚPLNÁ A OVERENÁ“** (nie „ČIASTOČNÁ“, nie „NEPLATNÁ“). Záloha mimo projektu, odporúčané druhé miesto (USB/cloud). Supabase je na FREE pláne, nemá tlačidlo Restore.
- [ ] **A2. Odstrániť zastarané súbory** zo svojho repa podľa `ODSTRAN.txt`, časť **A (nevyhnutné)**. Nič sa nemaže automaticky.

## B. Supabase — diagnostika (iba čítanie)
- [ ] **B1.** Supabase → SQL Editor → New query → vlož celý súbor `supabase/diagnostics/sponsors_predeploy_check.sql` → Run. Je to jeden SELECT, nič nemení.
- [ ] **B2.** Prečítaj stĺpec **stav**:
  - **Riadky 10–14 a 32 (kalendár)** musia byť **OK** (alebo riadok 13 **INFO** = kalendár 1; to je v poriadku). Ak je riadok 10, 11, 12 alebo 32 **FAIL**: **STOP**, kalendár nie je pripravený, migráciu `_04` nespúšťaj a pošli mi výsledok. Generátor by bez kalendára nevytvoril žiadne ponuky (zámerne, žiadne vymyslené preteky).
  - **Riadky 51–53 (duplicity)** musia byť **OK**. Ak je FAIL: **STOP**, pošli mi výsledok; nič sa nemaže automaticky.
  - Riadky 40–44 pred nasadením ukážu „ešte nebežala“ (INFO) — to je správne.
  - Riadky 70 a 80 sú trvalé upozornenia (plánovač nie je napojený; záloha sa z SQL neoveruje).

## C. Supabase — migrácie (každá celá, jedna po druhej, v tomto poradí)
SQL Editor → New query → vlož **celý** súbor → Run → prečítaj výsledok. Každý súbor beží v **jednej transakcii** (`begin; … commit;`): pri chybe sa nezmení nič. Každý súbor spúšťaj **iba raz**; starší súbor po novšom sa **odmietne** (nič nepoškodí).
- [ ] **C1.** `supabase/migrations/20261122_01_sponsors_foundation.sql`
- [ ] **C2.** `supabase/migrations/20261122_02_sponsor_catalog_main_30.sql`
- [ ] **C3.** `supabase/migrations/20261122_03_sponsor_offer_generator.sql`
- [ ] **C4.** `supabase/migrations/20261122_04_sponsor_generator_fixes.sql` (potrebuje tabuľku `tour_schedule`; ak chýba, odmietne sa a nič nezmení)
- [ ] **C5.** `supabase/migrations/20261122_05_sponsor_update_guards.sql`
- Ak niektorý súbor skončí chybou: **STOP**, pošli mi presný text chyby, ďalší nespúšťaj.
- **Nikdy nespúšťaj `_03` znova po `_04`** (ani iný starší súbor po novšom).

## D. Supabase — kontrola po migráciách (iba čítanie)
- [ ] **D1.** Znova spusti `sponsors_predeploy_check.sql`. Riadky 40–44 = **OK**, riadok 41 = 30 firiem, riadky 31 a 32 = **OK**, riadky 51–53 = **OK**.
- [ ] **D2.** Spusti: `select * from public.sponsor_duplicate_report();` — má vrátiť **0 riadkov**. Ak vráti riadky, **STOP**, pošli mi ich. (Nikdy nespúšťaj `sponsor_fix_duplicate_offers(true)` bez môjho potvrdenia; bez parametra je to len suchý beh.)

## E. GitHub Desktop
- [ ] **E1.** Rozbaľ ZIP `cycling-manager-sponzori-generator-v3.zip` do priečinka repozitára (prepíše súbory na rovnakých cestách).
- [ ] **E2.** GitHub Desktop → skontroluj zoznam zmien (len súbory Sponzorov, preklady, dokumenty, testy, migrácie, `diagnostics`).
- [ ] **E3.** Do **Summary** a **Description** vlož text commitu z reportu → **Commit to main** → **Push origin**.

## F. Vercel
- [ ] **F1.** Vercel → projekt → **Deployments**: nové nasadenie sa spustí samo po pushi. Počkaj na **Ready** (zelené). Ak je **Error**, nič nemeň v databáze; pošli mi text chyby.
- [ ] **F2.** Environment variables sa nemenia (žiadne nové).

## G. Kontrola na živom webe (prihlásený hráč)
- [ ] **G1.** `/sponsors` → záložka **Trh sponzorov**: najviac **3** ponuky hlavných sponzorov, pri každej 2 ciele, dĺžka zmluvy, „Ponuka platí do“ a zostávajúci čas, sumy „Zatiaľ neurčené“. **Žiadny** zoznam všetkých 30 firiem.
- [ ] **G2.** **Prijať** je vypnuté (podpis bez schválených súm nie je možný); **Odmietnuť** ponuku hneď skryje a **nová sa neobjaví hneď**.
- [ ] **G3.** `/sponsors?demo=1` ukáže 3 ukážkové ponuky označené DEMO.
- [ ] **G4.** Nový testovací účet v Rookie dostane 3 ponuky hneď po registrácii (ak nie, pri prvej návšteve `/sponsors`).
- [ ] **G5.** Telefón aj počítač: stránka je prehľadná, nič nepretŕča.

## H. Čo ešte NIE JE hotové (neprezentovať ako hotové)
- **Plánovač nedeľného updatu nie je napojený.** Doplnenie ponúk sa deje pri prvej návšteve `/sponsors` po nedeli 00:00 (Europe/Bratislava). Nie je to automatický update pre všetkých naraz. Voliteľný `pg_cron` je popísaný na konci `_03`; nezapína sa bez tvojho potvrdenia.
- Sumy, podpis, výplaty a predčasné ukončenie sú vypnuté (čaká na tvoje schválenie súm).
- Do `race_results` zatiaľ nič nezapisuje, forma hráča je preto vždy „základná“.

## I. Ak sa niečo pokazí
- Kód: vo Vercel → Deployments → predošlé nasadenie → **Promote to Production** (databázu to nemení).
- Databáza: migrácie sú pridávacie a nič nemažú; nič nevracaj ručne. Pošli mi výsledok diagnostiky a presný text chyby. Záloha z kroku A1 je poistka.
