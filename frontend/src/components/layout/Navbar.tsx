"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";

/*
 * RainbowKit's ConnectButton is a client component that reaches
 * into wagmi + WalletConnect. We load it dynamically with ssr:false
 * so the server bundle stays clean and iOS Safari doesn't hit
 * hydration mismatches on first paint.
 */
const ConnectButton = dynamic(
  () =>
    import("@rainbow-me/rainbowkit").then((mod) => mod.ConnectButton),
  { ssr: false }
);

const NAV_LINKS = [
  { href: "/", label: "HOME" },
  { href: "/claim", label: "CLAIM", highlight: true },
  { href: "/airdrop-apply", label: "APPLY" },
  { href: "/packs", label: "PACKS" },
  { href: "/leaderboard", label: "BOARD" },
  { href: "/squad", label: "SQUAD" },
  { href: "/match", label: "MATCH" },
  { href: "/marketplace", label: "MARKET" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-50 bg-[#061206]/95 backdrop-blur-sm"
      style={{ borderBottom: "3px solid #1E8F4E", boxShadow: "0 3px 0 0 #0B6623" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 group">
            <div className="pixel-float" style={{ imageRendering: "pixelated" }}>
              <Image
                src="/trophy.svg"
                alt="Agents Cup"
                width={28}
                height={28}
                className="drop-shadow-[0_0_8px_rgba(30,143,78,0.4)]"
              />
            </div>
            <span
              className="font-pixel text-[10px] sm:text-xs text-white tracking-wider"
              style={{ textShadow: "2px 2px 0 #0B6623" }}
            >
              AGENTS CUP
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              const isHighlighted = link.highlight && !isActive;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 font-pixel text-[7px] tracking-wider transition-all ${
                    isActive
                      ? "text-white bg-[#1E8F4E]"
                      : isHighlighted
                      ? "text-[#0a0a0a] bg-[#FFD700] hover:bg-[#ffdf33] animate-pulse"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                  style={
                    isActive
                      ? { boxShadow: "inset -2px -2px 0 #0B6623, inset 2px 2px 0 #2eb060" }
                      : isHighlighted
                      ? { boxShadow: "inset -2px -2px 0 #b8860b, inset 2px 2px 0 #ffdf66" }
                      : {}
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Wallet button — desktop */}
          <div className="hidden md:block wallet-btn-wrapper">
            <ConnectButton
              accountStatus="address"
              chainStatus="icon"
              showBalance={false}
            />
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span className="font-pixel text-xs">{mobileOpen ? "X" : "="}</span>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden pb-4 space-y-1 border-t-2 border-[#0B6623] pt-2">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              const isHighlighted = link.highlight && !isActive;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 font-pixel text-[8px] tracking-wider transition-colors ${
                    isActive
                      ? "text-white bg-[#1E8F4E]"
                      : isHighlighted
                      ? "text-[#0a0a0a] bg-[#FFD700]"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {/* Wallet button — mobile */}
            <div className="pt-2 wallet-btn-wrapper wallet-btn-mobile flex justify-center">
              <ConnectButton
                accountStatus="address"
                chainStatus="icon"
                showBalance={false}
              />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
