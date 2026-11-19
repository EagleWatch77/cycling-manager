-- !!! NEBEZPEČNÉ – NIKDY NEPUSTI AUTOMATICKY !!!  Manuálny súbor, nie migrácia (preto je mimo supabase/migrations/).
-- Čo robí: vráti prihláseným hráčom právo čítať VŠETKY stĺpce market_riders – vrátane SKRYTÉHO Potenciálu, Trainability, Professionalism a Recovery
--          každého jazdca na trhu. Teda znova otvorí presne tú dieru, ktorú migrácia B zatvára. Dáta nemení.
-- Použi to len keď to výslovne rozhodne majiteľ a vie, že hráči budú môcť skryté hodnoty čítať. NIE JE to odporúčaný postup pri chybe B:
--   odporúčaný postup je SAFE_B_nudzove_zatvorenie_trhu.sql (ochrana skrytých údajov má prednosť) – pozri docs/DEPLOY_trh_start.md.
-- Poistka: súbor sa nevykoná, kým sa dolu RUČNE nezmení hodnota v_potvrdenie na presný text. Nezmenený súbor nič nespraví a skončí chybou.
do $poistka$
declare
  v_potvrdenie constant text := 'NIE';   -- <<< na odomknutie zmeň 'NIE' na 'ANO-ODHALIT-SKRYTE-HODNOTY' (celý text, presne)
begin
  if v_potvrdenie <> 'ANO-ODHALIT-SKRYTE-HODNOTY' then
    raise exception 'ZASTAVENÉ: súbor odomyká skryté hodnoty trhu hráčom. Nič sa nezmenilo. Ak to naozaj chceš, prečítaj hlavičku a zmeň v_potvrdenie.';
  end if;
end
$poistka$;
grant select on public.market_riders to authenticated;
