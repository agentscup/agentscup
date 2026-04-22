import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateCard, type XSignals } from "@/lib/earlyAccess/cardGen";

/**
 * POST /api/early-access/admin/backfill-rarity
 *
 * One-off administrative endpoint to re-generate every early-access
 * claim's card under the CURRENT rarity formula. Historical rows
 * were written with earlier overlapping floor/ceil ranges and
 * different score weights; a later migration re-wrote `score` but
 * left `overall`/`rarity`/`stats` stale. That produced the
 * "nftzbt 66 score but 64 OVR / COMMON" mismatch players noticed.
 *
 * Because `generateCard()` is pure and deterministic — same handle +
 * same X signals always yields the same card — we can replay it
 * against the stored signals and write the canonical output back.
 * No user-facing regen, no card-image change beyond number
 * alignment.
 *
 * Auth: requires header `x-admin-secret` matching `AUTH_SECRET`
 * (the existing NextAuth signing secret). The endpoint can be
 * deleted after the backfill lands, but leaving it in is harmless
 * — re-runs are idempotent.
 */
export async function POST(req: Request) {
  const expected = process.env.AUTH_SECRET;
  const provided = req.headers.get("x-admin-secret");
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: claims, error } = await supabase
    .from("early_access_claims")
    .select(
      "id, x_handle, x_display_name, x_avatar_url, follower_count, account_age_days, follows_base, bio_mentions_base, base_tweet_hits, rarity, overall, score"
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type BackfillRow = {
    handle: string;
    before: { rarity: string; overall: number; score: number };
    after: { rarity: string; overall: number; score: number };
    changed: boolean;
  };
  const results: BackfillRow[] = [];

  for (const c of claims ?? []) {
    const signals: XSignals = {
      handle: c.x_handle as string,
      displayName: (c.x_display_name as string | null) ?? (c.x_handle as string),
      avatarUrl: (c.x_avatar_url as string | null) ?? undefined,
      followerCount: (c.follower_count as number | null) ?? 0,
      accountAgeDays: (c.account_age_days as number | null) ?? 0,
      followsBase: (c.follows_base as boolean | null) ?? false,
      bioMentionsBase: (c.bio_mentions_base as boolean | null) ?? false,
      baseTweetHits: (c.base_tweet_hits as number | null) ?? 0,
    };
    const card = generateCard(signals);

    const before = {
      rarity: c.rarity as string,
      overall: (c.overall as number) ?? 0,
      score: (c.score as number) ?? 0,
    };
    const after = {
      rarity: card.rarity,
      overall: card.overall,
      score: card.score,
    };
    const changed =
      before.rarity !== after.rarity ||
      before.overall !== after.overall ||
      before.score !== after.score;

    if (changed) {
      await supabase
        .from("early_access_claims")
        .update({
          rarity: card.rarity,
          score: card.score,
          overall: card.overall,
          position: card.position,
          stats: card.stats,
        })
        .eq("id", c.id);
    }

    results.push({
      handle: signals.handle,
      before,
      after,
      changed,
    });
  }

  return NextResponse.json({
    processed: results.length,
    updated: results.filter((r) => r.changed).length,
    rows: results,
  });
}
