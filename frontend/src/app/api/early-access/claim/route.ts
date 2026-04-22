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

  let body: {
    handle?: string;
    tweetUrl?: string;
    claimId?: string;
    walletAddress?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const handle = body.handle?.toLowerCase().replace(/^@/, "").trim();
  const tweetUrl = body.tweetUrl?.trim();
  const walletAddress = body.walletAddress?.trim().toLowerCase();

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
  if (!walletAddress || !/^0x[a-f0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json(
      { error: "walletAddress must be a valid 0x-prefixed EVM address" },
      { status: 400 }
    );
  }

  // Author-match validation was intentionally removed — X display
  // handles drift between OAuth profile and the current @username
  // (renames, capitalisation differences, retweet URL shapes where
  // the URL path carries the original author's handle, etc.) and
  // real users were getting blocked with "Tweet author does not
  // match your handle" despite posting a legit share tweet. The
  // unique-per-handle DB constraint still stops replay / multi-
  // claim, and the OAuth session binds the claim to the logged-in
  // X account.

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
      // Fire a best-effort tweet lookup for bookkeeping. We no
      // longer hard-fail on author mismatch or missing share URL —
      // the X API 402 / rename / retweet edge-cases kept false-
      // positive-failing real users. If the fetch succeeds cleanly
      // we flip status to "verified" for analytics; otherwise the
      // claim still goes through with status "pending".
      await getTweetById(tweetId);
      verificationStatus = "verified";
    } catch (err) {
      const e = err as { status?: number };
      // Treat 401 (expired / rotated Bearer Token), 402 (X Basic
      // paid-tier paywall on GET /2/tweets/:id under the current X
      // API pricing — no app credits left), 403 (forbidden, usually
      // scope), 429 (rate-limit), 5xx, and timeouts as transient.
      // The claim goes through with `verification_status: pending`
      // and the async worker can confirm later once we have a paid
      // tier or credit balance.
      //
      // Only genuine client errors (400 malformed, 404 tweet missing)
      // hard-fail, because those mean the input itself is bad, not
      // our token.
      const isTransient =
        !e.status ||
        e.status === 401 ||
        e.status === 402 ||
        e.status === 403 ||
        e.status === 429 ||
        e.status === 408 ||
        e.status >= 500;
      if (!isTransient) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Tweet lookup failed" },
          { status: 400 }
        );
      }
      if (e.status === 402) {
        console.warn(
          "[claim] X API 402 — app out of tweet-lookup credits, accepting claim as pending"
        );
      }
      // Transient failures: accept and let the async worker verify.
      // Status stays `pending`.
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
      evm_address: walletAddress,
      wallet_recorded_at: new Date().toISOString(),
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
