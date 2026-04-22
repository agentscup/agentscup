-- =====================================================================
-- Base migration v2 — on-chain listing + purchase bookkeeping
-- =====================================================================
-- Adds the EVM-specific columns needed to tie DB state to the
-- AgentsCupMarketplace contract:
--
--   listing_id_hex  bytes32 listing id the seller used when calling
--                   listAgent() on the contract. All buy verifications
--                   key off this value.
--   price_wei       sale price in wei. Exists alongside the legacy
--                   `price_cup` numeric column so historical Solana
--                   listings keep rendering without a tricky type coerce.

alter table listings
  add column if not exists listing_id_hex text unique,
  add column if not exists price_wei numeric;

create index if not exists listings_listing_id_hex_idx
  on listings (lower(listing_id_hex))
  where listing_id_hex is not null;
