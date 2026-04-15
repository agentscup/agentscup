-- ================================================================
-- SOL → $CUP Economy Migration
-- One-time migration to rename columns and drop unused stake table
-- Safe to run multiple times (idempotent)
-- ================================================================

-- 1. Rename listings.price_sol → price_cup
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'listings' and column_name = 'price_sol'
  ) then
    alter table listings rename column price_sol to price_cup;
  end if;
end $$;

-- 2. Change listings.price_cup type to support large CUP amounts (no decimals)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'listings' and column_name = 'price_cup' and data_type = 'numeric'
  ) then
    alter table listings alter column price_cup type numeric(18,0) using price_cup::numeric(18,0);
  end if;
end $$;

-- 3. Rename pack_purchases.amount_sol → amount_cup
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'pack_purchases' and column_name = 'amount_sol'
  ) then
    alter table pack_purchases rename column amount_sol to amount_cup;
  end if;
end $$;

-- 4. Change pack_purchases.amount_cup type to support large CUP amounts
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'pack_purchases' and column_name = 'amount_cup' and data_type = 'numeric'
  ) then
    alter table pack_purchases alter column amount_cup type numeric(18,0) using amount_cup::numeric(18,0);
  end if;
end $$;

-- 5. Drop matches.stake_sol (no longer used)
alter table matches drop column if exists stake_sol;

-- 6. Drop stakes table if it exists (from old staking system)
drop table if exists stakes cascade;

-- 7. Verify
select
  'listings.price_cup exists: ' || exists(
    select 1 from information_schema.columns where table_name='listings' and column_name='price_cup'
  )::text as listings_check,
  'pack_purchases.amount_cup exists: ' || exists(
    select 1 from information_schema.columns where table_name='pack_purchases' and column_name='amount_cup'
  )::text as packs_check,
  'matches.stake_sol removed: ' || (not exists(
    select 1 from information_schema.columns where table_name='matches' and column_name='stake_sol'
  ))::text as matches_check;
