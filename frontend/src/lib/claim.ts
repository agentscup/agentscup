"use client";

/**
 * Client-side helpers for the /claim flow. Thin wrappers over wagmi's
 * imperative actions + the CupClaimRouter contract.
 */

import {
  writeContract,
  waitForTransactionReceipt,
  readContract,
  switchChain,
  getChainId,
} from "wagmi/actions";
import { base } from "wagmi/chains";
import type { Hash } from "viem";
import { wagmiConfig } from "./wagmi";
import CupClaimRouterAbi from "@/abi/CupClaimRouter.json";

export const CLAIM_ROUTER_ADDRESS = (process.env.NEXT_PUBLIC_CLAIM_ROUTER_ADDRESS ??
  "0x13087c212f2b8253b761fE91d8281bD48EE48C24") as `0x${string}`;

export type ClaimEligibility = {
  main?: { amount: string; proof: `0x${string}`[] };
  bonus?: { amount: string; proof: `0x${string}`[] };
};

export type ClaimStatus = {
  mainClaimed: boolean;
  bonusClaimed: boolean;
};

let proofsCache: Record<string, ClaimEligibility> | null = null;

/** Lazy-load combined proofs from /public (served statically by Next). */
export async function loadProofs(): Promise<Record<string, ClaimEligibility>> {
  if (proofsCache) return proofsCache;
  const res = await fetch("/claim-proofs.json", { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load claim proofs (${res.status})`);
  proofsCache = (await res.json()) as Record<string, ClaimEligibility>;
  return proofsCache;
}

export async function lookupEligibility(
  address: string
): Promise<ClaimEligibility | null> {
  const proofs = await loadProofs();
  return proofs[address.toLowerCase()] ?? null;
}

export async function readClaimFee(): Promise<bigint> {
  const fee = (await readContract(wagmiConfig, {
    address: CLAIM_ROUTER_ADDRESS,
    abi: CupClaimRouterAbi,
    functionName: "claimFeeWei",
    chainId: base.id,
  })) as bigint;
  return fee;
}

export async function readClaimStatus(user: string): Promise<ClaimStatus> {
  const [mainClaimed, bonusClaimed] = (await readContract(wagmiConfig, {
    address: CLAIM_ROUTER_ADDRESS,
    abi: CupClaimRouterAbi,
    functionName: "claimStatus",
    args: [user as `0x${string}`],
    chainId: base.id,
  })) as [boolean, boolean];
  return { mainClaimed, bonusClaimed };
}

async function ensureBase(): Promise<void> {
  if (getChainId(wagmiConfig) === base.id) return;
  try {
    await switchChain(wagmiConfig, { chainId: base.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/user rejected|user denied/i.test(msg)) {
      throw new Error("Please approve the network switch to Base in your wallet.");
    }
    console.warn("[claim] switchChain soft-failed, continuing:", msg);
  }
}

export async function submitClaim(
  eligibility: ClaimEligibility,
  feeWei: bigint
): Promise<Hash> {
  await ensureBase();

  const mainAmount = eligibility.main ? BigInt(eligibility.main.amount) : 0n;
  const mainProof: `0x${string}`[] = eligibility.main?.proof ?? [];
  const bonusAmount = eligibility.bonus ? BigInt(eligibility.bonus.amount) : 0n;
  const bonusProof: `0x${string}`[] = eligibility.bonus?.proof ?? [];

  const hash = await writeContract(wagmiConfig, {
    address: CLAIM_ROUTER_ADDRESS,
    abi: CupClaimRouterAbi,
    functionName: "claim",
    args: [mainAmount, mainProof, bonusAmount, bonusProof],
    value: feeWei,
    chainId: base.id,
  });
  await waitForTransactionReceipt(wagmiConfig, {
    chainId: base.id,
    hash,
    timeout: 90_000,
  });
  return hash;
}

/** Format a wei amount as a human-readable CUP string (no decimals). */
export function formatCup(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  return whole.toLocaleString("en-US");
}
