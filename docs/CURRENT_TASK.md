# CURRENT_TASK (prepísané 2026-11-22)

**Hotovo (len UI, NIČ nenasadené; migrácia netreba):** redizajn `/sponsors` (C-112) — trh = dve sekcie Hlavní/Vedľajší (3 + 3 karty, desktop 3 / tablet 2 / mobil 1), kompaktné karty (názov, štítok 10/5 týždňov, oba ciele, platnosť, Detail + Odmietnuť), jedno finančné upozornenie nad sekciami, kompaktný prehľad. Peniaze a zamknuté Prijať sú v Detaile.
- Súbory: `app/sponsors/page.tsx`, `components/sponsors/SponsorCards.tsx`, `components/ui/SummaryCard.tsx` (voliteľné `compact`), 7× i18n, testy.
- Predošlá úloha (C-111, migrácia `20261122_06`, 50 vedľajších sponzorov) je pripravená, NESPUSTENÁ; postup `docs/NASADENIE_VEDLAJSI_SPONZORI.md`.

**Logá (C-113, len UI):** 80 SVG log + symbolov v `apps/web/public/sponsors/`, mapovanie `lib/sponsors/logos.ts` (kind + presný názov), komponent `SponsorLogo.tsx`; karty, Detail a aktívne zmluvy ich zobrazujú, fallback = text.

**Čaká na majiteľa:** výslovné potvrdenie nasadenia; schválenie súm (O-031); napojenie plánovača (stále NIE JE).
