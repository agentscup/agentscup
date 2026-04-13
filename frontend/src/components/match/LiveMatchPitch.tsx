"use client";

import { useEffect, useState, useRef } from "react";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface MatchEvent {
  minute: number;
  type: string;
  team: "home" | "away";
  playerName: string;
  description: string;
}

interface Props {
  events: MatchEvent[];
  homeScore: number;
  awayScore: number;
  currentMinute: number;
  homeName: string;
  awayName: string;
  isPlaying: boolean;
}

/* ================================================================== */
/*  Player positions (11v11, horizontal pitch)                         */
/*  Home attacks RIGHT, Away attacks LEFT                              */
/* ================================================================== */

const HOME_PLAYERS = [
  { x: 5, y: 50 },   // GK
  { x: 18, y: 15 },  // LB
  { x: 18, y: 38 },  // CB
  { x: 18, y: 62 },  // CB
  { x: 18, y: 85 },  // RB
  { x: 32, y: 25 },  // CM
  { x: 32, y: 50 },  // CM
  { x: 32, y: 75 },  // CM
  { x: 44, y: 18 },  // LW
  { x: 44, y: 50 },  // ST
  { x: 44, y: 82 },  // RW
];

const AWAY_PLAYERS = [
  { x: 95, y: 50 },  // GK
  { x: 82, y: 85 },  // LB
  { x: 82, y: 62 },  // CB
  { x: 82, y: 38 },  // CB
  { x: 82, y: 15 },  // RB
  { x: 68, y: 75 },  // CM
  { x: 68, y: 50 },  // CM
  { x: 68, y: 25 },  // CM
  { x: 56, y: 82 },  // LW
  { x: 56, y: 50 },  // ST
  { x: 56, y: 18 },  // RW
];

/* ================================================================== */
/*  Ball target positions based on event type + team                   */
/* ================================================================== */

function getBallTarget(event: MatchEvent): { x: number; y: number } {
  const isHome = event.team === "home";
  switch (event.type) {
    case "goal":
      return isHome ? { x: 93, y: 50 } : { x: 7, y: 50 };
    case "shot_saved":
      return isHome ? { x: 90, y: 42 } : { x: 10, y: 42 };
    case "shot_missed":
      return isHome ? { x: 95, y: 35 } : { x: 5, y: 35 };
    case "pass":
      return isHome ? { x: 38, y: 30 + Math.random() * 40 } : { x: 62, y: 30 + Math.random() * 40 };
    case "tackle":
      return isHome ? { x: 55, y: 45 } : { x: 45, y: 55 };
    case "possession_change":
      return { x: 50, y: 50 };
    default:
      return { x: 50, y: 50 };
  }
}

/* ================================================================== */
/*  Flash overlay config                                               */
/* ================================================================== */

const FLASH_EVENTS: Record<string, { text: string; color: string }> = {
  goal: { text: "GOAL!", color: "#FFD700" },
  shot_saved: { text: "SAVE!", color: "#00AEEF" },
  red_card: { text: "RED CARD!", color: "#FF3B3B" },
  yellow_card: { text: "YELLOW!", color: "#eab308" },
  injury: { text: "INJURY", color: "#f97316" },
};

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export default function LiveMatchPitch({
  events,
  homeScore,
  awayScore,
  currentMinute,
  homeName,
  awayName,
  isPlaying,
}: Props) {
  const [ballPos, setBallPos] = useState({ x: 50, y: 50 });
  const [flash, setFlash] = useState<{ text: string; color: string; team: string } | null>(null);
  const [activeTeam, setActiveTeam] = useState<"home" | "away" | null>(null);
  const [eventPlayerName, setEventPlayerName] = useState<string | null>(null);
  const lastEventCount = useRef(0);

  // React to new events
  useEffect(() => {
    if (events.length <= lastEventCount.current) return;

    const newEvents = events.slice(lastEventCount.current);
    lastEventCount.current = events.length;

    // Process the most significant event in this batch
    const significant = newEvents.find(e =>
      ["goal", "shot_saved", "shot_missed", "tackle", "pass", "red_card", "yellow_card", "injury"].includes(e.type)
    ) || newEvents[newEvents.length - 1];

    if (!significant) return;

    // Move ball
    const target = getBallTarget(significant);
    setBallPos(target);
    setActiveTeam(significant.team);
    setEventPlayerName(significant.playerName);

    // Show flash for significant events
    const flashConfig = FLASH_EVENTS[significant.type];
    if (flashConfig) {
      setFlash({ ...flashConfig, team: significant.team });
      setTimeout(() => setFlash(null), 2000);
    }

    // Clear player highlight after a bit
    setTimeout(() => {
      setEventPlayerName(null);
      setActiveTeam(null);
    }, 1500);
  }, [events]);

  return (
    <div className="w-full">
      {/* Scoreboard above pitch */}
      <div className="flex items-center justify-center gap-4 mb-3">
        <div className="text-center flex-1">
          <div className="font-pixel text-[7px] sm:text-[8px] text-[#1E8F4E] tracking-wider truncate">{homeName}</div>
        </div>
        <div className="font-pixel text-xl sm:text-2xl text-white px-4" style={{ textShadow: "2px 2px 0 #0B6623" }}>
          {homeScore}
          <span className="text-white/30 mx-2 text-sm">-</span>
          {awayScore}
        </div>
        <div className="text-center flex-1">
          <div className="font-pixel text-[7px] sm:text-[8px] text-[#FF3B3B] tracking-wider truncate">{awayName}</div>
        </div>
      </div>

      {/* Minute bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          {isPlaying && (
            <div className="w-2 h-2" style={{ backgroundColor: "#00AEEF", boxShadow: "0 0 6px #00AEEF" }} />
          )}
          <span className="font-pixel text-[7px] text-white/50 tracking-wider">
            {isPlaying ? `${currentMinute}'` : "FT"}
          </span>
        </div>
        <div className="flex-1 h-[3px] bg-[#222]" style={{ imageRendering: "pixelated" }}>
          <div
            className="h-full bg-[#1E8F4E] transition-all duration-500"
            style={{ width: `${Math.min((currentMinute / 95) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Pitch */}
      <div
        className="relative w-full aspect-[2/1] sm:aspect-[5/2] overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0B6623 0%, #0a5a1f 25%, #0B6623 50%, #0a5a1f 75%, #0B6623 100%)",
          border: "3px solid #1E8F4E",
          boxShadow: "inset -3px -3px 0 #084a18, inset 3px 3px 0 #2eb060, 6px 6px 0 rgba(0,0,0,0.5)",
          imageRendering: "pixelated",
        }}
      >
        {/* Grass stripes */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 48px, rgba(255,255,255,0.02) 48px, rgba(255,255,255,0.02) 96px)",
        }} />

        {/* Pitch markings */}
        <div className="absolute left-1/2 top-0 w-[2px] h-full bg-white/15" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[12%] aspect-square rounded-full border-[2px] border-white/15" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/25" />

        {/* Left penalty area */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[12%] h-[55%] border-r-[2px] border-t-[2px] border-b-[2px] border-white/15" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[5%] h-[30%] border-r-[2px] border-t-[2px] border-b-[2px] border-white/15" />

        {/* Right penalty area */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[12%] h-[55%] border-l-[2px] border-t-[2px] border-b-[2px] border-white/15" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[5%] h-[30%] border-l-[2px] border-t-[2px] border-b-[2px] border-white/15" />

        {/* Goals */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[1.5%] h-[18%] bg-white/10 border-r-[2px] border-white/20" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[1.5%] h-[18%] bg-white/10 border-l-[2px] border-white/20" />

        {/* Home team players */}
        {HOME_PLAYERS.map((pos, i) => (
          <div
            key={`h-${i}`}
            className="absolute transition-all duration-700"
            style={{
              left: `${pos.x + (activeTeam === "home" ? 2 : 0)}%`,
              top: `${pos.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="relative flex flex-col items-center">
              {/* Player pixel body */}
              <div
                className="w-[6px] h-[5px] sm:w-[10px] sm:h-[7px] relative"
                style={{
                  backgroundColor: "#1E8F4E",
                  boxShadow: activeTeam === "home" ? "0 0 6px #1E8F4E80" : "none",
                }}
              >
                {/* Head */}
                <div className="absolute -top-[4px] sm:-top-[5px] left-1/2 -translate-x-1/2 w-[4px] h-[4px] sm:w-[6px] sm:h-[5px] bg-[#FFDCB4] rounded-sm" />
              </div>
              {/* Shorts */}
              <div className="w-[6px] h-[3px] sm:w-[10px] sm:h-[4px] bg-white" />
              {/* Boots */}
              <div className="w-[6px] h-[2px] sm:w-[10px] sm:h-[2px] bg-[#1a1a2e]" />
            </div>
          </div>
        ))}

        {/* Away team players */}
        {AWAY_PLAYERS.map((pos, i) => (
          <div
            key={`a-${i}`}
            className="absolute transition-all duration-700"
            style={{
              left: `${pos.x + (activeTeam === "away" ? -2 : 0)}%`,
              top: `${pos.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="relative flex flex-col items-center">
              <div
                className="w-[6px] h-[5px] sm:w-[10px] sm:h-[7px] relative"
                style={{
                  backgroundColor: "#FF3B3B",
                  boxShadow: activeTeam === "away" ? "0 0 6px #FF3B3B80" : "none",
                }}
              >
                <div className="absolute -top-[4px] sm:-top-[5px] left-1/2 -translate-x-1/2 w-[4px] h-[4px] sm:w-[6px] sm:h-[5px] bg-[#E8B88A] rounded-sm" />
              </div>
              <div className="w-[6px] h-[3px] sm:w-[10px] sm:h-[4px] bg-white" />
              <div className="w-[6px] h-[2px] sm:w-[10px] sm:h-[2px] bg-[#1a1a2e]" />
            </div>
          </div>
        ))}

        {/* Ball */}
        <div
          className="absolute w-[6px] h-[6px] sm:w-2 sm:h-2 bg-white rounded-full z-10 transition-all duration-700 ease-in-out"
          style={{
            left: `${ballPos.x}%`,
            top: `${ballPos.y}%`,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 8px rgba(255,255,255,0.7)",
          }}
        />

        {/* Event flash overlay */}
        {flash && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none animate-[fade-in_0.2s_ease-out]">
            <div
              className="px-3 py-1.5 sm:px-5 sm:py-2 font-pixel text-[10px] sm:text-sm tracking-wider animate-pulse"
              style={{
                color: flash.color,
                textShadow: `0 0 12px ${flash.color}, 2px 2px 0 #000`,
                background: "rgba(0,0,0,0.65)",
              }}
            >
              {flash.text}
            </div>
            {eventPlayerName && (
              <div
                className="absolute font-pixel text-[5px] sm:text-[7px] tracking-wider"
                style={{
                  color: flash.color,
                  textShadow: "1px 1px 0 #000",
                  top: "62%",
                }}
              >
                {eventPlayerName}
              </div>
            )}
          </div>
        )}

        {/* Kick-off / halftime / fulltime overlay */}
        {!isPlaying && currentMinute >= 90 && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none bg-black/40">
            <div
              className="font-pixel text-xs sm:text-sm text-white tracking-wider"
              style={{ textShadow: "2px 2px 0 #000" }}
            >
              FULL TIME
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
