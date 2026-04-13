import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const router = Router();

// GET /api/agents — list all agents (filterable)
router.get("/", async (req: Request, res: Response) => {
  try {
    const { position, rarity, techStack, search } = req.query;

    let query = supabase.from("agents").select("*");

    if (position && position !== "ALL") query = query.eq("position", position);
    if (rarity && rarity !== "ALL") query = query.eq("rarity", rarity);
    if (techStack && techStack !== "ALL") query = query.eq("tech_stack", techStack);
    if (search && typeof search === "string" && search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    }

    const { data, error } = await query.order("overall", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// GET /api/agents/stats — lightweight counts for homepage
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [agentsRes, playersRes, usersRes] = await Promise.all([
      supabase.from("agents").select("id", { count: "exact", head: true }),
      supabase.from("agents").select("id", { count: "exact", head: true }).neq("position", "MGR"),
      supabase.from("users").select("id", { count: "exact", head: true }),
    ]);

    // pvp_matches may not exist yet — wrap in try/catch
    let liveMatches = 0;
    try {
      const matchesRes = await supabase
        .from("pvp_matches")
        .select("id", { count: "exact", head: true })
        .eq("status", "playing");
      liveMatches = matchesRes.count ?? 0;
    } catch { /* table may not exist */ }

    res.json({
      agents: agentsRes.count ?? 0,
      players: playersRes.count ?? 0,
      users: usersRes.count ?? 0,
      packTiers: 4,
      liveMatches,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// GET /api/agents/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from("agents").select("*").eq("id", req.params.id).single();
    if (error || !data) { res.status(404).json({ error: "Agent not found" }); return; }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// POST /api/agents/seed — seed all agents from frontend data (run once)
router.post("/seed", async (req: Request, res: Response) => {
  try {
    const { agents } = req.body;
    if (!agents || !Array.isArray(agents)) {
      res.status(400).json({ error: "agents array required" });
      return;
    }

    const rows = agents.map((a: Record<string, unknown>) => ({
      id: a.id,
      name: a.name,
      position: a.position,
      overall: a.overall,
      pace: (a.stats as Record<string, number>)?.pace ?? 50,
      shooting: (a.stats as Record<string, number>)?.shooting ?? 50,
      passing: (a.stats as Record<string, number>)?.passing ?? 50,
      dribbling: (a.stats as Record<string, number>)?.dribbling ?? 50,
      defending: (a.stats as Record<string, number>)?.defending ?? 50,
      physical: (a.stats as Record<string, number>)?.physical ?? 50,
      rarity: a.rarity,
      tech_stack: a.techStack,
      flavor_text: a.flavorText,
      avatar_svg: a.avatarSvg,
    }));

    const { error } = await supabase.from("agents").upsert(rows, { onConflict: "id" });
    if (error) throw error;
    res.json({ seeded: rows.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

export default router;
