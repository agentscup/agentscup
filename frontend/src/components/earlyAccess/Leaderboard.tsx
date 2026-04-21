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
  /** How many rows to fetch/show. */
  limit?: number;
  /** Highlight the row matching this handle (the signed-in user's own rank). */
  highlightHandle?: string;
  /** Compact dense variant — avatars 28px, tighter padding. Used on
   *  the landing preview. */
  compact?: boolean;
  /** Show a small header with the total count. */
  showHeader?: boolean;
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
}: Props) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/early-access/leaderboard?limit=${limit}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { rows?: LeaderboardRow[]; total?: number } | null) => {
        if (cancelled) return;
        setRows(data?.rows ?? []);
        setTotal(data?.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load leaderboard");
      });
    return () => {
      cancelled = true;
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
          : rows.map((row) => (
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
  const padding = compact ? "6px 10px" : "10px 14px";
  const isPodium = row.rank <= 3;

  return (
    <div
      className="relative flex items-center gap-3 transition-colors duration-200"
      style={{
        padding,
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
        className="shrink-0 w-8 text-center font-pixel tracking-[0.05em]"
        style={{
          fontSize: isPodium ? "13px" : "10px",
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
        <div className="text-[10px] text-white/40 truncate leading-tight mt-0.5">
          @{row.handle} · {formatFollowers(row.followerCount)} followers
        </div>
      </div>

      {/* OVR + rarity */}
      <div className="shrink-0 flex items-center gap-2.5">
        <div
          className="font-pixel text-[6px] tracking-[0.25em] px-1.5 py-0.5"
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
            minWidth: compact ? 28 : 34,
            fontSize: compact ? "14px" : "16px",
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
