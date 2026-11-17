# CURRENT_TASK
C-085 + C-086 hotové v kóde a v migrácii 20261117_04 (NESPUSTENÁ, spínače vypnuté, nič nenasadené/nepushnuté).
Poradie nasadenia: web (pozná oba kalendáre) -> migrácie 01, 02, 03, 04 -> `select * from calendar_v2_conflicts()` -> `select activate_game_calendar_v2();` -> až potom zapnúť `development_model_settings` a `rider_state_settings`.
Ďalej: Race Engine (pokrok z pretekov cez `RaceProgressReport`; pred etapou `rider_state_catch_up_many` musí vrátiť 0), Morálka a ciele, kalibrácia záťaže etáp.
