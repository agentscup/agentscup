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
      // Checks: tx mined + succeeded, hit the V2 PackStore contract,
      // emitted PackPurchased with buyer + amount matching the tier's
      // configured $CUP price. V2 uses CUP not ETH but the event shape
      // `PackPurchased(buyer, packTier, amount, requestId)` is
      // unchanged — `amount` just represents CUP wei now.
      const verification = await verifyPackPurchase(
        txHash,
        walletAddress,
        BigInt(packConfig.priceCupWei)
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
      // `pack_purchases.amount_cup` is `numeric(18,0)` (legacy from the
      // Solana-era schema, sized for $CUP token base units that never
      // got near 10^18). Post-V2 migration the on-chain amount is now
      // ERC-20 CUP wei (18 decimals) and even a starter pack's 50k CUP
      // = 5×10^22 overflows the column. Cap the stored value at the
      // column max so the insert succeeds — the canonical receipt
      // lives in `tx_signature` anyway (BaseScan is the source of
      // truth for the exact paid amount).
      //
      // Also: pass as STRING not Number. JS Number has 53 bits of
      // integer precision (~9×10^15); casting 5×10^22 wei to Number
      // silently loses the lower digits. PostgREST accepts string
      // form for numeric columns and preserves precision.
      const AMOUNT_CAP = 999_999_999_999_999_999n; // numeric(18,0) max
      const amountWeiRaw = verification.amountWei ?? 0n;
      const amountForDb =
        amountWeiRaw > AMOUNT_CAP ? AMOUNT_CAP : amountWeiRaw;

      const { data, error } = await supabase.rpc("open_pack_atomic", {
        p_wallet_address: walletAddress.toLowerCase(),
        p_pack_type: packType,
        p_tx_signature: txHash.toLowerCase(),
        p_amount_cup: amountForDb.toString(),
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
      // Print the whole error object so ops can see Postgres error
      // codes, stacks, and nested details. Previously collapsed to
      // "Unknown error" for non-Error throws, making it impossible
      // to diagnose numeric-overflow class issues.
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[PACK OPEN ERROR]", msg, JSON.stringify(err, null, 2));
      res.status(500).json({ error: msg || "Pack open failed" });
    }
  }
);

// GET /api/packs/types — sent to the frontend so it can display prices
router.get("/types", (_req: Request, res: Response) => {
  res.json(PACK_CONFIGS);
});

export default router;
