"use client";

import { useState, useEffect } from "react";
import { getLeaderboard } from "@/lib/api";

interface LeaderboardEntry {
  id: string;
  user_id: string;
  team_name: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  users?: {
    wallet_address: string;
    username?: string;
  };
}

export default function LeaderboardPage() {
  const [standings, setStandings] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getLeaderboard()
      .then((data) => setStandings(data as LeaderboardEntry[]))
      .catch(() => setStandings([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="font-pixel text-sm sm:text-base text-white tracking-wider"
          style={{ textShadow: "3px 3px 0 #0B6623" }}
        >
          LEADERBOARD
        </h1>
        <p className="font-pixel text-[7px] text-white/40 mt-2 tracking-wider">
          WIN +3 PTS &middot; DRAW +1 PT &middot; LOSS +0
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="font-pixel text-lg text-white/30 mb-4 animate-pulse">...</div>
          <p className="font-pixel text-[7px] text-white/40 tracking-wider">LOADING LEADERBOARD</p>
        </div>
      ) : standings.length === 0 ? (
        <div className="text-center py-20">
          <div className="font-pixel text-2xl text-white/30 mb-4">?</div>
          <h3 className="font-pixel text-[10px] text-white mb-2 tracking-wider">NO STANDINGS YET</h3>
          <p className="font-pixel text-[7px] text-white/40 tracking-wider">
            PLAY MATCHES TO CLIMB THE LEADERBOARD!
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div
            className="overflow-hidden"
            style={{
              border: "3px solid #1E8F4E",
              boxShadow:
                "inset -3px -3px 0 #0B6623, inset 3px 3px 0 #2eb060, 6px 6px 0 rgba(0,0,0,0.5)",
            }}
          >
            {/* Table Header */}
            <div
              className="grid items-center px-3 py-2"
              style={{
                gridTemplateColumns: "32px 1fr 40px 40px 40px 40px 48px 48px 56px",
                background: "#1E8F4E",
                borderBottom: "3px solid #0B6623",
              }}
            >
              <span className="font-pixel text-[6px] text-black tracking-wider">#</span>
              <span className="font-pixel text-[6px] text-black tracking-wider">TEAM</span>
              <span className="font-pixel text-[6px] text-black tracking-wider text-center">P</span>
              <span className="font-pixel text-[6px] text-black tracking-wider text-center">W</span>
              <span className="font-pixel text-[6px] text-black tracking-wider text-center">D</span>
              <span className="font-pixel text-[6px] text-black tracking-wider text-center">L</span>
              <span className="font-pixel text-[6px] text-black tracking-wider text-center">GF</span>
              <span className="font-pixel text-[6px] text-black tracking-wider text-center">GA</span>
              <span className="font-pixel text-[6px] text-black tracking-wider text-center">PTS</span>
            </div>

            {/* Rows */}
            {standings.map((team, idx) => {
              const rank = idx + 1;
              const played = team.wins + team.draws + team.losses;

              return (
                <div
                  key={team.id}
                  className="grid items-center px-3 py-2.5 transition-colors"
                  style={{
                    gridTemplateColumns: "32px 1fr 40px 40px 40px 40px 48px 48px 56px",
                    background: idx % 2 === 0 ? "#111" : "#0a0a0a",
                    borderBottom: "1px solid #222",
                    borderLeft: "3px solid transparent",
                  }}
                >
                  <span
                    className="font-pixel text-[7px] tracking-wider"
                    style={{
                      color:
                        rank === 1
                          ? "#1E8F4E"
                          : rank === 2
                            ? "#C0C0C0"
                            : rank === 3
                              ? "#CD7F32"
                              : "#ffffff60",
                    }}
                  >
                    {rank}
                  </span>

                  <span className="font-pixel text-[7px] tracking-wider truncate text-[#e0d6b8]">
                    {team.team_name || team.users?.username || team.users?.wallet_address?.slice(0, 8) + "..." || "UNKNOWN"}
                  </span>

                  <span className="font-pixel text-[7px] text-white/60 text-center">{played}</span>
                  <span className="font-pixel text-[7px] text-[#1E8F4E] text-center">{team.wins}</span>
                  <span className="font-pixel text-[7px] text-[#eab308] text-center">{team.draws}</span>
                  <span className="font-pixel text-[7px] text-[#ef4444] text-center">{team.losses}</span>
                  <span className="font-pixel text-[7px] text-white/50 text-center">{team.goals_for}</span>
                  <span className="font-pixel text-[7px] text-white/50 text-center">{team.goals_against}</span>

                  <span
                    className="font-pixel text-[8px] text-center font-bold text-white"
                  >
                    {team.points}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 pixel-card p-4">
            <div className="flex flex-wrap gap-6 justify-center">
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[6px] text-white/40 tracking-wider">P</span>
                <span className="text-[9px] text-[#e0d6b8]/40">PLAYED</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[6px] text-[#1E8F4E] tracking-wider">W</span>
                <span className="text-[9px] text-[#e0d6b8]/40">WON</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[6px] text-[#eab308] tracking-wider">D</span>
                <span className="text-[9px] text-[#e0d6b8]/40">DRAWN</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[6px] text-[#ef4444] tracking-wider">L</span>
                <span className="text-[9px] text-[#e0d6b8]/40">LOST</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[6px] text-white/40 tracking-wider">GF/GA</span>
                <span className="text-[9px] text-[#e0d6b8]/40">GOALS FOR/AGAINST</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-pixel text-[6px] text-white tracking-wider">PTS</span>
                <span className="text-[9px] text-[#e0d6b8]/40">POINTS</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
