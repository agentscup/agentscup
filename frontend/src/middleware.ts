import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Sets an `x-pathname` header on every request so the root layout can
 * tell which route is being rendered. Used to bypass the maintenance
 * takeover on pages that should stay reachable (e.g. `/early-access`).
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("x-pathname", request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: [
    // Skip Next internals, static files, favicon, and API routes
    "/((?!_next/|api/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
