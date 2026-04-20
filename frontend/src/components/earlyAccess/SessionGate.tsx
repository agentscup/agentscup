"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

/**
 * Wraps the early-access tree so child components can call
 * `useSession()`. Intentionally scoped only to `/early-access/*` —
 * the rest of the site doesn't need an auth context and we don't
 * want it fetching `/api/auth/session` on every page.
 */
export default function SessionGate({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
