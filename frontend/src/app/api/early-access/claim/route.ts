import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/early-access/claim
 *
 * Called after the user posts the share tweet. Marks the claim row as
 * `claimed = true` and records the tweet URL. For v1 the tweet is
 * trust-validated by URL shape only; once the backend has a Twitter
 * API bearer token the server-side validator should:
 *
 *   - Fetch the tweet via GET /2/tweets/:id
 *   - Verify `author_id` matches the authenticated X user
 *   - Verify the tweet body contains the share URL
 *
 * Until then, the shape + unique-per-handle index is good enough to
 * stop casual abuse.
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

  let body: { handle?: string; tweetUrl?: string; claimId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const handle = body.handle?.toLowerCase().replace(/^@/, "").trim();
  const tweetUrl = body.tweetUrl?.trim();

  if (!handle || !tweetUrl) {
    return NextResponse.json(
      { error: "handle and tweetUrl required" },
      { status: 400 }
    );
  }
  if (!isLikelyTweetUrl(tweetUrl)) {
    return NextResponse.json(
      { error: "tweetUrl is not a tweet URL" },
      { status: 400 }
    );
  }

  // Sanity: the tweet URL author segment should match the handle the
  // user claimed with. Cheap pre-API-key check.
  const authorFromUrl = extractTweetAuthor(tweetUrl);
  if (authorFromUrl && authorFromUrl.toLowerCase() !== handle) {
    return NextResponse.json(
      { error: "Tweet author does not match your handle" },
      { status: 400 }
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing, error: findErr } = await supabase
    .from("early_access_claims")
    .select("id, claimed")
    .eq("x_handle", handle)
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: "No reveal found — reveal your card first" },
      { status: 404 }
    );
  }
  if (existing.claimed) {
    return NextResponse.json({ ok: true, alreadyClaimed: true });
  }

  const { error: updErr } = await supabase
    .from("early_access_claims")
    .update({
      claimed: true,
      claimed_tweet_url: tweetUrl,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

function isLikelyTweetUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^/]+\/status\/\d+/.test(url);
}

function extractTweetAuthor(url: string): string | null {
  const m = url.match(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([^/]+)\/status\/\d+/);
  return m ? m[1] : null;
}
