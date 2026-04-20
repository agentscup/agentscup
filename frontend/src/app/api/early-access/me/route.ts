import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getUserById,
  doesUserFollow,
  countRecentBaseMentions,
  bioMentionsBase,
  accountAgeDays,
} from "@/lib/earlyAccess/xApi";

/**
 * GET /api/early-access/me
 *
 * Returns the signed-in user's XSignals object, ready to feed into
 * the rarity / card generator on the client. Runs all the X-API
 * lookups server-side so the Bearer Token never reaches the browser.
 *
 * Shape mirrors the client's XSignals type so the page can drop this
 * straight into `generateCard(signals)`.
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

  // Pull fresh profile + metrics; avatar/bio can change between sessions.
  const user = await getUserById(s.xUserId).catch(() => null);

  const [followsBaseRaw, followsAgentsCupRaw, baseTweetHits] = await Promise.all([
    doesUserFollow(s.xUserId, "base").catch(() => false),
    doesUserFollow(s.xUserId, "agentscup").catch(() => false),
    countRecentBaseMentions(s.xUserId).catch(() => 0),
  ]);

  return NextResponse.json({
    xUserId: s.xUserId,
    handle: (user?.username ?? s.xHandle).toLowerCase(),
    displayName: user?.name ?? s.xHandle,
    avatarUrl: user?.profile_image_url ?? s.xAvatarUrl,
    followerCount: user?.public_metrics?.followers_count ?? 0,
    accountAgeDays: accountAgeDays(user?.created_at),
    followsBase: followsBaseRaw,
    followsAgentsCup: followsAgentsCupRaw,
    bioMentionsBase: bioMentionsBase(user?.description),
    baseTweetHits,
  });
}
