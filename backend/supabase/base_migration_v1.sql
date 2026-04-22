-- =====================================================================
-- Solana → Base migration, phase 1: user identity + chain-neutral keys
-- =====================================================================
-- We keep the legacy `wallet_address` column around for historical
-- records (existing Solana claims/users) and add a parallel
-- `evm_address` column that every post-cutover row is keyed on. All
-- new inserts happen under evm_address; the app layer never mixes
-- formats on the same row.

alter table users
  add column if not exists evm_address text unique;

create index if not exists users_evm_address_idx
  on users (lower(evm_address))
  where evm_address is not null;

-- Marketplace listings — same treatment. Sellers are identified by
-- their EVM address going forward; the old Solana `seller_wallet`
-- text column is reused but conventionally holds 0x-prefixed hex
-- once Base is live. A CHECK constraint is tempting but we want the
-- old Solana rows to stay readable, so we keep the column loose.

alter table listings
  add column if not exists seller_evm_address text;

create index if not exists listings_seller_evm_idx
  on listings (lower(seller_evm_address))
  where seller_evm_address is not null;

-- Matches record both player wallets for replay / dispute. Add
-- EVM-address columns so we can query by 0x-format without casting
-- tricks.

alter table matches
  add column if not exists home_evm_address text,
  add column if not exists away_evm_address text;

-- Pack purchases persist the on-chain tx hash so the verifier can
-- idempotently cross-check a request against its proof-of-payment.
-- Solana used `tx_signature`; for EVM we store the same field but
-- as a 0x-prefixed keccak hash. No schema change needed — the
-- text column accepts both. The index already exists for dedup.

-- Early access claims already have evm_address + wallet_recorded_at
-- from the earlier migration (v3), no changes needed here.
