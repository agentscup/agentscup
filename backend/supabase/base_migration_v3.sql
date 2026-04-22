-- =====================================================================
-- Base migration v3 — widen listings.price_cup for ETH wei amounts
-- =====================================================================
--
-- Production incident (2026-04-23): users reported "can't list on
-- marketplace". Root cause traced to `listings.price_cup` being
-- `numeric(18,0)` — max 999,999,999,999,999,999 (18 digits).
--
--   0.01 ETH = 10^16 wei ✓
--   0.1  ETH = 10^17 wei ✓
--   1    ETH = 10^18 wei ✗  (19 digits — overflows numeric(18,0))
--
-- The legacy column was sized for $CUP token amounts (~millions),
-- never for ETH wei. Any listing ≥ 1 ETH was silently 500-ing at the
-- insert step and surfacing as a generic "Failed to list agent" toast
-- on the frontend.
--
-- Fix: widen the column to numeric(40,0). 40 digits is absurdly large
-- (10^40 — more than total wei in existence), but numeric columns in
-- Postgres have no storage overhead for unused precision, so this is
-- a free upgrade. Backward compatible: all existing rows re-fit.
-- =====================================================================

alter table listings
  alter column price_cup type numeric(40,0) using price_cup::numeric(40,0);

-- price_wei already exists from v2 as uncapped numeric — no change.
