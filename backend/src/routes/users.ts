import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

/* ── Random team name generator ─────────────────────────────────── */
const ADJECTIVES = [
  "Atomic", "Blazing", "Cosmic", "Dark", "Electric", "Frozen",
  "Golden", "Hyper", "Iron", "Jade", "Killer", "Lunar",
  "Mega", "Neon", "Omega", "Pixel", "Quantum", "Rogue",
  "Shadow", "Turbo", "Ultra", "Venom", "Wild", "Zero",
  "Binary", "Cyber", "Digital", "Flux", "Glitch", "Hex",
  "Inferno", "Nitro", "Onyx", "Plasma", "Rapid", "Stealth",
];

const NOUNS = [
  "Wolves", "Dragons", "Titans", "Hawks", "Vipers", "Panthers",
  "Knights", "Legends", "Strikers", "Phantoms", "Foxes", "Bears",
  "Lions", "Sharks", "Eagles", "Cobras", "Falcons", "Spartans",
  "Ninjas", "Rockets", "Bots", "Agents", "Nodes", "Stacks",
  "Bytes", "Cores", "Chips", "Daemons", "Vectors", "Wardens",
  "Sentinels", "Reapers", "Rovers", "Bolts", "Hammers", "Blades",
];

function generateTeamName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj} ${noun} ${num}`;
}

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

    // Ensure leaderboard row exists — give new users a random team name
    const { data: existing } = await supabase
      .from("leaderboard")
      .select("id")
      .eq("user_id", data.id)
      .single();

    if (!existing) {
      await supabase
        .from("leaderboard")
        .insert({ user_id: data.id, team_name: generateTeamName() });
    }

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
