# CURRENT_TASK
C-085 Sedem tréningových plánov + jeden kalendár hotové v kóde a v migrácii 20261117_04 (NESPUSTENÁ, spínače vypnuté, nič nenasadené/nepushnuté).
Pred zapnutím: spustiť migrácie v poradí 01, 02, 03, 04; skontrolovať `select * from calendar_v2_conflicts()` (vlastník DB); rozhodnúť o prípadných starých registráciách na Tour v posunutých týždňoch; potom zapnúť `development_model_settings` a `rider_state_settings`.
Ďalej: Race Engine (pokrok z pretekov cez `RaceProgressReport`), Morálka a ciele, kalibrácia záťaže etáp.
