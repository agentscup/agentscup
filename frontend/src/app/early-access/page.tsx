"use client";

import { useState } from "react";
import Image from "next/image";
import { generateCard, FounderCard as FounderCardT, XSignals, upgradeAvatarUrl } from "@/lib/earlyAccess/cardGen";
import ConnectX from "@/components/earlyAccess/ConnectX";
import CardReveal from "@/components/earlyAccess/CardReveal";
import ShareClaim from "@/components/earlyAccess/ShareClaim";

type Phase = "connect" | "revealing" | "revealed" | "claimed";

export default function EarlyAccessPage() {
  const [phase, setPhase] = useState<Phase>("connect");
  const [card, setCard] = useState<FounderCardT | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);

  async function handleConnect(raw: XSignals) {
    const signals: XSignals = {
      ...raw,
      avatarUrl: upgradeAvatarUrl(raw.avatarUrl) ?? raw.avatarUrl,
    };
    const generated = generateCard(signals);
    setCard(generated);
    setPhase("revealing");

    // Fire-and-forget: persist the reveal so the claim endpoint can
    // find the row later. If the network hiccups the user can still
    // share — we'll upsert on claim.
    try {
      const res = await fetch("/api/early-access/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signals, card: generated }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string };
        if (data.id) setClaimId(data.id);
      }
    } catch {
      /* swallow — claim endpoint will upsert */
    }
  }

  async function handleClaimed(tweetUrl: string) {
    if (!card) return;
    const res = await fetch("/api/early-access/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: card.handle,
        tweetUrl,
        claimId,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Claim failed");
    }
    setPhase("claimed");
  }

  const shareUrl =
    card && typeof window !== "undefined"
      ? `${window.location.origin}/early-access/card/${encodeURIComponent(card.handle)}`
      : "";

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Backdrop />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-20">
        <Header />

        <div className="mt-10">
          {phase === "connect" && <ConnectX onConnect={handleConnect} />}

          {phase === "revealing" && card && (
            <CardReveal card={card} onComplete={() => setPhase("revealed")} />
          )}

          {phase === "revealed" && card && (
            <div className="space-y-10">
              <div className="flex flex-col items-center">
                <CardReveal card={card} />
              </div>
              <SignalBreakdown card={card} />
              <ShareClaim
                card={card}
                shareUrl={shareUrl}
                onClaimed={handleClaimed}
              />
            </div>
          )}

          {phase === "claimed" && card && (
            <div className="space-y-10">
              <div className="flex flex-col items-center">
                <CardReveal card={card} />
              </div>
              <ShareClaim
                card={card}
                shareUrl={shareUrl}
                onClaimed={handleClaimed}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="text-center">
      <div className="flex justify-center mb-6">
        <div className="pixel-float" style={{ imageRendering: "pixelated" }}>
          <Image
            src="/trophy.svg"
            alt="Agents Cup"
            width={72}
            height={72}
            className="drop-shadow-[0_0_20px_rgba(30,143,78,0.4)]"
          />
        </div>
      </div>
      <div
        className="inline-block px-3 py-1 mb-4 font-pixel text-[8px] tracking-[0.3em]"
        style={{
          background: "#1a1200",
          color: "#FFD700",
          border: "2px solid #FFD700",
          boxShadow:
            "inset -2px -2px 0 #8a6f00, inset 2px 2px 0 #FFF4B0, 3px 3px 0 rgba(0,0,0,0.5)",
        }}
      >
        <span className="inline-block w-1.5 h-1.5 bg-[#FFD700] mr-2 animate-pulse align-middle" />
        EARLY ACCESS · ON BASE
      </div>

      <h1
        className="font-pixel text-xl sm:text-3xl text-white mb-4 tracking-wider"
        style={{ textShadow: "3px 3px 0 #0B6623, 6px 6px 0 rgba(0,0,0,0.5)" }}
      >
        AGENTS CUP
      </h1>
      <p className="font-pixel text-[8px] sm:text-[10px] text-white/50 max-w-xl mx-auto leading-relaxed tracking-wider">
        ONE CARD PER X ACCOUNT · BASE ENGAGEMENT BOOSTS RARITY
      </p>
    </div>
  );
}

function Backdrop() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full border border-white/[0.04]" />
      <div className="absolute top-0 left-1/2 w-px h-full bg-white/[0.03]" />
      <div className="absolute w-2 h-2 bg-[#2eb060]/20 top-[10%] left-[15%] animate-[pixel-blink_2s_step-end_infinite]" />
      <div className="absolute w-2 h-2 bg-[#2eb060]/20 top-[30%] right-[20%] animate-[pixel-blink_3s_step-end_infinite]" />
      <div className="absolute w-1 h-1 bg-white/20 top-[60%] left-[40%] animate-[pixel-blink_2.5s_step-end_infinite]" />
      <div className="absolute w-1 h-1 bg-[#2eb060]/30 top-[20%] right-[35%] animate-[pixel-blink_1.5s_step-end_infinite]" />
      <div className="absolute w-3 h-3 bg-white/10 top-[70%] right-[15%] animate-[pixel-blink_3s_step-end_infinite]" style={{ animationDelay: "1s" }} />
      <div className="absolute w-2 h-2 bg-[#FFD700]/10 top-[50%] left-[10%] animate-[pixel-blink_2.2s_step-end_infinite]" />
    </div>
  );
}

function SignalBreakdown({ card }: { card: FounderCardT }) {
  if (card.signalBreakdown.length === 0) {
    return (
      <div className="text-center">
        <div className="font-pixel text-[8px] text-white/40 tracking-wider">
          NO BASE SIGNALS DETECTED — COMMON PULL
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-md mx-auto w-full">
      <div className="font-pixel text-[8px] text-white/50 tracking-[0.2em] text-center mb-3">
        RARITY BREAKDOWN
      </div>
      <div className="space-y-1.5">
        {card.signalBreakdown.map((b) => (
          <div
            key={b.label}
            className="flex items-center justify-between px-3 py-1.5"
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid #1E8F4E33",
            }}
          >
            <span className="text-[11px] text-white/70">{b.label}</span>
            <span
              className="font-pixel text-[9px]"
              style={{ color: "#FFD700", textShadow: "1px 1px 0 #0B6623" }}
            >
              +{b.points}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
