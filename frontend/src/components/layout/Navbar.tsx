"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

const NAV_LINKS = [
  { href: "/", label: "HOME" },
  { href: "/packs", label: "PACKS" },
  { href: "/leaderboard", label: "BOARD" },
  { href: "/squad", label: "SQUAD" },
  { href: "/match", label: "MATCH" },
  { href: "/marketplace", label: "MARKET" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const walletAddress = publicKey?.toBase58();
  const shortAddr = walletAddress ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}` : "";

  return (
    <nav className="sticky top-0 z-50 bg-[#061206]/95 backdrop-blur-sm" style={{ borderBottom: "3px solid #1E8F4E", boxShadow: "0 3px 0 0 #0B6623" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 group">
            <div className="pixel-float" style={{ imageRendering: "pixelated" }}>
              <Image src="/trophy.svg" alt="Agents Cup" width={28} height={28} className="drop-shadow-[0_0_8px_rgba(30,143,78,0.4)]" />
            </div>
            <span className="font-pixel text-[10px] sm:text-xs text-white tracking-wider" style={{ textShadow: "2px 2px 0 #0B6623" }}>
              AGENTS CUP
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 font-pixel text-[7px] tracking-wider transition-all ${
                    isActive
                      ? "text-white bg-[#1E8F4E]"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                  style={isActive ? { boxShadow: "inset -2px -2px 0 #0B6623, inset 2px 2px 0 #2eb060" } : {}}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Wallet button */}
          <div className="hidden md:block">
            {connected ? (
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[7px] text-white/50">{shortAddr}</span>
                <button
                  onClick={() => disconnect()}
                  className="font-pixel text-[7px] py-1.5 px-3 text-white border-2 border-white/30 hover:bg-white/10 transition-colors"
                  style={{ boxShadow: "inset -2px -2px 0 rgba(255,255,255,0.1), inset 2px 2px 0 rgba(255,255,255,0.2)" }}
                >
                  DISCONNECT
                </button>
              </div>
            ) : (
              <button
                onClick={() => setVisible(true)}
                className="font-pixel text-[7px] py-2 px-4 bg-[#1E8F4E] text-[#050e05] hover:bg-[#2eb060] transition-colors"
                style={{ boxShadow: "inset -3px -3px 0 #0B6623, inset 3px 3px 0 #2eb060, 0 3px 0 0 #084a18" }}
              >
                CONNECT
              </button>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <span className="font-pixel text-xs">{mobileOpen ? "X" : "="}</span>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden pb-4 space-y-1 border-t-2 border-[#0B6623] pt-2">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 font-pixel text-[8px] tracking-wider transition-colors ${
                    isActive
                      ? "text-white bg-[#1E8F4E]"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {connected ? (
              <button
                onClick={() => disconnect()}
                className="w-full mt-2 font-pixel text-[8px] py-2 text-white border-2 border-white/30 hover:bg-white/10"
              >
                {shortAddr} - DISCONNECT
              </button>
            ) : (
              <button
                onClick={() => setVisible(true)}
                className="w-full mt-2 font-pixel text-[8px] py-2 bg-[#1E8F4E] text-[#050e05]"
                style={{ boxShadow: "inset -3px -3px 0 #0B6623, inset 3px 3px 0 #2eb060" }}
              >
                CONNECT WALLET
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
