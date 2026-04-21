"use client";

import { useEffect, useMemo, useState } from "react";
import type { FounderCard as FounderCardT } from "@/lib/earlyAccess/cardGen";

interface Props {
  card: FounderCardT;
  /** Public, shareable URL for the card preview. */
  shareUrl: string;
  /** Called once the user has shared and confirmed. */
  onClaimed: (tweetUrl: string, walletAddress: string) => Promise<void>;
}

type Phase = "idle" | "posted" | "claiming" | "error";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Tight two-step share: tap a big button that opens X with the tweet
 * pre-filled, wait a few seconds for them to actually post it, then
 * paste the URL (or just confirm) to lock in the claim.
 *
 * Trust-based by default; the claim endpoint does an author-match on
 * the pasted URL. Once the Twitter API key lands, server will also
 * fetch the tweet and confirm the share URL is in the body.
 */
export default function ShareClaim({ card, shareUrl, onClaimed }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [tweetUrl, setTweetUrl] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number | null>(null);

  const intentUrl = useMemo(
    () => `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildText(card, shareUrl))}`,
    [card, shareUrl]
  );

  const walletValid = EVM_ADDRESS_RE.test(walletAddress.trim());

  // Gentle cooldown after the user clicks "Open X" — keeps them from
  // hitting "Claim" before the tweet is actually up.
  useEffect(() => {
    if (cooldown == null) return;
    if (cooldown <= 0) {
      setCooldown(null);
      return;
    }
    const t = setTimeout(() => setCooldown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function openX() {
    window.open(intentUrl, "_blank", "noopener,noreferrer");
    setPhase("posted");
    setCooldown(6);
  }

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUrl = tweetUrl.trim();
    const trimmedWallet = walletAddress.trim();
    if (trimmedUrl && !isTweetUrl(trimmedUrl)) {
      setError("That doesn't look like a tweet URL.");
      return;
    }
    if (!EVM_ADDRESS_RE.test(trimmedWallet)) {
      setError("Enter a valid EVM address (0x… 42 characters).");
      return;
    }
    setError(null);
    setPhase("claiming");
    try {
      await onClaimed(trimmedUrl, trimmedWallet.toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
      setPhase("posted");
    }
  }

  return (
    <div className="max-w-md mx-auto w-full animate-[fade-up_0.4s_ease-out]">
      <div
        className="p-6 sm:p-8"
        style={{
          background: "linear-gradient(180deg, #0f2a0f 0%, #0a1e0a 100%)",
          border: "3px solid #1E8F4E",
          boxShadow:
            "inset -3px -3px 0 #0B6623, inset 3px 3px 0 #2eb060, 6px 6px 0 rgba(0,0,0,0.5)",
        }}
      >
        <h2
          className="font-pixel text-[10px] sm:text-xs text-white text-center mb-2 tracking-wider"
          style={{ textShadow: "2px 2px 0 #0B6623" }}
        >
          SHARE TO CLAIM YOUR SPOT
        </h2>
        <p className="text-[12px] sm:text-sm text-white/60 text-center mb-6 leading-relaxed">
          Post your card on X and you&apos;re in. Takes 15 seconds.
        </p>

        <button
          onClick={openX}
          className="group w-full relative overflow-hidden font-pixel text-[10px] sm:text-[11px] tracking-[0.25em]"
          style={{
            padding: "16px 20px",
            background: "linear-gradient(180deg, #1DA1F2 0%, #0d7dc0 100%)",
            color: "#fff",
            border: "3px solid #7fcfff",
            boxShadow:
              "inset -3px -3px 0 #004870, inset 3px 3px 0 #7fcfff, 4px 4px 0 rgba(0,0,0,0.6)",
            textShadow: "1px 1px 0 #004870",
          }}
        >
          <span
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background:
                "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)",
              backgroundSize: "200% 200%",
              animation: "shine 1.2s linear infinite",
            }}
          />
          <span className="relative">
            {phase === "idle" ? "POST ON X ↗" : "REOPEN X ↗"}
          </span>
        </button>

        {phase !== "idle" && (
          <form onSubmit={claim} className="mt-5 space-y-3 animate-[fade-up_0.3s_ease-out]">
            <label className="block">
              <span className="font-pixel text-[7px] text-white/60 tracking-wider block mb-2">
                TWEET URL
              </span>
              <input
                type="url"
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                placeholder="https://x.com/you/status/…"
                className="w-full font-pixel text-[10px] px-3 py-2 outline-none"
                style={{
                  background: "#000",
                  border: "2px solid #1E8F4E",
                  color: "#fff",
                  imageRendering: "pixelated",
                }}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <label className="block">
              <span className="font-pixel text-[7px] text-white/60 tracking-wider block mb-2">
                EVM WALLET (FOR AIRDROP) <span style={{ color: "#FFD700" }}>*</span>
              </span>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="w-full font-mono text-[11px] px-3 py-2 outline-none"
                style={{
                  background: "#000",
                  border: `2px solid ${
                    walletAddress.length === 0
                      ? "#1E8F4E"
                      : walletValid
                      ? "#FFD700"
                      : "#FF3B3B"
                  }`,
                  color: "#fff",
                  imageRendering: "pixelated",
                }}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={42}
              />
              <span className="font-pixel text-[6px] text-white/40 tracking-wider mt-1 block">
                {walletAddress.length === 0
                  ? "BASE / ETH ADDRESS — REQUIRED FOR AIRDROP"
                  : walletValid
                  ? "✓ VALID ADDRESS"
                  : `${walletAddress.length}/42 — MUST START WITH 0x`}
              </span>
            </label>

            {error && (
              <div className="font-pixel text-[8px] text-red-400 tracking-wider">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={phase === "claiming" || cooldown !== null || !walletValid}
              className="w-full pixel-btn-outline text-[9px] py-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {phase === "claiming"
                ? "CLAIMING…"
                : cooldown != null
                ? `WAIT ${cooldown}S…`
                : !walletValid
                ? "ENTER WALLET TO CLAIM"
                : "I POSTED IT — CLAIM"}
            </button>
          </form>
        )}
      </div>

      <style jsx>{`
        @keyframes shine {
          0%   { background-position: 200% 200%; }
          100% { background-position: -200% -200%; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function buildText(
  card: { rarity: string; overall: number },
  url: string
): string {
  return [
    `I just pulled a ${card.rarity} Founder Card (OVR ${card.overall}) for @agentscup 🏆`,
    "",
    "Claim yours on @base 👇",
    url,
  ].join("\n");
}

function isTweetUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^/]+\/status\/\d+/.test(url);
}
