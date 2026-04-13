import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

// POST /api/users/connect — upsert user by wallet
router.post("/connect", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress required" });
      return;
    }

    const { data, error } = await supabase
      .from("users")
      .upsert({ wallet_address: walletAddress }, { onConflict: "wallet_address" })
      .select()
      .single();

    if (error) throw error;

    // Ensure leaderboard row exists
    await supabase
      .from("leaderboard")
      .upsert({ user_id: data.id, team_name: "MY SQUAD" }, { onConflict: "user_id" });

    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// GET /api/users/:walletAddress — full profile
router.get("/:walletAddress", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("wallet_address", walletAddress)
      .single();

    if (error || !user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { data: userAgents } = await supabase
      .from("user_agents")
      .select("*, agents(*)")
      .eq("user_id", user.id);

    const { data: squads } = await supabase
      .from("squads")
      .select("*")
      .eq("user_id", user.id);

    const { data: standing } = await supabase
      .from("leaderboard")
      .select("*")
      .eq("user_id", user.id)
      .single();

    res.json({ ...user, agents: userAgents || [], squads: squads || [], standing });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// GET /api/users/:walletAddress/stats
router.get("/:walletAddress/stats", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;

    const { data: user } = await supabase
      .from("users")
      .select("id, elo, xp")
      .eq("wallet_address", walletAddress)
      .single();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { count: agentCount } = await supabase
      .from("user_agents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const { count: matchCount } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .or(`home_player_id.eq.${user.id},away_player_id.eq.${user.id}`);

    res.json({ elo: user.elo, xp: user.xp, agentCount: agentCount || 0, matchCount: matchCount || 0 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

export default router;
