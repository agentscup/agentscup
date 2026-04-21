"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";

interface Props {
  onStart: () => void;
  /** When OAuth is live, caller passes the real <SignInWithX /> button
   *  here to take over the golden CTA slot. Falls back to the local
   *  handle-input flow (via `onStart`) if null/undefined. */
  signInWith?: ReactNode | null;
}

/**
 * Refined hero — single focal point, generous whitespace, no
 * decorative noise around the CTA. Counter sits as a small dignified
 * badge above the wordmark, not as a competing focal element.
 */
export default function LandingHero({ onStart, signInWith }: Props) {
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
    <div className="relative flex flex-col items-center text-center min-h-[560px] justify-center pt-8 pb-16 animate-[hero-fade_600ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <CounterBadge count={claimed} />

      <div className="flex justify-center my-10">
        <div className="floating-trophy">
          <Image
            src="/trophy.svg"
            alt="Agents Cup"
            width={120}
            height={120}
            className="drop-shadow-[0_0_56px_rgba(255,215,0,0.45)]"
            priority
            style={{ imageRendering: "pixelated" }}
          />
        </div>
      </div>

      {/* Eyebrow */}
      <div className="font-pixel text-[8px] sm:text-[10px] text-[#FFD700]/80 tracking-[0.5em] mb-5">
        EARLY ACCESS
      </div>

      {/* Wordmark */}
      <h1
        className="font-pixel text-[28px] sm:text-[56px] leading-none text-white mb-4 tracking-[0.05em]"
        style={{
          textShadow:
            "3px 3px 0 #0B6623, 6px 6px 0 rgba(0,0,0,0.55), 0 0 60px rgba(30,143,78,0.18)",
        }}
      >
        FOUNDER&nbsp;CARD
      </h1>

      {/* Subtitle */}
      <p className="text-[13px] sm:text-base text-white/60 max-w-[440px] mx-auto leading-[1.65] mb-12 px-4 font-medium">
        A one-of-one card minted from your X handle.<br />
        <span className="text-white/40">Bigger followings pull rarer cards.</span>
      </p>

      {signInWith ?? (
        <button
          onClick={onStart}
          className="group relative font-pixel text-[10px] sm:text-[12px] tracking-[0.4em] overflow-hidden"
          style={{
            padding: "20px 56px",
            background: "linear-gradient(180deg, #FFD700 0%, #B8960C 100%)",
            color: "#1a1200",
            border: "3px solid #FFF4B0",
            boxShadow:
              "inset -3px -3px 0 #8a6f00, inset 3px 3px 0 #FFF4B0, 0 6px 0 #5a4500, 0 12px 24px rgba(0,0,0,0.4)",
            textShadow: "1px 1px 0 #FFF4B0",
            imageRendering: "pixelated",
            transition: "transform 180ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(4px)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
        >
          <span
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background:
                "linear-gradient(120deg, transparent 35%, rgba(255,255,255,0.45) 50%, transparent 65%)",
              backgroundSize: "250% 250%",
              animation: "shine 1.6s linear infinite",
            }}
          />
          <span className="relative">CONNECT WITH X</span>
        </button>
      )}

      <p className="mt-8 font-pixel text-[7px] text-white/30 tracking-[0.4em]">
        FREE  ·  ONE PER ACCOUNT  ·  60 SECONDS
      </p>

      <style jsx>{`
        @keyframes hero-fade {
          0%   { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes shine {
          0%   { background-position: 250% 250%; }
          100% { background-position: -250% -250%; }
        }
        .floating-trophy {
          animation: float 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}

function CounterBadge({ count }: { count: number | null }) {
  return (
    <div
      className="inline-flex items-center gap-2.5 px-3.5 py-1.5 font-pixel text-[7px] tracking-[0.35em]"
      style={{
        background: "rgba(10,30,10,0.7)",
        backdropFilter: "blur(8px)",
        color: "#7fc878",
        border: "1px solid rgba(46,176,96,0.3)",
        borderRadius: "2px",
      }}
    >
      <span className="w-1.5 h-1.5 bg-[#2eb060] animate-pulse" />
      {count == null ? "LIVE" : `${count.toLocaleString()} CLAIMED`}
    </div>
  );
}
