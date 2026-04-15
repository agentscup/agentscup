"use client";

import { useState } from "react";

const CUP_CA = "FjZvB6k9jCWDBUsgXRxJUByrqWHADQJigXK233b5pump";
const PUMPFUN_URL = `https://pump.fun/coin/${CUP_CA}`;
const DEXSCREENER_EMBED = `https://dexscreener.com/solana/${CUP_CA}?embed=1&theme=dark&info=0&trades=0`;
const DEXSCREENER_FULL = `https://dexscreener.com/solana/${CUP_CA}`;

export default function CupToken() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(CUP_CA);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Token identity card */}
      <div
        className="lg:col-span-2 p-6 flex flex-col"
        style={{
          background: "linear-gradient(180deg, #1a1200 0%, #120d00 50%, #0a0800 100%)",
          border: "3px solid #FFD700",
          boxShadow:
            "inset -3px -3px 0 #B8960C, inset 3px 3px 0 #FFF4B0, 6px 6px 0 rgba(0,0,0,0.5)",
          imageRendering: "pixelated",
        }}
      >
        {/* Logo + ticker */}
        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-16 h-16 flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(180deg, #FFD700 0%, #B8960C 100%)",
              border: "3px solid #FFF4B0",
              boxShadow: "inset -2px -2px 0 #8a6f00, inset 2px 2px 0 #FFF4B0, 3px 3px 0 rgba(0,0,0,0.6)",
              imageRendering: "pixelated",
            }}
          >
            <span className="font-pixel text-[14px] text-[#1a1200]" style={{ textShadow: "1px 1px 0 #FFF4B0" }}>
              $
            </span>
          </div>
          <div className="min-w-0">
            <div
              className="font-pixel text-lg text-[#FFD700] tracking-wider"
              style={{ textShadow: "2px 2px 0 #000, 3px 3px 0 rgba(0,0,0,0.5)" }}
            >
              $CUP
            </div>
            <div className="font-pixel text-[7px] text-white/50 tracking-wider mt-1">
              GAME TOKEN · TOKEN-2022
            </div>
          </div>
        </div>

        {/* Contract address */}
        <div className="mb-5">
          <div className="font-pixel text-[6px] text-white/40 tracking-wider mb-2">
            CONTRACT ADDRESS
          </div>
          <button
            onClick={handleCopy}
            className="w-full text-left p-3 transition-colors hover:border-[#FFD700] group"
            style={{
              background: "#000",
              border: "2px solid #3a2d00",
              boxShadow: "inset -2px -2px 0 #1a1400, inset 2px 2px 0 #5a4500",
              imageRendering: "pixelated",
            }}
            aria-label="Copy contract address"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] sm:text-[11px] text-[#FFD700]/90 break-all">
                {CUP_CA}
              </span>
              <span
                className="font-pixel text-[7px] shrink-0 tracking-wider"
                style={{ color: copied ? "#2eb060" : "#FFD700" }}
              >
                {copied ? "✓ COPIED" : "COPY"}
              </span>
            </div>
          </button>
        </div>

        {/* Buy / Sell CTA */}
        <a
          href={PUMPFUN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center font-pixel text-[10px] tracking-wider transition-transform active:translate-y-[2px] mb-3"
          style={{
            padding: "14px 20px",
            background: "linear-gradient(180deg, #FFD700 0%, #B8960C 100%)",
            color: "#1a1200",
            border: "3px solid #FFF4B0",
            boxShadow:
              "inset -3px -3px 0 #8a6f00, inset 3px 3px 0 #FFF4B0, 0 4px 0 #5a4500, 6px 6px 0 rgba(0,0,0,0.5)",
            textShadow: "1px 1px 0 #FFF4B0",
            imageRendering: "pixelated",
          }}
        >
          BUY / SELL ON PUMP.FUN ↗
        </a>

        <a
          href={DEXSCREENER_FULL}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center font-pixel text-[7px] text-white/40 hover:text-[#FFD700] tracking-wider transition-colors mt-auto"
        >
          VIEW FULL CHART ON DEXSCREENER ↗
        </a>
      </div>

      {/* Chart */}
      <div
        className="lg:col-span-3 relative overflow-hidden"
        style={{
          background: "#0a0a0a",
          border: "3px solid #1E8F4E",
          boxShadow:
            "inset -3px -3px 0 #0B6623, inset 3px 3px 0 #2eb060, 6px 6px 0 rgba(0,0,0,0.5)",
          imageRendering: "pixelated",
          minHeight: 360,
        }}
      >
        <iframe
          src={DEXSCREENER_EMBED}
          title="$CUP price chart"
          className="w-full h-full absolute inset-0"
          style={{ border: 0, minHeight: 360 }}
          loading="lazy"
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}
