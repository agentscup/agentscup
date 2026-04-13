"use client";

import { Agent, Rarity } from "@/types";
import { cn, getRarityColor } from "@/lib/utils";

interface AgentCardProps {
  agent: Agent;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  showStats?: boolean;
  isFlipped?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "w-32 h-44",
  md: "w-44 h-60",
  lg: "w-56 h-76",
};

const ratingSize = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
};

const nameSize = {
  sm: "text-[6px]",
  md: "text-[8px]",
  lg: "text-[10px]",
};

function getGlowClass(rarity: Rarity) {
  switch (rarity) {
    case "legendary": return "glow-legendary";
    case "epic": return "glow-epic";
    case "rare": return "glow-rare";
    default: return "";
  }
}

function getPositionColor(position: string) {
  if (position === "GK") return "#eab308";
  if (["CB", "LB", "RB"].includes(position)) return "#1E8F4E";
  if (["CDM", "CM", "CAM"].includes(position)) return "#3b82f6";
  if (["ST", "LW", "RW"].includes(position)) return "#ef4444";
  return "#a855f7";
}

function getCardBg(rarity: Rarity) {
  switch (rarity) {
    case "legendary": return "linear-gradient(180deg, #2a2000 0%, #111 50%, #1a1400 100%)";
    case "epic": return "linear-gradient(180deg, #1a1020 0%, #111 50%, #1a1020 100%)";
    case "rare": return "linear-gradient(180deg, #001a1a 0%, #111 50%, #001a1a 100%)";
    default: return "linear-gradient(180deg, #181818 0%, #111 50%, #181818 100%)";
  }
}

function getBorderColor(rarity: Rarity) {
  switch (rarity) {
    case "legendary": return "#FFD700";
    case "epic": return "#C0C0C0";
    case "rare": return "#00AEEF";
    default: return "#444";
  }
}

export default function AgentCard({
  agent,
  size = "md",
  onClick,
  showStats = false,
  isFlipped = false,
  className,
}: AgentCardProps) {
  const rarityColor = getRarityColor(agent.rarity);
  const borderColor = getBorderColor(agent.rarity);

  if (isFlipped) {
    return (
      <div
        className={cn(sizeClasses[size], "relative cursor-pointer transition-transform duration-300 hover:scale-105", className)}
        onClick={onClick}
      >
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            background: "#111",
            border: `3px solid #333`,
            boxShadow: "inset -3px -3px 0 #222, inset 3px 3px 0 #444, 6px 6px 0 rgba(0,0,0,0.5)",
            imageRendering: "pixelated",
          }}
        >
          <div className="text-center opacity-40">
            <div className="font-pixel text-white text-[8px] tracking-wider">AGENTS</div>
            <div className="font-pixel text-white text-[8px] tracking-wider">CUP</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          sizeClasses[size],
          "relative cursor-pointer transition-all duration-200 hover:scale-105 hover:-translate-y-1",
          getGlowClass(agent.rarity),
          className
        )}
        onClick={onClick}
        style={{
          background: getCardBg(agent.rarity),
          border: `3px solid ${borderColor}`,
          boxShadow: agent.rarity === "common"
            ? "inset -3px -3px 0 #222, inset 3px 3px 0 #555, 4px 4px 0 rgba(0,0,0,0.5)"
            : undefined,
          imageRendering: "pixelated",
        }}
      >
        {/* Position badge - top left */}
        <div className="absolute top-1.5 left-1.5 z-10">
          <div
            className="px-1.5 py-0.5 font-pixel text-[6px] text-black font-bold"
            style={{
              background: getPositionColor(agent.position),
              boxShadow: "2px 2px 0 rgba(0,0,0,0.5)",
            }}
          >
            {agent.position}
          </div>
        </div>

        {/* Overall rating - top right */}
        <div className="absolute top-1.5 right-2 z-10">
          <span
            className={cn("font-pixel font-bold", ratingSize[size])}
            style={{ color: rarityColor, textShadow: "2px 2px 0 rgba(0,0,0,0.8)" }}
          >
            {agent.overall}
          </span>
        </div>

        {/* Avatar SVG */}
        <div className="flex items-center justify-center pt-9 pb-1 px-3 flex-1">
          <div
            className={cn(
              "overflow-hidden",
              size === "sm" ? "w-14 h-14" : size === "md" ? "w-20 h-20" : "w-28 h-28"
            )}
            style={{ imageRendering: "pixelated" }}
            dangerouslySetInnerHTML={{ __html: agent.avatarSvg }}
          />
        </div>

        {/* Name + mini stats */}
        <div className="absolute bottom-1.5 left-0 right-0 text-center px-1">
          <p className={cn("font-pixel text-white truncate", nameSize[size])} style={{ textShadow: "1px 1px 0 #000" }}>
            {agent.name}
          </p>
          {size !== "sm" && (
            <div className="flex justify-center gap-[2px] mt-1 px-2">
              {(["pace", "shooting", "passing", "dribbling", "defending", "physical"] as const).map((stat) => (
                <div key={stat} className="flex-1 h-[3px] bg-black/50" style={{ imageRendering: "pixelated" }}>
                  <div
                    className="h-full"
                    style={{
                      width: `${(agent.stats[stat] / 99) * 100}%`,
                      backgroundColor: rarityColor,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full stats display */}
      {showStats && (
        <div className="w-full max-w-[200px] space-y-1 px-1">
          {(["pace", "shooting", "passing", "dribbling", "defending", "physical"] as const).map((stat) => (
            <div key={stat} className="flex items-center gap-2">
              <span className="font-pixel text-[6px] text-white/60 uppercase w-8 shrink-0">
                {stat.slice(0, 3)}
              </span>
              <div className="flex-1 h-[4px] bg-[#222]" style={{ imageRendering: "pixelated" }}>
                <div
                  className="h-full"
                  style={{
                    width: `${(agent.stats[stat] / 99) * 100}%`,
                    backgroundColor:
                      agent.stats[stat] >= 90 ? "#FFD700" :
                      agent.stats[stat] >= 70 ? "#1E8F4E" :
                      agent.stats[stat] >= 50 ? "#eab308" : "#ef4444",
                  }}
                />
              </div>
              <span className="font-pixel text-[6px] text-white w-5 text-right">
                {agent.stats[stat]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
