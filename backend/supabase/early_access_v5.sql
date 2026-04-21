-- Leaderboard now sorts by rarity score (descending), which because
-- rarity tier is derived from score also gives us natural tier
-- ordering (LEGENDARY → EPIC → RARE → COMMON). A partial index on
-- (score DESC) for claimed rows makes the query a sub-millisecond
-- index-range scan even at hundreds of thousands of claims.

create index if not exists early_access_claims_score_idx
  on early_access_claims (score desc nulls last, overall desc)
  where claimed = true;

-- Follower-count index no longer needed — keep it dropped so we
-- don't pay the write-amplification tax on an unused secondary.
drop index if exists early_access_claims_leaderboard_idx;
