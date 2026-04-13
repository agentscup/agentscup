"use client";

import { useEffect, useState, useRef, useCallback } from "react";

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
  mySide: "home" | "away";
}

/* ================================================================== */
/*  Base formations — positions shift dynamically during play          */
/* ================================================================== */

const HOME_BASE = [
  { x: 5, y: 50, role: "GK" },
  { x: 18, y: 15, role: "DEF" },
  { x: 18, y: 38, role: "DEF" },
  { x: 18, y: 62, role: "DEF" },
  { x: 18, y: 85, role: "DEF" },
  { x: 32, y: 25, role: "MID" },
  { x: 32, y: 50, role: "MID" },
  { x: 32, y: 75, role: "MID" },
  { x: 44, y: 18, role: "FWD" },
  { x: 44, y: 50, role: "FWD" },
  { x: 44, y: 82, role: "FWD" },
];

const AWAY_BASE = [
  { x: 95, y: 50, role: "GK" },
  { x: 82, y: 85, role: "DEF" },
  { x: 82, y: 62, role: "DEF" },
  { x: 82, y: 38, role: "DEF" },
  { x: 82, y: 15, role: "DEF" },
  { x: 68, y: 75, role: "MID" },
  { x: 68, y: 50, role: "MID" },
  { x: 68, y: 25, role: "MID" },
  { x: 56, y: 82, role: "FWD" },
  { x: 56, y: 50, role: "FWD" },
  { x: 56, y: 18, role: "FWD" },
];

/* ================================================================== */
/*  Dynamic position shifts based on game state                        */
/* ================================================================== */

type Phase = "neutral" | "home_attack" | "away_attack" | "home_goal" | "away_goal" | "halftime";

function shiftPositions(
  base: typeof HOME_BASE,
  phase: Phase,
  isHome: boolean,
): { x: number; y: number }[] {
  return base.map((p) => {
    let dx = 0;
    let dy = 0;

    if (phase === "home_attack") {
      if (isHome) {
        // Home pushes forward
        dx = p.role === "FWD" ? 6 : p.role === "MID" ? 4 : p.role === "DEF" ? 2 : 0;
      } else {
        // Away retreats
        dx = p.role === "FWD" ? 3 : p.role === "MID" ? 2 : p.role === "DEF" ? 1 : 0;
      }
    } else if (phase === "away_attack") {
      if (!isHome) {
        dx = p.role === "FWD" ? -6 : p.role === "MID" ? -4 : p.role === "DEF" ? -2 : 0;
      } else {
        dx = p.role === "FWD" ? -3 : p.role === "MID" ? -2 : p.role === "DEF" ? -1 : 0;
      }
    } else if (phase === "home_goal") {
      if (isHome) {
        // Celebration — cluster toward center
        dx = p.role === "GK" ? 8 : p.role === "DEF" ? 5 : p.role === "MID" ? 3 : 0;
        dy = (50 - p.y) * 0.15;
      }
    } else if (phase === "away_goal") {
      if (!isHome) {
        dx = p.role === "GK" ? -8 : p.role === "DEF" ? -5 : p.role === "MID" ? -3 : 0;
        dy = (50 - p.y) * 0.15;
      }
    }

    return { x: p.x + dx, y: p.y + dy };
  });
}

/* ================================================================== */
/*  Ball path & event config                                           */
/* ================================================================== */

function getBallTarget(event: MatchEvent): { x: number; y: number } {
  const isHome = event.team === "home";
  const ry = 35 + Math.random() * 30; // random y in goal area
  switch (event.type) {
    case "goal":
      return isHome ? { x: 96, y: 50 } : { x: 4, y: 50 };
    case "shot_saved":
      return isHome ? { x: 92, y: ry } : { x: 8, y: ry };
    case "shot_missed":
      return isHome ? { x: 97, y: 30 + Math.random() * 40 } : { x: 3, y: 30 + Math.random() * 40 };
    case "pass":
      return isHome
        ? { x: 35 + Math.random() * 15, y: 20 + Math.random() * 60 }
        : { x: 50 + Math.random() * 15, y: 20 + Math.random() * 60 };
    case "tackle":
      return { x: 42 + Math.random() * 16, y: 30 + Math.random() * 40 };
    case "possession_change":
      return { x: 50, y: 50 };
    case "half_time":
      return { x: 50, y: 50 };
    default:
      return { x: 50, y: 50 };
  }
}

const FLASH_EVENTS: Record<string, { text: string; color: string; duration: number }> = {
  goal: { text: "GOAL!", color: "#FFD700", duration: 3000 },
  shot_saved: { text: "SAVE!", color: "#00AEEF", duration: 1800 },
  shot_missed: { text: "MISS!", color: "#888", duration: 1200 },
  red_card: { text: "RED CARD!", color: "#FF3B3B", duration: 2500 },
  yellow_card: { text: "YELLOW CARD!", color: "#eab308", duration: 2000 },
  injury: { text: "INJURY!", color: "#f97316", duration: 2000 },
  half_time: { text: "HALF TIME", color: "#ffffff", duration: 2500 },
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
  mySide,
}: Props) {
  const [ballPos, setBallPos] = useState({ x: 50, y: 50 });
  const [phase, setPhase] = useState<Phase>("neutral");
  const [flash, setFlash] = useState<{ text: string; color: string; team: string; playerName?: string; minute?: number } | null>(null);
  const [goalFlash, setGoalFlash] = useState(false);
  const [prevHomeScore, setPrevHomeScore] = useState(homeScore);
  const [prevAwayScore, setPrevAwayScore] = useState(awayScore);
  const [scorePulse, setScorePulse] = useState<"home" | "away" | null>(null);
  const lastEventCount = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Score change detection for pulse animation
  useEffect(() => {
    if (homeScore > prevHomeScore) {
      setScorePulse("home");
      setTimeout(() => setScorePulse(null), 2000);
    }
    if (awayScore > prevAwayScore) {
      setScorePulse("away");
      setTimeout(() => setScorePulse(null), 2000);
    }
    setPrevHomeScore(homeScore);
    setPrevAwayScore(awayScore);
  }, [homeScore, awayScore, prevHomeScore, prevAwayScore]);

  // React to new events
  const processEvents = useCallback(() => {
    if (events.length <= lastEventCount.current) return;

    const newEvents = events.slice(lastEventCount.current);
    lastEventCount.current = events.length;

    const significant = newEvents.find(e =>
      ["goal", "shot_saved", "shot_missed", "tackle", "pass", "red_card", "yellow_card", "injury", "half_time"].includes(e.type)
    ) || newEvents[newEvents.length - 1];

    if (!significant) return;

    // Move ball
    setBallPos(getBallTarget(significant));

    // Set phase for player positioning
    let newPhase: Phase = "neutral";
    if (significant.type === "goal") {
      newPhase = significant.team === "home" ? "home_goal" : "away_goal";
      setGoalFlash(true);
      setTimeout(() => setGoalFlash(false), 800);
    } else if (significant.type === "half_time") {
      newPhase = "halftime";
    } else if (["pass", "shot_saved", "shot_missed"].includes(significant.type)) {
      newPhase = significant.team === "home" ? "home_attack" : "away_attack";
    } else if (significant.type === "tackle") {
      newPhase = significant.team === "home" ? "away_attack" : "home_attack";
    }

    setPhase(newPhase);
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    phaseTimer.current = setTimeout(() => setPhase("neutral"), 2000);

    // Flash overlay
    const flashConfig = FLASH_EVENTS[significant.type];
    if (flashConfig) {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlash({
        text: flashConfig.text,
        color: flashConfig.color,
        team: significant.team,
        playerName: significant.playerName,
        minute: significant.minute,
      });
      flashTimer.current = setTimeout(() => setFlash(null), flashConfig.duration);
    }
  }, [events]);

  useEffect(() => { processEvents(); }, [processEvents]);

  // Computed player positions
  const homePositions = shiftPositions(HOME_BASE, phase, true);
  const awayPositions = shiftPositions(AWAY_BASE, phase, false);

  // Goal scorers for display
  const goalScorers = events
    .filter(e => e.type === "goal")
    .map(e => ({ team: e.team, name: e.playerName, minute: e.minute }));

  const isHalfTime = phase === "halftime" || (currentMinute === 45 && events.some(e => e.type === "half_time"));

  return (
    <div className="w-full">
      {/* Scoreboard */}
      <div
        className="pixel-card p-3 sm:p-4 mb-3 transition-all duration-300"
        style={{
          borderColor: goalFlash ? "#FFD700" : scorePulse ? (scorePulse === "home" ? "#1E8F4E" : "#FF3B3B") : "#333",
          boxShadow: goalFlash
            ? "0 0 20px rgba(255,215,0,0.3), inset -3px -3px 0 #222, inset 3px 3px 0 #444"
            : undefined,
        }}
      >
        <div className="flex items-center justify-between">
          {/* Home team */}
          <div className="flex-1 text-center sm:text-left">
            <div className="font-pixel text-[7px] sm:text-[8px] tracking-wider truncate" style={{ color: "#1E8F4E" }}>
              {homeName}
            </div>
            {/* Home goal scorers */}
            <div className="mt-1 space-y-0.5 hidden sm:block">
              {goalScorers.filter(g => g.team === "home").map((g, i) => (
                <div key={i} className="font-pixel text-[5px] text-white/30 tracking-wider">{g.name} {g.minute}&apos;</div>
              ))}
            </div>
          </div>

          {/* Score + Minute */}
          <div className="text-center px-4 sm:px-8">
            <div className="flex items-center justify-center gap-3">
              <span
                className="font-pixel text-xl sm:text-3xl text-white transition-all duration-300"
                style={{
                  textShadow: scorePulse === "home" ? "0 0 15px #1E8F4E, 2px 2px 0 #0B6623" : "2px 2px 0 #0B6623",
                  transform: scorePulse === "home" ? "scale(1.3)" : "scale(1)",
                }}
              >
                {homeScore}
              </span>
              <span className="font-pixel text-white/20 text-sm sm:text-base">-</span>
              <span
                className="font-pixel text-xl sm:text-3xl text-white transition-all duration-300"
                style={{
                  textShadow: scorePulse === "away" ? "0 0 15px #FF3B3B, 2px 2px 0 #991b1b" : "2px 2px 0 #0B6623",
                  transform: scorePulse === "away" ? "scale(1.3)" : "scale(1)",
                }}
              >
                {awayScore}
              </span>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              {isPlaying && (
                <div
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: "#00AEEF", boxShadow: "0 0 4px #00AEEF" }}
                />
              )}
              <span className="font-pixel text-[7px] text-white/40 tracking-wider">
                {isHalfTime ? "HT" : isPlaying ? `${currentMinute}'` : currentMinute >= 90 ? "FT" : `${currentMinute}'`}
              </span>
            </div>
          </div>

          {/* Away team */}
          <div className="flex-1 text-center sm:text-right">
            <div className="font-pixel text-[7px] sm:text-[8px] tracking-wider truncate" style={{ color: "#FF3B3B" }}>
              {awayName}
            </div>
            <div className="mt-1 space-y-0.5 hidden sm:block">
              {goalScorers.filter(g => g.team === "away").map((g, i) => (
                <div key={i} className="font-pixel text-[5px] text-white/30 tracking-wider">{g.name} {g.minute}&apos;</div>
              ))}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-[3px] bg-[#1a1a1a] overflow-hidden" style={{ imageRendering: "pixelated" }}>
          <div className="h-full flex">
            <div
              className="h-full bg-[#1E8F4E] transition-all duration-600"
              style={{ width: `${Math.min((currentMinute / 95) * 100, 100)}%` }}
            />
            {currentMinute >= 45 && currentMinute < 46 && (
              <div className="h-full w-[2px] bg-white/40" />
            )}
          </div>
        </div>
      </div>

      {/* Pitch */}
      <div
        className="relative w-full aspect-[2/1] sm:aspect-[5/2] overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0B6623 0%, #0a5a1f 25%, #0B6623 50%, #0a5a1f 75%, #0B6623 100%)",
          border: `3px solid ${goalFlash ? "#FFD700" : "#1E8F4E"}`,
          boxShadow: goalFlash
            ? "0 0 30px rgba(255,215,0,0.4), inset -3px -3px 0 #b8860b, inset 3px 3px 0 #ffe066"
            : "inset -3px -3px 0 #084a18, inset 3px 3px 0 #2eb060, 6px 6px 0 rgba(0,0,0,0.5)",
          imageRendering: "pixelated",
          transition: "border-color 0.3s, box-shadow 0.3s",
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

        {/* Penalty areas */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[12%] h-[55%] border-r-[2px] border-t-[2px] border-b-[2px] border-white/15" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[5%] h-[30%] border-r-[2px] border-t-[2px] border-b-[2px] border-white/15" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[12%] h-[55%] border-l-[2px] border-t-[2px] border-b-[2px] border-white/15" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[5%] h-[30%] border-l-[2px] border-t-[2px] border-b-[2px] border-white/15" />

        {/* Corner arcs (quarter circles) */}
        <div className="absolute left-0 top-0 w-[3%] h-[6%] border-b-[2px] border-r-[2px] border-white/10 rounded-br-full" />
        <div className="absolute left-0 bottom-0 w-[3%] h-[6%] border-t-[2px] border-r-[2px] border-white/10 rounded-tr-full" />
        <div className="absolute right-0 top-0 w-[3%] h-[6%] border-b-[2px] border-l-[2px] border-white/10 rounded-bl-full" />
        <div className="absolute right-0 bottom-0 w-[3%] h-[6%] border-t-[2px] border-l-[2px] border-white/10 rounded-tl-full" />

        {/* Goal nets */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[1.5%] h-[18%] border-r-[2px] border-white/25"
          style={{ background: "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)" }} />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[1.5%] h-[18%] border-l-[2px] border-white/25"
          style={{ background: "repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)" }} />

        {/* Possession glow — subtle highlight on attacking team's half */}
        {phase === "home_attack" && (
          <div className="absolute right-0 top-0 w-1/2 h-full pointer-events-none transition-opacity duration-500"
            style={{ background: "radial-gradient(ellipse at 85% 50%, rgba(30,143,78,0.08) 0%, transparent 60%)" }} />
        )}
        {phase === "away_attack" && (
          <div className="absolute left-0 top-0 w-1/2 h-full pointer-events-none transition-opacity duration-500"
            style={{ background: "radial-gradient(ellipse at 15% 50%, rgba(255,59,59,0.08) 0%, transparent 60%)" }} />
        )}

        {/* Home team players */}
        {homePositions.map((pos, i) => {
          const base = HOME_BASE[i];
          const isGK = base.role === "GK";
          return (
            <div
              key={`h-${i}`}
              className="absolute transition-all duration-700 ease-out"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: "translate(-50%, -50%)",
                zIndex: isGK ? 1 : 2,
              }}
            >
              <div className="relative flex flex-col items-center">
                {/* Shadow */}
                <div className="absolute bottom-[-2px] w-[8px] h-[2px] sm:w-[12px] sm:h-[3px] bg-black/20 rounded-full" />
                {/* Body */}
                <div
                  className="w-[6px] h-[5px] sm:w-[10px] sm:h-[7px] relative transition-shadow duration-300"
                  style={{
                    backgroundColor: isGK ? "#FFD700" : "#1E8F4E",
                    boxShadow: phase.startsWith("home") ? `0 0 8px ${isGK ? "#FFD70060" : "#1E8F4E60"}` : "none",
                  }}
                >
                  <div className="absolute -top-[4px] sm:-top-[5px] left-1/2 -translate-x-1/2 w-[4px] h-[4px] sm:w-[6px] sm:h-[5px] bg-[#FFDCB4] rounded-sm" />
                </div>
                <div className="w-[6px] h-[3px] sm:w-[10px] sm:h-[4px] bg-white" />
                <div className="w-[6px] h-[2px] sm:w-[10px] sm:h-[2px] bg-[#1a1a2e]" />
              </div>
            </div>
          );
        })}

        {/* Away team players */}
        {awayPositions.map((pos, i) => {
          const base = AWAY_BASE[i];
          const isGK = base.role === "GK";
          return (
            <div
              key={`a-${i}`}
              className="absolute transition-all duration-700 ease-out"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: "translate(-50%, -50%)",
                zIndex: isGK ? 1 : 2,
              }}
            >
              <div className="relative flex flex-col items-center">
                <div className="absolute bottom-[-2px] w-[8px] h-[2px] sm:w-[12px] sm:h-[3px] bg-black/20 rounded-full" />
                <div
                  className="w-[6px] h-[5px] sm:w-[10px] sm:h-[7px] relative transition-shadow duration-300"
                  style={{
                    backgroundColor: isGK ? "#FFD700" : "#FF3B3B",
                    boxShadow: phase.startsWith("away") ? `0 0 8px ${isGK ? "#FFD70060" : "#FF3B3B60"}` : "none",
                  }}
                >
                  <div className="absolute -top-[4px] sm:-top-[5px] left-1/2 -translate-x-1/2 w-[4px] h-[4px] sm:w-[6px] sm:h-[5px] bg-[#E8B88A] rounded-sm" />
                </div>
                <div className="w-[6px] h-[3px] sm:w-[10px] sm:h-[4px] bg-white" />
                <div className="w-[6px] h-[2px] sm:w-[10px] sm:h-[2px] bg-[#1a1a2e]" />
              </div>
            </div>
          );
        })}

        {/* Ball */}
        <div
          className="absolute z-10 transition-all duration-600 ease-out"
          style={{
            left: `${ballPos.x}%`,
            top: `${ballPos.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* Ball glow trail */}
          <div
            className="absolute w-3 h-3 sm:w-4 sm:h-4 rounded-full -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2"
            style={{
              background: `radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)`,
            }}
          />
          {/* Ball */}
          <div
            className="w-[6px] h-[6px] sm:w-2.5 sm:h-2.5 bg-white rounded-full"
            style={{
              boxShadow: "0 0 6px rgba(255,255,255,0.8), 0 1px 2px rgba(0,0,0,0.4)",
            }}
          />
        </div>

        {/* Event flash overlay */}
        {flash && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none"
            style={{
              background: flash.text === "GOAL!"
                ? "radial-gradient(ellipse at center, rgba(255,215,0,0.12) 0%, rgba(0,0,0,0.5) 70%)"
                : "rgba(0,0,0,0.45)",
              animation: "fade-in 0.15s ease-out",
            }}
          >
            <div
              className="font-pixel text-xs sm:text-base tracking-[0.2em] mb-1"
              style={{
                color: flash.color,
                textShadow: `0 0 20px ${flash.color}, 0 0 40px ${flash.color}60, 3px 3px 0 #000`,
                animation: flash.text === "GOAL!" ? "pulse 0.5s ease-in-out infinite" : "none",
              }}
            >
              {flash.text}
            </div>
            {flash.playerName && (
              <div
                className="font-pixel text-[6px] sm:text-[8px] tracking-wider mt-1"
                style={{ color: "white", textShadow: "1px 1px 0 #000" }}
              >
                {flash.playerName} {flash.minute}&apos;
              </div>
            )}
          </div>
        )}

        {/* Half-time overlay */}
        {isHalfTime && !flash && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none bg-black/50">
            <div className="text-center">
              <div className="font-pixel text-xs sm:text-sm text-white tracking-wider mb-2" style={{ textShadow: "2px 2px 0 #000" }}>
                HALF TIME
              </div>
              <div className="font-pixel text-[7px] text-white/40 tracking-wider">
                {homeScore} - {awayScore}
              </div>
            </div>
          </div>
        )}

        {/* Full time overlay */}
        {!isPlaying && currentMinute >= 90 && !flash && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none bg-black/50">
            <div className="text-center">
              <div className="font-pixel text-xs sm:text-sm text-white tracking-wider mb-2" style={{ textShadow: "2px 2px 0 #000" }}>
                FULL TIME
              </div>
              <div className="font-pixel text-lg sm:text-xl text-white tracking-wider" style={{ textShadow: "2px 2px 0 #0B6623" }}>
                {homeScore} - {awayScore}
              </div>
              {(() => {
                const myScore = mySide === "home" ? homeScore : awayScore;
                const theirScore = mySide === "home" ? awayScore : homeScore;
                const result = myScore > theirScore ? "VICTORY" : myScore < theirScore ? "DEFEAT" : "DRAW";
                const color = myScore > theirScore ? "#1E8F4E" : myScore < theirScore ? "#ef4444" : "#eab308";
                return (
                  <div className="font-pixel text-[9px] sm:text-xs tracking-[0.3em] mt-2" style={{ color, textShadow: "2px 2px 0 #000" }}>
                    {result}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* "You" indicator */}
        <div
          className="absolute top-1 sm:top-1.5 font-pixel text-[5px] sm:text-[6px] tracking-wider z-5 pointer-events-none"
          style={{
            left: mySide === "home" ? "20%" : "80%",
            color: mySide === "home" ? "#1E8F4E" : "#FF3B3B",
            textShadow: "1px 1px 0 #000, 0 0 4px rgba(0,0,0,0.8)",
            transform: "translateX(-50%)",
          }}
        >
          YOU
        </div>
      </div>
    </div>
  );
}
