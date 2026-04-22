import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Two jobs:
 *
 *   1. Sets an `x-pathname` header on every request so the root
 *      layout can tell which route is being rendered. Used to
 *      bypass the maintenance takeover on pages that should stay
 *      reachable (e.g. `/early-access`).
 *
 *   2. Rewrites the root path `/` to `/early-access`. Agentscup.com
 *      is currently locked to the early-access landing while the
 *      game migrates on-chain infra; visitors see the X-connect
 *      flow without a visible redirect hop. The URL in the address
 *      bar stays on the root, the route handler for /early-access
 *      runs underneath.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Launch day: agentscup.com / www.agentscup.com and every
  // early-access URL 307 forward to play.agentscup.com — the game
  // is live, the campaign funnel is done. External 307 (not a
  // same-host rewrite) so the address bar flips to play.agentscup.com
  // and any deep-linked tweet / share URL re-resolves into the game.
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const isRootDomain =
    host === "agentscup.com" || host === "www.agentscup.com";

  if (isRootDomain) {
    const target = new URL(
      `https://play.agentscup.com${pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(target, { status: 307 });
  }

  if (
    pathname === "/early-access" ||
    pathname.startsWith("/early-access/")
  ) {
    const target = new URL(
      `https://play.agentscup.com/${request.nextUrl.search}`
    );
    return NextResponse.redirect(target, { status: 307 });
  }

  const response = NextResponse.next();
  response.headers.set("x-pathname", pathname);
  return response;
}

export const config = {
  matcher: [
    // Skip Next internals, static files, favicon, and API routes
    "/((?!_next/|api/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
