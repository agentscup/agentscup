import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyMarketplacePurchase, isEvmAddress } from "../lib/evm";
import { marketplaceLimiter } from "../middleware/rateLimiter";
import { dedup } from "../middleware/dedup";

const router = Router();

/** 7-day listing window. The earlier 24h TTL auto-expired listings
 *  before sellers had a realistic chance to find a buyer on a
 *  thin market. */
const LISTING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────
// GET /api/marketplace/listings
// ─────────────────────────────────────────────────────────────────────
router.get("/listings", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("listings")
      .select("*, user_agents(*, agents(*))")
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/marketplace/list
//   Creates a DB listing that mirrors what the seller just posted on-
//   chain via AgentsCupMarketplace.listAgent. We intentionally don't
//   verify the tx here — if it's fake, buyAgent will simply revert
//   when any buyer tries to purchase, so no funds can be lost. That
//   keeps this endpoint fast + survives transient RPC flakes.
// ─────────────────────────────────────────────────────────────────────
router.post("/list", async (req: Request, res: Response) => {
  try {
    const {
      walletAddress,
      userAgentId,
      priceWei,
      listingIdHex,
      listingType,
    } = req.body;

    if (!walletAddress || !userAgentId || !priceWei || !listingIdHex) {
      res.status(400).json({
        error:
          "walletAddress, userAgentId, priceWei, listingIdHex required",
      });
      return;
    }
    if (!isEvmAddress(walletAddress)) {
      res.status(400).json({ error: "walletAddress must be 0x-prefixed" });
      return;
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(listingIdHex)) {
      res.status(400).json({ error: "listingIdHex must be 32 bytes (0x+64 hex)" });
      return;
    }
    // Parse priceWei defensively — frontend may send a number, string,
    // or bigint. We need a canonical numeric for the DB column.
    let priceWeiNum: bigint;
    try {
      priceWeiNum = BigInt(priceWei);
      if (priceWeiNum <= 0n) throw new Error("price must be > 0");
    } catch {
      res.status(400).json({ error: "priceWei must be a positive integer" });
      return;
    }

    const walletLower = walletAddress.toLowerCase();
    const listingIdLower = listingIdHex.toLowerCase();

    // Verify ownership of the user_agent + that it isn't already listed.
    const { data: ua } = await supabase
      .from("user_agents")
      .select("id, is_listed, user_id, users!inner(wallet_address, evm_address)")
      .eq("id", userAgentId)
      .single();

    if (!ua) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const joined = ua as unknown as {
      users: { wallet_address: string | null; evm_address: string | null };
    };
    const ownerMatch =
      joined.users.evm_address?.toLowerCase() === walletLower ||
      joined.users.wallet_address?.toLowerCase() === walletLower;
    if (!ownerMatch) {
      res.status(403).json({ error: "Not your agent" });
      return;
    }
    if (ua.is_listed) {
      res.status(400).json({ error: "Already listed" });
      return;
    }

    await supabase
      .from("user_agents")
      .update({ is_listed: true })
      .eq("id", userAgentId);

    const { data, error } = await supabase
      .from("listings")
      .insert({
        user_agent_id: userAgentId,
        seller_wallet: walletLower,
        seller_evm_address: walletLower,
        price_cup: Number(priceWeiNum), // legacy numeric col, holds wei now
        price_wei: priceWeiNum.toString(),
        listing_id_hex: listingIdLower,
        listing_type: listingType || "fixed",
        expires_at: new Date(Date.now() + LISTING_TTL_MS).toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/marketplace/buy
//   Called after the buyer has successfully submitted buyAgent() on-
//   chain. We verify the AgentSold event matches the DB listing, then
//   atomically swap ownership via the existing PostgreSQL function.
// ─────────────────────────────────────────────────────────────────────
const buyDedup = dedup((req) => req.body?.txHash || null);

router.post(
  "/buy",
  marketplaceLimiter,
  buyDedup,
  async (req: Request, res: Response) => {
    try {
      const { buyerWallet, listingId, txHash } = req.body;
      if (!buyerWallet || !listingId || !txHash) {
        res.status(400).json({
          error: "buyerWallet, listingId, and txHash required",
        });
        return;
      }
      if (!isEvmAddress(buyerWallet)) {
        res.status(400).json({ error: "buyerWallet must be 0x-prefixed" });
        return;
      }

      const { data: listing } = await supabase
        .from("listings")
        .select("price_wei, price_cup, listing_id_hex")
        .eq("id", listingId)
        .eq("is_active", true)
        .single();

      if (!listing) {
        res.status(404).json({ error: "Listing not found or already sold" });
        return;
      }

      const listingIdHex = listing.listing_id_hex as string | null;
      if (!listingIdHex) {
        res.status(400).json({
          error:
            "Listing has no on-chain id — was created before the Base cutover",
        });
        return;
      }

      // Prefer the new price_wei column; fall back to price_cup (wei-equivalent
      // under the Base-era numeric convention).
      const priceWeiStr =
        (listing.price_wei as string | null) ??
        (listing.price_cup != null ? String(listing.price_cup) : "");
      if (!priceWeiStr) {
        res.status(400).json({ error: "Listing price missing" });
        return;
      }
      const priceWei = BigInt(priceWeiStr);

      console.log(
        `[MARKETPLACE BUY] wallet=${buyerWallet} listing=${listingId} priceWei=${priceWei} tx=${txHash}`
      );

      const v = await verifyMarketplacePurchase(
        txHash,
        listingIdHex,
        buyerWallet,
        priceWei
      );
      if (!v.valid) {
        console.log(`[MARKETPLACE BUY] TX verification failed: ${v.reason}`);
        res.status(400).json({ error: `TX verification failed: ${v.reason}` });
        return;
      }
      console.log(`[MARKETPLACE BUY] TX verified on-chain`);

      // Atomic buy via PostgreSQL function. Existing signature is
      // `p_buyer_wallet, p_listing_id, p_tx_signature`; we reuse it
      // by passing the EVM tx hash as the signature.
      const { data, error } = await supabase.rpc("buy_agent_atomic", {
        p_buyer_wallet: buyerWallet.toLowerCase(),
        p_listing_id: listingId,
        p_tx_signature: txHash.toLowerCase(),
      });

      if (error) {
        console.error(`[MARKETPLACE BUY] RPC error:`, error.message);
        throw error;
      }

      const result = data as {
        error?: string;
        success?: boolean;
        agent_id?: string;
      };
      if (result.error) {
        console.log(
          `[MARKETPLACE BUY] Atomic function error: ${result.error}`
        );
        res.status(400).json({ error: result.error });
        return;
      }

      console.log(`[MARKETPLACE BUY] Success! agent=${result.agent_id}`);
      res.json({ success: true, agentId: result.agent_id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[MARKETPLACE BUY ERROR]", msg);
      res.status(500).json({ error: msg });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────
// GET /api/marketplace/stats
// ─────────────────────────────────────────────────────────────────────
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const { data: active, error: aErr } = await supabase
      .from("listings")
      .select("price_cup, price_wei")
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString());
    if (aErr) throw aErr;

    const activeCount = active?.length || 0;
    const priceOf = (l: { price_cup: number | null; price_wei: string | null }) =>
      Number(l.price_wei ?? l.price_cup ?? 0);
    const floorPrice =
      activeCount > 0 ? Math.min(...active!.map(priceOf)) : 0;

    const { data: sold, error: sErr } = await supabase
      .from("listings")
      .select("price_cup, price_wei")
      .eq("is_active", false)
      .not("tx_signature", "is", null);
    if (sErr) throw sErr;

    const totalTrades = sold?.length || 0;
    const totalVolume = sold ? sold.reduce((sum, l) => sum + priceOf(l), 0) : 0;

    res.json({
      activeListings: activeCount,
      totalTrades,
      totalVolume: Math.round(totalVolume),
      floorPrice: Math.round(floorPrice),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/marketplace/history
// ─────────────────────────────────────────────────────────────────────
router.get("/history", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, seller_wallet, seller_evm_address, price_cup, price_wei, tx_signature, created_at, user_agents(*, agents(*))"
      )
      .eq("is_active", false)
      .not("tx_signature", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json(data || []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/marketplace/cancel/:id
// ─────────────────────────────────────────────────────────────────────
router.delete("/cancel/:id", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;
    const walletLower = walletAddress?.toLowerCase();

    const { data: listing } = await supabase
      .from("listings")
      .select("*")
      .eq("id", req.params.id)
      .eq("is_active", true)
      .single();

    if (!listing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const sellerLower =
      (listing.seller_evm_address as string | null)?.toLowerCase() ??
      (listing.seller_wallet as string | null)?.toLowerCase();
    if (sellerLower !== walletLower) {
      res.status(403).json({ error: "Not yours" });
      return;
    }

    await supabase
      .from("user_agents")
      .update({ is_listed: false })
      .eq("id", listing.user_agent_id);
    await supabase
      .from("listings")
      .update({ is_active: false })
      .eq("id", req.params.id);

    res.json({ cancelled: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

export default router;
