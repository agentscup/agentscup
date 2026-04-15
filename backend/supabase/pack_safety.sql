-- ================================================================
-- Pack Opening & Marketplace Safety — Atomic Functions
-- Run this in Supabase SQL Editor after migration.sql
-- ================================================================

-- 1. ATOMIC PACK OPENING
-- Handles: idempotency, user upsert, card creation, purchase record
-- All in a single transaction — no partial states possible
create or replace function open_pack_atomic(
  p_wallet_address text,
  p_pack_type text,
  p_tx_signature text,
  p_amount_cup numeric,
  p_agent_ids text[],
  p_mint_addresses text[]
) returns jsonb as $$
declare
  v_user_id uuid;
  v_existing_purchase jsonb;
  v_cards jsonb;
  v_i integer;
begin
  -- STEP 1: Idempotency — if this tx was already processed, return existing cards
  select jsonb_build_object(
    'already_processed', true,
    'cards', pp.cards_received
  ) into v_existing_purchase
  from pack_purchases pp
  where pp.tx_signature = p_tx_signature;

  if v_existing_purchase is not null then
    -- Return the previously created cards (fetch full agent data)
    return (
      select jsonb_build_object(
        'already_processed', true,
        'cards', coalesce(jsonb_agg(
          jsonb_build_object(
            'id', ua.id,
            'agent_id', ua.agent_id,
            'mint_address', ua.mint_address,
            'agents', jsonb_build_object(
              'id', a.id, 'name', a.name, 'position', a.position,
              'overall', a.overall, 'pace', a.pace, 'shooting', a.shooting,
              'passing', a.passing, 'dribbling', a.dribbling,
              'defending', a.defending, 'physical', a.physical,
              'rarity', a.rarity, 'tech_stack', a.tech_stack,
              'flavor_text', a.flavor_text
            )
          )
        ), '[]'::jsonb)
      )
      from user_agents ua
      join agents a on a.id = ua.agent_id
      join users u on u.id = ua.user_id
      where u.wallet_address = p_wallet_address
        and ua.agent_id = any(
          select jsonb_array_elements_text(
            (select pp2.cards_received from pack_purchases pp2 where pp2.tx_signature = p_tx_signature)
          )
        )
      -- limit to cards from this specific purchase by matching mint addresses
    );
  end if;

  -- STEP 2: Upsert user (get or create)
  insert into users (wallet_address)
  values (p_wallet_address)
  on conflict (wallet_address) do update set wallet_address = excluded.wallet_address
  returning id into v_user_id;

  -- STEP 3: Insert all user_agents in one batch
  v_cards := '[]'::jsonb;
  for v_i in 1..array_length(p_agent_ids, 1) loop
    insert into user_agents (user_id, agent_id, mint_address)
    values (v_user_id, p_agent_ids[v_i], p_mint_addresses[v_i]);
  end loop;

  -- STEP 4: Record the purchase (UNIQUE constraint on tx_signature prevents duplicates)
  insert into pack_purchases (user_id, pack_type, tx_signature, amount_cup, cards_received)
  values (
    v_user_id,
    p_pack_type,
    p_tx_signature,
    p_amount_cup,
    to_jsonb(p_agent_ids)
  );

  -- STEP 5: Ensure leaderboard row exists
  insert into leaderboard (user_id, team_name)
  values (v_user_id, 'MY SQUAD')
  on conflict (user_id) do nothing;

  -- STEP 6: Return the created cards with full agent data
  return (
    select jsonb_build_object(
      'already_processed', false,
      'cards', coalesce(jsonb_agg(
        jsonb_build_object(
          'id', ua.id,
          'agent_id', ua.agent_id,
          'mint_address', ua.mint_address,
          'agents', jsonb_build_object(
            'id', a.id, 'name', a.name, 'position', a.position,
            'overall', a.overall, 'pace', a.pace, 'shooting', a.shooting,
            'passing', a.passing, 'dribbling', a.dribbling,
            'defending', a.defending, 'physical', a.physical,
            'rarity', a.rarity, 'tech_stack', a.tech_stack,
            'flavor_text', a.flavor_text
          )
        )
      ), '[]'::jsonb)
    )
    from user_agents ua
    join agents a on a.id = ua.agent_id
    where ua.user_id = v_user_id
      and ua.mint_address = any(p_mint_addresses)
  );
end;
$$ language plpgsql;


-- 2. ATOMIC MARKETPLACE BUY
-- Handles: listing validation, ownership transfer, listing deactivation
-- Uses SELECT FOR UPDATE to lock the listing row — prevents double-buy
create or replace function buy_agent_atomic(
  p_buyer_wallet text,
  p_listing_id uuid,
  p_tx_signature text
) returns jsonb as $$
declare
  v_listing record;
  v_buyer_id uuid;
begin
  -- STEP 1: Lock the listing row (prevents concurrent buys)
  select * into v_listing
  from listings
  where id = p_listing_id and is_active = true
  for update skip locked;

  if v_listing is null then
    return jsonb_build_object('error', 'Listing not available or already sold');
  end if;

  -- Prevent self-buy
  if v_listing.seller_wallet = p_buyer_wallet then
    return jsonb_build_object('error', 'Cannot buy your own listing');
  end if;

  -- STEP 2: Upsert buyer
  insert into users (wallet_address)
  values (p_buyer_wallet)
  on conflict (wallet_address) do update set wallet_address = excluded.wallet_address
  returning id into v_buyer_id;

  -- STEP 3: Transfer ownership
  update user_agents
  set user_id = v_buyer_id, is_listed = false
  where id = v_listing.user_agent_id;

  -- STEP 4: Deactivate listing
  update listings
  set is_active = false, tx_signature = p_tx_signature
  where id = p_listing_id;

  -- STEP 5: Ensure leaderboard row exists for buyer
  insert into leaderboard (user_id, team_name)
  values (v_buyer_id, 'MY SQUAD')
  on conflict (user_id) do nothing;

  return jsonb_build_object(
    'success', true,
    'agent_id', v_listing.user_agent_id,
    'buyer_id', v_buyer_id
  );
end;
$$ language plpgsql;
