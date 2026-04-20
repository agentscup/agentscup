-- =====================================================================
-- Early Access claim registry
-- =====================================================================
-- One row per X account that goes through the early-access flow.
-- The row is created the moment the card is revealed and transitions
-- to `claimed = true` after the user shares the tweet.

create table if not exists early_access_claims (
  id              uuid primary key default gen_random_uuid(),
  x_user_id       text unique not null,               -- X stable id
  x_handle        text not null,                      -- lowercased @handle sans '@'
  x_display_name  text,
  x_avatar_url    text,                               -- 400x400 variant
  follower_count  int,
  account_age_days int,
  follows_base    boolean default false,
  bio_mentions_base boolean default false,
  base_tweet_hits  int default 0,                     -- count of recent base mentions
  rarity          text not null,                      -- COMMON | RARE | EPIC | LEGENDARY
  score           int not null,                       -- computed rarity score
  stats           jsonb not null,                     -- { pace, shooting, passing, ... }
  position        text not null,                      -- GK / CB / ... / ST / MGR
  overall         int not null,
  claimed         boolean default false,
  claimed_tweet_url text,
  claimed_at      timestamptz,
  created_at      timestamptz default now()
);

create index if not exists early_access_claims_handle_idx
  on early_access_claims (x_handle);
create index if not exists early_access_claims_claimed_idx
  on early_access_claims (claimed);
create index if not exists early_access_claims_created_idx
  on early_access_claims (created_at desc);

-- Row-level security: backend writes via service role only.
alter table early_access_claims enable row level security;

-- Public read of leaderboard-style aggregates; no PII beyond handle.
drop policy if exists early_access_public_read on early_access_claims;
create policy early_access_public_read
  on early_access_claims for select
  using (true);

-- No direct client writes — all mutations through the backend.
drop policy if exists early_access_no_client_write on early_access_claims;
create policy early_access_no_client_write
  on early_access_claims for all
  using (false)
  with check (false);
