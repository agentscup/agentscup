-- =====================================================================
-- Launch scale columns — enables the async verification worker that
-- sweeps claimed rows long after the signup request has returned.
-- =====================================================================

alter table early_access_claims
  add column if not exists claimed_tasks jsonb,
  add column if not exists verification_status text default 'pending',
  add column if not exists verified_at timestamptz,
  add column if not exists verification_run_at timestamptz,
  add column if not exists original_rarity text,
  add column if not exists original_score int;

-- Index the verification pipeline's scan query:
--   SELECT * FROM early_access_claims
--   WHERE claimed = true AND verification_status = 'pending'
--   ORDER BY claimed_at ASC LIMIT 50;
create index if not exists early_access_claims_pending_verification_idx
  on early_access_claims (verification_status, claimed_at)
  where claimed = true and verification_status = 'pending';
