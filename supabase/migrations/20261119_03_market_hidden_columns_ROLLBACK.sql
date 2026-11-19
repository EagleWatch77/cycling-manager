-- ONLY IF NEEDED: gives players the old full SELECT right on market_riders back (undoes part B). Changes no data.
-- Row-level security still hides premium / foreign rows. Run part B again once the cause is fixed.
grant select on public.market_riders to authenticated;
