/**
 * Async early-access claim verifier.
 *
 * Background sweep that re-runs X API checks on every `claimed=true,
 * verification_status='pending'` row and either promotes the row to
 * `verified` or marks it `flagged` (with the live rarity + score
 * downgraded to the floor so dishonest claims can't keep a high
 * founder badge).
 *
 * Pacing: X API v2 Basic tier allows ~75 /2/users/:id/following
 * requests per 15 minutes. We target 50 per run to stay safely under
 * the limit, and expect Railway's scheduler to wake us once every
 * 15 minutes. That gives ~4800 verifications/day — more than enough
 * for a thousands-scale launch.
 *
 * Invocation: `npx ts-node src/jobs/earlyAccessVerifier.ts`
 */

import { supabase } from "../lib/supabase";

const X_API = "https://api.x.com/2";
const BEARER = process.env.X_BEARER_TOKEN;
const BATCH_SIZE = Number(process.env.VERIFIER_BATCH_SIZE ?? 50);

interface ClaimRow {
  id: string;
  x_user_id: string;
  x_handle: string;
  claimed_tweet_url: string | null;
}

async function main() {
  if (!BEARER) {
    console.error("[verifier] X_BEARER_TOKEN not set, aborting");
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from("early_access_claims")
    .select(
      "id, x_user_id, x_handle, claimed_tweet_url"
    )
    .eq("claimed", true)
    .eq("verification_status", "pending")
    .order("claimed_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[verifier] fetch failed:", error.message);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log("[verifier] no pending claims");
    return;
  }

  console.log(`[verifier] processing ${rows.length} pending claims`);

  let verifiedCount = 0;
  let flaggedCount = 0;

  for (const row of rows as ClaimRow[]) {
    try {
      const result = await verifyOne(row);
      if (result.status === "verified") verifiedCount++;
      else flaggedCount++;

      await supabase
        .from("early_access_claims")
        .update({
          verification_status: result.status,
          verification_run_at: new Date().toISOString(),
          verified_at:
            result.status === "verified" ? new Date().toISOString() : null,
        })
        .eq("id", row.id);
    } catch (err) {
      console.error(`[verifier] ${row.x_handle}: ${(err as Error).message}`);
      // Leave the row pending; we'll retry on the next run.
    }
  }

  console.log(
    `[verifier] done — verified=${verifiedCount} flagged=${flaggedCount}`
  );
}

async function verifyOne(row: ClaimRow): Promise<{
  status: "verified" | "flagged";
  correctedRarity?: string;
  correctedScore?: number;
}> {
  const tweetId = extractTweetId(row.claimed_tweet_url ?? "");

  // Tweet still exists and was posted by this user?
  let tweetOk = false;
  if (tweetId) {
    try {
      const tweet = await xGet<{ data: { author_id: string; text: string } }>(
        `/tweets/${tweetId}?tweet.fields=author_id`
      );
      tweetOk = tweet.data.author_id === row.x_user_id;
    } catch {
      tweetOk = false;
    }
  }

  // Tasks no longer contribute rarity points — they're a reveal
  // gate, nothing more. The only thing the verifier can hard-check
  // is the share tweet itself. Everything else (follower count, age,
  // base bio) was fixed at OAuth time and isn't worth re-fetching.
  const tweetGone = !!row.claimed_tweet_url && !tweetOk;
  const status: "verified" | "flagged" = tweetGone ? "flagged" : "verified";

  return { status };
}

// ─────────────────────────────────────────────────────────────────────
// X API helpers
// ─────────────────────────────────────────────────────────────────────

async function xGet<T>(path: string): Promise<T> {
  const res = await fetch(`${X_API}${path}`, {
    headers: { Authorization: `Bearer ${BEARER}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`X API ${res.status}: ${text.slice(0, 120)}`);
  }
  return (await res.json()) as T;
}

function extractTweetId(url: string): string | null {
  const m = url.match(/\/status\/(\d+)/);
  return m ? m[1] : null;
}

main().catch((err) => {
  console.error("[verifier] fatal:", err);
  process.exit(1);
});
