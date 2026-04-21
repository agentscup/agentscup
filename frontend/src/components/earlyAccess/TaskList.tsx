"use client";

import { useEffect, useState } from "react";

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
}

interface TaskDef {
  key: keyof TaskState;
  title: string;
  subtitle: string;
  intent: string;
  accent: string;
}

const TASKS: TaskDef[] = [
  {
    key: "notificationsOn",
    title: "Turn on @agentscup notifications",
    subtitle: "Tap the bell on our profile — don't miss launch day.",
    intent: AGENTSCUP_PROFILE,
    accent: "#b068ff",
  },
  {
    key: "likePinned",
    title: "Like our pinned post",
    subtitle: "One tap on the heart.",
    intent: pinnedIntent("like"),
    accent: "#FF3B8A",
  },
  {
    key: "replyPinned",
    title: "Reply to our pinned post",
    subtitle: "Drop an emoji. Any emoji.",
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
}: Props) {
  // Rarity is entirely account-driven — tasks gate the REVEAL button
  // but do not add points. We no longer surface a live preview on
  // this screen; the reveal itself is where the rarity reveal lives.

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

      <div className="mt-2 space-y-2.5">
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
      className="group relative w-full text-left transition-all duration-300 active:translate-x-[2px] sm:hover:translate-x-[2px]"
      style={{
        padding: "14px 14px",
        minHeight: 64,
        background: done
          ? "rgba(46,176,96,0.08)"
          : "rgba(10,20,10,0.6)",
        border: `1px solid ${done ? "rgba(46,176,96,0.5)" : "rgba(255,255,255,0.06)"}`,
        borderLeftWidth: "3px",
        borderLeftColor: accent,
        cursor: done ? "default" : "pointer",
        animationDelay: `${index * 60}ms`,
        touchAction: "manipulation",
      }}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Status indicator */}
        <div
          className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center font-pixel text-[10px] sm:text-[11px] transition-all duration-300"
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
            className="font-pixel text-[9px] sm:text-[10px] tracking-[0.1em] mb-1 truncate"
            style={{ color: done ? "#7fc878" : "#fff" }}
          >
            {def.title}
          </div>
          <div className="text-[10px] sm:text-[11px] text-white/45 truncate leading-relaxed">
            {done
              ? "Completed"
              : counting != null
              ? `Confirming in ${counting}s…`
              : def.subtitle}
          </div>
        </div>

        <div
          className="shrink-0 font-pixel text-[7px] tracking-[0.3em]"
          style={{
            color: done ? "#7fc878" : "rgba(255,255,255,0.3)",
          }}
        >
          {done ? "DONE" : "REQUIRED"}
        </div>
      </div>
    </button>
  );
}

