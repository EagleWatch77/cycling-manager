-- BEZPEČNÝ núdzový postup pri probléme s migráciou B (ochrana skrytých údajov má prednosť). Manuálny súbor, nie migrácia.
-- Čo robí: hráčom (prihlásení aj anonymní) úplne odoberie čítanie tabuľky market_riders. Hráč na stránke Trh uvidí chybu / prázdny trh, ale
--          NIČ skryté neuniká (ani verejné stĺpce). Nákup cez reserve_market_rider() a admin čítanie cez admin_market_riders() fungujú ďalej
--          (sú SECURITY DEFINER). Dáta nemení. Môžeš ho pustiť opakovane.
-- Návrat do normálu: oprav kód (alebo nasaď správny build), potom znova pusti migráciu B (20261119_02_market_hidden_columns_B.sql) – tá vráti LEN verejné stĺpce.
-- Nikdy to nezačínaj súborom ROLLBACK_B_ODOMKNE_SKRYTE_HODNOTY.sql.
revoke select on public.market_riders from public, anon, authenticated;
