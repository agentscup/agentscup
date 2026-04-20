/**
 * Server-only helpers around the X API v2. All calls go through the
 * app-only Bearer Token (`X_BEARER_TOKEN`) — user-level scopes from
 * OAuth are only used for sign-in identity; the read-only lookups
 * below are app-level and quota-friendly.
 *
 * Keep this module server-only: the Bearer Token must never reach
 * a client bundle.
 */

const API_BASE = "https://api.x.com/2";

/** UserIDs of the accounts that unlock bonus rarity points. */
export const BASE_USER_HANDLES = ["base", "agentscup"] as const;

interface XApiError extends Error {
  status?: number;
}

export async function xGet<T>(path: string, init?: RequestInit): Promise<T> {
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) {
    const err: XApiError = new Error("X_BEARER_TOKEN not configured");
    err.status = 500;
    throw err;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${bearer}`,
    },
    // Cache user-lookup calls briefly — X rate limits bite otherwise.
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err: XApiError = new Error(`X API ${res.status}: ${text.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

// ─────────────────────────────────────────────────────────────────────
// User lookups
// ─────────────────────────────────────────────────────────────────────

export interface XUser {
  id: string;
  username: string;
  name: string;
  description?: string;
  profile_image_url?: string;
  created_at?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
}

/** Fetch a user by numeric id, including bio + metrics. */
export async function getUserById(id: string): Promise<XUser> {
  const data = await xGet<{ data: XUser }>(
    `/users/${id}?user.fields=description,profile_image_url,created_at,public_metrics`
  );
  return data.data;
}

/** Fetch a user by username, case-insensitive. */
export async function getUserByUsername(username: string): Promise<XUser> {
  const data = await xGet<{ data: XUser }>(
    `/users/by/username/${encodeURIComponent(username)}?user.fields=description,profile_image_url,created_at,public_metrics`
  );
  return data.data;
}

/** Cached "target" accounts we check follows against. Resolving once
 *  per process, not per request, keeps the free-tier rate limits from
 *  biting during signup spikes. */
const targetIdCache = new Map<string, string>();

export async function resolveTargetUserId(handle: string): Promise<string | null> {
  const key = handle.toLowerCase();
  const cached = targetIdCache.get(key);
  if (cached) return cached;
  try {
    const u = await getUserByUsername(handle);
    if (u?.id) {
      targetIdCache.set(key, u.id);
      return u.id;
    }
  } catch {
    /* swallow — caller falls back to "not following" */
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Follow + engagement checks
// ─────────────────────────────────────────────────────────────────────

/**
 * Does the given user follow `targetHandle`?
 *
 * X API v2 exposes `GET /2/users/:id/following` with pagination (max
 * 1000/page) but has no direct "A follows B?" endpoint. We page up to
 * 5 times (5000 follows) and stop early if we find the target.
 *
 * Users following more than 5k accounts don't get credit for the
 * follow — acceptable trade-off; those users are rare and we don't
 * want to burn rate-limit budget on them.
 */
export async function doesUserFollow(userId: string, targetHandle: string): Promise<boolean> {
  const targetId = await resolveTargetUserId(targetHandle);
  if (!targetId) return false;

  let token: string | undefined;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({
      max_results: "1000",
      "user.fields": "id",
    });
    if (token) qs.set("pagination_token", token);

    try {
      const data = await xGet<{
        data?: Array<{ id: string }>;
        meta?: { next_token?: string };
      }>(`/users/${userId}/following?${qs}`);

      if (data.data?.some((u) => u.id === targetId)) return true;
      token = data.meta?.next_token;
      if (!token) break;
    } catch {
      return false;
    }
  }
  return false;
}

/** Scan the user's most recent N public tweets for Base-related
 *  mentions. Returns a hit count. N defaults to 20 — keeps within
 *  one free-tier request. */
export async function countRecentBaseMentions(userId: string, limit = 20): Promise<number> {
  try {
    const qs = new URLSearchParams({
      max_results: String(Math.min(100, Math.max(5, limit))),
      "tweet.fields": "text",
      exclude: "retweets,replies",
    });
    const data = await xGet<{ data?: Array<{ id: string; text: string }> }>(
      `/users/${userId}/tweets?${qs}`
    );
    const regex = /\b(base(?:chain)?|onbase|based)\b/i;
    const hits = (data.data ?? []).filter((t) => regex.test(t.text)).length;
    return Math.min(hits, 10);
  } catch {
    return 0;
  }
}

export function bioMentionsBase(bio?: string): boolean {
  if (!bio) return false;
  // Matches "base", "basechain", "onbase", and hashtag forms like
  // "#base". We keep the word boundary to avoid false hits on words
  // like "baseball" or "database".
  return /(^|\s|#|\/)base(?:chain|\b)/i.test(bio);
}

// ─────────────────────────────────────────────────────────────────────
// Tweet verification for claim
// ─────────────────────────────────────────────────────────────────────

export interface XTweet {
  id: string;
  text: string;
  author_id: string;
  created_at?: string;
}

/** Fetch a single tweet with its author id, for claim-time verification. */
export async function getTweetById(tweetId: string): Promise<XTweet> {
  const data = await xGet<{ data: XTweet }>(
    `/tweets/${tweetId}?tweet.fields=author_id,created_at`
  );
  return data.data;
}

/** Pull the numeric id out of a tweet URL: .../status/<id> */
export function tweetIdFromUrl(url: string): string | null {
  const m = url.match(/\/status\/(\d+)/);
  return m ? m[1] : null;
}

// ─────────────────────────────────────────────────────────────────────
// Account-age helper
// ─────────────────────────────────────────────────────────────────────

export function accountAgeDays(createdAt?: string): number {
  if (!createdAt) return 0;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}
