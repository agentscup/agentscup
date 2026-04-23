"use client";

import { useState, useRef } from "react";
import { useAccount, useChainId } from "wagmi";
import { base } from "wagmi/chains";
import { PACK_TYPES } from "@/data/agents";
import { Agent, PackType } from "@/types";
import { getRarityColor } from "@/lib/utils";
import { openPack } from "@/lib/api";
import { mapDbAgent, type DbAgent } from "@/lib/mapAgent";
import { buyPack } from "@/lib/evm";
import AgentCard from "@/components/cards/AgentCard";

/**
 * Pack purchase flow on Base:
 *   1. User clicks BUY → wallet prompts for buyPack() tx with msg.value = priceWei
 *   2. Tx confirms → we POST /api/packs/open with { walletAddress, packType, txHash }
 *   3. Backend re-reads the tx receipt, decodes PackPurchased event, rolls cards
 *
 * The tx hash is stashed in a ref so a failed API call (network blip, rate
 * limit, etc.) can be retried without forcing the user to re-sign.
 */

function PackCard({ pack, onBuy, disabled }: { pack: PackType; onBuy: () => void; disabled: boolean }) {
  const tierStyles: Record<string, { border: string; glow: string; accent: string }> = {
    starter: { border: "#444", glow: "", accent: "#666" },
    pro: { border: "#00E5FF", glow: "glow-rare", accent: "#00E5FF" },
    elite: { border: "#C0C0C0", glow: "glow-epic", accent: "#C0C0C0" },
    legendary: { border: "#FFD700", glow: "glow-legendary", accent: "#FFD700" },
  };
  const style = tierStyles[pack.id] || tierStyles.starter;

  return (
    <div
      className={`relative ${style.glow} p-6 text-center flex flex-col h-full`}
      style={{
        background: "linear-gradient(180deg, #1a1a1a 0%, #111 50%, #0a0a0a 100%)",
        border: `3px solid ${style.border}`,
        boxShadow: `inset -3px -3px 0 ${style.border}40, inset 3px 3px 0 ${style.border}60, 6px 6px 0 rgba(0,0,0,0.5)`,
        imageRendering: "pixelated",
      }}
    >
      <div
        className="font-pixel text-3xl mb-4"
        style={{ color: style.accent, textShadow: `2px 2px 0 ${style.border}80` }}
      >
        [?]
      </div>

      <h3 className="font-pixel text-[9px] mb-2 tracking-wider" style={{ color: style.accent }}>
        {pack.name.toUpperCase()}
      </h3>
      <p className="text-[10px] text-[#e0d6b8]/40 mb-4 flex-1 leading-relaxed">{pack.description}</p>

      <div className="space-y-1.5 mb-4 text-left">
        <div className="flex justify-between">
          <span className="font-pixel text-[6px] text-white/40 tracking-wider">CARDS</span>
          <span className="font-pixel text-[7px] text-white">{pack.cardCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-pixel text-[6px] text-white/40 tracking-wider">RARE+</span>
          <span className="font-pixel text-[7px] text-[#00E5FF]">{pack.rareGuarantee}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-pixel text-[6px] text-white/40 tracking-wider">EPIC %</span>
          <span className="font-pixel text-[7px] text-[#C0C0C0]">{(pack.epicChance * 100).toFixed(0)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="font-pixel text-[6px] text-white/40 tracking-wider">LEGEND %</span>
          <span className="font-pixel text-[7px] text-white">{(pack.legendaryChance * 100).toFixed(0)}%</span>
        </div>
      </div>

      <button
        onClick={onBuy}
        disabled={disabled}
        className="pixel-btn w-full text-[8px] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pack.priceCupHuman} $CUP
      </button>
    </div>
  );
}

export default function PacksPage() {
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();
  const [openedCards, setOpenedCards] = useState<Agent[]>([]);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [isOpening, setIsOpening] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Holds the tx hash of a confirmed buyPack() when the subsequent
   *  /api/packs/open call failed. Lets the user retry the server
   *  roll without re-paying. */
  const pendingTx = useRef<{ txHash: string; packType: string } | null>(null);

  async function claimPack(txHash: string, packType: string) {
    if (!address) return;

    const result = await openPack(address.toLowerCase(), packType, txHash);
    const resultData = result as { cards: Array<{ agents: unknown }>; already_processed?: boolean };

    const cards = resultData.cards
      .filter((c) => c.agents)
      .map((c) => mapDbAgent(c.agents as DbAgent));

    pendingTx.current = null;

    setOpenedCards(cards);
    setRevealIndex(-1);
    setIsOpening(true);

    let i = 0;
    const interval = setInterval(() => {
      setRevealIndex(i);
      i++;
      if (i >= cards.length) clearInterval(interval);
    }, 600);
  }

  async function handleBuy(pack: PackType) {
    if (!address || !isConnected) {
      setError(
        "Wallet isn't connected. Tap Connect at the top, approve in your wallet, then try again."
      );
      return;
    }
    setError(null);
    setBuying(true);

    try {
      // Retry path — previous buy confirmed on-chain but API call failed
      if (pendingTx.current && pendingTx.current.packType === pack.id) {
        await claimPack(pendingTx.current.txHash, pack.id);
        setBuying(false);
        return;
      }

      // Fresh purchase: send on-chain tx, then claim cards server-side.
      // Pack prices are $CUP wei (18 decimals). buyPack handles approve
      // internally so the first purchase is a 2-tx flow; subsequent
      // buys use the max allowance set on the first approve.
      const priceCup = BigInt(pack.priceCupWei);
      const { txHash } = await buyPack(pack.tier, priceCup);

      // Stash tx hash so a server-side failure can be retried without re-paying
      pendingTx.current = { txHash, packType: pack.id };

      await claimPack(txHash, pack.id);
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : "Failed to open pack";

      // Friendlier errors for common wallet / chain issues.
      const lc = msg.toLowerCase();
      if (lc.includes("erc20insufficientbalance") || lc.includes("transferfrom failed") || lc.includes("insufficient allowance")) {
        msg = `Not enough $CUP for ${pack.priceCupHuman} $CUP. Buy $CUP on Uniswap (homepage link) and try again.`;
      } else if (lc.includes("insufficient funds") || lc.includes("exceeds the balance")) {
        msg = `Not enough ETH for gas. Top up a small amount of ETH on Base — packs cost $CUP but you still need ETH for the network fee.`;
      } else if (lc.includes("user rejected") || lc.includes("user denied")) {
        msg = "Transaction rejected in wallet.";
      } else if (
        (lc.includes("chain") && (lc.includes("mismatch") || lc.includes("does not match"))) ||
        lc.includes("wrong network") ||
        lc.includes("expected chain")
      ) {
        msg = "Your wallet is still on the old network. Open your wallet, switch to Base, and tap BUY again.";
      } else if (lc.includes("timeout") || lc.includes("timed out")) {
        msg = "Wallet took too long to respond. Reopen your wallet app and try again.";
      } else if (lc.includes("session") || lc.includes("walletconnect")) {
        msg = "Wallet session dropped. Reconnect your wallet from the Connect button and try again.";
      }

      if (pendingTx.current) {
        setError(`${msg}. Your payment went through on-chain — click the button again to claim your cards.`);
      } else {
        setError(msg);
      }
    } finally {
      setBuying(false);
    }
  }

  function handleClose() {
    setIsOpening(false);
    setOpenedCards([]);
    setRevealIndex(-1);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="text-center mb-10">
        <h1 className="font-pixel text-sm sm:text-base text-white mb-3 tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
          PACK STORE
        </h1>
        <p className="font-pixel text-[7px] text-white/40 tracking-wider">
          {address ? "OPEN PACKS TO DISCOVER NEW AGENTS" : "CONNECT YOUR WALLET TO BUY PACKS"}
        </p>
      </div>

      {error && (
        <div className="pixel-card p-3 mb-6 text-center" style={{ borderColor: pendingTx.current ? "#eab308" : "#ef4444" }}>
          <p className="font-pixel text-[7px] tracking-wider" style={{ color: pendingTx.current ? "#eab308" : "#ef4444" }}>
            {error}
          </p>
        </div>
      )}

      {/* Wrong-network banner — fires when the wallet is connected
          but sitting on a non-Base chain (Ethereum mainnet is the
          default mobile-wallet state for users who just installed
          MetaMask). Catches the silent majority who would tap BUY
          and get a scary signing popup on the wrong chain. */}
      {isConnected && currentChainId && currentChainId !== base.id && (
        <div
          className="mb-6 text-center px-4 py-3"
          style={{
            background: "rgba(255,215,0,0.08)",
            border: "2px solid rgba(255,215,0,0.45)",
            boxShadow: "inset -2px -2px 0 rgba(139,113,0,0.3), inset 2px 2px 0 rgba(255,244,176,0.2)",
          }}
        >
          <p className="font-pixel text-[8px] text-[#FFD700] tracking-wider mb-1">
            WRONG NETWORK
          </p>
          <p className="text-[11px] text-white/70 leading-relaxed">
            Your wallet is on a different chain. Open your wallet app and switch to <b>Base</b> before buying. On mobile, tap BUY and approve the switch prompt in your wallet, then tap BUY again.
          </p>
        </div>
      )}

      {/* Pack grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
        {PACK_TYPES.map((pack) => (
          <PackCard
            key={pack.id}
            pack={pack}
            onBuy={() => handleBuy(pack)}
            disabled={!address || buying}
          />
        ))}
      </div>

      {buying && (
        <div className="text-center mt-6">
          <div className="font-pixel text-[8px] text-white/60 tracking-wider animate-pulse">
            {pendingTx.current ? "CLAIMING YOUR PACK..." : "CONFIRM IN WALLET..."}
          </div>
        </div>
      )}

      {/* Pack opening overlay */}
      {isOpening && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <h2 className="font-pixel text-[10px] sm:text-xs text-white mb-6 tracking-wider" style={{ textShadow: "2px 2px 0 #0B6623" }}>
            {revealIndex < openedCards.length - 1 ? "REVEALING..." : "PACK COMPLETE!"}
          </h2>

          <div className="flex flex-wrap justify-center gap-3 max-w-4xl mb-8">
            {openedCards.map((card, i) => (
              <div
                key={`${card.id}-${i}`}
                className="transition-all duration-500"
                style={{
                  opacity: i <= revealIndex ? 1 : 0.15,
                  transform: i <= revealIndex ? "scale(1) rotateY(0)" : "scale(0.8) rotateY(180deg)",
                  transitionDelay: `${i * 50}ms`,
                }}
              >
                {i <= revealIndex ? (
                  <div className="animate-[slide-up_0.4s_ease-out]">
                    <AgentCard agent={card} size="sm" />
                  </div>
                ) : (
                  <AgentCard agent={card} size="sm" isFlipped />
                )}
              </div>
            ))}
          </div>

          {revealIndex >= openedCards.length - 1 && (
            <div className="text-center animate-[fade-in_0.5s_ease-out]">
              <div className="flex justify-center gap-4 mb-6">
                {["legendary", "epic", "rare", "common"].map((r) => {
                  const count = openedCards.filter((c) => c.rarity === r).length;
                  if (count === 0) return null;
                  return (
                    <span key={r} className="font-pixel text-[7px] tracking-wider" style={{ color: getRarityColor(r as "legendary") }}>
                      {count}x {r.toUpperCase()}
                    </span>
                  );
                })}
              </div>
              <button onClick={handleClose} className="pixel-btn text-[9px]">
                CONTINUE
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
