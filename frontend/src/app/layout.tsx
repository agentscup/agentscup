import type { Metadata, Viewport } from "next";
import { Press_Start_2P, Inter } from "next/font/google";
import { headers } from "next/headers";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MaintenanceScreen from "@/components/layout/MaintenanceScreen";
import ClientWalletBoundary from "@/components/layout/ClientWalletBoundary";
import InAppBrowserBanner from "@/components/layout/InAppBrowserBanner";
import "./globals.css";

const MAINTENANCE_MODE = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

/**
 * Routes that stay reachable even while MAINTENANCE_MODE is on. Keep
 * this list tight — each entry is a prefix-match on the URL path.
 * `/early` is the public vanity path that rewrites to `/early-access`
 * via next.config; we need to accept both because the middleware that
 * tags x-pathname runs before the rewrite resolves.
 */
const MAINTENANCE_BYPASS_PREFIXES = ["/early-access", "/early"];

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  // iPhones with notch / Dynamic Island need explicit viewport-fit
  // cover so our env(safe-area-inset-*) padding kicks in. Without
  // this, iOS Safari clamps the viewport to the visible area and
  // fixed-position modals (RainbowKit's wallet picker) render with
  // odd offsets — the "yamuk gibi" skew users saw on iPhone 17.
  viewportFit: "cover",
};

// Metadata is host-aware — during the pre-launch window both
// agentscup.com (early-access landing) and play.agentscup.com
// (full game) share a single deployment, so the tab title should
// match the domain the visitor is on:
//
//   agentscup.com / www  → "Agents Cup — Early Access"
//   play.agentscup.com   → "Agents Cup — AI Football Card Game on Base"
//
// After launch day, flipping MAINTENANCE_MODE=false promotes the
// game title everywhere.
export async function generateMetadata(): Promise<Metadata> {
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  const isRootDomain =
    host === "agentscup.com" || host === "www.agentscup.com";
  const stillEarlyAccess = MAINTENANCE_MODE && isRootDomain;
  return {
    title: stillEarlyAccess
      ? "Agents Cup — Early Access"
      : "Agents Cup — AI Football Card Game on Base",
    description: stillEarlyAccess
      ? "Agents Cup early access — connect with X, claim your pack, drop your wallet."
      : "Collect AI Agent footballers, build your squad, and dominate the pitch. A pixel art card game on Base.",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const host = (h.get("host") ?? "").toLowerCase();
  const bypassMaintenance = MAINTENANCE_BYPASS_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );
  // Maintenance screen only takes over the root domain
  // (agentscup.com / www). play.agentscup.com serves the full game
  // during the pre-launch window so early testers, investors, and
  // the marketing team have a live URL to point at without waiting
  // for the root-domain flip.
  const isRootDomain =
    host === "agentscup.com" || host === "www.agentscup.com";
  const showMaintenance =
    MAINTENANCE_MODE && !bypassMaintenance && isRootDomain;

  return (
    <html lang="en" className={`${pressStart.variable} ${inter.variable} dark`}>
      <body className="scanlines min-h-screen flex flex-col bg-[#061206] text-[#d4e4d4] font-body antialiased bg-grid">
        {showMaintenance ? (
          <MaintenanceScreen />
        ) : bypassMaintenance ? (
          // Bypass routes render bare — they provide their own chrome.
          <main className="flex-1">{children}</main>
        ) : (
          <ClientWalletBoundary>
            <InAppBrowserBanner />
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </ClientWalletBoundary>
        )}
      </body>
    </html>
  );
}
