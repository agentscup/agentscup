import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@/auth";
import type { FounderCard, Position } from "@/lib/earlyAccess/cardGen";
import { scoreToRarity } from "@/lib/earlyAccess/cardGen";

/**
 * GET /api/early-access/status
 *
 * Returns the existing reveal / claim row for the signed-in user (or
 * for the `?handle=` query param in mock mode) so the frontend can
 * skip the user back to their progress on page refresh. Without this
 * endpoint, a returning user sees the landing hero as if they had
 * never touched the site.
 *
 * Response shape:
 *   { status: "none" | "revealed" | "claimed", card?, claimId?, tasks? }
 *
 * None: user has never hit /reveal — show the normal funnel.
 * Revealed: card exists but user hasn't posted the tweet yet — skip
 *           straight to the share step with their existing card.
 * Claimed: claim is locked in — show the card + SPOT LOCKED stamp.
 *
 * Edge-cached privately for 10 seconds so page-refresh bursts don't
 * pin the DB pooler.
 */
export async function GET(req: Request) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ status: "none" });
  }

  const session = await auth();
  const xSession = session as typeof session & { xHandle?: string };

  // Prefer the authenticated handle; fall back to the explicit query
  // param so the handle-input / mock flow can also restore.
  const queryHandle = new URL(req.url).searchParams.get("handle");
  const handle = (xSession?.xHandle ?? queryHandle ?? "")
    .toLowerCase()
    .replace(/^@/, "")
    .trim();

  if (!handle) {
    return NextResponse.json({ status: "none" });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("early_access_claims")
    .select(
      "id, x_handle, x_display_name, x_avatar_url, rarity, score, position, overall, stats, claimed, claimed_tasks"
    )
    .eq("x_handle", handle)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ status: "none" });
  }

  const card: FounderCard = {
    handle: data.x_handle as string,
    displayName: (data.x_display_name as string | null) ?? (data.x_handle as string),
    avatarUrl: (data.x_avatar_url as string | null) ?? undefined,
    // Derive from live score so a returning user never sees a stale
    // rarity label left over from an earlier scoring formula.
    rarity: scoreToRarity(data.score as number),
    score: data.score as number,
    position: data.position as Position,
    overall: data.overall as number,
    stats: data.stats as FounderCard["stats"],
    signalBreakdown: [],
  };

  return NextResponse.json(
    {
      status: data.claimed ? "claimed" : "revealed",
      card,
      claimId: data.id as string,
      tasks: (data.claimed_tasks as Record<string, boolean> | null) ?? null,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=10",
      },
    }
  );
}
