"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

/**
 * /airdrop-apply — supplementary airdrop submission form.
 *
 *   - Users connect their Base-compatible wallet
 *   - Optionally add their X handle
 *   - Submit → backend upserts into airdrop_applications
 *   - At distribution time, each unique submitter gets 150,000 CUP
 *     via a new MerkleDistributor (gated behind the paid claim router).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export default function AirdropApplyPage() {
  const { address, isConnected } = useAccount();
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  // Fetch application counter for social proof
  useEffect(() => {
    fetch(`${API_BASE}/airdrop/stats`)
      .then((r) => r.json())
      .then((d) => setTotal(typeof d.total === "number" ? d.total : null))
      .catch(() => setTotal(null));
  }, [success]);

  async function submit() {
    if (!address) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/airdrop/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          x_handle: handle.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0d6b8] py-20 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-pixel text-2xl mb-2 tracking-wider text-[#FFD700]">
          $CUP BONUS AIRDROP
        </h1>
        <p className="text-xs text-[#e0d6b8]/60 mb-8">
          Missed the main snapshot? Apply here for the supplementary round.
          <br />
          Each approved wallet receives <span className="text-[#FFD700] font-bold">150,000 CUP</span>.
        </p>

        {total !== null && (
          <div className="mb-6 text-[10px] text-[#e0d6b8]/50 font-pixel tracking-wider">
            {total.toLocaleString()} APPLICATIONS SUBMITTED
          </div>
        )}

        {!isConnected && (
          <div
            className="p-6"
            style={{
              background: "linear-gradient(180deg, #1a1a1a 0%, #111 100%)",
              border: "3px solid #FFD700",
            }}
          >
            <p className="text-sm mb-4">Connect your Base wallet to apply.</p>
            <ConnectButton />
          </div>
        )}

        {isConnected && !success && (
          <div
            className="p-6 space-y-4"
            style={{
              background: "linear-gradient(180deg, #1a1a1a 0%, #111 100%)",
              border: "3px solid #FFD700",
              boxShadow: "inset 3px 3px 0 #FFD70060, 6px 6px 0 rgba(0,0,0,0.5)",
            }}
          >
            <div>
              <div className="font-pixel text-[9px] text-[#e0d6b8]/50 tracking-wider mb-1">
                WALLET
              </div>
              <div className="font-mono text-xs text-white break-all">{address}</div>
            </div>

            <div>
              <div className="font-pixel text-[9px] text-[#e0d6b8]/50 tracking-wider mb-1">
                X HANDLE (OPTIONAL)
              </div>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
                placeholder="username"
                maxLength={15}
                className="w-full bg-black/50 border-2 border-[#FFD700]/40 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFD700]"
              />
              <p className="text-[10px] text-[#e0d6b8]/40 mt-1">
                Lets us verify you&apos;re the real replier on the airdrop tweet.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500 text-red-400 text-xs">
                {error === "invalid_address"
                  ? "Wallet not valid."
                  : error === "invalid_handle"
                  ? "X handle must be 1-15 chars (letters/digits/underscore)."
                  : `Error: ${error}`}
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting}
              className="pixel-btn w-full text-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "SUBMITTING..." : "APPLY FOR 150,000 CUP"}
            </button>

            <p className="text-[10px] text-[#e0d6b8]/40">
              Duplicate addresses are filtered. Bots / sybils excluded at
              distribution time.
            </p>
          </div>
        )}

        {isConnected && success && (
          <div
            className="p-6 text-center"
            style={{
              background: "linear-gradient(180deg, #1a2a1a 0%, #0a1a0a 100%)",
              border: "3px solid #00ff41",
              boxShadow: "inset 3px 3px 0 #00ff4160, 6px 6px 0 rgba(0,0,0,0.5)",
            }}
          >
            <div className="font-pixel text-2xl text-[#00ff41] mb-4">✓ SUBMITTED</div>
            <p className="text-xs text-[#e0d6b8]/80 mb-2">
              <span className="text-[#FFD700] font-bold">150,000 CUP</span> will be
              allocated to this wallet if it passes the sybil check at
              distribution time.
            </p>
            <p className="text-[10px] text-[#e0d6b8]/50">
              You can check <a href="/claim" className="underline">/claim</a> after
              distribution is announced.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
