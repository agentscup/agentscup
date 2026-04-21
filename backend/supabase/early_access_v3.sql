-- Capture the player's EVM wallet address so we can drop airdrops on
-- launch day. Stored lowercase; the API layer validates the 0x-prefixed
-- 40-hex-char shape before insert.
alter table early_access_claims
  add column if not exists evm_address text,
  add column if not exists wallet_recorded_at timestamptz;

-- Fast lookup for airdrop snapshot queries.
create index if not exists early_access_claims_evm_idx
  on early_access_claims (evm_address)
  where evm_address is not null;
