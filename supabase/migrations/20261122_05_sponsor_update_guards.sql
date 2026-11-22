-- ============================================================================
-- Sponzori — OCHRANA PRI UPDATE (owner 2026-11-22). Whole file, one transaction, idempotent, additive. Run AFTER 20261122_01 .. _04 (refuses otherwise).
-- Deletes nothing, changes no row. NOT RUN in production.
--
-- _04 guarded INSERT only. This closes the UPDATE side so the "one company per player" rule cannot be bypassed later by changing the firm, the player
-- or the status of an offer or contract:
--   offers    : when an offer becomes/is 'open' and its player, company or status changes  -> same checks as at INSERT
--               (no second valid offer of the firm, no offer of a firm with an ACTIVE contract, not the last signed firm)
--   contracts : when a contract becomes/is 'active' and its player, company or status changes (e.g. ended -> active)
--               -> no second active contract of the firm for the player, no other valid offer of that firm
--   (the player/company/terms of a contract were already immutable since _01; this also covers status changes.)
-- Everything is serialised per player by the same advisory lock as in _04, so concurrent updates/inserts queue instead of racing.
-- Ordinary operations are NOT affected: rejecting, expiring, ending a contract never pass through the guard (the trigger fires only when the row
-- is or becomes open/active), and unrelated updates of a legacy row are not blocked.
-- ============================================================================

-- One transaction: either the whole file is applied or nothing (a failed run leaves no half-state).
begin;

do $guard$ begin
  if to_regprocedure('public.sponsor_offer_company_guard()') is null or to_regprocedure('public.sponsor_contract_company_guard()') is null
     or to_regprocedure('public.sponsor_reachable_tours(timestamptz, integer)') is null then
    raise exception 'Run 20261122_01, _02, _03 and _04 first. Nothing was changed.';
  end if;
end $guard$;

drop trigger if exists sponsor_offers_company_guard_upd_trg on public.sponsor_offers;
create trigger sponsor_offers_company_guard_upd_trg before update on public.sponsor_offers for each row
  when (new.status = 'open' and (old.status is distinct from new.status or old.player_id is distinct from new.player_id or old.company_id is distinct from new.company_id))
  execute function public.sponsor_offer_company_guard();

drop trigger if exists sponsor_contracts_company_guard_upd_trg on public.sponsor_contracts;
create trigger sponsor_contracts_company_guard_upd_trg before update on public.sponsor_contracts for each row
  when (new.status = 'active' and (old.status is distinct from new.status or old.player_id is distinct from new.player_id or old.company_id is distinct from new.company_id))
  execute function public.sponsor_contract_company_guard();

commit;
