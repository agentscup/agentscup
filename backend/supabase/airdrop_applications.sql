-- =====================================================================
-- Airdrop supplementary submissions — anyone can apply for the
-- supplementary airdrop by submitting their EVM address. Each unique
-- address receives 150,000 CUP at distribution time.
-- =====================================================================

create table if not exists airdrop_applications (
  id              uuid primary key default gen_random_uuid(),
  evm_address     text not null unique,
  x_handle        text,                         -- optional
  ip_hash         text,                         -- sha256(ip) — spam defense
  user_agent      text,
  source          text default 'form',          -- 'form' | 'import' | 'manual'
  created_at      timestamptz default now(),
  included_in_merkle boolean default false,
  distribution_tx text                          -- populated after funding
);

create index if not exists airdrop_applications_created_idx
  on airdrop_applications (created_at desc);
create index if not exists airdrop_applications_included_idx
  on airdrop_applications (included_in_merkle)
  where included_in_merkle = false;

alter table airdrop_applications enable row level security;

-- No direct client writes — all inserts go through the backend with
-- the service_role key. This lets us apply rate limits + IP hashing
-- centrally.
drop policy if exists airdrop_applications_no_client_write on airdrop_applications;
create policy airdrop_applications_no_client_write
  on airdrop_applications for all
  using (false)
  with check (false);
