-- ================================================================
-- Agents Cup — Supabase Migration
-- Run this in Supabase SQL Editor to create all tables
-- ================================================================

-- 1. USERS
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  username text,
  elo integer not null default 1000,
  xp integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_users_wallet on users(wallet_address);

-- 2. AGENTS (static roster — seeded once via seed script)
create table if not exists agents (
  id text primary key,
  name text not null,
  position text not null,
  overall integer not null,
  pace integer not null default 50,
  shooting integer not null default 50,
  passing integer not null default 50,
  dribbling integer not null default 50,
  defending integer not null default 50,
  physical integer not null default 50,
  rarity text not null default 'common',
  tech_stack text not null default 'independent',
  flavor_text text,
  avatar_svg text
);

create index idx_agents_rarity on agents(rarity);
create index idx_agents_position on agents(position);

-- 3. USER_AGENTS (NFTs owned by players)
create table if not exists user_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  agent_id text not null references agents(id),
  mint_address text unique,
  level integer not null default 1,
  xp integer not null default 0,
  is_listed boolean not null default false,
  acquired_at timestamptz not null default now()
);

create index idx_user_agents_user on user_agents(user_id);
create index idx_user_agents_agent on user_agents(agent_id);
create index idx_user_agents_mint on user_agents(mint_address);

-- 4. SQUADS
create table if not exists squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null default 'My Squad',
  formation text not null default '4-3-3',
  chemistry integer not null default 0,
  positions jsonb not null default '{}',
  manager_id text references agents(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_squads_user on squads(user_id);

-- 5. MATCHES
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  home_player_id uuid references users(id),
  away_player_id uuid references users(id),
  home_squad jsonb,
  away_squad jsonb,
  home_score integer not null default 0,
  away_score integer not null default 0,
  status text not null default 'pending',
  events jsonb not null default '[]',
  seed bigint,
  tx_signature text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index idx_matches_home on matches(home_player_id);
create index idx_matches_away on matches(away_player_id);
create index idx_matches_status on matches(status);

-- 6. LISTINGS (marketplace)
create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  user_agent_id uuid not null references user_agents(id) on delete cascade,
  seller_wallet text not null,
  price_cup numeric(18,0) not null,
  listing_type text not null default 'fixed',
  is_active boolean not null default true,
  expires_at timestamptz,
  tx_signature text,
  created_at timestamptz not null default now()
);

create index idx_listings_active on listings(is_active) where is_active = true;
create index idx_listings_seller on listings(seller_wallet);

-- 7. LEADERBOARD
create table if not exists leaderboard (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references users(id) on delete cascade,
  team_name text not null default 'MY SQUAD',
  played integer not null default 0,
  won integer not null default 0,
  drawn integer not null default 0,
  lost integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  points integer not null default 0,
  updated_at timestamptz not null default now()
);

create index idx_leaderboard_points on leaderboard(points desc);

-- 8. PACK PURCHASES (on-chain verification log)
create table if not exists pack_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  pack_type text not null,
  tx_signature text unique not null,
  amount_cup numeric(18,0) not null,
  cards_received jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index idx_pack_purchases_user on pack_purchases(user_id);
create index idx_pack_purchases_tx on pack_purchases(tx_signature);

-- ================================================================
-- Row Level Security (RLS)
-- ================================================================

alter table users enable row level security;
alter table user_agents enable row level security;
alter table squads enable row level security;
alter table matches enable row level security;
alter table listings enable row level security;
alter table leaderboard enable row level security;
alter table pack_purchases enable row level security;

-- Public read for agents (static data)
alter table agents enable row level security;
create policy "Agents are publicly readable"
  on agents for select using (true);

-- Public read for leaderboard
create policy "Leaderboard is publicly readable"
  on leaderboard for select using (true);

-- Public read for active listings
create policy "Active listings are publicly readable"
  on listings for select using (is_active = true);

-- Service role bypasses RLS for all mutations (backend uses service_role key)

-- ================================================================
-- Functions
-- ================================================================

-- Auto-update updated_at timestamps
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger squads_updated_at
  before update on squads
  for each row execute function update_updated_at();

create trigger leaderboard_updated_at
  before update on leaderboard
  for each row execute function update_updated_at();

-- Record match result and update leaderboard atomically
create or replace function record_match_result(
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer,
  p_events jsonb
) returns void as $$
declare
  v_home_id uuid;
begin
  -- Update match
  update matches
    set home_score = p_home_score,
        away_score = p_away_score,
        events = p_events,
        status = 'finished',
        finished_at = now()
    where id = p_match_id
    returning home_player_id into v_home_id;

  if v_home_id is null then return; end if;

  -- Update leaderboard for home player
  insert into leaderboard (user_id, team_name, played, won, drawn, lost, goals_for, goals_against, points)
    values (
      v_home_id, 'MY SQUAD', 1,
      case when p_home_score > p_away_score then 1 else 0 end,
      case when p_home_score = p_away_score then 1 else 0 end,
      case when p_home_score < p_away_score then 1 else 0 end,
      p_home_score, p_away_score,
      case when p_home_score > p_away_score then 3
           when p_home_score = p_away_score then 1
           else 0 end
    )
    on conflict (user_id) do update set
      played = leaderboard.played + 1,
      won = leaderboard.won + (case when p_home_score > p_away_score then 1 else 0 end),
      drawn = leaderboard.drawn + (case when p_home_score = p_away_score then 1 else 0 end),
      lost = leaderboard.lost + (case when p_home_score < p_away_score then 1 else 0 end),
      goals_for = leaderboard.goals_for + p_home_score,
      goals_against = leaderboard.goals_against + p_away_score,
      points = leaderboard.points + (
        case when p_home_score > p_away_score then 3
             when p_home_score = p_away_score then 1
             else 0 end
      );
end;
$$ language plpgsql;
