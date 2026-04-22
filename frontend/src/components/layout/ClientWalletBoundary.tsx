"use client";

/**
 * Client-only mount point for the wagmi + RainbowKit provider tree.
 *
 * Why the extra file: RainbowKit's walletConnect connector calls
 * `@walletconnect/sign-client`, which eagerly reads IndexedDB at
 * `createClient` time. On the Node runtime (SSR / Turbopack dev
 * server) `indexedDB` is undefined and the call throws an
 * `unhandledRejection`. The page still renders HTTP 200 because
 * Next traps the rejection, but the noise spams the dev console
 * and slows first paint.
 *
 * Wrapping the provider in a `dynamic(..., { ssr: false })` boundary
 * defers the whole wagmi tree to client hydration — the server just
 * renders the children bare, and wallet state spins up after mount.
 * Pages that call `useAccount()` get `address: undefined` during the
 * initial paint, same as before a wallet connects, which is already
 * the shape they handle.
 */
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const WalletProvider = dynamic(
  () => import("@/contexts/WalletProvider"),
  {
    ssr: false,
    loading: ({ error }) =>
      error ? (
        <div className="p-6 text-center text-[#ef4444] font-pixel text-[10px]">
          Wallet provider failed to load. Refresh the page.
        </div>
      ) : null,
  }
);

export default function ClientWalletBoundary({
  children,
}: {
  children: ReactNode;
}) {
  return <WalletProvider>{children}</WalletProvider>;
}
