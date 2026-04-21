"use client";

import { useEffect, useState } from "react";
import { FounderCard as FounderCardT, Rarity } from "@/lib/earlyAccess/cardGen";
import FounderCard from "./FounderCard";

interface Props {
  card: FounderCardT;
  onComplete?: () => void;
}

/**
 * FIFA-style pack reveal. Multi-stage build with rarity-coloured
 * effects that escalate over ~5 seconds:
 *
 *   t=0      idle           sealed pack drops in, halo dim
 *   t=200    anticipation   pulse halo grows, gentle wobble starts
 *   t=1500   buildup        light beams burst out, wobble intensifies,
 *                           orbiting sparks accelerate
 *   t=3200   explosion      full-screen white flash + radial burst
 *   t=3500   revealing      sealed disappears, real card flips in
 *                           with rotateY + scale punch
 *   t=4800   revealed       beams fade, holo shimmer settles
 *
 * onComplete fires at t=5500 to keep the card on screen for a beat
 * before the share UI cross-fades in.
 */
type Phase =
  | "idle"
  | "anticipation"
  | "buildup"
  | "explosion"
  | "revealing"
  | "revealed";

export default function CardReveal({ card, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase("anticipation"), 200));
    timers.push(setTimeout(() => setPhase("buildup"), 1500));
    timers.push(setTimeout(() => setPhase("explosion"), 3200));
    timers.push(setTimeout(() => setPhase("revealing"), 3500));
    timers.push(setTimeout(() => setPhase("revealed"), 4800));
    timers.push(setTimeout(() => onComplete?.(), 5500));
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  const theme = THEMES[card.rarity];
  const buildup = phase === "buildup";
  const exploding = phase === "explosion";
  const revealing = phase === "revealing";
  const revealed = phase === "revealed";
  const anticipating = phase === "anticipation" || buildup;

  return (
    <div className="relative flex items-center justify-center min-h-[600px] w-full overflow-hidden">
      {/* ── Halo (grows with each phase) ───────────────────────── */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none transition-opacity duration-700"
        style={{
          background: `radial-gradient(circle at center, ${theme.glow} 0%, transparent 65%)`,
          opacity: revealed ? 0.6 : buildup ? 0.85 : anticipating ? 0.55 : 0.25,
          transform: buildup ? "scale(1.3)" : anticipating ? "scale(1.1)" : "scale(1)",
          transition: "opacity 700ms ease-out, transform 1500ms ease-out",
        }}
      />

      {/* ── Rotating light beams (kick in at buildup) ──────────── */}
      {(buildup || exploding) && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          style={{ animation: "beam-spin 4s linear infinite" }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                width: "200%",
                height: "10px",
                background: `linear-gradient(90deg, transparent 0%, ${theme.beam} 45%, ${theme.beam} 55%, transparent 100%)`,
                transform: `rotate(${i * 45}deg)`,
                opacity: exploding ? 0.9 : 0.5,
                filter: `blur(${exploding ? 1 : 4}px)`,
                animation: `beam-pulse 1.5s ease-in-out infinite ${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Orbiting sparks (anticipation onward) ──────────────── */}
      {(anticipating || exploding || revealing) && (
        <OrbitSparks intensity={buildup ? 1.4 : exploding ? 2 : 1} color={theme.beam} />
      )}

      {/* ── White flash burst ──────────────────────────────────── */}
      {exploding && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at center, rgba(255,255,255,1) 0%, rgba(255,255,255,0.7) 25%, transparent 60%)",
            animation: "flash-burst 300ms ease-out forwards",
          }}
        />
      )}

      {/* ── Outward particle confetti (at explosion) ───────────── */}
      {exploding && <ExplosionConfetti color={theme.beam} />}

      {/* ── Sealed pack ────────────────────────────────────────── */}
      {!revealing && !revealed && (
        <div
          className="relative"
          style={{
            animation: buildup
              ? "pack-shake-violent 0.18s steps(2) infinite"
              : anticipating
              ? "pack-shake-soft 0.4s ease-in-out infinite"
              : "pack-drop 0.6s cubic-bezier(0.22,1,0.36,1) both",
            opacity: exploding ? 0 : 1,
            transition: "opacity 300ms ease-out",
          }}
        >
          <SealedPack theme={theme} intensity={buildup ? 1.5 : anticipating ? 1.1 : 0.9} />
        </div>
      )}

      {/* ── Real card flip-in ──────────────────────────────────── */}
      {(revealing || revealed) && (
        <div
          className="relative"
          style={{
            animation: revealing
              ? "card-flip-in 1.3s cubic-bezier(0.22,1,0.36,1) both"
              : undefined,
            filter: revealing ? "drop-shadow(0 0 40px " + theme.beam + ")" : undefined,
          }}
        >
          <FounderCard card={card} />
        </div>
      )}

      {/* Rarity announcement banner — slides in just before reveal */}
      {revealing && (
        <div
          aria-hidden
          className="absolute top-8 inset-x-0 flex justify-center pointer-events-none"
          style={{
            animation: "rarity-banner 1.3s cubic-bezier(0.22,1,0.36,1) both",
          }}
        >
          <div
            className="font-pixel text-xl sm:text-3xl tracking-[0.4em]"
            style={{
              color: theme.beam,
              textShadow: `0 0 24px ${theme.beam}, 0 0 8px #fff, 4px 4px 0 rgba(0,0,0,0.8)`,
            }}
          >
            {card.rarity}!
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes beam-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes beam-pulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
        @keyframes flash-burst {
          0%   { opacity: 0; transform: scale(0.4); }
          30%  { opacity: 1; transform: scale(1.5); }
          100% { opacity: 0; transform: scale(2.4); }
        }
        @keyframes pack-drop {
          0%   { transform: translateY(-80px) scale(0.6); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes pack-shake-soft {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25%      { transform: translate(-2px, 1px) rotate(-1deg); }
          75%      { transform: translate(2px, -1px) rotate(1deg); }
        }
        @keyframes pack-shake-violent {
          0%   { transform: translate(-3px, 2px) rotate(-2deg); }
          25%  { transform: translate(4px, -3px) rotate(2deg); }
          50%  { transform: translate(-4px, -1px) rotate(-3deg); }
          75%  { transform: translate(3px, 3px) rotate(2deg); }
          100% { transform: translate(-2px, -2px) rotate(-1deg); }
        }
        @keyframes card-flip-in {
          0%   { transform: scale(0.2) rotateY(180deg) rotateZ(-12deg); opacity: 0; filter: brightness(3); }
          35%  { transform: scale(1.25) rotateY(-15deg) rotateZ(2deg); opacity: 1; filter: brightness(1.6); }
          65%  { transform: scale(0.96) rotateY(8deg) rotateZ(-1deg); filter: brightness(1.2); }
          100% { transform: scale(1) rotateY(0) rotateZ(0); filter: brightness(1); }
        }
        @keyframes rarity-banner {
          0%   { transform: translateY(-30px) scale(0.6); opacity: 0; }
          40%  { transform: translateY(0) scale(1.15); opacity: 1; }
          70%  { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sealed pack silhouette — gold-rimmed envelope with pulsing seal
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
          "linear-gradient(135deg, #0a1e0a 0%, #0a2a12 50%, #0a1e0a 100%)",
        border: `4px solid ${theme.border}`,
        boxShadow: `
          inset -4px -4px 0 ${theme.borderDark},
          inset 4px 4px 0 ${theme.borderLight},
          0 0 ${20 * intensity}px ${theme.glow},
          8px 8px 0 rgba(0,0,0,0.6)
        `,
        imageRendering: "pixelated",
      }}
    >
      {/* Diagonal scanlines */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-25"
        style={{
          background:
            "repeating-linear-gradient(45deg, transparent 0 8px, rgba(46,176,96,0.25) 8px 10px)",
        }}
      />

      {/* Scanlight sweep — moves vertically inside the pack */}
      <div
        aria-hidden
        className="absolute inset-x-0 h-1/3 pointer-events-none mix-blend-screen"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${theme.beam} 50%, transparent 100%)`,
          opacity: 0.4 * intensity,
          animation: "scan-sweep 1.6s ease-in-out infinite",
        }}
      />

      {/* Top + bottom labels */}
      <div className="absolute top-4 inset-x-0 text-center font-pixel text-[7px] tracking-[0.4em] text-white/50">
        AGENTS CUP
      </div>
      <div className="absolute bottom-4 inset-x-0 text-center font-pixel text-[7px] tracking-[0.4em] text-white/40">
        FOUNDER PACK
      </div>

      {/* Centerpiece — pulsing seal */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          {/* Outer ring */}
          <div
            className="w-32 h-32 rounded-full"
            style={{
              border: `4px solid ${theme.beam}`,
              boxShadow: `0 0 ${24 * intensity}px ${theme.beam}, inset 0 0 ${16 * intensity}px ${theme.beam}`,
              animation: "seal-pulse 1.4s ease-in-out infinite",
            }}
          />
          {/* Glyph */}
          <div
            className="absolute inset-0 flex items-center justify-center font-pixel text-[44px]"
            style={{
              color: "#FFD700",
              textShadow: `2px 2px 0 #0B6623, 4px 4px 0 rgba(0,0,0,0.6), 0 0 ${16 * intensity}px #FFD700`,
            }}
          >
            ?
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scan-sweep {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(400%); }
        }
        @keyframes seal-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Orbiting sparks
// ─────────────────────────────────────────────────────────────────────

function OrbitSparks({ intensity, color }: { intensity: number; color: string }) {
  const count = Math.round(14 * intensity);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => {
        const radius = 160 + ((i * 23) % 80);
        const startAngle = (i * 360) / count;
        const dur = 2.5 + ((i * 0.3) % 2);
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{
              width: 4,
              height: 4,
              background: i % 3 === 0 ? "#fff" : color,
              imageRendering: "pixelated",
              boxShadow: `0 0 8px ${color}`,
              animation: `orbit-${i} ${dur}s linear infinite`,
              transformOrigin: "center",
            }}
          >
            <style jsx>{`
              @keyframes orbit-${i} {
                from { transform: translate(-50%, -50%) rotate(${startAngle}deg) translateX(${radius}px) rotate(-${startAngle}deg); }
                to   { transform: translate(-50%, -50%) rotate(${startAngle + 360}deg) translateX(${radius}px) rotate(-${startAngle + 360}deg); }
              }
            `}</style>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Explosion confetti — radial spray outward
// ─────────────────────────────────────────────────────────────────────

function ExplosionConfetti({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center">
      {Array.from({ length: 36 }).map((_, i) => {
        const angle = (i * 360) / 36;
        const distance = 280 + ((i * 17) % 180);
        const size = 6 + ((i * 3) % 6);
        return (
          <div
            key={i}
            className="absolute"
            style={{
              width: size,
              height: size,
              background: i % 4 === 0 ? "#fff" : i % 3 === 0 ? "#FFD700" : color,
              imageRendering: "pixelated",
              boxShadow: `0 0 6px ${color}`,
              animation: `explode-${i} 900ms cubic-bezier(0.2,0.7,0.4,1) forwards`,
              animationDelay: `${(i % 6) * 12}ms`,
            }}
          >
            <style jsx>{`
              @keyframes explode-${i} {
                0%   { transform: rotate(${angle}deg) translateX(0) scale(0.5); opacity: 1; }
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
// Rarity palettes (must mirror FounderCard's colour intent)
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
    glow: "rgba(106,142,107,0.55)",
    beam: "#a8c2a8",
  },
  RARE: {
    border: "#00aeef",
    borderLight: "#7fd9ff",
    borderDark: "#006080",
    glow: "rgba(0,174,239,0.65)",
    beam: "#7fd9ff",
  },
  EPIC: {
    border: "#b068ff",
    borderLight: "#d9b0ff",
    borderDark: "#5a2a80",
    glow: "rgba(176,104,255,0.7)",
    beam: "#d9b0ff",
  },
  LEGENDARY: {
    border: "#FFD700",
    borderLight: "#fff4b0",
    borderDark: "#8a6f00",
    glow: "rgba(255,215,0,0.75)",
    beam: "#FFF4B0",
  },
};
