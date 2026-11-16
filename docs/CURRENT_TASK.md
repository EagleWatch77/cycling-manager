# Current task
Market purchase + weekly rider swap prepared (2026-11-16). Decision: C-052, open O-018..O-021. Migration 20261116_02_market_purchase_and_swap.sql written, tested on a local Postgres 16, NOT applied to production, SWITCHED OFF by default (rider_swap_settings.enabled = false) - nothing can be bought or swapped until the owner turns it on.
- Code: lib/contract/swap.ts, lib/market/swap.ts, app/transfers/actions.ts, BuyRiderButton, PendingSwapRows, market detail + Kontrakt tab + history (contract_ended), gameState hook (after season aging), i18n (7 languages), tests: contract/swap.test.ts + supabase/tests/rider_swaps.test.sh (111 checks).
- Before activation: apply 20261115_03, 20261116_01, 20261116_02 in Supabase; decide O-018 (race/training closure guarantee) first.
- Awaiting owner: O-013..O-021; the older pending items (D4, D7-D10, D12-D14, C-046, O-011, O-012).
