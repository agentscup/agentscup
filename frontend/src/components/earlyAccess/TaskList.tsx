"use client";

import { useEffect, useMemo, useState } from "react";
import type { Rarity } from "@/lib/earlyAccess/cardGen";
import { scoreToRarity } from "@/lib/earlyAccess/cardGen";

export interface TaskState {
  followBase: boolean;
  followAgentsCup: boolean;
  notificationsOn: boolean;
  replyPinned: boolean;
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
    key: "followBase",
    title: "Follow @base",
    subtitle: "Biggest boost — we build on Base.",
    points: 50,
    intent: "https://twitter.com/intent/follow?screen_name=base",
    accent: "#00AEEF",
    badge: "BIGGEST",
  },
  {
    key: "followAgentsCup",
    title: "Follow @agentscup",
    subtitle: "Stay in the loop on drops and updates.",
    points: 15,
    intent: "https://twitter.com/intent/follow?screen_name=agentscup",
    accent: "#1E8F4E",
  },
  {
    key: "notificationsOn",
    title: "Turn on notifications",
    subtitle: "So you don't miss launch day.",
    points: 10,
    intent: "https://x.com/agentscup",
    accent: "#b068ff",
  },
  {
    key: "replyPinned",
    title: "Reply to our pinned post",
    subtitle: "Drop an emoji. Any emoji.",
    points: 15,
    intent:
      "https://twitter.com/intent/tweet?text=" +
      encodeURIComponent("🏆 #AgentsCup @agentscup"),
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
  const score = useMemo(() => {
    let s = handleJitter;
    if (tasks.followBase) s += 50;
    if (tasks.followAgentsCup) s += 15;
    if (tasks.notificationsOn) s += 10;
    if (tasks.replyPinned) s += 15;
    return s;
  }, [tasks, handleJitter]);

  const rarity = scoreToRarity(score);
  const maxScore = handleJitter + 50 + 15 + 10 + 15;

  const tasksDone = TASKS.every((t) => tasks[t.key]);
  const remaining = TASKS.filter((t) => !tasks[t.key]).length;

  return (
    <div className="max-w-md mx-auto w-full animate-[fade-up_0.4s_ease-out]">
      <div className="text-center mb-6">
        <div className="font-pixel text-[8px] text-white/40 tracking-[0.2em] mb-1">
          PLAYING AS
        </div>
        <div
          className="font-pixel text-sm text-white tracking-[0.1em]"
          style={{ textShadow: "2px 2px 0 #0B6623" }}
        >
          @{handle}
        </div>
      </div>

      <RarityMeter score={score} rarity={rarity} maxScore={maxScore} />

      <div className="mt-6 space-y-3">
        {TASKS.map((t) => (
          <TaskRow
            key={t.key}
            def={t}
            done={tasks[t.key]}
            onDone={() => onTaskComplete(t.key)}
          />
        ))}
      </div>

      <button
        onClick={onReveal}
        disabled={!tasksDone}
        className="w-full mt-8 pixel-btn text-[10px] py-4 tracking-[0.3em] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {tasksDone
          ? "REVEAL MY CARD ↗"
          : `COMPLETE ${remaining} MORE TO REVEAL`}
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
}: {
  def: TaskDef;
  done: boolean;
  onDone: () => void;
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

  return (
    <button
      onClick={start}
      disabled={done}
      className={`group relative w-full text-left transition-transform ${
        done ? "opacity-80" : "hover:-translate-y-0.5"
      }`}
      style={{
        padding: "14px 16px",
        background: done
          ? "linear-gradient(180deg, rgba(46,176,96,0.15) 0%, rgba(11,102,35,0.15) 100%)"
          : "#0a1a0a",
        border: `2px solid ${done ? "#2eb060" : def.accent + "80"}`,
        boxShadow: done
          ? `inset -2px -2px 0 rgba(11,102,35,0.4), inset 2px 2px 0 rgba(46,176,96,0.3), 3px 3px 0 rgba(0,0,0,0.45)`
          : `inset -2px -2px 0 rgba(0,0,0,0.5), inset 2px 2px 0 rgba(255,255,255,0.04), 3px 3px 0 rgba(0,0,0,0.4)`,
        imageRendering: "pixelated",
      }}
    >
      {def.badge && !done && (
        <span
          className="absolute -top-2 -right-2 font-pixel text-[6px] tracking-[0.15em] px-1.5 py-0.5"
          style={{
            background: def.accent,
            color: "#000",
            boxShadow: `2px 2px 0 rgba(0,0,0,0.5)`,
          }}
        >
          {def.badge}
        </span>
      )}

      <div className="flex items-center gap-3">
        {/* Status dot / checkmark */}
        <div
          className="shrink-0 w-7 h-7 flex items-center justify-center font-pixel text-[10px]"
          style={{
            background: done ? "#2eb060" : "rgba(0,0,0,0.5)",
            border: `2px solid ${done ? "#FFD700" : def.accent}`,
            color: done ? "#000" : def.accent,
            imageRendering: "pixelated",
          }}
        >
          {done ? "✓" : counting != null ? counting : "→"}
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="font-pixel text-[10px] tracking-wider truncate"
            style={{ color: done ? "#2eb060" : "#fff" }}
          >
            {def.title}
          </div>
          <div className="text-[11px] text-white/50 mt-0.5 truncate">
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
            color: done ? "#FFD700" : def.accent,
            textShadow: "1px 1px 0 rgba(0,0,0,0.5)",
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
    <div
      className="p-4"
      style={{
        background: "rgba(0,0,0,0.4)",
        border: `2px solid ${color}60`,
        boxShadow: "inset -2px -2px 0 rgba(0,0,0,0.5), inset 2px 2px 0 rgba(255,255,255,0.04)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-pixel text-[7px] text-white/60 tracking-[0.2em]">
          PREDICTED RARITY
        </span>
        <span
          className="font-pixel text-[9px] tracking-[0.2em] transition-colors"
          style={{ color, textShadow: `0 0 8px ${color}80` }}
        >
          {rarity}
        </span>
      </div>
      <div
        className="relative h-3 overflow-hidden"
        style={{ background: "#000", border: "1px solid #333" }}
      >
        {/* Tier markers at 30 / 60 / 90 */}
        {[30, 60, 90].map((m) => (
          <div
            key={m}
            className="absolute top-0 bottom-0 w-px opacity-60"
            style={{
              left: `${(m / maxScore) * 100}%`,
              background: "rgba(255,255,255,0.25)",
            }}
          />
        ))}
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}aa 0%, ${color} 100%)`,
            boxShadow: `0 0 12px ${color}80`,
          }}
        />
      </div>
      <div className="flex justify-between mt-1 font-pixel text-[6px] tracking-wider text-white/30">
        <span>COMMON</span>
        <span>RARE</span>
        <span>EPIC</span>
        <span style={{ color: "#FFD700" }}>LEGENDARY</span>
      </div>
    </div>
  );
}
