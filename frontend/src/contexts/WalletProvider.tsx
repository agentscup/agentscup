"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount } from "wagmi";
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { useEffect, useRef, type ReactNode } from "react";
import "@rainbow-me/rainbowkit/styles.css";

import { wagmiConfig, TARGET_CHAIN } from "@/lib/wagmi";
import { connectUser } from "@/lib/api";

/**
 * Root wallet provider for the game. Replaces the old Solana
 * wallet-adapter stack with wagmi + RainbowKit so every game page
 * (packs / marketplace / match / squad / collection) connects to
 * the same MetaMask / Coinbase / WalletConnect / Rainbow instance.
 *
 * The QueryClient is created at module scope so hot-reload keeps
 * the cache warm between component reloads; wagmi expects a stable
 * query client reference.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Fires `/api/users/connect` once per wallet address per session.
 * The endpoint upserts the users row and, on first sight, creates a
 * leaderboard row seeded with a random team name ("Neon Wolves 42").
 * Hitting this at the provider level means every page downstream —
 * squad, match, leaderboard — sees the same pre-assigned name
 * without each page having to check for themselves.
 *
 * Guarded by a ref so a transient disconnect/reconnect doesn't
 * spam the endpoint. The call itself is idempotent via Postgres
 * upsert, so a stray retry is harmless.
 */
function WalletSessionBootstrap() {
  const { address, isConnected } = useAccount();
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      synced.current = null;
      return;
    }
    const lower = address.toLowerCase();
    if (synced.current === lower) return;
    synced.current = lower;
    connectUser(lower).catch((err) => {
      // Non-fatal: the backend is happy to lazy-create the user on
      // first pack open / match join, this call is just for the
      // team-name seed. A network blip here shouldn't disrupt the
      // UI, so we just log and move on.
      if (typeof window !== "undefined") {
        console.warn("[wallet] connectUser bootstrap failed:", err);
      }
    });
  }, [address, isConnected]);

  return null;
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={TARGET_CHAIN}
          theme={darkTheme({
            accentColor: "#FFD700",
            accentColorForeground: "#1a1200",
            borderRadius: "small",
            fontStack: "system",
          })}
          // Keep `compact` — `wide` splits the modal into two panels
          // (help on left, wallet list on right) which clips the right
          // panel off-screen on narrow mobile viewports, leaving only
          // the "What is a Wallet?" text visible. Compact renders the
          // wallet list as the primary view on every screen size.
          modalSize="compact"
          showRecentTransactions={true}
        >
          <WalletSessionBootstrap />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Re-export for consumers that need to build custom themes.
export { lightTheme };
