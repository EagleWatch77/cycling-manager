# Current task
Rider contracts V1 + career history prepared (2026-11-16). Decision: C-050, open O-013..O-017. Migration 20261116_01_rider_contracts.sql written and tested on a local Postgres 16, NOT applied to production; nothing deletes riders.
- Code: lib/contract/*, ContractCard, CareerHistoryCard, app/rider/contract + history pages, i18n (7 languages), tests: contract.test.ts + supabase/tests/rider_contracts.test.sh.
- Missing integration: the market purchase function (no player write path to market_riders / riders exists). It must call start_rider_contract_internal() in the same transaction.
- Awaiting owner: apply migrations 20261115_03 and 20261116_01 in Supabase (in this order); O-013..O-017; the older pending items (D4, D7-D10, D12-D14, career simulation decisions C-046, O-011, O-012).
