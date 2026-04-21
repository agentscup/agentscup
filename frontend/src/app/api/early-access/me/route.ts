import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * GET /api/early-access/me
 *
 * Returns just enough identity data to bootstrap the card for a
 * signed-in user. Deliberately does NOT hit the X API — at launch
 * volume (thousands of signups / hour) the /following and /tweets
 * endpoints would blow through rate limits within minutes.
 *
 * Instead, all Base-signal bonuses are earned on the client through
 * trust-based task completion. An async verification worker on the
 * backend re-checks each claim in a batched pace (75 req / 15 min)
 * and flags inconsistencies out-of-band — users who lie about
 * following @base get their card downgraded to COMMON rarity in the
 * hours after claim without ever blocking the signup flow.
 *
 * Cost per user during signup: 0 X API calls.
 */
export async function GET() {
  const session = await auth();
  const s = session as typeof session & {
    xUserId?: string;
    xHandle?: string;
    xAvatarUrl?: string;
  };

  if (!s?.xUserId || !s.xHandle) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  return NextResponse.json({
    xUserId: s.xUserId,
    handle: s.xHandle.toLowerCase(),
    displayName: s.xHandle,
    avatarUrl: s.xAvatarUrl,
    // Signals are populated by the async verification worker, not here.
    // Client-side they default to false and flip when the user completes
    // the corresponding task in TaskList.
    followsBase: false,
    followsAgentsCup: false,
    bioMentionsBase: false,
    baseTweetHits: 0,
    followerCount: 0,
    accountAgeDays: 0,
  });
}
