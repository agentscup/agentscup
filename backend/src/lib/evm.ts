/**
 * Base (EVM) infrastructure helpers. Replaces the old Solana
 * web3.js-based payment module. Everything in the app-level
 * economy now flows through three contracts on Base mainnet:
 *
 *   AgentsCupPackStore       → pack purchases (ETH → treasury)
 *   AgentsCupMarketplace     → agent trades (ETH + bps fee)
 *   AgentsCupMatchEscrow     → match entry escrow, winner payout
 *
 * The backend plays two roles in this architecture:
 *   1. Verifier — watches on-chain logs for pack and marketplace
 *      activity, then credits DB state in response. Scales because
 *      event lookup via `eth_getLogs` is a cheap index scan.
 *   2. Operator — holds the treasury private key, which also owns
 *      OPERATOR_ROLE on the match escrow. This is what lets us call
 *      `payoutWinner` / `refundDraw` on match settlement from the
 *      Node process.
 *
 * Configuration (all optional — missing values simply disable the
 * paths that need them so the rest of the app keeps starting):
 *
 *   BASE_RPC_URL                       mainnet RPC (Alchemy, QuickNode, etc.)
 *   TREASURY_PRIVATE_KEY               0x-prefixed EOA private key (signer)
 *   PACK_STORE_ADDRESS                 deployed AgentsCupPackStore
 *   MARKETPLACE_ADDRESS                deployed AgentsCupMarketplace
 *   MATCH_ESCROW_ADDRESS               deployed AgentsCupMatchEscrow
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  parseAbiItem,
  parseEventLogs,
  getAddress,
  type Address,
  type Hash,
  type Hex,
  type Transport,
} from "viem";
import {
  privateKeyToAccount,
  nonceManager as jsonRpcNonceManager,
  type Account,
} from "viem/accounts";
import { base } from "viem/chains";

// V2 ABIs — economy migrated from native ETH to $CUP on 2026-04-23.
// Event signatures (PackPurchased / AgentSold / EntryDeposited) are
// unchanged between V1 and V2 so the verifier logic stays the same;
// only the function inputs and the settlement asset flipped.
import AgentsCupPackStoreAbi from "../abi/AgentsCupPackStoreV2.json";
import AgentsCupMarketplaceAbi from "../abi/AgentsCupMarketplaceV2.json";
import AgentsCupMatchEscrowAbi from "../abi/AgentsCupMatchEscrowV2.json";
import AgentsCupTokenAbi from "../abi/AgentsCupToken.json";

// ─────────────────────────────────────────────────────────────────────
// Config — Base mainnet only. Testnet support was pulled from the
// app build so ops can't accidentally point one service at 84532
// while another sits on 8453.
// ─────────────────────────────────────────────────────────────────────

const CHAIN_ID = base.id;
const CHAIN = base;

/**
 * RPC transport with automatic failover. Reads BASE_RPC_URL as the
 * primary (Alchemy / QuickNode / etc. for production) and falls
 * back to the public Base endpoint when the primary times out or
 * rate-limits. `rank: true` auto-reorders by latency so the faster
 * endpoint gets more traffic. retryCount=3 covers transient
 * network blips without propagating errors to the caller.
 *
 * For the smallest deployments both slots can be the public RPC;
 * for launch with real traffic set BASE_RPC_URL to a paid
 * provider — public mainnet.base.org rate-limits hard around
 * 5 requests/sec and will melt under a crowd of pack-buyers.
 */
const PRIMARY_RPC = (process.env.BASE_RPC_URL || "https://mainnet.base.org").trim();
const FALLBACK_RPC = (process.env.BASE_RPC_URL_FALLBACK || "https://mainnet.base.org").trim();
const RPC_URL = PRIMARY_RPC; // kept for logs

function makeTransport(): Transport {
  // If primary and fallback are the same URL, don't double-wrap —
  // fallback() with one transport is just overhead for no gain.
  if (PRIMARY_RPC === FALLBACK_RPC) {
    return http(PRIMARY_RPC, { retryCount: 3, retryDelay: 150 });
  }
  return fallback(
    [
      http(PRIMARY_RPC, { retryCount: 2, retryDelay: 100 }),
      http(FALLBACK_RPC, { retryCount: 2, retryDelay: 100 }),
    ],
    { rank: true, retryCount: 1 }
  );
}

const TREASURY_PRIVATE_KEY = (process.env.TREASURY_PRIVATE_KEY ?? "").trim();

const PACK_STORE_ADDRESS = normalizeAddress(process.env.PACK_STORE_ADDRESS);
const MARKETPLACE_ADDRESS = normalizeAddress(process.env.MARKETPLACE_ADDRESS);
const MATCH_ESCROW_ADDRESS = normalizeAddress(process.env.MATCH_ESCROW_ADDRESS);
const CUP_TOKEN_ADDRESS = normalizeAddress(
  process.env.CUP_TOKEN_ADDRESS ||
    "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668"
);

/** 50,000 CUP — V2 match entry fee. 18 decimals → `50_000n * 10^18`.
 *  Flipped from 0.001 ETH to 50k CUP when the economy migrated to
 *  $CUP on 2026-04-23. This is the per-player amount the match
 *  escrow pulls into custody on `depositEntry`; winner gets 2× pot. */
export const MATCH_ENTRY_FEE_WEI = 50_000n * 10n ** 18n;
export const CHAIN_CONFIG = { chainId: CHAIN_ID, rpcUrl: RPC_URL };
export const CONTRACTS = {
  packStore: PACK_STORE_ADDRESS,
  marketplace: MARKETPLACE_ADDRESS,
  matchEscrow: MATCH_ESCROW_ADDRESS,
  cupToken: CUP_TOKEN_ADDRESS,
};

// ─────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: makeTransport(),
});

/**
 * viem's wallet-client inferred type is too deep for TypeScript to
 * re-serialize at our tsconfig's inference limits. We box it behind
 * a narrow internal handle that exposes just the methods the routes
 * call (`writeContract` + `account.address`) and keep the heavy
 * generic types off the public surface. Runtime is unchanged.
 */
interface TreasurySigner {
  account: Account;
  writeContract: (args: Parameters<ReturnType<typeof createWalletClient>["writeContract"]>[0]) => Promise<Hash>;
}

let cachedWallet: TreasurySigner | null = null;
export function getWalletClient(): TreasurySigner | null {
  if (cachedWallet) return cachedWallet;
  if (!TREASURY_PRIVATE_KEY) return null;
  const pk = (TREASURY_PRIVATE_KEY.startsWith("0x")
    ? TREASURY_PRIVATE_KEY
    : `0x${TREASURY_PRIVATE_KEY}`) as Hex;
  // Attach viem's JSON-RPC nonce manager to the account. Without
  // this, back-to-back treasury txs can race the public Base RPC's
  // mempool propagation — the second tx reads the "pending" nonce
  // before the first hits the mempool view and ends up reusing the
  // first tx's nonce, which comes back as "replacement transaction
  // underpriced". The nonce manager tracks the next nonce locally
  // and increments atomically between sends.
  const account = privateKeyToAccount(pk, { nonceManager: jsonRpcNonceManager });
  const client = createWalletClient({
    account,
    chain: CHAIN,
    transport: makeTransport(),
  });
  cachedWallet = client as unknown as TreasurySigner;
  return cachedWallet;
}

export function requireWalletClient(): TreasurySigner {
  const w = getWalletClient();
  if (!w) {
    throw new Error(
      "TREASURY_PRIVATE_KEY is not configured — backend cannot sign on-chain payouts."
    );
  }
  return w;
}

export function treasuryAddress(): Address | null {
  const w = getWalletClient();
  return w?.account?.address ?? null;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers — address + tx validation
// ─────────────────────────────────────────────────────────────────────

export function isEvmAddress(s: string | undefined | null): s is string {
  return !!s && /^0x[a-fA-F0-9]{40}$/.test(s);
}

function normalizeAddress(a: string | undefined): Address | null {
  const s = (a ?? "").trim();
  if (!isEvmAddress(s)) return null;
  return getAddress(s);
}

async function fetchSuccessfulReceipt(txHash: string) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new Error("invalid tx hash format");
  }
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash as Hash,
    timeout: 30_000, // 30 s — Base block time is 2 s, plenty of head-room
  });
  if (receipt.status !== "success") {
    throw new Error(`tx reverted (${txHash.slice(0, 10)}…)`);
  }
  return receipt;
}

// ─────────────────────────────────────────────────────────────────────
// Pack purchase verification
// ─────────────────────────────────────────────────────────────────────

/**
 * Confirms a pack purchase transaction:
 *   - tx is mined + succeeded
 *   - it hit the PackStore contract
 *   - emitted PackPurchased with matching (buyer, packTier, amount)
 *
 * `requestId` is the client-provided dedupe key; caller persists it
 * against the DB to stop replays. We don't check it here — verifying
 * against DB is the idempotency fence, not the event.
 */
export interface PackPurchaseVerification {
  valid: boolean;
  reason?: string;
  buyer?: Address;
  packTier?: number;
  amountWei?: bigint;
}

export async function verifyPackPurchase(
  txHash: string,
  expectedBuyer: string,
  expectedMinAmountWei: bigint
): Promise<PackPurchaseVerification> {
  if (!PACK_STORE_ADDRESS) {
    return { valid: false, reason: "PACK_STORE_ADDRESS not configured" };
  }
  if (!isEvmAddress(expectedBuyer)) {
    return { valid: false, reason: "invalid buyer address" };
  }
  let receipt;
  try {
    receipt = await fetchSuccessfulReceipt(txHash);
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }

  // Decode PackPurchased directly from the receipt's own logs
  // instead of a follow-up `eth_getLogs` call. The public Base RPC
  // occasionally rejects `eth_getLogs` with "unknown block" for
  // blockHash filters (state-prune / edge node behavior) even when
  // the receipt itself landed cleanly. receipt.logs is always
  // populated and self-contained, so we skip the extra round-trip.
  const event = parseAbiItem(
    "event PackPurchased(address indexed buyer, uint8 indexed packTier, uint256 amount, bytes32 indexed requestId)"
  );
  const decoded = parseEventLogs({
    abi: [event],
    logs: receipt.logs,
    eventName: "PackPurchased",
  });
  const match = decoded.find(
    (l) => l.address.toLowerCase() === PACK_STORE_ADDRESS.toLowerCase()
  );
  if (!match) {
    return { valid: false, reason: "PackPurchased event not found in tx" };
  }
  const { buyer, packTier, amount } = match.args;
  if (!buyer || buyer.toLowerCase() !== expectedBuyer.toLowerCase()) {
    return { valid: false, reason: "buyer mismatch" };
  }
  if (!amount || amount < expectedMinAmountWei) {
    return {
      valid: false,
      reason: `paid ${amount ?? 0n} wei, expected >= ${expectedMinAmountWei} wei`,
    };
  }
  return {
    valid: true,
    buyer: getAddress(buyer),
    packTier: Number(packTier ?? 0),
    amountWei: amount,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Marketplace purchase verification
// ─────────────────────────────────────────────────────────────────────

/**
 * Confirms a marketplace buy:
 *   - tx hit the Marketplace contract
 *   - emitted AgentSold(listingId, seller, buyer, price, fee)
 *   - listingId + buyer + price all match the DB listing record
 */
export interface MarketplacePurchaseVerification {
  valid: boolean;
  reason?: string;
  buyer?: Address;
  seller?: Address;
  priceWei?: bigint;
  feeWei?: bigint;
  listingId?: string;
}

export async function verifyMarketplacePurchase(
  txHash: string,
  expectedListingIdHex: string, // bytes32 hex
  expectedBuyer: string,
  expectedPriceWei: bigint
): Promise<MarketplacePurchaseVerification> {
  if (!MARKETPLACE_ADDRESS) {
    return { valid: false, reason: "MARKETPLACE_ADDRESS not configured" };
  }
  if (!isEvmAddress(expectedBuyer)) {
    return { valid: false, reason: "invalid buyer address" };
  }
  let receipt;
  try {
    receipt = await fetchSuccessfulReceipt(txHash);
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }

  // Decode AgentSold from the receipt's own logs — see note on
  // verifyPackPurchase above about why we avoid the extra getLogs.
  const event = parseAbiItem(
    "event AgentSold(bytes32 indexed listingId, address indexed seller, address indexed buyer, uint256 price, uint256 fee)"
  );
  const decoded = parseEventLogs({
    abi: [event],
    logs: receipt.logs,
    eventName: "AgentSold",
  });
  const match = decoded.find(
    (l) => l.address.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase()
  );
  if (!match) {
    return { valid: false, reason: "AgentSold event not found in tx" };
  }
  const { listingId, seller, buyer, price, fee } = match.args;
  if (!listingId || listingId.toLowerCase() !== expectedListingIdHex.toLowerCase()) {
    return { valid: false, reason: "listingId mismatch" };
  }
  if (!buyer || buyer.toLowerCase() !== expectedBuyer.toLowerCase()) {
    return { valid: false, reason: "buyer mismatch" };
  }
  if (!price || price !== expectedPriceWei) {
    return {
      valid: false,
      reason: `price mismatch — paid ${price ?? 0n} wei, expected ${expectedPriceWei} wei`,
    };
  }
  return {
    valid: true,
    listingId,
    buyer: getAddress(buyer),
    seller: seller ? getAddress(seller) : undefined,
    priceWei: price,
    feeWei: fee ?? 0n,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Match entry verification
// ─────────────────────────────────────────────────────────────────────

/**
 * Confirms a player deposited the current entry fee into the escrow
 * for the given match slot. Both players go through this verifier
 * independently when they hit /join_queue.
 */
export interface MatchEntryVerification {
  valid: boolean;
  reason?: string;
  player?: Address;
  matchId?: string;
  slot?: number;
  amountWei?: bigint;
}

export async function verifyMatchEntry(
  txHash: string,
  expectedPlayer: string,
  expectedMatchIdHex: string,
  expectedSlot: number,
  expectedAmountWei: bigint = MATCH_ENTRY_FEE_WEI
): Promise<MatchEntryVerification> {
  if (!MATCH_ESCROW_ADDRESS) {
    return { valid: false, reason: "MATCH_ESCROW_ADDRESS not configured" };
  }
  if (!isEvmAddress(expectedPlayer)) {
    return { valid: false, reason: "invalid player address" };
  }
  let receipt;
  try {
    receipt = await fetchSuccessfulReceipt(txHash);
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }

  // Decode EntryDeposited from the receipt's own logs — see note on
  // verifyPackPurchase about why we avoid the extra getLogs.
  const event = parseAbiItem(
    "event EntryDeposited(bytes32 indexed matchId, uint8 indexed slot, address indexed player, uint256 amount)"
  );
  const decoded = parseEventLogs({
    abi: [event],
    logs: receipt.logs,
    eventName: "EntryDeposited",
  });
  const match = decoded.find(
    (l) => l.address.toLowerCase() === MATCH_ESCROW_ADDRESS.toLowerCase()
  );
  if (!match) {
    return { valid: false, reason: "EntryDeposited event not found in tx" };
  }
  const { matchId, slot, player, amount } = match.args;
  if (!matchId || matchId.toLowerCase() !== expectedMatchIdHex.toLowerCase()) {
    return { valid: false, reason: "matchId mismatch" };
  }
  if (Number(slot ?? 255) !== expectedSlot) {
    return { valid: false, reason: "slot mismatch" };
  }
  if (!player || player.toLowerCase() !== expectedPlayer.toLowerCase()) {
    return { valid: false, reason: "player mismatch" };
  }
  if (!amount || amount < expectedAmountWei) {
    return {
      valid: false,
      reason: `paid ${amount ?? 0n} wei, expected >= ${expectedAmountWei} wei`,
    };
  }
  return {
    valid: true,
    player: getAddress(player),
    matchId,
    slot: Number(slot),
    amountWei: amount,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Operator-side match settlement
// ─────────────────────────────────────────────────────────────────────

export interface PayoutResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Error strings that are either permanent (insufficient funds,
 * invalid address, contract revert) or already manual-compensate-
 * territory. Retrying these wastes time and masks the real issue in
 * logs, so we bail out immediately when we see them.
 */
const PERMANENT_ERROR_PATTERNS = [
  "insufficient funds",
  "insufficient balance",
  "invalid destination",
  "invalid beneficiary",
  "invalid address",
  "not configured",
  "execution reverted",
  "transaction reverted",
  "not authorized",
  "access control",
  "must hold",
];

function isPermanentError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return PERMANENT_ERROR_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Retry wrapper for treasury-signed operations. Settles transient
 * RPC issues (timeouts, brief "replacement transaction underpriced"
 * spikes from mempool-view lag, sequencer hiccups) without the
 * caller having to think about it. The NonceManager attached to the
 * wallet already protects against same-nonce collisions between two
 * distinct payouts — this retry is the last-mile fallback for when
 * a single tx submission itself flakes.
 *
 *  - Up to 3 attempts per operation
 *  - 1.5s → 3s backoff between attempts
 *  - Returns immediately on "permanent" errors (see patterns above)
 *  - Loud log on every retry so we can spot RPC degradations
 */
async function withRetry<T extends PayoutResult>(
  label: string,
  op: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastResult: T | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await op();
    if (result.success) {
      if (attempt > 1) {
        console.log(`[payout] ${label} succeeded on attempt ${attempt}`);
      }
      return result;
    }
    lastResult = result;
    const err = result.error ?? "unknown";
    if (isPermanentError(err)) {
      console.error(
        `[payout] ${label} failed with permanent error — not retrying: ${err}`
      );
      return result;
    }
    if (attempt < maxAttempts) {
      const backoff = 1500 * attempt; // 1.5s, 3s
      console.warn(
        `[payout] ${label} attempt ${attempt}/${maxAttempts} failed (${err.slice(0, 80)}) — retrying in ${backoff}ms`
      );
      await new Promise((r) => setTimeout(r, backoff));
    } else {
      console.error(
        `[payout] ${label} exhausted ${maxAttempts} attempts — last error: ${err}`
      );
    }
  }
  return lastResult!;
}

/** Pay the entire match pot to `winningSlot`. Called once, operator-
 *  signed. Wrapped in withRetry so transient RPC issues (timeout,
 *  mempool lag) don't strand a winner waiting on a one-off flake. */
export async function payoutWinner(
  matchIdHex: string,
  winningSlot: 0 | 1
): Promise<PayoutResult> {
  if (!MATCH_ESCROW_ADDRESS) {
    return { success: false, error: "MATCH_ESCROW_ADDRESS not configured" };
  }
  return withRetry(`payoutWinner match=${matchIdHex.slice(0, 10)}`, async () => {
    try {
      const wallet = requireWalletClient();
      const hash = await wallet.writeContract({
        chain: CHAIN,
        account: wallet.account,
        address: MATCH_ESCROW_ADDRESS,
        abi: AgentsCupMatchEscrowAbi,
        functionName: "payoutWinner",
        args: [matchIdHex as Hex, winningSlot],
      });
      await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      return { success: true, txHash: hash };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}

/** Refund both players (draw outcome). Retries on transient RPC
 *  errors; permanent errors (revert, insufficient funds) fail fast. */
export async function refundMatchDraw(
  matchIdHex: string
): Promise<PayoutResult> {
  if (!MATCH_ESCROW_ADDRESS) {
    return { success: false, error: "MATCH_ESCROW_ADDRESS not configured" };
  }
  return withRetry(`refundMatchDraw match=${matchIdHex.slice(0, 10)}`, async () => {
    try {
      const wallet = requireWalletClient();
      const hash = await wallet.writeContract({
        chain: CHAIN,
        account: wallet.account,
        address: MATCH_ESCROW_ADDRESS,
        abi: AgentsCupMatchEscrowAbi,
        functionName: "refundDraw",
        args: [matchIdHex as Hex],
      });
      await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      return { success: true, txHash: hash };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}

/**
 * Send native ETH from the treasury wallet to any address. Legacy —
 * retained for the ETH-era `compensateMissedTopUp` script but no
 * longer used in the V2 economy path. Keeping the export so historical
 * tooling still compiles.
 */
export async function transferEth(
  to: string,
  amountWei: bigint
): Promise<PayoutResult> {
  if (!isEvmAddress(to)) {
    return { success: false, error: "invalid destination" };
  }
  if (amountWei <= 0n) {
    return { success: false, error: "amountWei must be > 0" };
  }
  return withRetry(`transferEth ${to.slice(0, 10)} ${amountWei}wei`, async () => {
    try {
      const wallet = requireWalletClient();
      // Cast to `any` locally because viem's sendTransaction has the
      // same generic-depth inference problem writeContract does, and
      // we've already narrowed our wallet-client interface upstream.
      // Runtime behaviour is untouched.
      const hash = (await (wallet as unknown as {
        sendTransaction: (args: unknown) => Promise<Hash>;
      }).sendTransaction({
        account: wallet.account,
        chain: CHAIN,
        to: getAddress(to),
        value: amountWei,
      })) as Hash;
      await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      return { success: true, txHash: hash };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}

/**
 * Transfer $CUP from the treasury wallet to `to`. Used by bot-match
 * settlement — the "second player" in a bot match doesn't actually
 * deposit into the escrow, so when the human wins we have to top up
 * the prize pot from treasury CUP to match what a PvP pot would look
 * like (2× entry fee). Treasury must hold enough CUP — operations
 * docs the minimum balance in the `/health/treasury` endpoint.
 */
export async function transferCup(
  to: string,
  amountCupWei: bigint
): Promise<PayoutResult> {
  if (!CUP_TOKEN_ADDRESS) {
    return { success: false, error: "CUP_TOKEN_ADDRESS not configured" };
  }
  if (!isEvmAddress(to)) {
    return { success: false, error: "invalid destination" };
  }
  if (amountCupWei <= 0n) {
    return { success: false, error: "amountCupWei must be > 0" };
  }
  return withRetry(
    `transferCup ${to.slice(0, 10)} ${amountCupWei}CUPwei`,
    async () => {
      try {
        const wallet = requireWalletClient();
        const hash = await wallet.writeContract({
          account: wallet.account,
          chain: CHAIN,
          address: CUP_TOKEN_ADDRESS,
          abi: AgentsCupTokenAbi,
          functionName: "transfer",
          args: [getAddress(to), amountCupWei],
        });
        await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 30_000,
        });
        return { success: true, txHash: hash };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }
  );
}

/**
 * Reads a wallet's $CUP balance. Used by the `/health/treasury`
 * endpoint so ops can monitor how much CUP the treasury has for
 * bot-match top-ups.
 */
export async function readCupBalance(address: string): Promise<bigint> {
  if (!CUP_TOKEN_ADDRESS) return 0n;
  if (!isEvmAddress(address)) return 0n;
  try {
    const v = (await publicClient.readContract({
      address: CUP_TOKEN_ADDRESS,
      abi: AgentsCupTokenAbi,
      functionName: "balanceOf",
      args: [getAddress(address)],
    })) as bigint;
    return v;
  } catch {
    return 0n;
  }
}

/** Drain any funded slots to a beneficiary — emergency recovery +
 *  primary match settlement path (bot + PvP, win + draw). Wrapped
 *  in withRetry so a single RPC flake doesn't drop a payout. */
export async function forfeitMatch(
  matchIdHex: string,
  beneficiary: string
): Promise<PayoutResult> {
  if (!MATCH_ESCROW_ADDRESS) {
    return { success: false, error: "MATCH_ESCROW_ADDRESS not configured" };
  }
  if (!isEvmAddress(beneficiary)) {
    return { success: false, error: "invalid beneficiary" };
  }
  return withRetry(
    `forfeitMatch match=${matchIdHex.slice(0, 10)} → ${beneficiary.slice(0, 10)}`,
    async () => {
      try {
        const wallet = requireWalletClient();
        const hash = await wallet.writeContract({
          chain: CHAIN,
          account: wallet.account,
          address: MATCH_ESCROW_ADDRESS,
          abi: AgentsCupMatchEscrowAbi,
          functionName: "forfeitAll",
          args: [matchIdHex as Hex, getAddress(beneficiary)],
        });
        await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
        return { success: true, txHash: hash };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }
  );
}

// Re-export the three ABIs for any caller that needs to decode logs
// outside the helpers above (e.g. future event-watcher workers).
export {
  AgentsCupPackStoreAbi,
  AgentsCupMarketplaceAbi,
  AgentsCupMatchEscrowAbi,
};
