"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getSiteStats } from "@/lib/api";

const MatchPreview = dynamic(() => import("@/components/home/MatchPreview"), {
  ssr: false,
  loading: () => <div className="w-full max-w-2xl mx-auto aspect-[3/2]" />,
});

const features = [
  {
    icon: "[ ]",
    title: "COLLECT",
    description: "Open packs to discover unique AI-themed agent cards with different rarities.",
  },
  {
    icon: "[#]",
    title: "BUILD",
    description: "Pick your formation, assign agents, maximize chemistry with tech stack synergies.",
  },
  {
    icon: "[!]",
    title: "BATTLE",
    description: "Challenge players in real-time simulated matches. Climb the ELO leaderboard.",
  },
];

export default function Home() {
  const [stats, setStats] = useState<{ agents: number; players: number; users: number; packTiers: number; liveMatches: number } | null>(null);

  useEffect(() => {
    getSiteStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="relative overflow-hidden">
      {/* Pitch line decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-white/[0.04]" />
        <div className="absolute top-0 left-1/2 w-px h-full bg-white/[0.03]" />
        <div className="absolute -top-[100px] left-1/2 -translate-x-1/2 w-[200px] h-[200px] rounded-full border border-white/[0.03]" />
        <div className="absolute -bottom-[100px] left-1/2 -translate-x-1/2 w-[200px] h-[200px] rounded-full border border-white/[0.03]" />
        <div className="absolute w-2 h-2 bg-[#2eb060]/20 top-[10%] left-[15%] animate-[pixel-blink_2s_step-end_infinite]" />
        <div className="absolute w-2 h-2 bg-[#2eb060]/20 top-[30%] right-[20%] animate-[pixel-blink_3s_step-end_infinite]" />
        <div className="absolute w-1 h-1 bg-white/20 top-[60%] left-[40%] animate-[pixel-blink_2.5s_step-end_infinite]" />
        <div className="absolute w-1 h-1 bg-[#2eb060]/30 top-[20%] right-[35%] animate-[pixel-blink_1.5s_step-end_infinite]" />
        <div className="absolute w-3 h-3 bg-white/10 top-[70%] right-[15%] animate-[pixel-blink_3s_step-end_infinite]" style={{ animationDelay: "1s" }} />
      </div>

      {/* Hero */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
        <div className="flex justify-center mb-6">
          <div className="pixel-float" style={{ imageRendering: "pixelated" }}>
            <Image src="/trophy.svg" alt="Agents Cup Trophy" width={96} height={96} className="drop-shadow-[0_0_20px_rgba(30,143,78,0.4)]" />
          </div>
        </div>

        <h1 className="font-pixel text-2xl sm:text-4xl text-white mb-6 tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623, 6px 6px 0 rgba(0,0,0,0.5)" }}>
          AGENTS CUP
        </h1>
        <p className="font-pixel text-[8px] sm:text-[10px] text-white/50 max-w-xl mx-auto mb-8 leading-relaxed tracking-wider">
          COLLECT AI AGENTS. BUILD YOUR SQUAD. DOMINATE THE PITCH.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/packs" className="pixel-btn text-[10px] px-8 py-3 inline-block text-center">
            START PLAYING
          </Link>
          <Link href="/collection" className="pixel-btn-outline text-[10px] px-8 py-3 inline-block text-center">
            BROWSE AGENTS
          </Link>
        </div>
      </section>

      {/* Live Match Preview */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="font-pixel text-[10px] sm:text-xs text-white text-center mb-8 tracking-wider" style={{ textShadow: "2px 2px 0 #0B6623" }}>
          <span className="inline-block w-2 h-2 bg-[#FF3B3B] rounded-full mr-2 animate-pulse" />
          LIVE MATCH
        </h2>
        <MatchPreview />
      </section>

      {/* Features */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="pixel-card p-6 text-center hover:border-[#1E8F4E]/50 transition-colors cursor-default"
            >
              <div className="font-pixel text-[#1E8F4E] text-lg mb-4">{f.icon}</div>
              <h3 className="font-pixel text-[10px] text-white mb-3 tracking-wider" style={{ textShadow: "2px 2px 0 #0B6623" }}>{f.title}</h3>
              <p className="text-xs text-white/50 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* $CUP Token — chart + buy ────────────────────────────────────
          The in-game currency lives on Base as an ERC-20 at the CA
          below. We embed DexScreener's live chart + volume widget and
          surface a one-click BUY link that deep-links to Uniswap's
          Base swap UI pre-populated with the token address. The
          chart iframe is lazy-loaded (eager: false) so first paint
          isn't blocked by DexScreener's bundle.
       ─────────────────────────────────────────────────────────────── */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div
          className="overflow-hidden"
          style={{
            background: "linear-gradient(180deg, #1a1400 0%, #0a0800 100%)",
            border: "3px solid #FFD700",
            boxShadow:
              "inset -3px -3px 0 #B8960C, inset 3px 3px 0 #FFF4B0, 6px 6px 0 rgba(0,0,0,0.5)",
          }}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border-b-2 border-[#FFD700]/30">
            <div>
              <h2
                className="font-pixel text-[10px] sm:text-xs text-[#FFD700] tracking-wider mb-2"
                style={{ textShadow: "2px 2px 0 #B8960C" }}
              >
                $CUP TOKEN
              </h2>
              <p className="text-[10px] sm:text-xs text-white/60 leading-relaxed">
                The game&apos;s in-economy currency on Base. Use it to buy
                packs, list agents on the market, and enter matches.
              </p>
              <p className="text-[9px] text-white/30 mt-1 font-mono break-all">
                CA: 0x08d1c6b78e8aa80E0C505829C30C0f81F984a668
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://app.uniswap.org/swap?outputCurrency=0x08d1c6b78e8aa80E0C505829C30C0f81F984a668&chain=base"
                target="_blank"
                rel="noopener noreferrer"
                className="font-pixel text-[8px] sm:text-[10px] tracking-wider px-4 py-3 whitespace-nowrap transition-colors"
                style={{
                  background: "#FFD700",
                  color: "#1a1200",
                  boxShadow:
                    "inset -2px -2px 0 #B8960C, inset 2px 2px 0 #FFF4B0, 0 3px 0 #8B6F00",
                }}
              >
                BUY ON UNISWAP
              </a>
              <a
                href="https://dexscreener.com/base/0x08d1c6b78e8aa80E0C505829C30C0f81F984a668"
                target="_blank"
                rel="noopener noreferrer"
                className="font-pixel text-[8px] sm:text-[10px] tracking-wider px-4 py-3 whitespace-nowrap transition-colors"
                style={{
                  background: "transparent",
                  color: "#FFD700",
                  border: "2px solid #FFD700",
                  boxShadow: "inset -2px -2px 0 rgba(184,150,12,0.4)",
                }}
              >
                VIEW CHART ↗
              </a>
            </div>
          </div>
          <div
            className="relative w-full"
            style={{ aspectRatio: "16 / 9", minHeight: "420px" }}
          >
            <iframe
              src="https://dexscreener.com/base/0x08d1c6b78e8aa80E0C505829C30C0f81F984a668?embed=1&theme=dark&trades=0&info=0"
              title="$CUP / WETH DexScreener chart"
              className="absolute inset-0 w-full h-full"
              style={{ border: "0" }}
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="py-8 px-6" style={{ background: "linear-gradient(180deg, #0f2a0f 0%, #0a1e0a 100%)", border: "3px solid #1E8F4E", boxShadow: "inset -3px -3px 0 #0B6623, inset 3px 3px 0 #2eb060, 6px 6px 0 rgba(0,0,0,0.5)" }}>
          <div className="flex flex-wrap justify-center gap-8 sm:gap-16 text-center">
            <div>
              <div className="font-pixel text-xl text-white" style={{ textShadow: "2px 2px 0 #0B6623" }}>
                {stats ? stats.users : "..."}
              </div>
              <div className="font-pixel text-[6px] text-white/40 mt-2 tracking-wider">USERS</div>
            </div>
            <div>
              <div className="font-pixel text-xl text-white" style={{ textShadow: "2px 2px 0 #0B6623" }}>
                {stats ? stats.packTiers : "..."}
              </div>
              <div className="font-pixel text-[6px] text-white/40 mt-2 tracking-wider">PACK TIERS</div>
            </div>
            <div>
              <div className="font-pixel text-xl text-white" style={{ textShadow: "2px 2px 0 #0B6623" }}>
                {stats ? (stats.liveMatches > 0 ? stats.liveMatches : "LIVE") : "..."}
              </div>
              <div className="font-pixel text-[6px] text-white/40 mt-2 tracking-wider">MATCHES</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
