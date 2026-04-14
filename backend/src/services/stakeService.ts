import { supabase } from "../lib/supabase";
import {
  verifyTokenStakeTransaction,
  sendTokenPayout,
  STAKE_THRESHOLD,
  TOKEN_MINT,
} from "../lib/solana";

/* ================================================================== */
/*  $CUP Token Staking Service                                         */
/*  Stake 5M $CUP → play matches for FREE                             */
/* ================================================================== */

export interface StakeInfo {
  id: string;
  user_id: string;
  wallet_address: string;
  amount: number;
  token_mint: string;
  tx_signature: string;
  staked_at: string;
  is_active: boolean;
}

/**
 * Check if a wallet has an active stake >= STAKE_THRESHOLD
 */
export async function hasActiveStake(wallet: string): Promise<boolean> {
  const { data } = await supabase
    .from("stakes")
    .select("id, amount")
    .eq("wallet_address", wallet)
    .eq("is_active", true)
    .gte("amount", STAKE_THRESHOLD)
    .limit(1);

  return !!(data && data.length > 0);
}

/**
 * Get stake info for a wallet
 */
export async function getStakeInfo(
  wallet: string
): Promise<StakeInfo | null> {
  const { data } = await supabase
    .from("stakes")
    .select("*")
    .eq("wallet_address", wallet)
    .eq("is_active", true)
    .order("staked_at", { ascending: false })
    .limit(1)
    .single();

  return data || null;
}

/**
 * Record a new stake after verifying the on-chain transaction.
 */
export async function stakeTokens(
  wallet: string,
  txSignature: string
): Promise<{ success: boolean; error?: string }> {
  // Check if already staked
  const existing = await hasActiveStake(wallet);
  if (existing) {
    return { success: false, error: "Already have an active stake" };
  }

  // Verify the token transfer on-chain
  const verification = await verifyTokenStakeTransaction(txSignature, wallet);
  if (!verification.valid) {
    return { success: false, error: verification.error || "Verification failed" };
  }

  // Get user ID
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("wallet_address", wallet)
    .single();

  if (!user) {
    return { success: false, error: "User not found" };
  }

  // Record stake in DB
  const { error } = await supabase.from("stakes").insert({
    user_id: user.id,
    wallet_address: wallet,
    amount: STAKE_THRESHOLD,
    token_mint: TOKEN_MINT.toBase58(),
    tx_signature: txSignature,
    is_active: true,
  });

  if (error) {
    console.error("[STAKE] DB insert error:", error);
    return { success: false, error: "Failed to record stake" };
  }

  console.log(`[STAKE] ${wallet.slice(0, 8)} staked ${STAKE_THRESHOLD.toLocaleString()} $CUP`);
  return { success: true };
}

/**
 * Unstake: return tokens to user and deactivate stake.
 */
export async function unstakeTokens(
  wallet: string
): Promise<{ success: boolean; error?: string; signature?: string }> {
  const stake = await getStakeInfo(wallet);
  if (!stake) {
    return { success: false, error: "No active stake found" };
  }

  // Send tokens back to user
  const payout = await sendTokenPayout(wallet, stake.amount);
  if (!payout.success) {
    return { success: false, error: payout.error || "Token transfer failed" };
  }

  // Deactivate stake
  await supabase
    .from("stakes")
    .update({ is_active: false })
    .eq("id", stake.id);

  console.log(`[UNSTAKE] ${wallet.slice(0, 8)} unstaked ${stake.amount.toLocaleString()} $CUP`);
  return { success: true, signature: payout.signature };
}
