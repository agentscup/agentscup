import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * GET /api/early-access/me
 *
 * Returns the signed-in user's identity + the follower count / account
 * age the rarity engine needs. Everything comes from the session that
 * Auth.js populated during sign-in (Twitter provider's userinfo call
 * in the OAuth handshake) — there are zero extra X API calls in this
 * endpoint, so it scales to launch-hour load comfortably.
 *
 * Tasks remain trust-based; the async verifier worker re-checks them
 * out-of-band post-claim.
 */
export async function GET() {
  const session = await auth();
  const s = session as typeof session & {
    xUserId?: string;
    xHandle?: string;
    xAvatarUrl?: string;
    xFollowerCount?: number;
    xAccountAgeDays?: number;
  };

  if (!s?.xUserId || !s.xHandle) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  return NextResponse.json({
    xUserId: s.xUserId,
    handle: s.xHandle.toLowerCase(),
    displayName: s.xHandle,
    avatarUrl: s.xAvatarUrl,
    followerCount: s.xFollowerCount ?? 0,
    accountAgeDays: s.xAccountAgeDays ?? 0,
    // Tasks stay trust-based; verifier worker reconciles later.
    followsAgentsCup: false,
    bioMentionsBase: false,
    baseTweetHits: 0,
  });
}
