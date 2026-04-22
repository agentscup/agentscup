"use client";

import { createConfig } from "wagmi";
import { http, fallback } from "viem";
import { base } from "wagmi/chains";
import {
  baseAccount,        // Base Smart Account — Base-native connector
  metaMaskWallet,
  coinbaseWallet,     // @deprecated upstream but keep for users with older Coinbase Wallet app
  rainbowWallet,
  walletConnectWallet,
  injectedWallet,
  rabbyWallet,
  phantomWallet,
  trustWallet,
  okxWallet,
  braveWallet,
  safeWallet,
  ledgerWallet,
  // Popular on Base / mobile exchanges — iPhone users live in these
  binanceWallet,
  bybitWallet,
  bitgetWallet,
  uniswapWallet,
  zerionWallet,
  imTokenWallet,
  tokenPocketWallet,
  gateWallet,
  krakenWallet,
  magicEdenWallet,
  safepalWallet,
  frontierWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";

/**
 * Wagmi config for the game. Locked to Base mainnet only — testnets
 * are intentionally excluded from the app build so users can't
 * accidentally sign on Sepolia and lose track of where their funds
 * went. QA that needs testnet should override `wagmiConfig` at
 * branch build time.
 *
 * RPC URL picks up `NEXT_PUBLIC_BASE_RPC_URL` from Vercel env so we
 * can swap to Alchemy / QuickNode on launch day for higher rate
 * limits than the public `https://mainnet.base.org` endpoint (which
 * rate-limits hard above a few rps).
 */

const WALLET_CONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

// iPhone mobile-wallet debugging history:
//   Symptom  — ConnectButton modal opens but "What is a Wallet?" text
//              shows and nothing connects; wallet list is empty or
//              the few entries don't deep-link the installed app.
//   Root    1. RainbowKit 2.2.10 deprecated `coinbaseWallet` in favour
//              of `baseAccount` (Base's own Smart Account flow). Listing
//              only the deprecated connector means iOS Coinbase-Wallet
//              users hit the stale Coinbase SDK path, which has known
//              iOS 17+ universal-link bugs.
//           2. WalletConnect Cloud project ID must whitelist every
//              origin we serve from — agentscup.com, www.agentscup.com
//              and play.agentscup.com. Un-whitelisted origins silently
//              fail the session handshake on mobile only (desktop
//              forgives it).
//           3. The mobile wallet picker needs enough entries that the
//              user's installed wallet is actually in the list. A
//              terse 5-wallet list makes the modal look empty and
//              nudges users to scan QR via WalletConnect, which Safari
//              treats as a cross-app jump and often fails to route
//              back after approval.
//
// Fix:
//   - Promote `baseAccount` to the top of "Popular on Base" so every
//     Coinbase / Base-app user gets the native flow.
//   - Keep `coinbaseWallet` one slot lower as a compatibility entry
//     for users with an older Coinbase Wallet app install.
//   - Expand the "More" list with every iPhone-native wallet commonly
//     used on Base — Binance/Bybit/Bitget/OKX for exchange wallets,
//     Uniswap/Zerion/Rainbow for DeFi natives, imToken/TokenPocket/
//     Trust/SafePal for APAC users, Kraken/Gemini/Frontier for US.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular on Base",
      wallets: [
        baseAccount,       // Base Smart Account — use this first on Base
        coinbaseWallet,    // Legacy Coinbase Wallet extension users
        metaMaskWallet,
        rainbowWallet,
        phantomWallet,
        rabbyWallet,
      ],
    },
    {
      groupName: "Mobile exchanges",
      wallets: [
        binanceWallet,
        bybitWallet,
        bitgetWallet,
        okxWallet,
        gateWallet,
        krakenWallet,
      ],
    },
    {
      groupName: "DeFi wallets",
      wallets: [
        uniswapWallet,
        zerionWallet,
        trustWallet,
        imTokenWallet,
        tokenPocketWallet,
        safepalWallet,
        magicEdenWallet,
        frontierWallet,
      ],
    },
    {
      groupName: "More",
      wallets: [
        walletConnectWallet, // scan-to-connect fallback for any wallet not listed
        braveWallet,
        ledgerWallet,
        safeWallet,
        injectedWallet,
      ],
    },
  ],
  {
    appName: "Agents Cup",
    projectId: WALLET_CONNECT_PROJECT_ID || "agentscup-fallback",
  }
);

// Multiple RPC endpoints with failover. Public `mainnet.base.org`
// rate-limits fee endpoints hard on mobile networks (shared-IP NATs
// at carriers), which surfaces as "network fee unavailable" in the
// wallet UI during a pack purchase. `fallback` with `rank: true`
// rotates to a healthy endpoint automatically when any one starts
// 429-ing, and re-ranks by latency so the fastest stays primary.
// Env override is first so prod can pin a paid Alchemy/QuickNode key.
const BASE_RPCS = [
  process.env.NEXT_PUBLIC_BASE_RPC_URL,
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base.publicnode.com",
  "https://1rpc.io/base",
  "https://base.meowrpc.com",
].filter((u): u is string => typeof u === "string" && u.length > 0);

const UNIQUE_BASE_RPCS = [...new Set(BASE_RPCS)];

const baseTransport = fallback(
  UNIQUE_BASE_RPCS.map((url) =>
    http(url, {
      retryCount: 2,
      retryDelay: 200,
      timeout: 10_000,
    })
  ),
  { rank: true }
);

export const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  transports: {
    [base.id]: baseTransport,
  },
  ssr: true,
});

export const TARGET_CHAIN_ID = base.id;
export const TARGET_CHAIN = base;

export const CONTRACT_ADDRESSES = {
  packStore: (process.env.NEXT_PUBLIC_PACK_STORE_ADDRESS ?? "") as `0x${string}`,
  marketplace: (process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS ?? "") as `0x${string}`,
  matchEscrow: (process.env.NEXT_PUBLIC_MATCH_ESCROW_ADDRESS ?? "") as `0x${string}`,
};

/** 0.001 ETH — default match entry fee. Kept in wei as a JS BigInt
 *  so it survives JSON round-trips without precision loss. */
export const MATCH_ENTRY_FEE_WEI = 1_000_000_000_000_000n;
