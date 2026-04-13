import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

// GET /api/leaderboard — full standings sorted by points
router.get("/", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("leaderboard")
      .select("*, users(wallet_address, username)")
      .order("points", { ascending: false })
      .order("goals_for", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /api/leaderboard/:walletAddress — single user standing
router.get("/:walletAddress", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("wallet_address", walletAddress)
      .single();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { data, error } = await supabase
      .from("leaderboard")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "No leaderboard entry" });
      return;
    }

    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// PUT /api/leaderboard/team-name — update team name
router.put("/team-name", async (req: Request, res: Response) => {
  try {
    const { walletAddress, teamName } = req.body;

    if (!walletAddress || !teamName) {
      res.status(400).json({ error: "walletAddress and teamName required" });
      return;
    }

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("wallet_address", walletAddress)
      .single();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { data, error } = await supabase
      .from("leaderboard")
      .update({ team_name: teamName })
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
