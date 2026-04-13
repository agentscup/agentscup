import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { simulateMatch, SquadInput, MatchResult } from "../engine/matchEngine";

const router = Router();

// POST /api/matches/simulate — vs AI
router.post("/simulate", async (req: Request, res: Response) => {
  try {
    const { walletAddress, homeSquad, awaySquad, seed } = req.body;
    if (!walletAddress || !homeSquad || !awaySquad) {
      res.status(400).json({ error: "walletAddress, homeSquad, awaySquad required" });
      return;
    }

    const { data: user } = await supabase
      .from("users")
      .upsert({ wallet_address: walletAddress }, { onConflict: "wallet_address" })
      .select()
      .single();
    if (!user) { res.status(500).json({ error: "Failed to get user" }); return; }

    const matchSeed = seed || Date.now();
    const result: MatchResult = simulateMatch(homeSquad as SquadInput, awaySquad as SquadInput, matchSeed);

    // Create match record
    const { data: match, error } = await supabase.from("matches").insert({
      home_player_id: user.id,
      home_squad: homeSquad,
      away_squad: awaySquad,
      home_score: result.homeScore,
      away_score: result.awayScore,
      status: "finished",
      events: result.events,
      seed: matchSeed,
      finished_at: new Date().toISOString(),
    }).select().single();

    if (error) throw error;

    // Update leaderboard via DB function (+3 win, +1 draw)
    await supabase.rpc("record_match_result", {
      p_match_id: match.id,
      p_home_score: result.homeScore,
      p_away_score: result.awayScore,
      p_events: result.events,
    });

    // Grant XP
    const xpGain = result.homeScore > result.awayScore ? 30 : result.homeScore === result.awayScore ? 15 : 5;
    await supabase.from("users").update({ xp: user.xp + xpGain }).eq("id", user.id);

    res.json({
      matchId: match.id,
      result,
      xpGain,
      pointsEarned: result.homeScore > result.awayScore ? 3 : result.homeScore === result.awayScore ? 1 : 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// GET /api/matches/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error || !data) { res.status(404).json({ error: "Match not found" }); return; }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// GET /api/matches/user/:walletAddress
router.get("/user/:walletAddress", async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase
      .from("users").select("id").eq("wallet_address", req.params.walletAddress).single();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .or(`home_player_id.eq.${user.id},away_player_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json(data || []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

export default router;
