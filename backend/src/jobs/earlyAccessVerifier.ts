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
const FOLLOW_PAGE_LIMIT = 5; // up to 5 * 1000 follows

interface ClaimRow {
  id: string;
  x_user_id: string;
  x_handle: string;
  claimed_tweet_url: string | null;
  original_rarity: string | null;
  original_score: number | null;
  claimed_tasks: Record<string, boolean> | null;
}

async function main() {
  if (!BEARER) {
    console.error("[verifier] X_BEARER_TOKEN not set, aborting");
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from("early_access_claims")
    .select(
      "id, x_user_id, x_handle, claimed_tweet_url, original_rarity, original_score, claimed_tasks"
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

  // Resolve @base + @agentscup once; cached across the whole batch.
  const baseId = await resolveUserId("base");
  const agentsCupId = await resolveUserId("agentscup");

  let verifiedCount = 0;
  let flaggedCount = 0;

  for (const row of rows as ClaimRow[]) {
    try {
      const result = await verifyOne(row, baseId, agentsCupId);
      if (result.status === "verified") verifiedCount++;
      else flaggedCount++;

      await supabase
        .from("early_access_claims")
        .update({
          verification_status: result.status,
          verification_run_at: new Date().toISOString(),
          verified_at: result.status === "verified" ? new Date().toISOString() : null,
          // Apply rarity downgrade server-side so the public card
          // preview + OG image reflect the corrected state.
          rarity: result.correctedRarity ?? row.original_rarity,
          score: result.correctedScore ?? row.original_score,
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

async function verifyOne(
  row: ClaimRow,
  baseId: string | null,
  agentsCupId: string | null
): Promise<{
  status: "verified" | "flagged";
  correctedRarity?: string;
  correctedScore?: number;
}> {
  const claimedTasks = row.claimed_tasks ?? {};
  const tweetId = extractTweetId(row.claimed_tweet_url ?? "");

  // 1. Tweet still exists and was posted by this user?
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

  // 2. If the user said they followed @base, check it.
  let followsBaseReal = false;
  if (claimedTasks.followBase && baseId) {
    followsBaseReal = await checkFollows(row.x_user_id, baseId);
  }

  // 3. If they said they followed @agentscup, check it.
  let followsAgentsCupReal = false;
  if (claimedTasks.followAgentsCup && agentsCupId) {
    followsAgentsCupReal = await checkFollows(row.x_user_id, agentsCupId);
  }

  // Score reconciliation — rebuild from real signals + any tasks we
  // can't cheaply verify server-side (notifications, reply).
  let score = jitter(row.x_handle);
  const tasks = claimedTasks;
  if (followsBaseReal) score += 50;
  if (followsAgentsCupReal) score += 15;
  // Notifications + reply-pinned remain honour-system; count them if
  // the user checked them, but only when the tweet itself is legit.
  if (tweetOk && tasks.notificationsOn) score += 10;
  if (tweetOk && tasks.replyPinned) score += 15;

  const rarity = scoreToRarity(score);

  // Flag when the user lied about a task (gap between original score
  // and verified score is meaningful) or the tweet is gone entirely.
  const lied = claimedTasks.followBase && !followsBaseReal;
  const tweetGone = !!row.claimed_tweet_url && !tweetOk;

  const status: "verified" | "flagged" = lied || tweetGone ? "flagged" : "verified";

  return {
    status,
    correctedRarity: rarity,
    correctedScore: score,
  };
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

async function resolveUserId(username: string): Promise<string | null> {
  try {
    const data = await xGet<{ data: { id: string } }>(
      `/users/by/username/${encodeURIComponent(username)}`
    );
    return data.data.id;
  } catch {
    return null;
  }
}

async function checkFollows(sourceId: string, targetId: string): Promise<boolean> {
  let pageToken: string | undefined;
  for (let page = 0; page < FOLLOW_PAGE_LIMIT; page++) {
    const qs = new URLSearchParams({
      max_results: "1000",
      "user.fields": "id",
    });
    if (pageToken) qs.set("pagination_token", pageToken);
    try {
      const data = await xGet<{
        data?: Array<{ id: string }>;
        meta?: { next_token?: string };
      }>(`/users/${sourceId}/following?${qs}`);

      if (data.data?.some((u) => u.id === targetId)) return true;
      pageToken = data.meta?.next_token;
      if (!pageToken) return false;
    } catch {
      // Rate-limited mid-scan — bail; we'll retry next run.
      return false;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Scoring helpers (must stay in sync with frontend cardGen.ts)
// ─────────────────────────────────────────────────────────────────────

function scoreToRarity(score: number): "COMMON" | "RARE" | "EPIC" | "LEGENDARY" {
  if (score >= 90) return "LEGENDARY";
  if (score >= 60) return "EPIC";
  if (score >= 30) return "RARE";
  return "COMMON";
}

function jitter(handle: string): number {
  let h = 0x811c9dc5;
  const k = `jitter:${handle}`;
  for (let i = 0; i < k.length; i++) {
    h ^= k.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h % 16;
}

function extractTweetId(url: string): string | null {
  const m = url.match(/\/status\/(\d+)/);
  return m ? m[1] : null;
}

main().catch((err) => {
  console.error("[verifier] fatal:", err);
  process.exit(1);
});
