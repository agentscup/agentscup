import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

// GET /api/squads/:walletAddress
router.get("/:walletAddress", async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase
      .from("users").select("id").eq("wallet_address", req.params.walletAddress).single();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const { data, error } = await supabase
      .from("squads").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// POST /api/squads
router.post("/", async (req: Request, res: Response) => {
  try {
    const { walletAddress, name, formation, positions, managerId } = req.body;
    if (!walletAddress) { res.status(400).json({ error: "walletAddress required" }); return; }

    const { data: user } = await supabase
      .from("users").select("id").eq("wallet_address", walletAddress).single();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const { data, error } = await supabase.from("squads").insert({
      user_id: user.id,
      name: name || "My Squad",
      formation: formation || "4-3-3",
      positions: positions || {},
      manager_id: managerId || null,
    }).select().single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// PUT /api/squads/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const updates: Record<string, unknown> = {};
    const { name, formation, positions, chemistry, managerId } = req.body;
    if (name !== undefined) updates.name = name;
    if (formation !== undefined) updates.formation = formation;
    if (positions !== undefined) updates.positions = positions;
    if (chemistry !== undefined) updates.chemistry = chemistry;
    if (managerId !== undefined) updates.manager_id = managerId;

    const { data, error } = await supabase.from("squads").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/squads/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.from("squads").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ deleted: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

export default router;
