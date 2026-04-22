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
        // IMPORTANT: pass the wei value as a STRING to the numeric
        // columns, not `Number(bigint)`. JS `Number` only has 53 bits
        // of integer precision (~9×10^15), and every ETH price above
        // ~0.009 ETH exceeds that. Passing a lossy float corrupted
        // the stored price AND overflowed the legacy `numeric(18,0)`
        // price_cup column for listings ≥ 1 ETH (10^18 wei = 19 digits).
        // Supabase PostgREST accepts string form for numeric columns
        // and preserves full precision. Pair this with
        // base_migration_v3.sql which widens price_cup to numeric(40,0).
        price_cup: priceWeiNum.toString(),
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
    // BigInt-safe price extraction — wei values for ETH listings
    // above ~0.009 ETH exceed JS Number's 2^53 precision floor.
    // Using Number() here would silently round 0.05 ETH listings
    // (5×10^16 wei) down a few wei, corrupting both the floor and
    // the volume sum. Supabase returns numeric columns as strings,
    // so we parse straight into BigInt and only coerce to a JSON-
    // safe string at the response boundary.
    const weiOf = (l: {
      price_cup: string | number | null;
      price_wei: string | number | null;
    }): bigint => {
      const raw = l.price_wei ?? l.price_cup ?? 0;
      try {
        // strings parse cleanly; for the legacy number case we cast
        // via Math.floor to strip a stray decimal before BigInt.
        if (typeof raw === "number") return BigInt(Math.floor(raw));
        return BigInt(String(raw).trim() || "0");
      } catch {
        return 0n;
      }
    };

    let floorWei = 0n;
    if (active && active.length > 0) {
      floorWei = weiOf(active[0]);
      for (let i = 1; i < active.length; i++) {
        const w = weiOf(active[i]);
        if (w < floorWei) floorWei = w;
      }
    }

    const { data: sold, error: sErr } = await supabase
      .from("listings")
      .select("price_cup, price_wei")
      .eq("is_active", false)
      .not("tx_signature", "is", null);
    if (sErr) throw sErr;

    const totalTrades = sold?.length || 0;
    let totalVolumeWei = 0n;
    if (sold) {
      for (const s of sold) totalVolumeWei += weiOf(s);
    }

    res.json({
      activeListings: activeCount,
      totalTrades,
      // Serialise as string — the frontend parses back to BigInt
      // for formatEth(). JSON numbers can't represent wei amounts
      // past 2^53 without precision loss.
      totalVolume: totalVolumeWei.toString(),
      floorPrice: floorWei.toString(),
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
