"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  generateCard,
  FounderCard as FounderCardT,
  upgradeAvatarUrl,
  XSignals,
} from "@/lib/earlyAccess/cardGen";
import LandingHero from "@/components/earlyAccess/LandingHero";
import SignInWithX from "@/components/earlyAccess/SignInWithX";
import HandleStep from "@/components/earlyAccess/HandleStep";
import TaskList, { TaskState } from "@/components/earlyAccess/TaskList";
import CardReveal from "@/components/earlyAccess/CardReveal";
import FounderCard from "@/components/earlyAccess/FounderCard";
import TiltCard from "@/components/earlyAccess/TiltCard";
import ShareClaim from "@/components/earlyAccess/ShareClaim";
import Confetti from "@/components/earlyAccess/Confetti";

type Phase =
  | "landing"
  | "handle"        // mock fallback when OAuth env missing
  | "loading"       // signed-in, fetching signals
  | "tasks"
  | "revealing"
  | "revealed"
  | "claimed";

const EMPTY_TASKS: TaskState = {
  followBase: false,
  followAgentsCup: false,
  notificationsOn: false,
  replyPinned: false,
};

export default function EarlyAccessPage() {
  const { data: session, status } = useSession();
  const xSession = session as typeof session & {
    xUserId?: string;
    xHandle?: string;
    xAvatarUrl?: string;
  };

  const [phase, setPhase] = useState<Phase>("landing");
  const [handle, setHandle] = useState("");
  const [tasks, setTasks] = useState<TaskState>(EMPTY_TASKS);
  const [realSignals, setRealSignals] = useState<Partial<XSignals> | null>(null);
  const [card, setCard] = useState<FounderCardT | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);

  // ── Signed-in path (OAuth live) ─────────────────────────────────
  // When Auth.js reports a valid X session, skip the handle step and
  // hit /me for the real signals + follow check.
  useEffect(() => {
    if (status !== "authenticated" || !xSession?.xHandle) return;
    if (phase !== "landing" && phase !== "handle") return;
    setHandle(xSession.xHandle.toLowerCase());
    setPhase("loading");
    fetch("/api/early-access/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: (Partial<XSignals> & { followsAgentsCup?: boolean }) | null) => {
        if (data) {
          setRealSignals(data);
          // Pre-seed task toggles from real signals so the meter
          // reflects what we already know about the user.
          setTasks((t) => ({
            ...t,
            followBase: !!data.followsBase,
            followAgentsCup: !!data.followsAgentsCup,
          }));
        }
        setPhase("tasks");
      })
      .catch(() => setPhase("tasks"));
  }, [status, xSession?.xHandle, phase]);

  /** Deterministic 0-15 handle jitter (same as server-side gen). */
  const handleJitter = useMemo(() => {
    if (!handle) return 0;
    let h = 0x811c9dc5;
    const k = `jitter:${handle}`;
    for (let i = 0; i < k.length; i++) {
      h ^= k.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h % 16;
  }, [handle]);

  function buildSignals(): XSignals {
    return {
      handle,
      displayName: realSignals?.displayName ?? handle,
      avatarUrl:
        upgradeAvatarUrl(realSignals?.avatarUrl) ??
        upgradeAvatarUrl(
          `https://unavatar.io/twitter/${encodeURIComponent(handle)}`
        ),
      followerCount: realSignals?.followerCount ?? 500,
      accountAgeDays: realSignals?.accountAgeDays ?? 800,
      followsBase: tasks.followBase,
      bioMentionsBase: !!realSignals?.bioMentionsBase,
      baseTweetHits:
        (realSignals?.baseTweetHits ?? 0) + (tasks.replyPinned ? 1 : 0),
    };
  }

  async function startReveal() {
    const signals = buildSignals();
    const generated = generateCard(signals);

    let extra = 0;
    const extraBreak: FounderCardT["signalBreakdown"] = [];
    if (tasks.followAgentsCup) {
      extra += 15;
      extraBreak.push({ label: "Follows @agentscup", points: 15 });
    }
    if (tasks.notificationsOn) {
      extra += 10;
      extraBreak.push({ label: "Notifications on", points: 10 });
    }
    if (extra > 0) {
      generated.score += extra;
      generated.signalBreakdown = [...generated.signalBreakdown, ...extraBreak];
    }

    setCard(generated);
    setPhase("revealing");

    fetch("/api/early-access/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signals, card: generated }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { id?: string } | null) => {
        if (data?.id) setClaimId(data.id);
      })
      .catch(() => undefined);
  }

  async function submitClaim(tweetUrl: string) {
    if (!card) return;
    const res = await fetch("/api/early-access/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: card.handle,
        tweetUrl: tweetUrl || `https://x.com/${card.handle}`,
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

  // Is real X OAuth available? If yes, start the landing with the
  // real SignInWithX button; otherwise fall back to handle-input.
  const [oauthAvailable, setOauthAvailable] = useState(true);
  useEffect(() => {
    // Probe: /api/auth/providers should return 200 with a twitter
    // entry when OAuth is configured. If the call fails or returns
    // empty, fall back to the handle form.
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Record<string, unknown> | null) =>
        setOauthAvailable(!!data && !!data.twitter)
      )
      .catch(() => setOauthAvailable(false));
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Backdrop />
      <Confetti active={phase === "claimed"} />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-24">
        {phase === "landing" && (
          <LandingHero
            onStart={() => setPhase("handle")}
            signInWith={oauthAvailable ? <SignInWithX /> : null}
          />
        )}

        {phase === "handle" && !oauthAvailable && (
          <HandleStep
            onSubmit={(h) => {
              setHandle(h);
              setPhase("tasks");
            }}
          />
        )}

        {phase === "loading" && (
          <div className="text-center font-pixel text-[10px] text-white/60 tracking-[0.3em] py-20">
            LOADING YOUR CARD…
          </div>
        )}

        {phase === "tasks" && (
          <TaskList
            handle={handle}
            tasks={tasks}
            handleJitter={handleJitter}
            onTaskComplete={(k) => setTasks((prev) => ({ ...prev, [k]: true }))}
            onReveal={startReveal}
          />
        )}

        {phase === "revealing" && card && (
          <CardReveal card={card} onComplete={() => setPhase("revealed")} />
        )}

        {(phase === "revealed" || phase === "claimed") && card && (
          <div className="space-y-10">
            <div className="flex flex-col items-center">
              <TiltCard>
                <FounderCard card={card} />
              </TiltCard>
              {phase === "claimed" && (
                <div
                  className="mt-8 inline-flex items-center gap-2 px-4 py-2 font-pixel text-[9px] tracking-[0.3em] animate-[fade-up_0.5s_ease-out]"
                  style={{
                    background: "#1a1200",
                    color: "#FFD700",
                    border: "2px solid #FFD700",
                    boxShadow:
                      "inset -2px -2px 0 #8a6f00, inset 2px 2px 0 #FFF4B0, 3px 3px 0 rgba(0,0,0,0.5)",
                  }}
                >
                  ✓ SPOT LOCKED — SEE YOU ON LAUNCH DAY
                </div>
              )}
            </div>

            {phase === "revealed" && (
              <ShareClaim
                card={card}
                shareUrl={shareUrl}
                onClaimed={submitClaim}
              />
            )}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Backdrop() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full border border-white/[0.04]" />
      <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-white/[0.02]" />
      <div className="absolute top-0 left-1/2 w-px h-full bg-white/[0.03]" />
      <div className="absolute w-2 h-2 bg-[#2eb060]/30 top-[10%] left-[15%] animate-[pixel-blink_2s_step-end_infinite]" />
      <div className="absolute w-2 h-2 bg-[#2eb060]/20 top-[30%] right-[20%] animate-[pixel-blink_3s_step-end_infinite]" />
      <div className="absolute w-1 h-1 bg-white/20 top-[60%] left-[40%] animate-[pixel-blink_2.5s_step-end_infinite]" />
      <div className="absolute w-1 h-1 bg-[#2eb060]/30 top-[20%] right-[35%] animate-[pixel-blink_1.5s_step-end_infinite]" />
      <div className="absolute w-3 h-3 bg-[#FFD700]/15 top-[70%] right-[15%] animate-[pixel-blink_3s_step-end_infinite]" style={{ animationDelay: "1s" }} />
      <div className="absolute w-2 h-2 bg-[#FFD700]/15 top-[50%] left-[10%] animate-[pixel-blink_2.2s_step-end_infinite]" />
      <div className="absolute w-2 h-2 bg-[#00AEEF]/20 top-[80%] left-[55%] animate-[pixel-blink_2.8s_step-end_infinite]" style={{ animationDelay: "0.5s" }} />
    </div>
  );
}
