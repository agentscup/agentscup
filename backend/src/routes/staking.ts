import { Router } from "express";
import {
  stakeTokens,
  unstakeTokens,
  getStakeInfo,
  hasActiveStake,
} from "../services/stakeService";
import { STAKE_THRESHOLD } from "../lib/solana";

const router = Router();

/**
 * GET /api/staking/:wallet
 * Check if wallet has active stake
 */
router.get("/:wallet", async (req, res) => {
  try {
    const { wallet } = req.params;
    const stake = await getStakeInfo(wallet);
    const isStaker = !!(stake && stake.amount >= STAKE_THRESHOLD);

    res.json({
      isStaker,
      stake: stake
        ? {
            amount: stake.amount,
            stakedAt: stake.staked_at,
            txSignature: stake.tx_signature,
          }
        : null,
      threshold: STAKE_THRESHOLD,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/staking/stake
 * Stake tokens — verify TX and record
 */
router.post("/stake", async (req, res) => {
  try {
    const { wallet, txSignature } = req.body;
    if (!wallet || !txSignature) {
      return res.status(400).json({ error: "Missing wallet or txSignature" });
    }

    const result = await stakeTokens(wallet, txSignature);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: "Tokens staked successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/staking/unstake
 * Unstake tokens — return to user
 */
router.post("/unstake", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ error: "Missing wallet" });
    }

    const result = await unstakeTokens(wallet);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, signature: result.signature });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
