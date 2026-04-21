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
    <div className="max-w-[440px] mx-auto w-full animate-[fade-up_500ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div
        className="p-7 sm:p-8"
        style={{
          background: "rgba(10,30,10,0.5)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(46,176,96,0.25)",
          borderRadius: "2px",
        }}
      >
        <div className="text-center mb-7">
          <div className="font-pixel text-[7px] text-[#7fc878]/70 tracking-[0.45em] mb-3">
            STEP TWO
          </div>
          <h2
            className="font-pixel text-sm sm:text-base text-white tracking-[0.1em] mb-2"
            style={{ textShadow: "2px 2px 0 #0B6623" }}
          >
            SHARE TO CLAIM
          </h2>
          <p className="text-[12px] text-white/45 leading-relaxed">
            Post your card on X, paste the link, drop your wallet.
          </p>
        </div>

        <button
          onClick={openX}
          className="group w-full relative overflow-hidden font-pixel text-[10px] tracking-[0.35em] transition-transform duration-200"
          style={{
            padding: "16px 20px",
            background: "#000",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "2px",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(2px)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
        >
          <span
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background:
                "linear-gradient(120deg, transparent 35%, rgba(255,255,255,0.08) 50%, transparent 65%)",
              backgroundSize: "250% 250%",
              animation: "shine 1.6s linear infinite",
            }}
          />
          <span className="relative inline-flex items-center justify-center gap-3">
            {phase === "idle" ? (
              <>
                <XGlyph />
                POST ON X
              </>
            ) : (
              <>
                <XGlyph />
                REOPEN X
              </>
            )}
          </span>
        </button>

        {phase !== "idle" && (
          <form
            onSubmit={claim}
            className="mt-6 space-y-4 animate-[fade-up_400ms_cubic-bezier(0.16,1,0.3,1)_both]"
          >
            <FieldLabel
              label="Tweet URL"
              hint="Paste the link to your shared post"
            >
              <input
                type="url"
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                placeholder="https://x.com/you/status/…"
                className="w-full font-mono text-[11px] px-3.5 py-2.5 outline-none transition-colors duration-200"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "2px",
                  color: "#fff",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(46,176,96,0.5)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")
                }
                autoComplete="off"
                spellCheck={false}
              />
            </FieldLabel>

            <FieldLabel
              label={
                <>
                  EVM Wallet{" "}
                  <span className="text-[#FFD700]/70">— for airdrop</span>
                </>
              }
              hint={
                walletAddress.length === 0
                  ? "Base or Ethereum address (0x…)"
                  : walletValid
                  ? "✓ Valid address"
                  : `${walletAddress.length}/42 characters`
              }
              hintColor={
                walletAddress.length === 0
                  ? undefined
                  : walletValid
                  ? "#7fc878"
                  : "#ff7b7b"
              }
            >
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="w-full font-mono text-[12px] px-3.5 py-2.5 outline-none transition-colors duration-200"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: `1px solid ${
                    walletAddress.length === 0
                      ? "rgba(255,255,255,0.1)"
                      : walletValid
                      ? "rgba(255,215,0,0.5)"
                      : "rgba(255,80,80,0.5)"
                  }`,
                  borderRadius: "2px",
                  color: "#fff",
                }}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={42}
              />
            </FieldLabel>

            {error && (
              <div
                className="font-pixel text-[8px] text-[#ff7b7b] tracking-[0.15em] px-3 py-2"
                style={{
                  background: "rgba(255,80,80,0.08)",
                  borderLeft: "2px solid #ff7b7b",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={phase === "claiming" || cooldown !== null || !walletValid}
              className="w-full pixel-btn text-[10px] py-3.5 tracking-[0.4em] disabled:opacity-30 disabled:cursor-not-allowed transition-opacity duration-300"
            >
              {phase === "claiming"
                ? "CLAIMING…"
                : cooldown != null
                ? `WAIT ${cooldown}S`
                : !walletValid
                ? "ENTER WALLET TO CLAIM"
                : "CLAIM EARLY ACCESS"}
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

// ─────────────────────────────────────────────────────────────────────
// Form helpers
// ─────────────────────────────────────────────────────────────────────

function FieldLabel({
  label,
  hint,
  hintColor,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  hintColor?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-pixel text-[7px] text-white/45 tracking-[0.3em] block mb-2">
        {label}
      </span>
      {children}
      {hint && (
        <span
          className="font-pixel text-[6px] tracking-[0.2em] mt-1.5 block transition-colors duration-200"
          style={{ color: hintColor ?? "rgba(255,255,255,0.3)" }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function XGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
