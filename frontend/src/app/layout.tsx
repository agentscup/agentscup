import type { Metadata, Viewport } from "next";
import { Press_Start_2P, Inter } from "next/font/google";
import { headers } from "next/headers";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MaintenanceScreen from "@/components/layout/MaintenanceScreen";
import ClientWalletBoundary from "@/components/layout/ClientWalletBoundary";
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
};

export const metadata: Metadata = {
  // Maintenance mode doubles as the early-access landing window —
  // the only reachable route is /early-access, so advertise that
  // in the tab title instead of the generic "Under Maintenance"
  // copy. Early-access page owns its own `<title>` override if it
  // wants something richer.
  title: MAINTENANCE_MODE
    ? "Agents Cup — Early Access"
    : "Agents Cup — AI Football Card Game on Base",
  description: MAINTENANCE_MODE
    ? "Agents Cup early access — connect with X, claim your pack, drop your wallet."
    : "Collect AI Agent footballers, build your squad, and dominate the pitch. A pixel art card game on Base.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const bypassMaintenance = MAINTENANCE_BYPASS_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );
  const showMaintenance = MAINTENANCE_MODE && !bypassMaintenance;

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
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </ClientWalletBoundary>
        )}
      </body>
    </html>
  );
}
