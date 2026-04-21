"use client";

import { useEffect, useState } from "react";
import { FounderCard as FounderCardT, Rarity } from "@/lib/earlyAccess/cardGen";
import FounderCard from "./FounderCard";

interface Props {
  card: FounderCardT;
  onComplete?: () => void;
}

/**
 * Cinematic reveal sequence — single focal point at every step,
 * long ease-outs, no two effects screaming for attention at once.
 *
 *   t=0      drop      pack glides in from above, halo dim
 *   t=900    settle    pack at rest, halo at 35%, scan line begins
 *                      its slow vertical sweep
 *   t=2300   charge    halo rises to 60%, four light streaks pulse
 *                      out from the seal in cardinal directions,
 *                      gentle tremor begins
 *   t=3700   focus     halo blooms to 90%, pack emits a tight bright
 *                      ring just before the climax (like a camera
 *                      shutter closing in)
 *   t=4100   climax    single white flash, pack scales out, 16
 *                      radial particles in rarity colour
 *   t=4500   reveal    real card materialises with a calm 1.2s
 *                      flip-in. No screaming banner, no chaos —
 *                      the card is the hero
 *   t=5800   onComplete
 */
type Phase =
  | "drop"
  | "settle"
  | "charge"
  | "focus"
  | "climax"
  | "reveal"
  | "settled";

export default function CardReveal({ card, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("drop");

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase("settle"), 900));
    timers.push(setTimeout(() => setPhase("charge"), 2300));
    timers.push(setTimeout(() => setPhase("focus"), 3700));
    timers.push(setTimeout(() => setPhase("climax"), 4100));
    timers.push(setTimeout(() => setPhase("reveal"), 4500));
    timers.push(setTimeout(() => setPhase("settled"), 5700));
    timers.push(setTimeout(() => onComplete?.(), 5800));
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  const theme = THEMES[card.rarity];
  const showPack = phase === "drop" || phase === "settle" || phase === "charge" || phase === "focus";
  const showCard = phase === "reveal" || phase === "settled";
  const climaxing = phase === "climax";

  // Halo intensity bumps with each phase — single value drives the
  // whole atmospheric feel.
  const haloOpacity = {
    drop: 0.15,
    settle: 0.35,
    charge: 0.6,
    focus: 0.9,
    climax: 1,
    reveal: 0.55,
    settled: 0.45,
  }[phase];

  return (
    <div className="relative flex items-center justify-center min-h-[620px] w-full overflow-hidden">
      {/* Atmospheric halo — single layer, opacity-driven */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, ${theme.glow} 0%, transparent 60%)`,
          opacity: haloOpacity,
          transform: phase === "focus" ? "scale(1.4)" : "scale(1)",
          transition:
            "opacity 800ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />

      {/* Vertical scan line during settle/charge — single subtle motif */}
      {(phase === "settle" || phase === "charge") && (
        <div
          aria-hidden
          className="absolute inset-x-0 pointer-events-none mix-blend-screen"
          style={{
            height: "120px",
            background: `linear-gradient(180deg, transparent 0%, ${theme.beam}80 50%, transparent 100%)`,
            opacity: 0.4,
            animation: "scan-line 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        />
      )}

      {/* Charge streaks — 4 cardinal beams during charge phase */}
      {phase === "charge" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {[0, 90, 180, 270].map((deg) => (
            <div
              key={deg}
              className="absolute"
              style={{
                width: "260px",
                height: "2px",
                background: `linear-gradient(90deg, transparent 0%, ${theme.beam} 50%, transparent 100%)`,
                transform: `rotate(${deg}deg)`,
                animation: "streak-pulse 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite",
                animationDelay: `${(deg / 90) * 0.18}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Tight focus ring just before climax */}
      {phase === "focus" && (
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            width: "440px",
            height: "440px",
            border: `2px solid ${theme.beam}`,
            borderRadius: "50%",
            opacity: 0.75,
            boxShadow: `inset 0 0 60px ${theme.beam}80, 0 0 80px ${theme.beam}80`,
            animation: "focus-ring 380ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        />
      )}

      {/* Climax flash + particles */}
      {climaxing && (
        <>
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at center, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 25%, transparent 55%)",
              animation: "flash 380ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          />
          <ParticleBurst color={theme.beam} />
        </>
      )}

      {/* Sealed pack */}
      {showPack && (
        <div
          className="relative"
          style={{
            animation:
              phase === "drop"
                ? "pack-drop 900ms cubic-bezier(0.16, 1, 0.3, 1) both"
                : phase === "charge"
                ? "pack-tremor 0.4s ease-in-out infinite"
                : phase === "focus"
                ? "pack-shrink 380ms cubic-bezier(0.7, 0, 0.84, 0) forwards"
                : "pack-idle 3s ease-in-out infinite",
            opacity: phase === "focus" ? 0 : 1,
            transition: "opacity 380ms ease-in",
          }}
        >
          <SealedPack theme={theme} intensity={phase === "charge" ? 1.3 : 1} />
        </div>
      )}

      {/* Real card flip-in */}
      {showCard && (
        <div
          style={{
            animation: phase === "reveal"
              ? "card-flip 1.2s cubic-bezier(0.16, 1, 0.3, 1) both"
              : undefined,
            filter:
              phase === "reveal"
                ? `drop-shadow(0 0 32px ${theme.beam}80)`
                : `drop-shadow(0 0 16px ${theme.beam}40)`,
            transition: "filter 600ms ease-out",
          }}
        >
          <FounderCard card={card} />
        </div>
      )}

      <style jsx>{`
        @keyframes pack-drop {
          0%   { transform: translateY(-60px) scale(0.85); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes pack-idle {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        @keyframes pack-tremor {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(-1px, 1px); }
          50%      { transform: translate(1px, -1px); }
          75%      { transform: translate(1px, 1px); }
        }
        @keyframes pack-shrink {
          0%   { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.6); opacity: 0; }
        }
        @keyframes scan-line {
          0%   { transform: translateY(-200px); opacity: 0; }
          15%  { opacity: 0.45; }
          85%  { opacity: 0.45; }
          100% { transform: translateY(420px); opacity: 0; }
        }
        @keyframes streak-pulse {
          0%, 100% { opacity: 0; transform-origin: center; }
          40%      { opacity: 0.9; }
          50%      { opacity: 1; }
        }
        @keyframes focus-ring {
          0%   { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0.75; }
        }
        @keyframes flash {
          0%   { opacity: 0; transform: scale(0.6); }
          35%  { opacity: 1; transform: scale(1.4); }
          100% { opacity: 0; transform: scale(2); }
        }
        @keyframes card-flip {
          0%   { transform: scale(0.4) rotateY(120deg); opacity: 0; filter: brightness(2); }
          50%  { transform: scale(1.04) rotateY(-6deg); opacity: 1; filter: brightness(1.3); }
          100% { transform: scale(1) rotateY(0); opacity: 1; filter: brightness(1); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sealed pack — refined wordmark instead of generic "?"
// ─────────────────────────────────────────────────────────────────────

function SealedPack({
  theme,
  intensity,
}: {
  theme: ThemePalette;
  intensity: number;
}) {
  return (
    <div
      className="w-[280px] sm:w-[320px] h-[430px] sm:h-[490px] relative overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, #0c1e0c 0%, #0a1a0a 50%, #060f06 100%)",
        border: `3px solid ${theme.border}`,
        boxShadow: `
          inset -3px -3px 0 ${theme.borderDark},
          inset 3px 3px 0 ${theme.borderLight}40,
          0 0 ${22 * intensity}px ${theme.glow},
          0 8px 0 rgba(0,0,0,0.5),
          0 16px 32px rgba(0,0,0,0.6)
        `,
        imageRendering: "pixelated",
      }}
    >
      {/* Subtle grain */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)",
          backgroundSize: "4px 4px",
        }}
      />

      {/* Top + bottom marks */}
      <div className="absolute top-5 inset-x-0 text-center font-pixel text-[6px] tracking-[0.5em] text-white/40">
        AGENTS · CUP
      </div>
      <div className="absolute bottom-5 inset-x-0 text-center font-pixel text-[6px] tracking-[0.5em] text-white/30">
        FOUNDER PACK
      </div>

      {/* Center wordmark — clean monogram, no glyph */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          {/* Soft outer ring (no spinning) */}
          <div
            className="absolute w-40 h-40 rounded-full"
            style={{
              border: `1px solid ${theme.border}30`,
              boxShadow: `0 0 ${30 * intensity}px ${theme.glow}`,
            }}
          />
          {/* Inner ring */}
          <div
            className="absolute w-28 h-28 rounded-full"
            style={{
              border: `2px solid ${theme.beam}50`,
              boxShadow: `inset 0 0 ${18 * intensity}px ${theme.glow}`,
            }}
          />
          {/* Monogram */}
          <div
            className="font-pixel text-[40px] tracking-[0.05em]"
            style={{
              color: theme.borderLight,
              textShadow: `2px 2px 0 ${theme.borderDark}, 0 0 ${20 * intensity}px ${theme.beam}`,
            }}
          >
            AC
          </div>
        </div>
      </div>

      {/* Corner ornaments */}
      <Corner pos="tl" color={theme.beam} />
      <Corner pos="tr" color={theme.beam} />
      <Corner pos="bl" color={theme.beam} />
      <Corner pos="br" color={theme.beam} />
    </div>
  );
}

function Corner({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
  const map = {
    tl: { top: 12, left: 12 },
    tr: { top: 12, right: 12 },
    bl: { bottom: 12, left: 12 },
    br: { bottom: 12, right: 12 },
  } as const;
  return (
    <div
      aria-hidden
      className="absolute w-3 h-3"
      style={{
        ...map[pos],
        background: color,
        opacity: 0.4,
        boxShadow: `0 0 6px ${color}`,
        imageRendering: "pixelated",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Particle burst — radial spray at climax (16 pieces, smooth)
// ─────────────────────────────────────────────────────────────────────

function ParticleBurst({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center">
      {Array.from({ length: 16 }).map((_, i) => {
        const angle = (i * 360) / 16;
        const distance = 220 + ((i * 13) % 80);
        const size = 5 + ((i * 3) % 4);
        return (
          <div
            key={i}
            className="absolute"
            style={{
              width: size,
              height: size,
              background: i % 3 === 0 ? "#fff" : color,
              imageRendering: "pixelated",
              boxShadow: `0 0 8px ${color}`,
              animation: `particle-${i} 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
            }}
          >
            <style jsx>{`
              @keyframes particle-${i} {
                0%   { transform: rotate(${angle}deg) translateX(0) scale(0.6); opacity: 1; }
                100% { transform: rotate(${angle}deg) translateX(${distance}px) scale(0); opacity: 0; }
              }
            `}</style>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Rarity palettes
// ─────────────────────────────────────────────────────────────────────

interface ThemePalette {
  border: string;
  borderLight: string;
  borderDark: string;
  glow: string;
  beam: string;
}

const THEMES: Record<Rarity, ThemePalette> = {
  COMMON: {
    border: "#6b8e6b",
    borderLight: "#a8c2a8",
    borderDark: "#3b5a3b",
    glow: "rgba(106,142,107,0.45)",
    beam: "#a8c2a8",
  },
  RARE: {
    border: "#00aeef",
    borderLight: "#7fd9ff",
    borderDark: "#006080",
    glow: "rgba(0,174,239,0.55)",
    beam: "#7fd9ff",
  },
  EPIC: {
    border: "#b068ff",
    borderLight: "#d9b0ff",
    borderDark: "#5a2a80",
    glow: "rgba(176,104,255,0.6)",
    beam: "#d9b0ff",
  },
  LEGENDARY: {
    border: "#FFD700",
    borderLight: "#fff4b0",
    borderDark: "#8a6f00",
    glow: "rgba(255,215,0,0.65)",
    beam: "#FFF4B0",
  },
};
