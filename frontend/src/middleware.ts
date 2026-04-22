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

  // Root-path redirect to /early-access — only fires when the site
  // is in maintenance mode. In production agentscup.com runs with
  // NEXT_PUBLIC_MAINTENANCE_MODE=true so the root is the early-
  // access landing. In local dev (MAINTENANCE_MODE=false) this is
  // skipped, so `/` renders the game home page and the game routes
  // under it are reachable without a manual URL rewrite.
  const maintenanceOn =
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";
  if (pathname === "/" && maintenanceOn) {
    const url = request.nextUrl.clone();
    url.pathname = "/early-access";
    return NextResponse.redirect(url, { status: 307 });
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
