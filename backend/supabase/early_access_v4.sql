-- Partial index on follower_count for the leaderboard query:
--   SELECT x_handle, x_avatar_url, follower_count, rarity, overall
--   FROM early_access_claims
--   WHERE claimed = true
--   ORDER BY follower_count DESC NULLS LAST
--   LIMIT 100;
--
-- Filtering on claimed = true eliminates half the scan, and ordering
-- by follower_count desc turns the query into a sub-millisecond index
-- range scan even at hundreds of thousands of rows.

create index if not exists early_access_claims_leaderboard_idx
  on early_access_claims (follower_count desc nulls last)
  where claimed = true;
