"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface Props {
  onStart: () => void;
}

/**
 * First screen the user sees. One thing to do: press the big button.
 *
 * We deliberately do not explain rarity / tasks / share here — that's
 * what the next screen is for. The job of this screen is a strong
 * visual hook and a zero-friction start.
 */
export default function LandingHero({ onStart }: Props) {
  const [claimed, setClaimed] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/early-access/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { claimed?: number } | null) => {
        if (data?.claimed != null) setClaimed(data.claimed);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="relative flex flex-col items-center text-center min-h-[520px] justify-center">
      <CounterBadge count={claimed} />

      <div className="flex justify-center mb-8 mt-6 floating-trophy">
        <Image
          src="/trophy.svg"
          alt="Agents Cup"
          width={112}
          height={112}
          className="drop-shadow-[0_0_40px_rgba(255,215,0,0.5)]"
          priority
        />
      </div>

      <h1
        className="font-pixel text-2xl sm:text-5xl text-white mb-4 tracking-[0.1em]"
        style={{
          textShadow:
            "3px 3px 0 #0B6623, 6px 6px 0 rgba(0,0,0,0.5), 0 0 40px rgba(30,143,78,0.3)",
        }}
      >
        FOUNDER CARD
      </h1>

      <p className="font-pixel text-[10px] sm:text-xs text-[#FFD700] tracking-[0.35em] mb-4">
        AGENTS CUP · EARLY ACCESS
      </p>

      <p className="text-[13px] sm:text-base text-white/70 max-w-md mx-auto leading-relaxed mb-10 px-4">
        A one-of-one pixel-art card, minted from your X handle.
        Complete simple tasks to roll a rarer pull.
      </p>

      <button
        onClick={onStart}
        className="group relative font-pixel text-[10px] sm:text-[12px] tracking-[0.3em] overflow-hidden"
        style={{
          padding: "18px 48px",
          background: "linear-gradient(180deg, #FFD700 0%, #B8960C 100%)",
          color: "#1a1200",
          border: "4px solid #FFF4B0",
          boxShadow:
            "inset -4px -4px 0 #8a6f00, inset 4px 4px 0 #FFF4B0, 0 6px 0 #5a4500, 8px 8px 0 rgba(0,0,0,0.6)",
          textShadow: "1px 1px 0 #FFF4B0",
          imageRendering: "pixelated",
          transform: "translateY(0)",
          transition: "transform 120ms ease-out",
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(4px)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      >
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background:
              "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)",
            backgroundSize: "200% 200%",
            animation: "btn-shine 1.2s linear infinite",
          }}
        />
        <span className="relative">CONNECT WITH X ↗</span>
      </button>

      <p className="mt-6 font-pixel text-[7px] text-white/30 tracking-[0.3em]">
        FREE · ONE CARD PER X ACCOUNT · 60 SECONDS
      </p>

      <style jsx>{`
        @keyframes btn-shine {
          0%   { background-position: 200% 200%; }
          100% { background-position: -200% -200%; }
        }
        .floating-trophy {
          animation: float 3s ease-in-out infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}

function CounterBadge({ count }: { count: number | null }) {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1 font-pixel text-[8px] tracking-[0.3em]"
      style={{
        background: "#0a1e0a",
        color: "#2eb060",
        border: "2px solid #1E8F4E",
        boxShadow:
          "inset -2px -2px 0 #0B6623, inset 2px 2px 0 #2eb060, 3px 3px 0 rgba(0,0,0,0.5)",
      }}
    >
      <span className="w-1.5 h-1.5 bg-[#2eb060] animate-pulse" />
      {count == null ? "LIVE NOW" : `${count.toLocaleString()} CLAIMED`}
    </div>
  );
}
