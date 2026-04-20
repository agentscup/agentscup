"use client";

import { useEffect, useState } from "react";
import { FounderCard as FounderCardT } from "@/lib/earlyAccess/cardGen";
import FounderCard from "./FounderCard";

interface Props {
  card: FounderCardT;
  onComplete?: () => void;
}

type RevealPhase = "idle" | "shaking" | "flash" | "revealed";

/**
 * Pack-opening style reveal. Sequence:
 *
 *   1. Sealed silhouette "card" shakes for ~800ms (anticipation).
 *   2. Flash-out burst (150ms).
 *   3. Real card fades/scales in with rarity-tinted particles.
 *
 * Plays automatically on mount. `onComplete` fires once the real card
 * is fully visible, so the parent can show the share CTA.
 */
export default function CardReveal({ card, onComplete }: Props) {
  const [phase, setPhase] = useState<RevealPhase>("idle");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("shaking"), 250);
    const t2 = setTimeout(() => setPhase("flash"), 1100);
    const t3 = setTimeout(() => setPhase("revealed"), 1280);
    const t4 = setTimeout(() => onComplete?.(), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  return (
    <div className="relative flex items-center justify-center min-h-[560px] w-full">
      {/* Background particles */}
      <Particles phase={phase} rarity={card.rarity} />

      {/* Flash burst */}
      {phase === "flash" && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at center, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.2) 30%, transparent 60%)",
            animation: "flash-burst 150ms ease-out forwards",
          }}
        />
      )}

      {/* Sealed card silhouette — shown before reveal */}
      {phase !== "revealed" && (
        <div
          className={`relative ${phase === "shaking" ? "animate-[card-shake_0.25s_ease-in-out_infinite]" : ""}`}
          style={{ opacity: phase === "flash" ? 0 : 1, transition: "opacity 150ms" }}
        >
          <SealedSilhouette />
        </div>
      )}

      {/* Real card — fades + scales in */}
      {phase === "revealed" && (
        <div className="animate-[card-reveal_0.7s_cubic-bezier(0.22,1,0.36,1)_both]">
          <FounderCard card={card} />
        </div>
      )}

      <style jsx>{`
        @keyframes card-shake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25%      { transform: translate(-3px, 2px) rotate(-1.5deg); }
          50%      { transform: translate(3px, -2px) rotate(1.5deg); }
          75%      { transform: translate(-2px, 3px) rotate(-1deg); }
        }
        @keyframes flash-burst {
          0%   { opacity: 0; }
          40%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes card-reveal {
          0%   { transform: scale(0.3) rotateY(90deg); opacity: 0; filter: brightness(2.5); }
          50%  { transform: scale(1.08) rotateY(0deg); opacity: 1; filter: brightness(1.4); }
          100% { transform: scale(1) rotateY(0deg); opacity: 1; filter: brightness(1); }
        }
      `}</style>
    </div>
  );
}

/** Placeholder card back — shown before reveal. */
function SealedSilhouette() {
  return (
    <div
      className="w-[280px] sm:w-[320px] h-[430px] sm:h-[490px] relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #0a1e0a 0%, #0a2a12 50%, #0a1e0a 100%)",
        border: "4px solid #1E8F4E",
        boxShadow:
          "inset -4px -4px 0 #0B6623, inset 4px 4px 0 #2eb060, 8px 8px 0 rgba(0,0,0,0.6)",
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
      {/* Centerpiece trophy / "A" glyph */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="font-pixel text-[64px] tracking-[0.1em]"
          style={{
            color: "#FFD700",
            textShadow: "3px 3px 0 #0B6623, 6px 6px 0 rgba(0,0,0,0.6)",
            animation: "glow-pulse 2s ease-in-out infinite",
          }}
        >
          A
        </div>
      </div>
      <div className="absolute bottom-4 inset-x-0 text-center font-pixel text-[7px] tracking-[0.3em] text-white/40">
        FOUNDER EDITION
      </div>

      <style jsx>{`
        @keyframes glow-pulse {
          0%, 100% { filter: drop-shadow(0 0 4px #FFD700); }
          50%      { filter: drop-shadow(0 0 16px #FFD700); }
        }
      `}</style>
    </div>
  );
}

/** Pixel-blink particles that intensify on flash. */
function Particles({
  phase,
  rarity,
}: {
  phase: RevealPhase;
  rarity: FounderCardT["rarity"];
}) {
  const color = PARTICLE_COLORS[rarity];
  const active = phase === "flash" || phase === "revealed";

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 20 }).map((_, i) => {
        const left = (i * 97) % 100;
        const top = (i * 53 + 11) % 100;
        const delay = ((i * 73) % 100) / 100;
        const size = 2 + ((i * 41) % 5);
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              background: color,
              opacity: active ? 0.8 : 0,
              transform: `translate(-50%, -50%)`,
              animation: active
                ? `particle-float 1.2s ease-out ${delay}s forwards`
                : undefined,
              imageRendering: "pixelated",
            }}
          />
        );
      })}

      <style jsx>{`
        @keyframes particle-float {
          0%   { opacity: 1; transform: translate(-50%, -50%) scale(0.6); }
          100% { opacity: 0; transform: translate(-50%, -150%) scale(1.8); }
        }
      `}</style>
    </div>
  );
}

const PARTICLE_COLORS: Record<FounderCardT["rarity"], string> = {
  COMMON: "#9abd9a",
  RARE: "#00aeef",
  EPIC: "#b068ff",
  LEGENDARY: "#FFD700",
};
