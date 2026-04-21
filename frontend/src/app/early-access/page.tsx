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
  followAgentsCup: false,
  notificationsOn: false,
  replyPinned: false,
};

const LS_KEYS = {
  handle: "agentscup.earlyAccess.handle",
  tasks: (h: string) => `agentscup.earlyAccess.tasks.${h}`,
} as const;

function readLS(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private-mode failures */
  }
}

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
  const [restoreChecked, setRestoreChecked] = useState(false);

  // ── Page refresh restore ─────────────────────────────────────────
  // Before we show anything, check if the user already has a reveal
  // or claim on record (by OAuth session handle or a locally-cached
  // mock handle). If so, skip them straight back to the right phase
  // so refresh doesn't reset their progress.
  useEffect(() => {
    if (restoreChecked) return;
    // Wait for Auth.js to settle before deciding which handle to use.
    if (status === "loading") return;

    const oauthHandle = xSession?.xHandle?.toLowerCase() ?? null;
    const cachedHandle = readLS(LS_KEYS.handle);
    const targetHandle = oauthHandle ?? cachedHandle;

    if (!targetHandle) {
      setRestoreChecked(true);
      return;
    }

    const qs = oauthHandle ? "" : `?handle=${encodeURIComponent(targetHandle)}`;
    fetch(`/api/early-access/status${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data:
            | {
                status: "none" | "revealed" | "claimed";
                card?: FounderCardT;
                claimId?: string;
                tasks?: Record<string, boolean> | null;
              }
            | null
        ) => {
          if (data && data.status !== "none" && data.card) {
            setHandle(data.card.handle);
            setCard(data.card);
            if (data.claimId) setClaimId(data.claimId);
            if (data.tasks) {
              setTasks({
                followAgentsCup: !!data.tasks.followAgentsCup,
                notificationsOn: !!data.tasks.notificationsOn,
                replyPinned: !!data.tasks.replyPinned,
              });
            }
            setPhase(data.status === "claimed" ? "claimed" : "revealed");
          } else {
            // No server-side progress — maybe they have unfinished
            // task toggles in localStorage from an earlier session.
            if (cachedHandle) {
              setHandle(cachedHandle);
              const savedTasks = readLS(LS_KEYS.tasks(cachedHandle));
              if (savedTasks) {
                try {
                  const parsed = JSON.parse(savedTasks) as Partial<TaskState>;
                  setTasks((t) => ({ ...t, ...parsed }));
                } catch {
                  /* ignore corrupt cache */
                }
              }
              if (phase === "landing") setPhase("tasks");
            }
          }
        }
      )
      .catch(() => undefined)
      .finally(() => setRestoreChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, xSession?.xHandle, restoreChecked]);

  // ── Signed-in path (OAuth live) ─────────────────────────────────
  // Once restore finishes and the user is authenticated but hasn't
  // started yet, fan out to /me for real follower signals.
  useEffect(() => {
    if (!restoreChecked) return;
    if (status !== "authenticated" || !xSession?.xHandle) return;
    if (phase !== "landing" && phase !== "handle") return;
    setHandle(xSession.xHandle.toLowerCase());
    setPhase("loading");
    fetch("/api/early-access/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: (Partial<XSignals> & { followsAgentsCup?: boolean }) | null) => {
        if (data) {
          setRealSignals(data);
          setTasks((t) => ({
            ...t,
            followAgentsCup: !!data.followsAgentsCup,
          }));
        }
        setPhase("tasks");
      })
      .catch(() => setPhase("tasks"));
  }, [status, xSession?.xHandle, phase, restoreChecked]);

  // ── Persist tasks per handle so refresh keeps optimistic progress.
  useEffect(() => {
    if (!handle) return;
    writeLS(LS_KEYS.tasks(handle), JSON.stringify(tasks));
  }, [handle, tasks]);

  // Persist the handle itself the first time it's set.
  useEffect(() => {
    if (!handle) return;
    writeLS(LS_KEYS.handle, handle);
  }, [handle]);

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
      // Mock-mode default keeps unauthenticated walkthroughs in the
      // RARE bracket. Real OAuth users get their actual follower
      // count from /api/early-access/me which lifts them into EPIC /
      // LEGENDARY when they qualify.
      followerCount: realSignals?.followerCount ?? 500,
      accountAgeDays: realSignals?.accountAgeDays ?? 800,
    };
  }

  async function startReveal() {
    const signals = buildSignals();
    const generated = generateCard(signals);

    // Layer task bonuses on top of the follower-driven base score.
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
    if (tasks.replyPinned) {
      extra += 15;
      extraBreak.push({ label: "Replied to pinned post", points: 15 });
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
      body: JSON.stringify({ signals, card: generated, tasks }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { id?: string } | null) => {
        if (data?.id) setClaimId(data.id);
      })
      .catch(() => undefined);
  }

  async function submitClaim(tweetUrl: string, walletAddress: string) {
    if (!card) return;
    const res = await fetch("/api/early-access/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: card.handle,
        tweetUrl: tweetUrl || `https://x.com/${card.handle}`,
        walletAddress,
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
        {/* Suspend every phase until the restore probe finishes, so a
            returning user never sees the landing flash before being
            sent back to their claimed / revealed state. */}
        {!restoreChecked && (
          <div className="flex items-center justify-center min-h-[540px]">
            <div className="font-pixel text-[8px] text-white/30 tracking-[0.4em] animate-pulse">
              LOADING
            </div>
          </div>
        )}

        {restoreChecked && phase === "landing" && (
          <LandingHero
            onStart={() => setPhase("handle")}
            signInWith={oauthAvailable ? <SignInWithX /> : null}
          />
        )}

        {restoreChecked && phase === "handle" && !oauthAvailable && (
          <HandleStep
            onSubmit={(h) => {
              setHandle(h);
              setPhase("tasks");
            }}
          />
        )}

        {restoreChecked && phase === "loading" && (
          <div className="text-center font-pixel text-[10px] text-white/60 tracking-[0.3em] py-20">
            LOADING YOUR CARD…
          </div>
        )}

        {restoreChecked && phase === "tasks" && (
          <TaskList
            handle={handle}
            tasks={tasks}
            handleJitter={handleJitter}
            onTaskComplete={(k) => setTasks((prev) => ({ ...prev, [k]: true }))}
            onReveal={startReveal}
          />
        )}

        {restoreChecked && phase === "revealing" && card && (
          <CardReveal card={card} onComplete={() => setPhase("revealed")} />
        )}

        {restoreChecked && (phase === "revealed" || phase === "claimed") && card && (
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
