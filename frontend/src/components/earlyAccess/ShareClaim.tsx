"use client";

import { useMemo, useState } from "react";
import type { FounderCard as FounderCardT } from "@/lib/earlyAccess/cardGen";

interface Props {
  card: FounderCardT;
  /** Public, shareable URL that renders the card with OG meta. */
  shareUrl: string;
  /** Called after the user confirms they've shared. */
  onClaimed: (tweetUrl: string) => Promise<void>;
}

/**
 * Post-reveal screen. Pushes the user to X via the web intent, then
 * collects the resulting tweet URL for trust-based claim verification.
 *
 * Upgrade path: once the backend has a Twitter API bearer token,
 * replace `onClaimed` with a server-side lookup that confirms the
 * tweet exists, was posted by the authenticated user, and contains
 * the share URL.
 */
export default function ShareClaim({ card, shareUrl, onClaimed }: Props) {
  const [tweetUrl, setTweetUrl] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const intentUrl = useMemo(() => {
    const text = buildShareText(card, shareUrl);
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  }, [card, shareUrl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = tweetUrl.trim();
    if (!isLikelyTweetUrl(clean)) {
      setError("That doesn't look like a tweet URL.");
      return;
    }
    setError(null);
    setClaiming(true);
    try {
      await onClaimed(clean);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto w-full text-center">
        <div
          className="inline-block px-4 py-2 mb-6 font-pixel text-[10px] tracking-[0.3em]"
          style={{
            background: "#1a1200",
            color: "#FFD700",
            border: "2px solid #FFD700",
            boxShadow:
              "inset -2px -2px 0 #8a6f00, inset 2px 2px 0 #FFF4B0, 3px 3px 0 rgba(0,0,0,0.5)",
          }}
        >
          ✓ SPOT RESERVED
        </div>
        <p className="text-[12px] sm:text-sm text-white/70 leading-relaxed">
          Your card is claimed. We&apos;ll ping your @{card.handle} on X
          when Agents Cup goes live on Base.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto w-full">
      <div
        className="p-6 sm:p-8"
        style={{
          background: "linear-gradient(180deg, #0f2a0f 0%, #0a1e0a 100%)",
          border: "3px solid #1E8F4E",
          boxShadow:
            "inset -3px -3px 0 #0B6623, inset 3px 3px 0 #2eb060, 6px 6px 0 rgba(0,0,0,0.5)",
        }}
      >
        <h2 className="font-pixel text-[10px] sm:text-xs text-white text-center mb-3 tracking-wider"
          style={{ textShadow: "2px 2px 0 #0B6623" }}
        >
          STEP 2 — SHARE TO CLAIM
        </h2>
        <p className="text-[11px] sm:text-sm text-white/60 text-center mb-6 leading-relaxed">
          Post your card on X. Once it&apos;s live, paste the tweet URL
          below and your spot is locked in.
        </p>

        <a
          href={intentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center pixel-btn text-[10px] py-3 mb-4"
        >
          OPEN X TO POST ↗
        </a>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="font-pixel text-[7px] text-white/60 tracking-wider block mb-2">
              PASTE TWEET URL
            </span>
            <input
              type="url"
              value={tweetUrl}
              onChange={(e) => setTweetUrl(e.target.value)}
              placeholder="https://x.com/yourhandle/status/..."
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

          {error && (
            <div className="font-pixel text-[8px] text-red-400 tracking-wider">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={claiming}
            className="w-full pixel-btn-outline text-[9px] py-3 disabled:opacity-40"
          >
            {claiming ? "CLAIMING…" : "CLAIM EARLY ACCESS"}
          </button>
        </form>
      </div>
    </div>
  );
}

function buildShareText(card: { rarity: string; overall: number; handle: string }, url: string) {
  const lines = [
    `I just pulled a ${card.rarity} Founder Card (OVR ${card.overall}) for @AgentsCup on @base.`,
    "",
    "Claim yours — early access is open:",
    url,
  ];
  return lines.join("\n");
}

function isLikelyTweetUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^/]+\/status\/\d+/.test(url);
}
