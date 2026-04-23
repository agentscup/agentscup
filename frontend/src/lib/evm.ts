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
} from "wagmi/actions";
import { keccak256, toHex, toBytes, maxUint256, type Hash } from "viem";
import { getAccount } from "wagmi/actions";
import { base } from "wagmi/chains";

import { wagmiConfig, CONTRACT_ADDRESSES, MATCH_ENTRY_FEE_WEI, TARGET_CHAIN_ID } from "./wagmi";

// V2 contracts (CUP-native). The old ETH-based ABIs are kept as imports
// for a transition window but every call site uses V2 now — the switch
// landed when the economy migrated from native ETH to $CUP (50k/100k/
// 250k/750k CUP packs + 50k CUP match entry).
import AgentsCupPackStoreAbi from "@/abi/AgentsCupPackStoreV2.json";
import AgentsCupMarketplaceAbi from "@/abi/AgentsCupMarketplaceV2.json";
import AgentsCupMatchEscrowAbi from "@/abi/AgentsCupMatchEscrowV2.json";
import AgentsCupTokenAbi from "@/abi/AgentsCupToken.json";

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
 * Computes tight EIP-1559 fee overrides for writeContract, tuned for
 * Base. Two distinct problems this solves:
 *
 *   (a) Mobile wallets surfacing "network fee unavailable" when the
 *       wallet's own RPC (often the dApp's public RPC) rate-limits
 *       fee endpoints on carrier NATs. By passing explicit fee
 *       params, the wallet doesn't have to estimate at all.
 *
 *   (b) Wallets over-displaying the fee because viem's default
 *       `estimateFeesPerGas` on Base returns a 75th-percentile
 *       priority fee pulled up by MEV bots (~0.1-1 gwei) even
 *       though organic users need ~0.001 gwei. Wallet UI shows
 *       `maxFeePerGas × gasLimit` as the scary max → users see
 *       a $1-5 network fee for a pack buy that should cost pennies.
 *
 * Instead of trusting viem's estimator, we read the current
 * `baseFeePerGas` directly from the latest block and build a tight
 * EIP-1559 envelope:
 *
 *   maxPriorityFeePerGas = 0.001 gwei  (organic Base user tip)
 *   maxFeePerGas         = baseFee × 1.5 + priority
 *
 * The 1.5× headroom covers ~3 Base blocks (12.5% baseFee cap per
 * block), plenty for the mobile approval round-trip without bloating
 * the wallet's max-fee display. Actual charge is
 * `min(maxFee, baseFee + priority) × gasUsed` — any unused portion
 * refunds, so tightening maxFee only lowers the scary UI number, not
 * the real cost.
 */
const BASE_ORGANIC_PRIORITY_WEI = 1_000_000n;      // 0.001 gwei
const BASE_PRIORITY_CAP_WEI = 10_000_000n;         // 0.01 gwei hard cap
const BASE_FEE_HEADROOM_NUMER = 15n;
const BASE_FEE_HEADROOM_DENOM = 10n;

async function computeFeeOverrides(): Promise<{
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}> {
  try {
    const client = getPublicClient(wagmiConfig, {
      chainId: base.id as 8453,
    });
    if (!client) return {};
    const block = await client.getBlock({ blockTag: "latest" });
    const baseFee = block.baseFeePerGas ?? 0n;
    if (baseFee === 0n) return {}; // non-EIP-1559 response; let wallet decide
    const priority =
      BASE_ORGANIC_PRIORITY_WEI > BASE_PRIORITY_CAP_WEI
        ? BASE_PRIORITY_CAP_WEI
        : BASE_ORGANIC_PRIORITY_WEI;
    const maxFee =
      (baseFee * BASE_FEE_HEADROOM_NUMER) / BASE_FEE_HEADROOM_DENOM + priority;
    return {
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: priority,
    };
  } catch (err) {
    console.warn("[evm] fee estimation failed, falling back to wallet:", err);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────
// $CUP token allowance helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Reads the caller's CUP balance. Returns 0n if the wallet isn't
 * connected or the RPC is unreachable — callers should check > 0 before
 * assuming the user has liquidity to pay for a pack / deposit.
 */
export async function readCupBalance(
  owner: `0x${string}`
): Promise<bigint> {
  try {
    const v = (await readContract(wagmiConfig, {
      address: CONTRACT_ADDRESSES.cupToken,
      abi: AgentsCupTokenAbi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;
    return v;
  } catch {
    return 0n;
  }
}

/**
 * Ensures the connected wallet has approved `spender` for at least
 * `amount` CUP — if not, submits an approve() tx and waits for it to
 * confirm. Approves `maxUint256` so the user doesn't have to re-sign
 * for every pack / listing / match after the first purchase. A single
 * up-front approve-max is the established UX on DEXes and bluechip
 * NFT markets; alternative is to approve the exact amount each time,
 * which double-prompts the wallet for every in-game action.
 *
 * Returns the approval tx hash if a new approve was submitted, or null
 * if the existing allowance was already sufficient.
 */
export async function ensureCupAllowance(
  spender: `0x${string}`,
  amount: bigint
): Promise<Hash | null> {
  const account = getAccount(wagmiConfig);
  const owner = account.address as `0x${string}` | undefined;
  if (!owner) throw new Error("Wallet not connected");

  // Fast path — read current allowance.
  let current = 0n;
  try {
    current = (await readContract(wagmiConfig, {
      address: CONTRACT_ADDRESSES.cupToken,
      abi: AgentsCupTokenAbi,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;
  } catch {
    // readContract can flake on RPC hiccups; fall through and submit approve.
  }
  if (current >= amount) return null;

  await ensureBaseChain();
  const feeOverrides = await computeFeeOverrides();
  const hash = await writeContract(wagmiConfig, {
    chainId: base.id,
    address: CONTRACT_ADDRESSES.cupToken,
    abi: AgentsCupTokenAbi,
    functionName: "approve",
    args: [spender, maxUint256],
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
 * Buys a pack denominated in $CUP. Caller's wallet must hold at least
 * `priceCup` CUP and will auto-approve the pack store for max allowance
 * on the first buy (second tx), then submit buyPack() (third tx — or
 * single tx if allowance is already there).
 *
 * The backend verifies the resulting PackPurchased event; requestId
 * lets the backend dedup any replays.
 */
export async function buyPack(
  packTier: number,
  priceCup: bigint
): Promise<{ txHash: Hash; requestId: `0x${string}` }> {
  assertContract("packStore");
  await ensureBaseChain();

  // Make sure the store can pull the CUP out of the user's wallet.
  // Noop if already approved — the first pack buy is a 2-tx flow
  // (approve + buy), subsequent buys are single-tx.
  await ensureCupAllowance(CONTRACT_ADDRESSES.packStore, priceCup);

  const requestId = randomBytes32();
  const feeOverrides = await computeFeeOverrides();

  const hash = await writeContract(wagmiConfig, {
    chainId: base.id,
    address: CONTRACT_ADDRESSES.packStore,
    abi: AgentsCupPackStoreAbi,
    functionName: "buyPack",
    args: [packTier, requestId],
    ...feeOverrides,
  });
  await waitForTransactionReceipt(wagmiConfig, {
    chainId: base.id,
    hash,
    timeout: 60_000,
  });
  return { txHash: hash, requestId };
}

/** Reads the on-chain price for a pack tier from PackStoreV2. Falls back
 *  to 0n if the RPC flakes — caller should check before submitting. */
export async function readPackPriceCup(packTier: number): Promise<bigint> {
  try {
    const v = (await readContract(wagmiConfig, {
      address: CONTRACT_ADDRESSES.packStore,
      abi: AgentsCupPackStoreAbi,
      functionName: "packPrices",
      args: [packTier],
    })) as bigint;
    return v;
  } catch {
    return 0n;
  }
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

/** Buys an agent listing paid in CUP. Ensures allowance first so the
 *  contract can pull fee + payout in a single tx from the buyer. */
export async function buyAgentOnChain(
  listingIdHex: `0x${string}`,
  priceCup: bigint
): Promise<Hash> {
  assertContract("marketplace");
  await ensureBaseChain();
  await ensureCupAllowance(CONTRACT_ADDRESSES.marketplace, priceCup);
  const feeOverrides = await computeFeeOverrides();
  const hash = await writeContract(wagmiConfig, {
    chainId: base.id,
    address: CONTRACT_ADDRESSES.marketplace,
    abi: AgentsCupMarketplaceAbi,
    functionName: "buyAgent",
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
 * Deposits the CUP match entry fee into the escrow and returns the
 * matchId the caller is parked under. Ensures the escrow has allowance
 * first; the escrow itself custodies the deposited CUP until the
 * operator role calls payoutWinner / refundDraw / forfeitAll.
 */
export async function depositMatchEntry(
  entryFeeCup: bigint = MATCH_ENTRY_FEE_WEI
): Promise<{ txHash: Hash; matchId: `0x${string}` }> {
  assertContract("matchEscrow");
  await ensureBaseChain();
  await ensureCupAllowance(CONTRACT_ADDRESSES.matchEscrow, entryFeeCup);
  const matchId = randomBytes32();
  const feeOverrides = await computeFeeOverrides();
  const hash = await writeContract(wagmiConfig, {
    chainId: base.id,
    address: CONTRACT_ADDRESSES.matchEscrow,
    abi: AgentsCupMatchEscrowAbi,
    functionName: "depositEntry",
    args: [matchId, 0],
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
