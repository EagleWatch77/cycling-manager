# Presný postup: vrátiť IBA tréningový model S1+O5 (bez vrátenia Trhu, radaru ani migrácií A/B)

**Nikdy nevracaj celý commit** — v tom istom commite sú aj bezpečnostné opravy Trhu (skryté hodnoty, trvalý Trh, vypnutý generátor, reset), radar 1–200 a seed. Vrátiť sa dá len malá časť:

| Časť | Čo sa vráti | Čo sa NEMENÍ |
|---|---|---|
| SQL | funkcia `apply_development_plan_v2` späť na pôvodnú (strop 1,25, bez mladíckeho floor), pomocná funkcia `dev_phys_room` sa zruší | uložené dáta jazdcov, migrácie A/B, Trh, seed |
| TypeScript | `capSlope` **1,5 → 1,25** a `youthRoomFloor` **0,30 → 0** v `config.ts` + 3 testy, ktoré tieto čísla pripínajú | radar, Trh, generátor, ostatné súbory (menia sa presne 4 súbory) |

Už získané body atribútov ostanú (tréning atribúty nikdy neznižuje); od ďalšieho týždňa sa rozvoj počíta po starom.

## Postup (3 kroky, v tomto poradí)
1. **SQL** — v Supabase → SQL Editor spusti `supabase/diagnostics/market_launch/manual_rollbacks/ROLLBACK_S1O5_rozvoj.sql`. Potom pusti kontrolu 00: fáza 3 má byť **ČAKÁ** (nie CHYBA) a fáza 2 (B) zostáva SPLNENÉ.
2. **TypeScript** — z priečinka `supabase/diagnostics/market_launch/manual_rollbacks/S1O5_navrat_subory/` skopíruj priečinok `apps` do koreňa projektu (prepíše presne tieto 4 súbory):
   - `apps/web/src/lib/training/development/config.ts`
   - `apps/web/src/lib/training/development/development.test.ts`
   - `apps/web/src/lib/training/development/softcap200.test.ts`
   - `apps/web/src/lib/training/development/youthRoom.test.ts`

   V GitHub Desktop uvidíš **iba tieto 4 zmenené súbory**. Ak vidíš iné, nič nepotvrdzuj. Commit: Summary `Vrátiť pracovný model S1+O5 (len tréning)`. Počkaj na zelený build vo Verceli.
3. **Kontrola** — otvor stránku tréningu a ulož plán; pusti kontrolu 00 (F3 = ČAKÁ, F2 a F4 ostávajú SPLNENÉ).

Alternatíva pre technikov: `patch -p1 < supabase/diagnostics/market_launch/manual_rollbacks/S1O5_typescript_navrat.patch` z koreňa projektu urobí presne to isté (späť `patch -R`).

**Platnosť:** súbory a patch platia pre túto verziu balíka. Ak sa medzitým `config.ts` alebo tieto testy zmenili, nekopíruj ich — napíš mi a pripravím čerstvé.

## Čo je overené (test `supabase/tests/s1o5_revert_procedure.test.sh`)
- patch aj kópia súborov menia presne 4 súbory a nič z Trhu, radaru ani migrácií;
- po návrate `capSlope` = 1,25, `youthRoomFloor` = 0, strop pri Potenciáli 20/50/75/90/95/100 = 85/111/150/181/193/205, floor je v každom veku 0, tvrdé maximum 200 platí;
- všetky webové testy (aj Trh a radar) prechádzajú, `typecheck` je bez chýb;
- po SQL rollbacku sa nový TypeScript zhoduje so starou SQL funkciou (celé týždne tréningu aj starnutie, 69 kontrol) a zhoda by pri nesúlade zlyhala;
- opätovné spustenie patchu naopak (`patch -R`) vráti S1+O5 bajt po bajte.
