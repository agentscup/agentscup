import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { FounderCard, XSignals } from "@/lib/earlyAccess/cardGen";

/**
 * POST /api/early-access/reveal
 *
 * Persists the reveal so the claim step can look it up by handle later.
 * Idempotent — an existing row for the same (mock) x_user_id is updated
 * in place, not duplicated.
 *
 * Security note: during mock-auth this endpoint trusts the client to
 * provide accurate X signals. Once real OAuth lands, the server will
 * refetch signals from the X API and discard the client-provided copy.
 */
export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase env not configured" },
      { status: 500 }
    );
  }

  let body: { signals?: XSignals; card?: FounderCard };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const signals = body.signals;
  const card = body.card;
  if (!signals?.handle || !card) {
    return NextResponse.json(
      { error: "signals.handle and card required" },
      { status: 400 }
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // In mock-auth mode we don't have a stable X user id, so we use the
  // handle itself (lowercased). Real OAuth will replace this with the
  // numeric X id from the token payload.
  const xUserId = `mock:${signals.handle}`;

  const row = {
    x_user_id: xUserId,
    x_handle: signals.handle,
    x_display_name: signals.displayName ?? signals.handle,
    x_avatar_url: signals.avatarUrl ?? null,
    follower_count: signals.followerCount ?? null,
    account_age_days: signals.accountAgeDays ?? null,
    follows_base: !!signals.followsBase,
    bio_mentions_base: !!signals.bioMentionsBase,
    base_tweet_hits: signals.baseTweetHits ?? 0,
    rarity: card.rarity,
    score: card.score,
    stats: card.stats as unknown as Record<string, number>,
    position: card.position,
    overall: card.overall,
  };

  const { data, error } = await supabase
    .from("early_access_claims")
    .upsert(row, { onConflict: "x_user_id" })
    .select("id, claimed")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
