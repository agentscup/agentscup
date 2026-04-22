import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyPackPurchase, isEvmAddress } from "../lib/evm";
import { selectPackCards, PACK_CONFIGS } from "../services/packService";
import { packLimiter } from "../middleware/rateLimiter";
import { dedup } from "../middleware/dedup";

const router = Router();

// Dedup by txHash — prevents concurrent duplicate requests mid-flight.
// Once the DB UNIQUE constraint on tx_signature kicks in it would catch
// a dupe anyway, but the in-memory dedup saves a round-trip to the
// chain + DB under a retry storm.
const packDedup = dedup((req) => req.body?.txHash || null);

// POST /api/packs/open — credit a pack after an on-chain AgentsCupPackStore.buyPack
router.post(
  "/open",
  packLimiter,
  packDedup,
  async (req: Request, res: Response) => {
    try {
      const { walletAddress, packType, txHash } = req.body;

      // ── Validation ──
      if (!walletAddress || !packType || !txHash) {
        res.status(400).json({
          error: "walletAddress, packType, and txHash are required",
        });
        return;
      }
      if (!isEvmAddress(walletAddress)) {
        res
          .status(400)
          .json({ error: "walletAddress must be a 0x-prefixed EVM address" });
        return;
      }

      const packConfig = PACK_CONFIGS[packType as keyof typeof PACK_CONFIGS];
      if (!packConfig) {
        res.status(400).json({ error: "Invalid pack type" });
        return;
      }

      // ── Verify the on-chain tx matches our expectation ──
      // Checks: tx mined + succeeded, hit the PackStore contract, emitted
      // PackPurchased with matching buyer + amount >= priceWei.
      const verification = await verifyPackPurchase(
        txHash,
        walletAddress,
        BigInt(packConfig.priceWei)
      );
      if (!verification.valid) {
        console.log(
          `[PACK] TX verification failed: ${verification.reason} wallet=${walletAddress} tx=${txHash}`
        );
        res
          .status(400)
          .json({ error: `TX verification failed: ${verification.reason}` });
        return;
      }
      console.log(
        `[PACK] TX verified for ${packType} wallet=${walletAddress} amount=${verification.amountWei}wei`
      );

      // ── Roll cards ──
      const { agentIds, mintAddresses } = await selectPackCards(packType);

      // ── Atomic DB state ──
      // The `p_amount_cup` parameter is now a chain-agnostic numeric —
      // we feed the wei amount directly (still fits in the column's
      // NUMERIC range, no schema change needed). Legacy Solana rows
      // hold $CUP base units; Base rows hold wei. Reports that care
      // about the distinction can filter on tx_signature prefix
      // (Solana sigs = base58, EVM hashes = 0x-prefixed hex).
      const { data, error } = await supabase.rpc("open_pack_atomic", {
        p_wallet_address: walletAddress.toLowerCase(),
        p_pack_type: packType,
        p_tx_signature: txHash.toLowerCase(),
        p_amount_cup: Number(verification.amountWei ?? 0n),
        p_agent_ids: agentIds,
        p_mint_addresses: mintAddresses,
      });

      if (error) {
        // UNIQUE constraint on tx_signature — another request beat us
        if (error.code === "23505" || error.message?.includes("unique")) {
          const { data: existing } = await supabase
            .from("pack_purchases")
            .select("cards_received")
            .eq("tx_signature", txHash.toLowerCase())
            .single();

          if (existing) {
            const cardIds = existing.cards_received as string[];
            const { data: user } = await supabase
              .from("users")
              .select("id")
              .eq("wallet_address", walletAddress.toLowerCase())
              .maybeSingle();
            if (user) {
              const { data: agents } = await supabase
                .from("user_agents")
                .select("*, agents(*)")
                .in("agent_id", cardIds)
                .eq("user_id", user.id);
              res.json({ cards: agents || [], already_processed: true });
              return;
            }
          }
        }
        throw error;
      }

      const result = data as { already_processed: boolean; cards: unknown[] };
      res.json({
        cards: result.cards || [],
        already_processed: result.already_processed || false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[PACK OPEN ERROR]", msg);
      res.status(500).json({ error: msg });
    }
  }
);

// GET /api/packs/types — sent to the frontend so it can display prices
router.get("/types", (_req: Request, res: Response) => {
  res.json(PACK_CONFIGS);
});

export default router;
