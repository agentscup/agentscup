"use client";

import Image from "next/image";
import { FounderCard as FounderCardT, Rarity } from "@/lib/earlyAccess/cardGen";

interface Props {
  card: FounderCardT;
  /** Add a holographic shimmer animation. Turn off in static exports. */
  animated?: boolean;
  /** Scale the card; default 1. */
  scale?: number;
}

/**
 * The personalized early-access founder card. Mirrors the in-game
 * agent card layout but swaps the pixel-art avatar for the user's X
 * profile photo and tags it with a "FOUNDER" rarity stripe.
 *
 * All rendering is static — no data fetching, no state. Parents
 * (reveal, share, OG image) own the lifecycle.
 */
export default function FounderCard({ card, animated = true, scale = 1 }: Props) {
  const theme = RARITY_THEMES[card.rarity];

  return (
    <div
      className="relative inline-block"
      style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
    >
      {/* Glow halo — sits behind the card */}
      <div
        aria-hidden
        className={`absolute inset-0 -m-6 rounded-lg blur-2xl opacity-50 pointer-events-none ${
          animated ? "animate-pulse" : ""
        }`}
        style={{ background: theme.glow }}
      />

      {/* Card body */}
      <div
        className="relative w-[280px] sm:w-[320px] overflow-hidden"
        style={{
          background: theme.bg,
          border: `4px solid ${theme.border}`,
          boxShadow: `
            inset -4px -4px 0 ${theme.borderDark},
            inset 4px 4px 0 ${theme.borderLight},
            8px 8px 0 rgba(0,0,0,0.6)
          `,
          imageRendering: "pixelated",
        }}
      >
        {/* Top stripe: rarity only, centered */}
        <div
          className="relative flex items-center justify-center px-3 py-2"
          style={{
            background: theme.stripe,
            borderBottom: `3px solid ${theme.borderDark}`,
          }}
        >
          <span
            className="font-pixel text-[9px] tracking-[0.35em]"
            style={{
              color: theme.stripeText,
              textShadow: `1px 1px 0 ${theme.borderDark}`,
            }}
          >
            {card.rarity}
          </span>
        </div>

        {/* Overall + position badge row */}
        <div className="flex items-center gap-3 px-4 pt-4">
          <div
            className="w-14 h-14 flex flex-col items-center justify-center shrink-0"
            style={{
              background: theme.badgeBg,
              border: `3px solid ${theme.border}`,
              boxShadow: `inset -2px -2px 0 ${theme.borderDark}, inset 2px 2px 0 ${theme.borderLight}`,
              imageRendering: "pixelated",
            }}
          >
            <span
              className="font-pixel text-[16px] leading-none"
              style={{ color: theme.text, textShadow: `2px 2px 0 ${theme.borderDark}` }}
            >
              {card.overall}
            </span>
            <span
              className="font-pixel text-[6px] tracking-wider mt-1"
              style={{ color: theme.textSoft }}
            >
              {card.position}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div
              className="font-pixel text-[9px] tracking-[0.15em] truncate"
              style={{ color: theme.text, textShadow: `1px 1px 0 ${theme.borderDark}` }}
              title={card.displayName}
            >
              {card.displayName.toUpperCase()}
            </div>
            <div
              className="font-pixel text-[6px] tracking-[0.2em] mt-1 truncate"
              style={{ color: theme.textSoft }}
            >
              @{card.handle}
            </div>
          </div>
        </div>

        {/* Avatar slot with holographic shimmer overlay */}
        <div className="relative mx-4 mt-3 aspect-square overflow-hidden"
          style={{
            border: `3px solid ${theme.border}`,
            background: "#000",
            boxShadow: `inset -2px -2px 0 ${theme.borderDark}, inset 2px 2px 0 ${theme.borderLight}`,
          }}
        >
          {card.avatarUrl ? (
            <Image
              src={card.avatarUrl}
              alt={card.displayName}
              fill
              unoptimized
              className="object-cover"
              style={{ imageRendering: "auto" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-pixel text-[32px]" style={{ color: theme.text }}>?</span>
            </div>
          )}

          {/* Holo shimmer */}
          {animated && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none mix-blend-screen opacity-40"
              style={{
                background: `linear-gradient(135deg,
                  transparent 40%,
                  ${theme.shimmer} 50%,
                  transparent 60%)`,
                backgroundSize: "200% 200%",
                animation: "holo-shimmer 3s linear infinite",
              }}
            />
          )}

          {/* Scanline overlay for CRT feel */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              background:
                "repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.15) 3px)",
            }}
          />
        </div>

        {/* Stats grid — six cells */}
        <div className="grid grid-cols-3 gap-1 px-4 py-4">
          <StatCell label="PAC" value={card.stats.pace} theme={theme} />
          <StatCell label="SHO" value={card.stats.shooting} theme={theme} />
          <StatCell label="PAS" value={card.stats.passing} theme={theme} />
          <StatCell label="DRI" value={card.stats.dribbling} theme={theme} />
          <StatCell label="DEF" value={card.stats.defending} theme={theme} />
          <StatCell label="PHY" value={card.stats.physical} theme={theme} />
        </div>

        {/* Footer — early access + score */}
        <div
          className="px-4 py-2 flex items-center justify-between"
          style={{
            borderTop: `2px solid ${theme.borderDark}`,
            background: theme.footerBg,
          }}
        >
          <span
            className="font-pixel text-[6px] tracking-[0.2em]"
            style={{ color: theme.textSoft }}
          >
            EARLY ACCESS
          </span>
          <span
            className="font-pixel text-[6px] tracking-[0.2em]"
            style={{ color: theme.textSoft }}
          >
            BASE · {card.score} PTS
          </span>
        </div>
      </div>

      {/* Holo shimmer keyframes (inlined so component is self-contained) */}
      <style jsx>{`
        @keyframes holo-shimmer {
          0%   { background-position: 200% 200%; }
          100% { background-position: -200% -200%; }
        }
      `}</style>
    </div>
  );
}

function StatCell({
  label,
  value,
  theme,
}: {
  label: string;
  value: number;
  theme: RarityTheme;
}) {
  return (
    <div
      className="flex items-center justify-between px-2 py-1"
      style={{
        background: theme.statBg,
        border: `1px solid ${theme.borderDark}`,
      }}
    >
      <span
        className="font-pixel text-[6px] tracking-wider"
        style={{ color: theme.textSoft }}
      >
        {label}
      </span>
      <span
        className="font-pixel text-[9px]"
        style={{ color: theme.text, textShadow: `1px 1px 0 ${theme.borderDark}` }}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Rarity theme palettes
// ─────────────────────────────────────────────────────────────────────

interface RarityTheme {
  bg: string;
  border: string;
  borderLight: string;
  borderDark: string;
  stripe: string;
  stripeText: string;
  text: string;
  textSoft: string;
  badgeBg: string;
  statBg: string;
  footerBg: string;
  glow: string;
  shimmer: string;
}

const RARITY_THEMES: Record<Rarity, RarityTheme> = {
  COMMON: {
    bg: "linear-gradient(180deg, #1a2a1a 0%, #0f1a0f 100%)",
    border: "#6b8e6b",
    borderLight: "#a8c2a8",
    borderDark: "#3b5a3b",
    stripe: "linear-gradient(180deg, #4a6d4a 0%, #2d4a2d 100%)",
    stripeText: "#e6f2e6",
    text: "#e6f2e6",
    textSoft: "#9abd9a",
    badgeBg: "linear-gradient(180deg, #2d4a2d 0%, #1a2a1a 100%)",
    statBg: "rgba(0,0,0,0.35)",
    footerBg: "rgba(0,0,0,0.4)",
    glow: "radial-gradient(circle, rgba(106,142,107,0.35) 0%, transparent 70%)",
    shimmer: "rgba(200,220,200,0.45)",
  },
  RARE: {
    bg: "linear-gradient(180deg, #0a1a2a 0%, #061020 100%)",
    border: "#00aeef",
    borderLight: "#7fd9ff",
    borderDark: "#006080",
    stripe: "linear-gradient(180deg, #0085b0 0%, #004870 100%)",
    stripeText: "#e6f7ff",
    text: "#e6f7ff",
    textSoft: "#7fc8e6",
    badgeBg: "linear-gradient(180deg, #004870 0%, #001a33 100%)",
    statBg: "rgba(0,0,0,0.4)",
    footerBg: "rgba(0,0,0,0.45)",
    glow: "radial-gradient(circle, rgba(0,174,239,0.45) 0%, transparent 70%)",
    shimmer: "rgba(127,217,255,0.6)",
  },
  EPIC: {
    bg: "linear-gradient(180deg, #1a0a2a 0%, #0f0520 100%)",
    border: "#b068ff",
    borderLight: "#d9b0ff",
    borderDark: "#5a2a80",
    stripe: "linear-gradient(180deg, #7a3dd4 0%, #42146b 100%)",
    stripeText: "#f3e6ff",
    text: "#f3e6ff",
    textSoft: "#c9a0e6",
    badgeBg: "linear-gradient(180deg, #42146b 0%, #1a0533 100%)",
    statBg: "rgba(0,0,0,0.45)",
    footerBg: "rgba(0,0,0,0.5)",
    glow: "radial-gradient(circle, rgba(176,104,255,0.5) 0%, transparent 70%)",
    shimmer: "rgba(217,176,255,0.7)",
  },
  LEGENDARY: {
    bg: "linear-gradient(180deg, #2a1f00 0%, #1a1200 50%, #0a0800 100%)",
    border: "#FFD700",
    borderLight: "#fff4b0",
    borderDark: "#8a6f00",
    stripe: "linear-gradient(180deg, #FFD700 0%, #b8960c 100%)",
    stripeText: "#1a1200",
    text: "#FFF4B0",
    textSoft: "#d4b84a",
    badgeBg: "linear-gradient(180deg, #b8960c 0%, #5a4500 100%)",
    statBg: "rgba(0,0,0,0.5)",
    footerBg: "rgba(0,0,0,0.55)",
    glow: "radial-gradient(circle, rgba(255,215,0,0.55) 0%, transparent 70%)",
    shimmer: "rgba(255,244,176,0.75)",
  },
};
