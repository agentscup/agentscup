import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { upgradeAvatarUrl, overallToRarity } from "@/lib/earlyAccess/cardGen";

/**
 * GET /api/early-access/leaderboard
 *
 * Returns the top N claimed cards sorted by **overall rating**
 * descending — which is the big number players see on the right
 * side of each row. The earlier version sorted by rarity `score`
 * first, which gave a tier-grouped board but looked "wrong" to
 * players because a 70-OVR inside a LEGENDARY tier could sit above
 * a 99-OVR from an EPIC tier. Rating-first keeps the visible column
 * monotonic; `score` is the secondary tiebreak so same-rating
 * entries still fall in rarity order.
 *
 * The rarity pill beside each row is still derived from `score`, so
 * tier colors remain correct even when the ordering doesn't group
 * them.
 *
 * Performance characteristics:
 *   * Query uses the `overall` and `score` columns — both small int
 *     columns on a table that's ~5-digit rows at launch, so the
 *     two-column sort is a fast in-memory top-K.
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

  // Show every revealed row — i.e. anyone who finished the OAuth +
  // task flow and got their card generated. Filtering on
  // `claimed=true` hid the ~80% of the funnel who revealed but
  // haven't tweeted yet, so they opened the leaderboard and saw
  // their own card missing. The `claimed` flag still rides along in
  // the payload so the UI can render a "posted" badge later if we
  // want to distinguish.
  const [rowsRes, totalRes] = await Promise.all([
    supabase
      .from("early_access_claims")
      .select(
        "x_handle, x_display_name, x_avatar_url, follower_count, rarity, overall, score, position, claimed"
      )
      // Primary sort: the follower-weighted `score`. Higher score
      // means stronger X signals (more followers, Base in bio, older
      // account).
      // Secondary sort: `overall` as a tiebreaker for same-score
      // rows.
      .order("score", { ascending: false, nullsFirst: false })
      .order("overall", { ascending: false, nullsFirst: false })
      .limit(limit),
    supabase
      .from("early_access_claims")
      .select("id", { count: "exact", head: true }),
  ]);

  if (rowsRes.error) {
    return NextResponse.json({ rows: [], total: 0 });
  }

  const rows = (rowsRes.data ?? []).map((r, i) => {
    const score = (r.score as number) ?? 0;
    const overall = (r.overall as number) ?? 0;
    // Derive rarity from the visible overall rating so the tier
    // pill always matches the number players see. Old rows saved a
    // rarity computed from score under the earlier overlapping-
    // range formula, which could produce e.g. "74 OVR / COMMON"
    // next to "64 OVR / EPIC" — nonsensical to the reader. Deriving
    // at read time fixes both legacy and new rows without a
    // migration.
    const rarity = overallToRarity(overall);
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
      overall,
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
        // Tight CDN window so newly claimed cards surface on the
        // leaderboard within ~10s. stale-while-revalidate keeps
        // requests fast after the window elapses.
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    }
  );
}
