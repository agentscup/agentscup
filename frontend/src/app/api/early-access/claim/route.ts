import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTweetById, tweetIdFromUrl } from "@/lib/earlyAccess/xApi";
import { auth } from "@/auth";

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

  // Real tweet verification when OAuth + Bearer Token are configured.
  //   1. Fetch the tweet via X API v2.
  //   2. Confirm `author_id` matches the signed-in X user id.
  //   3. Confirm the tweet body contains our share URL.
  //
  // Under launch load the X API can rate-limit or go slow. If the
  // lookup fails for reasons other than a clear "wrong author"
  // mismatch (timeout, 429, server error), we accept the claim and
  // mark it `pending` — the async verification worker re-runs the
  // same checks later and flips to `flagged` if it finds abuse. This
  // keeps the signup funnel open under stress instead of turning
  // transient X outages into user-facing claim failures.
  const session = await auth();
  const xUserId = (session as typeof session & { xUserId?: string })?.xUserId;
  let verificationStatus: "pending" | "verified" | "flagged" = "pending";

  if (xUserId && process.env.X_BEARER_TOKEN) {
    const tweetId = tweetIdFromUrl(tweetUrl);
    if (!tweetId) {
      return NextResponse.json({ error: "Unable to parse tweet id" }, { status: 400 });
    }
    try {
      const tweet = await getTweetById(tweetId);
      if (tweet.author_id !== xUserId) {
        return NextResponse.json(
          { error: "This tweet belongs to a different account" },
          { status: 400 }
        );
      }
      // Share URL must appear somewhere in the tweet body. We compare
      // on lowercase and only match the path so Twitter's t.co
      // wrappers don't trip the check.
      const origin =
        req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
      const needle = `/early-access/card/${handle}`.toLowerCase();
      if (
        !tweet.text.toLowerCase().includes(needle) &&
        (!origin || !tweet.text.toLowerCase().includes(origin.toLowerCase()))
      ) {
        return NextResponse.json(
          { error: "Tweet is missing your share link — post the prefilled text" },
          { status: 400 }
        );
      }
      verificationStatus = "verified";
    } catch (err) {
      const e = err as { status?: number };
      // Hard client errors (malformed request) still fail the claim.
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Tweet lookup failed" },
          { status: 400 }
        );
      }
      // Transient failures (timeout, rate-limit, 5xx): accept and
      // let the async worker verify. Status stays `pending`.
    }
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
      verification_status: verificationStatus,
      verified_at: verificationStatus === "verified" ? new Date().toISOString() : null,
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
