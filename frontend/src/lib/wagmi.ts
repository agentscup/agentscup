"use client";

import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import {
  metaMaskWallet,
  coinbaseWallet,
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

// Wallet list is organised into two groups so the RainbowKit modal
// shows the Base-native ones first (Coinbase Wallet = Base Wallet +
// Smart Wallet under the hood) and surfaces the rest under a "More"
// section for players who already use a different extension on
// desktop or a specific mobile wallet app.
//
//   "Popular on Base" group — the wallets Base users most commonly
//   reach for: Base App (Coinbase Wallet), MetaMask, Rainbow, Phantom
//   (supports EVM since 2024), Rabby (power-user browser wallet).
//
//   "More" group — WalletConnect as the universal fallback, plus
//   Trust / OKX for mobile users, Brave / Ledger / Safe / injected
//   as edge-case coverage. Anything not in this list can still reach
//   the app via WalletConnect scan.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular on Base",
      wallets: [
        coinbaseWallet,   // Base Wallet / Coinbase Smart Wallet
        metaMaskWallet,
        rainbowWallet,
        phantomWallet,
        rabbyWallet,
      ],
    },
    {
      groupName: "More",
      wallets: [
        walletConnectWallet, // scan-to-connect for every other wallet
        trustWallet,
        okxWallet,
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

const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";

export const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  transports: {
    [base.id]: http(baseRpc),
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
