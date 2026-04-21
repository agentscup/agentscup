"use client";

import { useEffect, useMemo, useState } from "react";
import type { Rarity } from "@/lib/earlyAccess/cardGen";
import { scoreToRarity } from "@/lib/earlyAccess/cardGen";

export interface TaskState {
  notificationsOn: boolean;
  likePinned: boolean;
  replyPinned: boolean;
}

/**
 * Drop-in target for the @agentscup pinned launch post. When empty,
 * like / reply tasks fall back to opening the profile so the player
 * can find the post manually. Set once the canonical tweet exists
 * and both tasks will deep-link straight into the X intent dialog.
 *
 * Paste the numeric id from the tweet URL — the one after `/status/`.
 */
const PINNED_TWEET_ID = ""; // e.g. "1809123456789012345"
const AGENTSCUP_PROFILE = "https://x.com/agentscup";

function pinnedIntent(action: "like" | "reply"): string {
  if (!PINNED_TWEET_ID) return AGENTSCUP_PROFILE;
  if (action === "like") {
    return `https://twitter.com/intent/like?tweet_id=${PINNED_TWEET_ID}`;
  }
  return `https://twitter.com/intent/tweet?in_reply_to=${PINNED_TWEET_ID}`;
}

interface Props {
  handle: string;
  tasks: TaskState;
  onTaskComplete: (task: keyof TaskState) => void;
  onReveal: () => void;
  /** Deterministic jitter for the handle — shown in the meter so the
      preview matches the real rarity roll. */
  handleJitter: number;
}

interface TaskDef {
  key: keyof TaskState;
  title: string;
  subtitle: string;
  points: number;
  intent: string;
  accent: string;
  badge?: string;
}

const TASKS: TaskDef[] = [
  {
    key: "notificationsOn",
    title: "Turn on @agentscup notifications",
    subtitle: "Tap the bell on our profile — don't miss launch day.",
    points: 10,
    intent: AGENTSCUP_PROFILE,
    accent: "#b068ff",
  },
  {
    key: "likePinned",
    title: "Like our pinned post",
    subtitle: "Quick tap, big rarity boost.",
    points: 15,
    intent: pinnedIntent("like"),
    accent: "#FF3B8A",
  },
  {
    key: "replyPinned",
    title: "Reply to our pinned post",
    subtitle: "Drop an emoji. Any emoji.",
    points: 15,
    intent: pinnedIntent("reply"),
    accent: "#FFD700",
  },
];

/**
 * Shows the four signal-boosting tasks plus a live rarity meter that
 * updates as each task flips. Clicking a task opens X in a new tab
 * and auto-marks it complete after a short grace window — honour-
 * system for v1, swap to real Twitter-API verification post-OAuth.
 */
export default function TaskList({
  handle,
  tasks,
  onTaskComplete,
  onReveal,
  handleJitter,
}: Props) {
  // Tasks contribute up to +40 here. The bigger lever is follower
  // count (computed server-side at reveal time, +10 to +85). The
  // meter intentionally only previews task-driven movement — real
  // follower bonuses appear in the score when the card reveals.
  const score = useMemo(() => {
    let s = handleJitter;
    if (tasks.notificationsOn) s += 10;
    if (tasks.likePinned) s += 15;
    if (tasks.replyPinned) s += 15;
    return s;
  }, [tasks, handleJitter]);

  const rarity = scoreToRarity(score);
  const maxScore = handleJitter + 10 + 15 + 15;

  const tasksDone = TASKS.every((t) => tasks[t.key]);
  const remaining = TASKS.filter((t) => !tasks[t.key]).length;

  return (
    <div className="max-w-[440px] mx-auto w-full animate-[fade-up_500ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="text-center mb-8">
        <div className="font-pixel text-[7px] text-white/35 tracking-[0.45em] mb-2">
          SIGNED IN AS
        </div>
        <div
          className="font-pixel text-base text-white tracking-[0.1em]"
          style={{ textShadow: "2px 2px 0 #0B6623" }}
        >
          @{handle}
        </div>
      </div>

      <RarityMeter score={score} rarity={rarity} maxScore={maxScore} />

      <div className="mt-8 space-y-2.5">
        {TASKS.map((t, i) => (
          <TaskRow
            key={t.key}
            def={t}
            done={tasks[t.key]}
            onDone={() => onTaskComplete(t.key)}
            index={i}
          />
        ))}
      </div>

      <button
        onClick={onReveal}
        disabled={!tasksDone}
        className="w-full mt-10 pixel-btn text-[10px] py-4 tracking-[0.4em] disabled:opacity-30 disabled:cursor-not-allowed transition-opacity duration-300"
      >
        {tasksDone
          ? "REVEAL MY CARD"
          : `${remaining} TASK${remaining === 1 ? "" : "S"} REMAINING`}
      </button>

      <style jsx>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Task row
// ─────────────────────────────────────────────────────────────────────

function TaskRow({
  def,
  done,
  onDone,
  index,
}: {
  def: TaskDef;
  done: boolean;
  onDone: () => void;
  index: number;
}) {
  const [launched, setLaunched] = useState(false);
  const [counting, setCounting] = useState<number | null>(null);

  // Auto-complete the task 4 seconds after the user clicks the CTA —
  // enough time for them to actually perform the action on X.
  useEffect(() => {
    if (!launched || done || counting == null) return;
    if (counting <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setCounting((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [launched, counting, done, onDone]);

  function start() {
    if (done) return;
    window.open(def.intent, "_blank", "noopener,noreferrer");
    setLaunched(true);
    setCounting(4);
  }

  const accent = done ? "#2eb060" : def.accent;

  return (
    <button
      onClick={start}
      disabled={done}
      className="group relative w-full text-left transition-all duration-300"
      style={{
        padding: "16px 18px",
        background: done
          ? "rgba(46,176,96,0.08)"
          : "rgba(10,20,10,0.6)",
        border: `1px solid ${done ? "rgba(46,176,96,0.5)" : "rgba(255,255,255,0.06)"}`,
        borderLeftWidth: "3px",
        borderLeftColor: accent,
        cursor: done ? "default" : "pointer",
        animationDelay: `${index * 60}ms`,
      }}
      onMouseEnter={(e) => {
        if (!done) {
          e.currentTarget.style.background = "rgba(15,30,15,0.8)";
          e.currentTarget.style.transform = "translateX(2px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!done) {
          e.currentTarget.style.background = "rgba(10,20,10,0.6)";
          e.currentTarget.style.transform = "translateX(0)";
        }
      }}
    >
      <div className="flex items-center gap-4">
        {/* Status indicator */}
        <div
          className="shrink-0 w-8 h-8 flex items-center justify-center font-pixel text-[11px] transition-all duration-300"
          style={{
            background: done ? "#2eb060" : "transparent",
            border: `1.5px solid ${accent}`,
            color: done ? "#000" : accent,
            borderRadius: "1px",
          }}
        >
          {done ? "✓" : counting != null ? counting : "→"}
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="font-pixel text-[10px] tracking-[0.1em] mb-1 truncate"
            style={{ color: done ? "#7fc878" : "#fff" }}
          >
            {def.title}
          </div>
          <div className="text-[11px] text-white/45 truncate leading-relaxed">
            {done
              ? "Completed"
              : counting != null
              ? `Confirming in ${counting}s…`
              : def.subtitle}
          </div>
        </div>

        <div
          className="shrink-0 font-pixel text-[10px] tracking-wider"
          style={{
            color: done ? "#7fc878" : accent,
            opacity: done ? 0.6 : 1,
          }}
        >
          +{def.points}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Rarity meter
// ─────────────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<Rarity, string> = {
  COMMON: "#9abd9a",
  RARE: "#00aeef",
  EPIC: "#b068ff",
  LEGENDARY: "#FFD700",
};

function RarityMeter({
  score,
  rarity,
  maxScore,
}: {
  score: number;
  rarity: Rarity;
  maxScore: number;
}) {
  const pct = Math.min(100, Math.round((score / Math.max(maxScore, 1)) * 100));
  const color = RARITY_COLORS[rarity];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-pixel text-[7px] text-white/40 tracking-[0.4em]">
          PREDICTED TIER
        </span>
        <span
          className="font-pixel text-[12px] tracking-[0.3em] transition-colors duration-500"
          style={{ color, textShadow: `0 0 16px ${color}80` }}
        >
          {rarity}
        </span>
      </div>

      <div className="relative">
        {/* Track */}
        <div
          className="h-[6px] overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.05)",
            borderRadius: "1px",
          }}
        >
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${color}80 0%, ${color} 100%)`,
              boxShadow: `0 0 10px ${color}80`,
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </div>
        {/* Tier ticks above track */}
        <div className="relative h-3">
          {[
            { label: "RARE", at: 30 },
            { label: "EPIC", at: 60 },
            { label: "LEGEND", at: 90 },
          ].map((t) => {
            const left = Math.min(100, (t.at / maxScore) * 100);
            const reached = score >= t.at;
            return (
              <div
                key={t.label}
                className="absolute top-0 -translate-x-1/2 transition-opacity duration-500"
                style={{
                  left: `${left}%`,
                  opacity: reached ? 1 : 0.35,
                }}
              >
                <div
                  className="w-px h-2 mx-auto"
                  style={{
                    background: reached ? color : "rgba(255,255,255,0.2)",
                  }}
                />
                <div
                  className="font-pixel text-[6px] tracking-[0.15em] mt-1 whitespace-nowrap"
                  style={{
                    color: reached ? color : "rgba(255,255,255,0.3)",
                  }}
                >
                  {t.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
