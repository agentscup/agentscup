"use client";

import { useEffect, useState } from "react";

/*
  Animated pixel art match scene:
  - Mini football pitch with lines
  - Two teams of pixel players
  - Ball that moves between them
  - Score display
  - Animated "goal" flash events
*/

const EVENTS = [
  { time: "12'", text: "GOAL!", team: "home" },
  { time: "34'", text: "SAVE!", team: "away" },
  { time: "58'", text: "GOAL!", team: "away" },
  { time: "71'", text: "GOAL!", team: "home" },
  { time: "89'", text: "RED CARD", team: "away" },
];

export default function MatchPreview() {
  const [eventIdx, setEventIdx] = useState(0);
  const [showEvent, setShowEvent] = useState(false);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [ballX, setBallX] = useState(50);

  useEffect(() => {
    const interval = setInterval(() => {
      setEventIdx((prev) => {
        const next = (prev + 1) % EVENTS.length;
        if (next === 0) {
          setHomeScore(0);
          setAwayScore(0);
        }
        const event = EVENTS[next];
        if (event.text === "GOAL!" && event.team === "home") setHomeScore((s) => s + 1);
        if (event.text === "GOAL!" && event.team === "away") setAwayScore((s) => s + 1);
        setBallX(event.team === "home" ? 75 : 25);
        setShowEvent(true);
        setTimeout(() => {
          setShowEvent(false);
          setBallX(50);
        }, 2000);
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const currentEvent = EVENTS[eventIdx];

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Match header */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <div className="text-center">
          <div className="font-pixel text-[8px] text-[#1E8F4E] tracking-wider">TEAM ALPHA</div>
        </div>
        <div className="font-pixel text-xl text-white px-4" style={{ textShadow: "2px 2px 0 #0B6623" }}>
          {homeScore} <span className="text-white/30 text-sm">-</span> {awayScore}
        </div>
        <div className="text-center">
          <div className="font-pixel text-[8px] text-[#FF3B3B] tracking-wider">TEAM OMEGA</div>
        </div>
      </div>

      {/* Mini pitch */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          height: 200,
          background: "linear-gradient(180deg, #0B6623 0%, #0a5a1f 30%, #0B6623 50%, #0a5a1f 70%, #0B6623 100%)",
          border: "3px solid #1E8F4E",
          boxShadow: "inset -3px -3px 0 #084a18, inset 3px 3px 0 #2eb060, 6px 6px 0 rgba(0,0,0,0.5)",
          imageRendering: "pixelated",
        }}
      >
        {/* Pitch markings */}
        {/* Center line */}
        <div className="absolute left-1/2 top-0 w-[2px] h-full bg-white/20" />
        {/* Center circle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-white/20" />
        {/* Center dot */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/30" />
        {/* Left penalty area */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-24 border-r-2 border-t-2 border-b-2 border-white/20" />
        {/* Right penalty area */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-24 border-l-2 border-t-2 border-b-2 border-white/20" />
        {/* Grass stripes */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 48px, rgba(255,255,255,0.02) 48px, rgba(255,255,255,0.02) 96px)",
        }} />

        {/* Home team players (green) */}
        {[
          { x: 8, y: 50 },   // GK
          { x: 22, y: 25 },  // CB
          { x: 22, y: 75 },  // CB
          { x: 35, y: 15 },  // LB
          { x: 35, y: 85 },  // RB
          { x: 42, y: 50 },  // CM
        ].map((pos, i) => (
          <div
            key={`home-${i}`}
            className="absolute w-3 h-4 transition-all duration-1000"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) ${showEvent && currentEvent.team === "home" ? `translateX(${Math.random() * 8 - 4}px)` : ""}`,
            }}
          >
            {/* Player body */}
            <div className="w-3 h-2 bg-[#1E8F4E] relative">
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#FFDCB4] rounded-sm" />
            </div>
            <div className="w-3 h-1.5 bg-white" />
            <div className="w-3 h-0.5 bg-[#1a1a2e]" />
          </div>
        ))}

        {/* Away team players (red) */}
        {[
          { x: 92, y: 50 },  // GK
          { x: 78, y: 25 },  // CB
          { x: 78, y: 75 },  // CB
          { x: 65, y: 15 },  // LB
          { x: 65, y: 85 },  // RB
          { x: 58, y: 50 },  // CM
        ].map((pos, i) => (
          <div
            key={`away-${i}`}
            className="absolute w-3 h-4 transition-all duration-1000"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) ${showEvent && currentEvent.team === "away" ? `translateX(${Math.random() * 8 - 4}px)` : ""}`,
            }}
          >
            <div className="w-3 h-2 bg-[#FF3B3B] relative">
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#E8B88A] rounded-sm" />
            </div>
            <div className="w-3 h-1.5 bg-white" />
            <div className="w-3 h-0.5 bg-[#1a1a2e]" />
          </div>
        ))}

        {/* Ball */}
        <div
          className="absolute w-2 h-2 bg-white rounded-full transition-all duration-700 ease-in-out z-10"
          style={{
            left: `${ballX}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 6px rgba(255,255,255,0.6)",
          }}
        />

        {/* Event flash */}
        {showEvent && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div
              className="px-4 py-2 font-pixel text-sm tracking-wider animate-pulse"
              style={{
                color: currentEvent.text === "GOAL!" ? "#FFD700" : currentEvent.text === "RED CARD" ? "#FF3B3B" : "#00AEEF",
                textShadow: `0 0 10px ${currentEvent.text === "GOAL!" ? "#FFD700" : currentEvent.text === "RED CARD" ? "#FF3B3B" : "#00AEEF"}, 2px 2px 0 #000`,
                background: "rgba(0,0,0,0.6)",
              }}
            >
              {currentEvent.time} {currentEvent.text}
            </div>
          </div>
        )}
      </div>

      {/* Match ticker */}
      <div className="mt-3 flex justify-center gap-2 overflow-hidden">
        {EVENTS.map((e, i) => (
          <div
            key={i}
            className={`font-pixel text-[6px] px-2 py-1 transition-all duration-300 ${
              i === eventIdx ? "opacity-100 scale-110" : "opacity-30 scale-90"
            }`}
            style={{
              color: e.text === "GOAL!" ? "#FFD700" : e.text === "RED CARD" ? "#FF3B3B" : "#00AEEF",
              background: i === eventIdx ? "rgba(255,255,255,0.05)" : "transparent",
            }}
          >
            {e.time} {e.text}
          </div>
        ))}
      </div>
    </div>
  );
}
