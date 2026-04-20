"use client";

import { useState } from "react";
import type { XSignals } from "@/lib/earlyAccess/cardGen";

interface Props {
  onConnect: (signals: XSignals) => void;
}

/**
 * Placeholder auth surface. Ships a handle-input form until the real
 * Twitter OAuth route lands at `/api/auth/[...nextauth]`. The form
 * fakes the Base signals (follow, bio, tweets) with checkboxes so the
 * reveal flow can be demoed end-to-end before real API keys arrive.
 *
 * Once OAuth is wired, replace this whole surface with a single
 * "Connect with X" button that calls `signIn("twitter")`.
 */
export default function ConnectX({ onConnect }: Props) {
  const [handle, setHandle] = useState("");
  const [followsBase, setFollowsBase] = useState(false);
  const [bioMentionsBase, setBioMentionsBase] = useState(false);
  const [baseTweetHits, setBaseTweetHits] = useState(0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = handle.trim().replace(/^@/, "").toLowerCase();
    if (!clean) return;

    onConnect({
      handle: clean,
      displayName: clean,
      avatarUrl: `https://unavatar.io/twitter/${encodeURIComponent(clean)}`,
      followerCount: 500, // mock
      accountAgeDays: 800, // mock
      followsBase,
      bioMentionsBase,
      baseTweetHits,
    });
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
        <h2 className="font-pixel text-[10px] sm:text-xs text-white text-center mb-2 tracking-wider"
          style={{ textShadow: "2px 2px 0 #0B6623" }}
        >
          CLAIM YOUR FOUNDER CARD
        </h2>
        <p className="text-[11px] sm:text-sm text-white/60 text-center mb-6 leading-relaxed">
          Connect with X to reveal a one-of-one card minted from your
          handle. Base engagement boosts your rarity.
        </p>

        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="font-pixel text-[7px] text-white/60 tracking-wider block mb-2">
              X HANDLE
            </span>
            <div className="flex">
              <span
                className="font-pixel text-[10px] px-3 flex items-center"
                style={{
                  background: "#000",
                  border: "2px solid #1E8F4E",
                  borderRight: "none",
                  color: "#2eb060",
                }}
              >
                @
              </span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="yourhandle"
                className="flex-1 font-pixel text-[11px] px-3 py-2 outline-none"
                style={{
                  background: "#000",
                  border: "2px solid #1E8F4E",
                  color: "#fff",
                  imageRendering: "pixelated",
                }}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </label>

          {/* Mock-only Base signal toggles — invisible once OAuth is wired */}
          <div
            className="p-3 space-y-2"
            style={{
              background: "rgba(0,0,0,0.4)",
              border: "1px dashed #FFD70055",
            }}
          >
            <div className="font-pixel text-[6px] text-[#FFD700] tracking-[0.2em] mb-2">
              PREVIEW — MOCK BASE SIGNALS
            </div>
            <Toggle label="Follows @base" value={followsBase} onChange={setFollowsBase} />
            <Toggle label="Bio mentions Base" value={bioMentionsBase} onChange={setBioMentionsBase} />
            <label className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-white/80">Base tweets (0-10)</span>
              <input
                type="number"
                min={0}
                max={10}
                value={baseTweetHits}
                onChange={(e) =>
                  setBaseTweetHits(Math.max(0, Math.min(10, Number(e.target.value) || 0)))
                }
                className="w-16 font-pixel text-[10px] px-2 py-1 text-right"
                style={{
                  background: "#000",
                  border: "2px solid #1E8F4E",
                  color: "#fff",
                }}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={!handle.trim()}
            className="w-full pixel-btn text-[10px] py-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            REVEAL MY CARD
          </button>
        </form>
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer">
      <span className="text-[11px] text-white/80">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="relative w-10 h-5 shrink-0"
        style={{
          background: value ? "#2eb060" : "#222",
          border: `2px solid ${value ? "#FFD700" : "#444"}`,
          imageRendering: "pixelated",
        }}
      >
        <span
          className="absolute top-0 h-full w-1/2 transition-all"
          style={{
            left: value ? "50%" : "0",
            background: value ? "#FFD700" : "#666",
          }}
        />
      </button>
    </label>
  );
}
