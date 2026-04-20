import type { ReactNode } from "react";
import SessionGate from "@/components/earlyAccess/SessionGate";

/**
 * Dedicated layout for the early-access funnel. The root layout is
 * the one that handles the maintenance gate — this layout only adds
 * a NextAuth SessionProvider so sign-in state is available to all
 * /early-access/* descendants.
 */
export default function EarlyAccessLayout({ children }: { children: ReactNode }) {
  return <SessionGate>{children}</SessionGate>;
}
