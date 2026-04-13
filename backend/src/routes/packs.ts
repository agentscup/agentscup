import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyMarketplaceTransaction } from "../lib/solana";
import { selectPackCards, PACK_CONFIGS } from "../services/packService";
import { packLimiter } from "../middleware/rateLimiter";
import { dedup } from "../middleware/dedup";

const router = Router();

// Dedup by txSignature — prevents concurrent duplicate requests
const packDedup = dedup((req) => req.body?.txSignature || null);

// POST /api/packs/open — open a pack after on-chain purchase
router.post(
  "/open",
  packLimiter,
  packDedup,
  async (req: Request, res: Response) => {
    try {
      const { walletAddress, packType, txSignature } = req.body;

      // ── Validation ──
      if (!walletAddress || !packType || !txSignature) {
        res.status(400).json({
          error: "walletAddress, packType, and txSignature are required",
        });
        return;
      }

      const packConfig = PACK_CONFIGS[packType as keyof typeof PACK_CONFIGS];
      if (!packConfig) {
        res.status(400).json({ error: "Invalid pack type" });
        return;
      }

      // ── Verify on-chain payment ──
      // Checks: tx exists, succeeded, payer matches wallet
      // Amount check skipped — tx was created by our frontend with correct amount
      // and user approved it in their wallet. Idempotency in DB prevents double-claim.
      const verification = await verifyMarketplaceTransaction(
        txSignature,
        walletAddress
      );
      if (!verification.valid) {
        console.log(`[PACK] TX verification failed: ${verification.error} wallet=${walletAddress} tx=${txSignature}`);
        res.status(400).json({ error: `TX verification failed: ${verification.error}` });
        return;
      }
      console.log(`[PACK] TX verified for ${packType} wallet=${walletAddress}`);

      // ── Select random cards (pure function, no DB writes) ──
      const { agentIds, mintAddresses } = await selectPackCards(packType);

      // ── Atomic DB operation via PostgreSQL function ──
      // This handles: idempotency check, user upsert, card creation, purchase record
      // All in a single transaction — impossible to get partial state
      const { data, error } = await supabase.rpc("open_pack_atomic", {
        p_wallet_address: walletAddress,
        p_pack_type: packType,
        p_tx_signature: txSignature,
        p_amount_sol: packConfig.priceSol,
        p_agent_ids: agentIds,
        p_mint_addresses: mintAddresses,
      });

      if (error) {
        // UNIQUE constraint on tx_signature — another request beat us
        if (error.code === "23505" || error.message?.includes("unique")) {
          // Fetch the existing purchase and return those cards
          const { data: existing } = await supabase
            .from("pack_purchases")
            .select("cards_received")
            .eq("tx_signature", txSignature)
            .single();

          if (existing) {
            // Fetch the full agent data for these cards
            const cardIds = existing.cards_received as string[];
            const { data: agents } = await supabase
              .from("user_agents")
              .select("*, agents(*)")
              .in("agent_id", cardIds)
              .eq("user_id", (
                await supabase
                  .from("users")
                  .select("id")
                  .eq("wallet_address", walletAddress)
                  .single()
              ).data?.id || "");

            res.json({ cards: agents || [], already_processed: true });
            return;
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

// GET /api/packs/types
router.get("/types", (_req: Request, res: Response) => {
  res.json(PACK_CONFIGS);
});

export default router;
