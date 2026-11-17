## C-076 – Model F2 (oprava a finálne overenie tréningu) – NÁVRH, NESCHVÁLENÉ
- Simulácia v izolácii (modelF2.ts, careerF2.cli.ts), 3 seedy × 10 000 kariér; produkcia/DB bez zmeny.
- Spoločný rozpočet: kapacita 1,0 / 0,75; split 80/20 (75/25–85/15 mení OVR minimálne); koeficienty na plnú kapacitu cPhys 1,8, cTech 6,5 (4 Tour: cPhys ~2,0).
- Energia: produkčné Energy/Fatigue/readiness; Full = hard, Basic = normal; záťaž Tour-u je predpoklad. Výber režimu má význam až s prísnejšou tabuľkou účinnosti (čaká na rozhodnutie). Systém iba odporúča.
- Akumulátor: pri strope progress zahodiť (aj technika – produkčné riziko pri v_primary_at_cap := false).
- V: odporúčané 75/25; Univerzál a Klasikár sú znevýhodnení (čaká na rozhodnutie).
- Väzby plánov: použité produkčné SHAPES + vlastné doplnky; design v3 nebol k dispozícii – čaká na potvrdenie.
