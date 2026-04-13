"use client";

import { Agent, Position } from "@/types";
import { getRarityColor } from "@/lib/utils";

interface SquadSlotProps {
  agent: Agent | null;
  slot: string;
  position: Position;
  isSelected: boolean;
  onClick: () => void;
}

function getPosColor(position: Position) {
  if (position === "GK") return "#eab308";
  if (["CB", "LB", "RB"].includes(position)) return "#1E8F4E";
  if (["CDM", "CM", "CAM"].includes(position)) return "#3b82f6";
  if (["ST", "LW", "RW"].includes(position)) return "#ef4444";
  return "#a855f7";
}

export default function SquadSlot({ agent, slot, position, isSelected, onClick }: SquadSlotProps) {
  const posColor = getPosColor(position);

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 group"
      title={`${slot} (${position})`}
    >
      {agent ? (
        <>
          <div
            className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center overflow-hidden transition-all"
            style={{
              border: `3px solid ${getRarityColor(agent.rarity)}`,
              background: "#111",
              boxShadow: isSelected
                ? `0 0 12px ${getRarityColor(agent.rarity)}, inset -2px -2px 0 #222, inset 2px 2px 0 #444`
                : "inset -2px -2px 0 #222, inset 2px 2px 0 #444",
              imageRendering: "pixelated",
              transform: isSelected ? "scale(1.1)" : undefined,
            }}
          >
            <div
              className="w-10 h-10 sm:w-12 sm:h-12"
              style={{ imageRendering: "pixelated" }}
              dangerouslySetInnerHTML={{ __html: agent.avatarSvg }}
            />
          </div>
          <span className="font-pixel text-[5px] sm:text-[6px] text-white truncate max-w-[60px] text-center leading-tight">
            {agent.name}
          </span>
          <span className="font-pixel text-[6px] font-bold" style={{ color: getRarityColor(agent.rarity) }}>
            {agent.overall}
          </span>
        </>
      ) : (
        <>
          <div
            className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center transition-all"
            style={{
              border: `2px dashed ${posColor}80`,
              background: isSelected ? `${posColor}15` : "rgba(255,255,255,0.03)",
              boxShadow: isSelected ? `0 0 12px ${posColor}` : undefined,
              imageRendering: "pixelated",
              transform: isSelected ? "scale(1.1)" : undefined,
            }}
          >
            <span className="font-pixel text-[10px] text-white/40 group-hover:text-white transition-colors">+</span>
          </div>
          <span className="font-pixel text-[6px]" style={{ color: posColor }}>
            {position}
          </span>
        </>
      )}
    </button>
  );
}
