"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useBalance } from "wagmi";
import { base } from "wagmi/chains";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  CLAIM_ROUTER_ADDRESS,
  formatCup,
  lookupEligibility,
  readClaimFee,
  readClaimStatus,
  submitClaim,
  type ClaimEligibility,
  type ClaimStatus,
} from "@/lib/claim";

/**
 * Feature flag — when `NEXT_PUBLIC_CLAIM_LIVE` is anything other than
 * the string "true", the page renders a "goes live tomorrow" teaser
 * instead of the functional claim UI. Used to keep the router
 * contract deployed but gate user access until ops is ready to open
 * the window. Flip the env var (or hard-code the constant below) and
 * redeploy when the claim should open.
 */
const CLAIM_LIVE = process.env.NEXT_PUBLIC_CLAIM_LIVE === "true";

function ClaimComingSoon() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0d6b8] py-20 px-6 flex items-start justify-center">
      <div className="max-w-xl w-full text-center">
        <h1
          className="font-pixel text-2xl sm:text-3xl mb-4 tracking-wider text-[#FFD700]"
          style={{ textShadow: "3px 3px 0 rgba(139,113,0,0.6)" }}
        >
          $CUP AIRDROP
        </h1>
        <div
          className="p-8 sm:p-10"
          style={{
            background: "linear-gradient(180deg, #1a1400 0%, #0f0a00 100%)",
            border: "3px solid #FFD700",
            boxShadow:
              "inset 3px 3px 0 rgba(255,244,176,0.3), inset -3px -3px 0 rgba(139,113,0,0.4), 6px 6px 0 rgba(0,0,0,0.5)",
          }}
        >
          <div
            className="font-pixel text-[10px] text-[#FFD700]/70 tracking-[0.3em] mb-3"
          >
            COMING SOON
          </div>
          <div
            className="font-pixel text-xl sm:text-2xl text-[#FFD700] mb-4 tracking-wider"
            style={{ textShadow: "2px 2px 0 rgba(139,113,0,0.8)" }}
          >
            GOES LIVE TODAY
          </div>
          <p className="text-sm text-[#e0d6b8]/80 leading-relaxed mb-4">
            The $CUP claim window opens today. Check back shortly to pull your
            airdrop allocation into your wallet.
          </p>
          <p className="text-[11px] text-[#e0d6b8]/50 leading-relaxed">
            Already eligible? Your allocation is locked in on-chain — nothing to
            do until claiming opens.
          </p>
        </div>
        <p className="mt-6 text-[10px] text-[#e0d6b8]/40 font-pixel tracking-wider">
          FOLLOW @AGENTSCUP FOR THE GO-LIVE ANNOUNCEMENT
        </p>
      </div>
    </div>
  );
}

export default function ClaimPage() {
  if (!CLAIM_LIVE) {
    return <ClaimComingSoon />;
  }
  return <ClaimPageInner />;
}

function ClaimPageInner() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: ethBal } = useBalance({ address, chainId: base.id });

  const [eligibility, setEligibility] = useState<ClaimEligibility | null>(null);
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [feeWei, setFeeWei] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ txHash: string } | null>(null);

  // Load fee once, independent of wallet.
  useEffect(() => {
    readClaimFee().then(setFeeWei).catch((e) => console.warn("fee load", e));
  }, []);

  // On wallet connect, look up eligibility + claimed status.
  useEffect(() => {
    if (!address) {
      setEligibility(null);
      setStatus(null);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      lookupEligibility(address),
      readClaimStatus(address).catch((e) => {
        console.warn("status load", e);
        return null;
      }),
    ])
      .then(([e, s]) => {
        setEligibility(e);
        setStatus(s);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [address]);

  const mainAmount = eligibility?.main ? BigInt(eligibility.main.amount) : 0n;
  const bonusAmount = eligibility?.bonus ? BigInt(eligibility.bonus.amount) : 0n;
  const totalAmount = mainAmount + bonusAmount;

  const mainClaimed = status?.mainClaimed ?? false;
  const bonusClaimed = status?.bonusClaimed ?? false;

  const mainAvailable = mainAmount > 0n && !mainClaimed;
  const bonusAvailable = bonusAmount > 0n && !bonusClaimed;
  const anythingToClaim = mainAvailable || bonusAvailable;
  const allClaimed =
    (mainAmount > 0n ? mainClaimed : true) &&
    (bonusAmount > 0n ? bonusClaimed : true) &&
    (mainAmount > 0n || bonusAmount > 0n);

  const feeEth = feeWei ? Number(feeWei) / 1e18 : 0;
  const hasEnoughEth =
    ethBal && feeWei ? ethBal.value >= feeWei + 100_000_000_000_000n : true; // +0.0001 ETH gas buffer

  const wrongNetwork = isConnected && chainId !== base.id;

  const onClaim = useCallback(async () => {
    if (!eligibility || !feeWei) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const effective: ClaimEligibility = {
        main: mainAvailable ? eligibility.main : undefined,
        bonus: bonusAvailable ? eligibility.bonus : undefined,
      };
      const hash = await submitClaim(effective, feeWei);
      setSuccess({ txHash: hash });
      // Re-fetch status
      if (address) {
        const s = await readClaimStatus(address).catch(() => null);
        setStatus(s);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      let friendly = msg;
      if (/user rejected|user denied/i.test(msg)) friendly = "Transaction rejected in wallet.";
      else if (/insufficient funds/i.test(msg)) friendly = "Not enough ETH for the $1 fee + gas.";
      else if (/FeeTooLow/i.test(msg)) friendly = "Fee too low — refresh and retry.";
      else if (/AlreadyClaimed/i.test(msg)) friendly = "Already claimed.";
      else if (/InvalidProof/i.test(msg)) friendly = "Proof invalid — contact support.";
      setError(friendly);
    } finally {
      setSubmitting(false);
    }
  }, [eligibility, feeWei, mainAvailable, bonusAvailable, address]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0d6b8] py-20 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-pixel text-2xl mb-2 tracking-wider text-[#FFD700]">$CUP AIRDROP</h1>
        <p className="text-xs text-[#e0d6b8]/60 mb-8">
          Claim your $CUP tokens on Base. 1 tx, $1 fee — tokens land in your wallet.
        </p>

        {!isConnected && (
          <div
            className="p-6"
            style={{
              background: "linear-gradient(180deg, #1a1a1a 0%, #111 100%)",
              border: "3px solid #FFD700",
              boxShadow: "inset 3px 3px 0 #FFD70060, 6px 6px 0 rgba(0,0,0,0.5)",
            }}
          >
            <p className="text-sm mb-4">Connect your wallet to check eligibility.</p>
            <ConnectButton />
          </div>
        )}

        {isConnected && wrongNetwork && (
          <div className="p-4 mb-4 border-2 border-red-500 bg-red-500/10">
            <p className="font-pixel text-[10px] text-red-400">
              WRONG NETWORK — SWITCH TO BASE TO CLAIM
            </p>
          </div>
        )}

        {isConnected && loading && (
          <p className="font-pixel text-[10px] text-[#e0d6b8]/60">Checking eligibility...</p>
        )}

        {isConnected && !loading && eligibility === null && (
          <div
            className="p-6"
            style={{
              background: "linear-gradient(180deg, #1a1a1a 0%, #111 100%)",
              border: "3px solid #444",
            }}
          >
            <p className="font-pixel text-sm mb-2">NOT ELIGIBLE</p>
            <p className="text-xs text-[#e0d6b8]/60">
              This wallet is not in the $CUP airdrop. The snapshot was taken on 2026-04-22
              from early-access signups, top Base traders, and active Farcaster users with
              verified Base wallets and $100+ balance.
            </p>
            <p className="text-xs text-[#e0d6b8]/60 mt-4">
              Try another wallet or check back for future rounds.
            </p>
          </div>
        )}

        {isConnected && !loading && eligibility !== null && (
          <div className="space-y-4">
            <div
              className="p-6"
              style={{
                background: "linear-gradient(180deg, #1a1a1a 0%, #111 100%)",
                border: "3px solid #FFD700",
                boxShadow: "inset 3px 3px 0 #FFD70060, 6px 6px 0 rgba(0,0,0,0.5)",
              }}
            >
              <div className="mb-4">
                <div className="font-pixel text-[9px] text-[#e0d6b8]/50 tracking-wider mb-1">
                  ALLOCATION
                </div>
                <div className="font-pixel text-3xl text-[#FFD700]">
                  {formatCup(totalAmount)} CUP
                </div>
              </div>

              <div className="space-y-2 text-[11px] mb-6">
                {mainAmount > 0n && (
                  <div className="flex justify-between py-1 border-b border-[#FFD700]/20">
                    <span className="text-[#e0d6b8]/70">Main airdrop</span>
                    <span className={mainClaimed ? "text-green-400" : "text-[#FFD700]"}>
                      {formatCup(mainAmount)} CUP {mainClaimed ? "✓ claimed" : ""}
                    </span>
                  </div>
                )}
                {bonusAmount > 0n && (
                  <div className="flex justify-between py-1 border-b border-[#FFD700]/20">
                    <span className="text-[#e0d6b8]/70">Early-access bonus</span>
                    <span className={bonusClaimed ? "text-green-400" : "text-[#FFD700]"}>
                      {formatCup(bonusAmount)} CUP {bonusClaimed ? "✓ claimed" : ""}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-[#FFD700]/20">
                  <span className="text-[#e0d6b8]/70">Claim fee</span>
                  <span>~$1 ({feeEth.toFixed(4)} ETH)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#e0d6b8]/70">Your ETH balance</span>
                  <span className={hasEnoughEth ? "" : "text-red-400"}>
                    {ethBal ? Number(ethBal.formatted).toFixed(5) : "..."} ETH
                  </span>
                </div>
              </div>

              {allClaimed && (
                <div className="p-3 bg-green-500/10 border border-green-500 text-green-400 text-xs mb-4">
                  All allocations claimed. Check your wallet for $CUP.
                </div>
              )}

              {!allClaimed && !hasEnoughEth && (
                <div className="p-3 bg-red-500/10 border border-red-500 text-red-400 text-xs mb-4">
                  Insufficient ETH. Top up your wallet on Base with at least{" "}
                  {(feeEth + 0.0001).toFixed(4)} ETH.
                </div>
              )}

              {success && (
                <div className="p-3 bg-green-500/10 border border-green-500 text-green-400 text-xs mb-4 break-all">
                  Claim confirmed.{" "}
                  <a
                    href={`https://basescan.org/tx/${success.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    View tx
                  </a>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500 text-red-400 text-xs mb-4">
                  {error}
                </div>
              )}

              <button
                onClick={onClaim}
                disabled={
                  submitting || !anythingToClaim || wrongNetwork || !hasEnoughEth || !feeWei
                }
                className="pixel-btn w-full text-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting
                  ? "CLAIMING..."
                  : allClaimed
                  ? "ALL CLAIMED"
                  : wrongNetwork
                  ? "SWITCH TO BASE"
                  : !hasEnoughEth
                  ? "TOP UP ETH"
                  : `CLAIM ${formatCup(
                      (mainAvailable ? mainAmount : 0n) + (bonusAvailable ? bonusAmount : 0n)
                    )} CUP FOR $1`}
              </button>
            </div>

            <div className="text-[10px] text-[#e0d6b8]/40 text-center space-y-1">
              <p>
                Router:{" "}
                <a
                  href={`https://basescan.org/address/${CLAIM_ROUTER_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {CLAIM_ROUTER_ADDRESS.slice(0, 10)}...{CLAIM_ROUTER_ADDRESS.slice(-4)}
                </a>
              </p>
              <p>Claim window closes 2026-07-21.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
