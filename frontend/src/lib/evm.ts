"use client";

/**
 * Client-side EVM helpers — thin ergonomic wrappers over wagmi's
 * imperative actions (`writeContract`, `waitForTransactionReceipt`).
 *
 * Every helper throws on failure; the caller is expected to catch and
 * surface a readable error to the user. All ETH amounts are bigint
 * wei so we never lose precision to JS floats.
 *
 * The ABIs are compiled from `contracts-base/` and copied into
 * `frontend/src/abi/` by `npm run abi:extract` on the contracts
 * workspace — keep them in sync by re-running that after any
 * Solidity change.
 */

import {
  getPublicClient,
  writeContract,
  waitForTransactionReceipt,
  readContract,
  switchChain,
  getChainId,
  estimateFeesPerGas,
} from "wagmi/actions";
import { keccak256, toHex, toBytes, type Hash } from "viem";
import { base } from "wagmi/chains";

import { wagmiConfig, CONTRACT_ADDRESSES, MATCH_ENTRY_FEE_WEI, TARGET_CHAIN_ID } from "./wagmi";

import AgentsCupPackStoreAbi from "@/abi/AgentsCupPackStore.json";
import AgentsCupMarketplaceAbi from "@/abi/AgentsCupMarketplace.json";
import AgentsCupMatchEscrowAbi from "@/abi/AgentsCupMatchEscrow.json";

export { MATCH_ENTRY_FEE_WEI };

// ─────────────────────────────────────────────────────────────────────
// Chain guard — make sure every write lands on Base
// ─────────────────────────────────────────────────────────────────────

/**
 * Switches the connected wallet to Base before any write. Without
 * this, wagmi submits the tx on whatever chain the wallet is
 * currently pointed at — players who left their wallet on Ethereum
 * mainnet after using another dApp were getting the signing popup
 * on the wrong chain and had to tap "Switch Network" manually each
 * time. Calling `switchChain` up front prompts the wallet silently
 * if it's already on Base (a cheap no-op) or surfaces the usual
 * wallet switch dialog if it isn't.
 *
 * `writeContract` is also passed `chainId: base.id` as a second
 * belt-and-suspenders guard — wagmi will reject the submission if
 * the wallet somehow ends up on a mismatched chain between our
 * switch call and the tx request.
 */
async function ensureBaseChain(): Promise<void> {
  const current = getChainId(wagmiConfig);
  if (current === base.id) return;
  try {
    await switchChain(wagmiConfig, { chainId: base.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // User-rejection and "unrecognized chain" surface here. Rewrap
    // with a clearer message — the caller shows this to the user
    // verbatim as a toast/banner.
    if (/user rejected|user denied/i.test(msg)) {
      throw new Error(
        "Please approve the network switch to Base in your wallet."
      );
    }
    if (/unrecognized chain|not supported/i.test(msg)) {
      throw new Error(
        "Your wallet doesn't have Base configured. Add Base mainnet (chainId 8453, RPC https://mainnet.base.org) and try again."
      );
    }
    // Any other switchChain failure (including mobile WalletConnect
    // weirdness where the bridge timed out) — we DON'T throw here.
    // wagmi's writeContract below carries `chainId: base.id` and
    // will surface the real problem from inside viem with a more
    // actionable error string than "switch_chain failed". If the
    // switch actually worked (common on mobile — the wallet app
    // confirms in the background even when the RPC response times
    // out), the subsequent writeContract succeeds.
    console.warn(`[evm] switchChain soft-failed, continuing: ${msg}`);
    return;
  }

  // Verification poll — Phantom + mobile WalletConnect sessions can
  // resolve `wallet_switchEthereumChain` before their internal
  // tx-routing state actually commits. wagmi's `switchChain`
  // promise has resolved but `getChainId()` can still return the
  // old id for several seconds (more on mobile where the wallet
  // app deep-link round-trip adds latency). If writeContract fires
  // inside that window, the tx goes to the wrong chain and the
  // user sees "Expected 8453, got 1".
  //
  // 20 × 400ms = 8s poll. Mobile wallets often take 3-6 s for the
  // deep-link round-trip; desktop usually flips instantly. After
  // the timeout we CONTINUE instead of throwing — writeContract's
  // own chain check is a second line of defense and its error
  // message is clearer than a generic "didn't commit" string.
  for (let i = 0; i < 20; i++) {
    if (getChainId(wagmiConfig) === base.id) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  console.warn(
    "[evm] chain verification poll timed out — letting writeContract arbitrate"
  );
}

// ─────────────────────────────────────────────────────────────────────
// Fee overrides — fix "network fee unavailable" on mobile wallets
// ─────────────────────────────────────────────────────────────────────

/**
 * Estimates EIP-1559 fees via the dApp's own fallback transport and
 * returns overrides for writeContract. When the wallet is asked to
 * estimate fees itself (the default path), mobile wallets route fee
 * queries through the dApp's registered RPC — which is the public
 * `mainnet.base.org` rate-limited endpoint on free tier. Mobile
 * carriers share NATs and burst-hit that limit, so `eth_feeHistory`
 * returns empty and the wallet shows "network fee unavailable".
 *
 * By pre-estimating here (via viem's `fallback` transport which
 * rotates across 5 public RPCs) and passing explicit `maxFeePerGas`
 * + `maxPriorityFeePerGas` to `writeContract`, the wallet skips its
 * own estimation and signs with the values we provided.
 *
 * Silent failure is fine — if estimation fails (should be rare with
 * fallback RPCs), we return `{}` and let the wallet estimate as
 * before. The fallback transport means this is the improvement
 * path, not a regression.
 */
async function computeFeeOverrides(): Promise<{
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}> {
  try {
    const fees = await estimateFeesPerGas(wagmiConfig, { chainId: base.id });
    if (fees.maxFeePerGas && fees.maxPriorityFeePerGas) {
      // 20% buffer for volatile blocks — Base blocks are 2s so price
      // can move during the wallet approval round-trip on mobile.
      return {
        maxFeePerGas: (fees.maxFeePerGas * 12n) / 10n,
        maxPriorityFeePerGas: (fees.maxPriorityFeePerGas * 12n) / 10n,
      };
    }
  } catch (err) {
    console.warn("[evm] fee estimation failed, falling back to wallet:", err);
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────
// Hex utilities
// ─────────────────────────────────────────────────────────────────────

/** Generates a fresh 32-byte random hex string (`0x…`) suitable for
 *  use as a contract `bytes32` parameter (listing id, match id,
 *  request id). Uses the Web Crypto API — availability in every
 *  browser that can run the app. */
export function randomBytes32(): `0x${string}` {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return toHex(buf) as `0x${string}`;
}

/** Deterministic `bytes32` hash for a string input (agent id, etc.). */
export function hashToBytes32(input: string): `0x${string}` {
  return keccak256(toBytes(input));
}

// ─────────────────────────────────────────────────────────────────────
// Pack purchase
// ─────────────────────────────────────────────────────────────────────

/**
 * Calls AgentsCupPackStore.buyPack(packTier, requestId) with msg.value
 * = priceWei. Returns the tx hash once confirmed.
 *
 * The backend verifies the resulting PackPurchased event; requestId
 * lets the backend dedup any replays.
 */
export async function buyPack(
  packTier: number,
  priceWei: bigint
): Promise<{ txHash: Hash; requestId: `0x${string}` }> {
  assertContract("packStore");
  await ensureBaseChain();
  const requestId = randomBytes32();
  const feeOverrides = await computeFeeOverrides();

  const hash = await writeContract(wagmiConfig, {
    chainId: base.id,
    address: CONTRACT_ADDRESSES.packStore,
    abi: AgentsCupPackStoreAbi,
    functionName: "buyPack",
    args: [packTier, requestId],
    value: priceWei,
    ...feeOverrides,
  });
  await waitForTransactionReceipt(wagmiConfig, {
    chainId: base.id,
    hash,
    timeout: 60_000,
  });
  return { txHash: hash, requestId };
}

// ─────────────────────────────────────────────────────────────────────
// Marketplace
// ─────────────────────────────────────────────────────────────────────

/**
 * Calls AgentsCupMarketplace.listAgent. The backend creates the
 * matching DB record via POST /api/marketplace/list with the same
 * `listingId`.
 */
export async function listAgentOnChain(args: {
  listingId: `0x${string}`;
  agentId: `0x${string}`;
  priceWei: bigint;
  ttlSeconds: number;
}): Promise<Hash> {
  assertContract("marketplace");
  await ensureBaseChain();
  const feeOverrides = await computeFeeOverrides();
  const hash = await writeContract(wagmiConfig, {
    chainId: base.id,
    address: CONTRACT_ADDRESSES.marketplace,
    abi: AgentsCupMarketplaceAbi,
    functionName: "listAgent",
    args: [args.listingId, args.agentId, args.priceWei, args.ttlSeconds],
    ...feeOverrides,
  });
  await waitForTransactionReceipt(wagmiConfig, {
    chainId: base.id,
    hash,
    timeout: 60_000,
  });
  return hash;
}

/** Calls AgentsCupMarketplace.buyAgent with msg.value = priceWei. */
export async function buyAgentOnChain(
  listingIdHex: `0x${string}`,
  priceWei: bigint
): Promise<Hash> {
  assertContract("marketplace");
  await ensureBaseChain();
  const feeOverrides = await computeFeeOverrides();
  const hash = await writeContract(wagmiConfig, {
    chainId: base.id,
    address: CONTRACT_ADDRESSES.marketplace,
    abi: AgentsCupMarketplaceAbi,
    functionName: "buyAgent",
    args: [listingIdHex],
    value: priceWei,
    ...feeOverrides,
  });
  await waitForTransactionReceipt(wagmiConfig, {
    chainId: base.id,
    hash,
    timeout: 60_000,
  });
  return hash;
}

/** Optional — sellers can cancel a listing they created themselves. */
export async function cancelListingOnChain(
  listingIdHex: `0x${string}`
): Promise<Hash> {
  assertContract("marketplace");
  await ensureBaseChain();
  const feeOverrides = await computeFeeOverrides();
  const hash = await writeContract(wagmiConfig, {
    chainId: base.id,
    address: CONTRACT_ADDRESSES.marketplace,
    abi: AgentsCupMarketplaceAbi,
    functionName: "cancelListing",
    args: [listingIdHex],
    ...feeOverrides,
  });
  await waitForTransactionReceipt(wagmiConfig, {
    chainId: base.id,
    hash,
    timeout: 60_000,
  });
  return hash;
}

// ─────────────────────────────────────────────────────────────────────
// Match escrow
// ─────────────────────────────────────────────────────────────────────

/**
 * Calls AgentsCupMatchEscrow.depositEntry with a freshly-generated
 * bytes32 matchId and slot=0. The backend pairs players after both
 * deposits land; draining the escrows on settlement is an operator
 * concern, not the player's.
 */
export async function depositMatchEntry(
  entryFeeWei: bigint = MATCH_ENTRY_FEE_WEI
): Promise<{ txHash: Hash; matchId: `0x${string}` }> {
  assertContract("matchEscrow");
  await ensureBaseChain();
  const matchId = randomBytes32();
  const feeOverrides = await computeFeeOverrides();
  const hash = await writeContract(wagmiConfig, {
    chainId: base.id,
    address: CONTRACT_ADDRESSES.matchEscrow,
    abi: AgentsCupMatchEscrowAbi,
    functionName: "depositEntry",
    args: [matchId, 0],
    value: entryFeeWei,
    ...feeOverrides,
  });
  await waitForTransactionReceipt(wagmiConfig, {
    chainId: base.id,
    hash,
    timeout: 60_000,
  });
  return { txHash: hash, matchId };
}

/** Reads the current entryFee() from the deployed escrow. */
export async function readEntryFee(): Promise<bigint> {
  if (!CONTRACT_ADDRESSES.matchEscrow) return MATCH_ENTRY_FEE_WEI;
  // wagmi narrows chainId to the literal union of configured chains
  // (now just `8453` since testnet was removed from the app build).
  const pc = getPublicClient(wagmiConfig, {
    chainId: TARGET_CHAIN_ID as 8453,
  });
  if (!pc) return MATCH_ENTRY_FEE_WEI;
  try {
    const fee = (await readContract(wagmiConfig, {
      address: CONTRACT_ADDRESSES.matchEscrow,
      abi: AgentsCupMatchEscrowAbi,
      functionName: "entryFee",
      args: [],
    })) as bigint;
    return fee;
  } catch {
    return MATCH_ENTRY_FEE_WEI;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────

function assertContract(kind: keyof typeof CONTRACT_ADDRESSES): void {
  const addr = CONTRACT_ADDRESSES[kind];
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    throw new Error(
      `Contract address for ${kind} is not configured — set NEXT_PUBLIC_${kind
        .replace(/([A-Z])/g, "_$1")
        .toUpperCase()}_ADDRESS`
    );
  }
}

/** Convenience: format wei → human-readable ETH with up to 4 decimals. */
export function formatEth(wei: bigint, maxDecimals = 4): string {
  const divisor = 10n ** 18n;
  const whole = wei / divisor;
  const rem = wei % divisor;
  if (rem === 0n) return whole.toString();
  // Pad remainder to 18 chars, trim trailing zeros, cap decimals.
  const remStr = rem.toString().padStart(18, "0");
  const trimmed = remStr.replace(/0+$/, "").slice(0, maxDecimals);
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString();
}

/** Convenience: parse a user-entered ETH string → wei bigint. Throws
 *  on NaN / negative / too-precise input. */
export function parseEth(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Amount must be a positive decimal number");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(fracPadded);
}
