"use client";

import { Agent, Formation } from "@/types";
import { FORMATIONS } from "./FormationPositions";
import SquadSlot from "./SquadSlot";

interface FootballPitchProps {
  formation: Formation;
  positions: Record<string, Agent | null>;
  onSlotClick: (slot: string) => void;
  selectedSlot: string | null;
}

export default function FootballPitch({ formation, positions, onSlotClick, selectedSlot }: FootballPitchProps) {
  const slots = FORMATIONS[formation];

  return (
    <div
      className="relative w-full max-w-lg mx-auto aspect-[3/4] overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #0d3320 0%, #1a4d2e 50%, #0d3320 100%)",
        border: "3px solid #2d6b43",
        boxShadow: "inset -3px -3px 0 #0a2619, inset 3px 3px 0 #2d8a4e, 6px 6px 0 rgba(0,0,0,0.5)",
        imageRendering: "pixelated",
      }}
    >
      {/* Pitch markings */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 400" preserveAspectRatio="none">
        {/* Grass stripes */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect key={i} x="0" y={i * 50} width="300" height="25" fill={i % 2 === 0 ? "#1a4d2e" : "#1e5633"} opacity="0.3" />
        ))}
        {/* Outline */}
        <rect x="10" y="10" width="280" height="380" fill="none" stroke="#ffffff30" strokeWidth="2" />
        {/* Halfway line */}
        <line x1="10" y1="200" x2="290" y2="200" stroke="#ffffff30" strokeWidth="1.5" />
        {/* Center circle */}
        <circle cx="150" cy="200" r="40" fill="none" stroke="#ffffff30" strokeWidth="1.5" />
        <circle cx="150" cy="200" r="3" fill="#ffffff30" />
        {/* Top penalty area */}
        <rect x="70" y="10" width="160" height="60" fill="none" stroke="#ffffff30" strokeWidth="1.5" />
        <rect x="100" y="10" width="100" height="25" fill="none" stroke="#ffffff25" strokeWidth="1" />
        <circle cx="150" cy="55" r="2" fill="#ffffff30" />
        {/* Bottom penalty area */}
        <rect x="70" y="330" width="160" height="60" fill="none" stroke="#ffffff30" strokeWidth="1.5" />
        <rect x="100" y="365" width="100" height="25" fill="none" stroke="#ffffff25" strokeWidth="1" />
        <circle cx="150" cy="345" r="2" fill="#ffffff30" />
        {/* Corner arcs */}
        <path d="M10,20 A10,10 0 0,1 20,10" fill="none" stroke="#ffffff25" strokeWidth="1" />
        <path d="M280,10 A10,10 0 0,1 290,20" fill="none" stroke="#ffffff25" strokeWidth="1" />
        <path d="M10,380 A10,10 0 0,0 20,390" fill="none" stroke="#ffffff25" strokeWidth="1" />
        <path d="M280,390 A10,10 0 0,0 290,380" fill="none" stroke="#ffffff25" strokeWidth="1" />
      </svg>

      {/* Player slots */}
      {slots.map((s) => (
        <div
          key={s.slot}
          className="absolute transform -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${s.x}%`, top: `${s.y}%` }}
        >
          <SquadSlot
            agent={positions[s.slot] || null}
            slot={s.slot}
            position={s.position}
            isSelected={selectedSlot === s.slot}
            onClick={() => onSlotClick(s.slot)}
          />
        </div>
      ))}
    </div>
  );
}
