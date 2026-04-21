import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { upgradeAvatarUrl, scoreToRarity } from "@/lib/earlyAccess/cardGen";

/**
 * GET /api/early-access/leaderboard
 *
 * Returns the top N claimed cards sorted by rarity score descending.
 * Since rarity tier is a pure function of the score (90+ LEGENDARY,
 * 60+ EPIC, 30+ RARE, <30 COMMON), ordering by score alone naturally
 * groups the board by tier with the highest rank inside each tier
 * surfacing first. `overall` is the tiebreaker when two claims sit
 * on the same score.
 *
 * Performance characteristics:
 *   * Query uses `early_access_claims_score_idx` — a partial index
 *     on score for claimed rows, so the sort is a sub-millisecond
 *     index-range scan.
 *   * Response is CDN-cached for 60s via `s-maxage` — leaderboard
 *     freshness is non-critical and a 60s window eliminates DB
 *     pressure during launch-hour view bursts. Stale-while-
 *     revalidate lets the CDN keep serving while it refreshes.
 *
 * Query params:
 *   limit (default 50, max 100)
 */
export async function GET(req: Request) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ rows: [], total: 0 });
  }

  const qs = new URL(req.url).searchParams;
  const limit = Math.min(
    100,
    Math.max(1, Number(qs.get("limit") ?? "50"))
  );

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [rowsRes, totalRes] = await Promise.all([
    supabase
      .from("early_access_claims")
      .select(
        "x_handle, x_display_name, x_avatar_url, follower_count, rarity, overall, score, position"
      )
      .eq("claimed", true)
      .order("score", { ascending: false, nullsFirst: false })
      .order("overall", { ascending: false })
      .limit(limit),
    supabase
      .from("early_access_claims")
      .select("id", { count: "exact", head: true })
      .eq("claimed", true),
  ]);

  if (rowsRes.error) {
    return NextResponse.json({ rows: [], total: 0 });
  }

  const rows = (rowsRes.data ?? []).map((r, i) => {
    const score = (r.score as number) ?? 0;
    // Derive rarity from score at read time rather than trusting the
    // stored value — the rarity column on old rows carried labels
    // from earlier scoring rules (when task points counted) and went
    // stale once the formula changed. Score itself stays canonical
    // and drives the sort; we just re-label.
    const rarity = scoreToRarity(score);
    return {
      rank: i + 1,
      handle: r.x_handle as string,
      displayName:
        (r.x_display_name as string | null) ?? (r.x_handle as string),
      avatarUrl:
        upgradeAvatarUrl((r.x_avatar_url as string | null) ?? undefined) ??
        `https://unavatar.io/twitter/${encodeURIComponent(r.x_handle as string)}`,
      followerCount: (r.follower_count as number | null) ?? 0,
      rarity,
      overall: r.overall as number,
      score,
      position: r.position as string,
    };
  });

  return NextResponse.json(
    {
      rows,
      total: totalRes.count ?? rows.length,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
