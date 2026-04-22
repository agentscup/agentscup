"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Rarity } from "@/lib/earlyAccess/cardGen";

interface LeaderboardRow {
  rank: number;
  handle: string;
  displayName: string;
  avatarUrl: string;
  followerCount: number;
  rarity: Rarity;
  overall: number;
  score: number;
  position: string;
}

interface Props {
  /** Maximum rows to fetch from the server. The leaderboard API
   *  clamps this to 100. Server-side cache is per-limit so two
   *  callers with different limits live in different cache slots. */
  limit?: number;
  /** Highlight the row matching this handle (the signed-in user's own rank). */
  highlightHandle?: string;
  /** Compact dense variant — avatars 28px, tighter padding. Used on
   *  the landing preview. Also disables the LOAD MORE button
   *  (compact is meant to be a short teaser). */
  compact?: boolean;
  /** Show a small header with the total count. */
  showHeader?: boolean;
  /** How many rows to render on first paint. If fewer than the
   *  fetched length, a LOAD MORE button appears and reveals the
   *  rest in steps. Defaults to `limit` (show everything) so
   *  existing call sites keep their old behaviour. */
  initialVisible?: number;
  /** How many rows LOAD MORE reveals per click. */
  loadMoreStep?: number;
}

const RARITY_COLORS: Record<Rarity, string> = {
  COMMON: "#9abd9a",
  RARE: "#00aeef",
  EPIC: "#b068ff",
  LEGENDARY: "#FFD700",
};

export default function Leaderboard({
  limit = 50,
  highlightHandle,
  compact = false,
  showHeader = true,
  initialVisible,
  loadMoreStep = 20,
}: Props) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // How many rows the user has expanded to. Starts at
  // `initialVisible ?? limit` and grows by loadMoreStep per click
  // until it meets the fetched row count. Compact variant used to
  // skip the LOAD MORE entirely (teaser intent) but that left the
  // landing / mobile leaderboard stuck at 5 rows even when players
  // wanted to scroll further — so compact now honours the same
  // initialVisible + loadMoreStep knobs, just with tighter row
  // styling.
  const initialCount = initialVisible ?? limit;
  const [visible, setVisible] = useState(initialCount);

  useEffect(() => {
    let cancelled = false;

    // Initial fetch + polling. The endpoint is CDN-cached at ~10s
    // so a 15s client-side poll lands mostly on cache hits and keeps
    // every tab on the page in sync with newly claimed cards without
    // hammering the DB. Append a timestamp param so the browser's
    // own http cache doesn't dedup on the URL.
    const load = () => {
      fetch(`/api/early-access/leaderboard?limit=${limit}&_t=${Date.now()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { rows?: LeaderboardRow[]; total?: number } | null) => {
          if (cancelled) return;
          setRows(data?.rows ?? []);
          setTotal(data?.total ?? 0);
        })
        .catch(() => {
          if (!cancelled) setError("Could not load leaderboard");
        });
    };

    load();
    const id = setInterval(load, 15_000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [limit]);

  const targetHandle = highlightHandle?.toLowerCase();

  return (
    <div className="w-full animate-[fade-up_500ms_cubic-bezier(0.16,1,0.3,1)_both]">
      {showHeader && (
        <div className="flex items-baseline justify-between mb-4 px-1">
          <div>
            <div className="font-pixel text-[7px] text-white/40 tracking-[0.4em] mb-1">
              LEADERBOARD
            </div>
            <div
              className="font-pixel text-sm text-white tracking-[0.1em]"
              style={{ textShadow: "2px 2px 0 #0B6623" }}
            >
              TOP FOUNDERS
            </div>
          </div>
          {total > 0 && (
            <div className="font-pixel text-[7px] text-white/35 tracking-[0.3em]">
              {total.toLocaleString()} CLAIMED
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="font-pixel text-[8px] text-red-400 tracking-[0.15em] px-3 py-2">
          {error}
        </div>
      )}

      <div className={compact ? "space-y-1" : "space-y-1.5"}>
        {rows === null
          ? Array.from({ length: Math.min(5, limit) }).map((_, i) => (
              <SkeletonRow key={i} compact={compact} />
            ))
          : rows.length === 0
          ? (
            <div className="font-pixel text-[8px] text-white/35 tracking-[0.2em] text-center py-8">
              NO CLAIMS YET — BE THE FIRST
            </div>
          )
          : rows.slice(0, visible).map((row) => (
              <Row
                key={row.handle}
                row={row}
                compact={compact}
                highlighted={
                  targetHandle ? row.handle.toLowerCase() === targetHandle : false
                }
              />
            ))}
      </div>

      {/* LOAD MORE — shows whenever there are more rows than
          currently visible, regardless of compact. One click reveals
          the next `loadMoreStep` rows; auto-hides when everything
          fetched is shown. */}
      {rows && rows.length > visible && (
        <button
          onClick={() =>
            setVisible((v) => Math.min(rows.length, v + loadMoreStep))
          }
          className="w-full mt-3 py-3 font-pixel text-[8px] text-white/70 tracking-[0.3em] transition-colors hover:text-white"
          style={{
            background: "rgba(10,20,10,0.5)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderLeftWidth: "3px",
            borderLeftColor: "#1E8F4E",
          }}
        >
          LOAD MORE ({rows.length - visible} MORE)
        </button>
      )}

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

function Row({
  row,
  compact,
  highlighted,
}: {
  row: LeaderboardRow;
  compact: boolean;
  highlighted: boolean;
}) {
  const rarityColor = RARITY_COLORS[row.rarity];
  const avatarSize = compact ? 28 : 36;
  const isPodium = row.rank <= 3;

  return (
    <div
      className="relative flex items-center gap-2.5 sm:gap-3 transition-colors duration-200 px-2.5 py-2 sm:px-3.5 sm:py-2.5"
      style={{
        background: highlighted
          ? "rgba(255,215,0,0.08)"
          : "rgba(10,20,10,0.4)",
        border: `1px solid ${highlighted ? "rgba(255,215,0,0.3)" : "rgba(255,255,255,0.05)"}`,
        borderLeftWidth: "3px",
        borderLeftColor: highlighted ? "#FFD700" : rarityColor,
      }}
    >
      {/* Rank */}
      <div
        className="shrink-0 w-6 sm:w-8 text-center font-pixel tracking-[0.05em]"
        style={{
          fontSize: isPodium ? "12px" : "9px",
          color: isPodium
            ? ["#FFD700", "#E0E0E0", "#CD7F32"][row.rank - 1]
            : "rgba(255,255,255,0.4)",
          textShadow: isPodium
            ? `0 0 8px ${["#FFD700", "#E0E0E0", "#CD7F32"][row.rank - 1]}80`
            : "none",
        }}
      >
        {row.rank}
      </div>

      {/* Avatar */}
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: avatarSize,
          height: avatarSize,
          border: `1.5px solid ${rarityColor}80`,
          borderRadius: "1px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={row.avatarUrl}
          alt={row.displayName}
          width={avatarSize}
          height={avatarSize}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      {/* Name + handle */}
      <div className="flex-1 min-w-0">
        <div
          className="font-pixel truncate tracking-[0.05em]"
          style={{
            fontSize: compact ? "10px" : "11px",
            color: highlighted ? "#FFD700" : "#fff",
          }}
        >
          {row.displayName}
        </div>
        <div className="text-[9px] sm:text-[10px] text-white/40 truncate leading-tight mt-0.5">
          <span className="hidden sm:inline">@{row.handle} · </span>
          {formatFollowers(row.followerCount)}
          <span className="hidden sm:inline"> followers</span>
        </div>
      </div>

      {/* OVR + rarity — rarity pill hides on very narrow so OVR
          always stays visible and the row never wraps */}
      <div className="shrink-0 flex items-center gap-2 sm:gap-2.5">
        <div
          className="hidden xs:block font-pixel text-[6px] tracking-[0.25em] px-1.5 py-0.5"
          style={{
            color: rarityColor,
            border: `1px solid ${rarityColor}60`,
            borderRadius: "1px",
          }}
        >
          {row.rarity}
        </div>
        <div
          className="font-pixel text-center"
          style={{
            minWidth: compact ? 24 : 30,
            fontSize: compact ? "13px" : "15px",
            fontWeight: 700,
            color: "#fff",
            textShadow: `2px 2px 0 ${rarityColor}60`,
          }}
        >
          {row.overall}
        </div>
      </div>
    </div>
  );
}

function SkeletonRow({ compact }: { compact: boolean }) {
  const size = compact ? 28 : 36;
  return (
    <div
      className="flex items-center gap-3 animate-pulse"
      style={{
        padding: compact ? "6px 10px" : "10px 14px",
        background: "rgba(10,20,10,0.2)",
        border: "1px solid rgba(255,255,255,0.03)",
        borderLeftWidth: "3px",
        borderLeftColor: "rgba(255,255,255,0.1)",
      }}
    >
      <div className="w-8" />
      <div
        className="shrink-0"
        style={{
          width: size,
          height: size,
          background: "rgba(255,255,255,0.05)",
        }}
      />
      <div className="flex-1 space-y-1.5">
        <div className="h-2 w-3/5 bg-white/5" />
        <div className="h-1.5 w-2/5 bg-white/5" />
      </div>
      <div className="w-14 h-4 bg-white/5" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

/** Compact number: 1234 → 1.2K, 1234567 → 1.2M */
function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toString();
}
