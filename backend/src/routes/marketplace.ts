import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyMarketplaceTransaction } from "../lib/solana";
import { marketplaceLimiter } from "../middleware/rateLimiter";
import { dedup } from "../middleware/dedup";

const router = Router();

// GET /api/marketplace/listings
router.get("/listings", async (req: Request, res: Response) => {
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

// POST /api/marketplace/list
router.post("/list", async (req: Request, res: Response) => {
  try {
    const { walletAddress, userAgentId, priceSol, listingType } = req.body;
    if (!walletAddress || !userAgentId || !priceSol) {
      res.status(400).json({ error: "walletAddress, userAgentId, priceSol required" });
      return;
    }

    // Verify ownership
    const { data: ua } = await supabase
      .from("user_agents")
      .select("id, is_listed, user_id, users!inner(wallet_address)")
      .eq("id", userAgentId)
      .single();

    if (!ua) { res.status(404).json({ error: "Agent not found" }); return; }
    const joined = ua as unknown as { users: { wallet_address: string } };
    if (joined.users.wallet_address !== walletAddress) {
      res.status(403).json({ error: "Not your agent" }); return;
    }
    if (ua.is_listed) { res.status(400).json({ error: "Already listed" }); return; }

    await supabase.from("user_agents").update({ is_listed: true }).eq("id", userAgentId);

    const { data, error } = await supabase.from("listings").insert({
      user_agent_id: userAgentId,
      seller_wallet: walletAddress,
      price_sol: priceSol,
      listing_type: listingType || "fixed",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).select().single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// Dedup marketplace buy by txSignature
const buyDedup = dedup((req) => req.body?.txSignature || null);

// POST /api/marketplace/buy — atomic purchase via PostgreSQL function
router.post(
  "/buy",
  marketplaceLimiter,
  buyDedup,
  async (req: Request, res: Response) => {
    try {
      const { buyerWallet, listingId, txSignature } = req.body;
      if (!buyerWallet || !listingId || !txSignature) {
        res.status(400).json({ error: "buyerWallet, listingId, and txSignature required" });
        return;
      }

      // Verify price for the listing
      const { data: listing } = await supabase
        .from("listings")
        .select("price_sol")
        .eq("id", listingId)
        .eq("is_active", true)
        .single();

      if (!listing) {
        res.status(404).json({ error: "Listing not found or already sold" });
        return;
      }

      console.log(`[MARKETPLACE BUY] wallet=${buyerWallet} listing=${listingId} price=${listing.price_sol} tx=${txSignature}`);

      // Verify on-chain: tx exists, succeeded, payer matches
      const v = await verifyMarketplaceTransaction(txSignature, buyerWallet);
      if (!v.valid) {
        console.log(`[MARKETPLACE BUY] TX verification failed: ${v.error}`);
        res.status(400).json({ error: `TX failed: ${v.error}` });
        return;
      }
      console.log(`[MARKETPLACE BUY] TX verified on-chain`);

      // Atomic buy via PostgreSQL function
      const { data, error } = await supabase.rpc("buy_agent_atomic", {
        p_buyer_wallet: buyerWallet,
        p_listing_id: listingId,
        p_tx_signature: txSignature,
      });

      if (error) {
        console.error(`[MARKETPLACE BUY] RPC error:`, error.message);
        throw error;
      }

      const result = data as { error?: string; success?: boolean; agent_id?: string };
      if (result.error) {
        console.log(`[MARKETPLACE BUY] Atomic function error: ${result.error}`);
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

// DELETE /api/marketplace/cancel/:id
router.delete("/cancel/:id", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    const { data: listing } = await supabase
      .from("listings").select("*").eq("id", req.params.id).eq("is_active", true).single();

    if (!listing) { res.status(404).json({ error: "Not found" }); return; }
    if (listing.seller_wallet !== walletAddress) { res.status(403).json({ error: "Not yours" }); return; }

    await supabase.from("user_agents").update({ is_listed: false }).eq("id", listing.user_agent_id);
    await supabase.from("listings").update({ is_active: false }).eq("id", req.params.id);

    res.json({ cancelled: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

export default router;
