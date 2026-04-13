"use client";

import { Agent, UserAgent } from "@/types";
import { getRarityColor } from "@/lib/utils";
import AgentCard from "./AgentCard";
import StatBar from "../ui/StatBar";

interface AgentCardDetailProps {
  agent: Agent;
  userAgent?: UserAgent;
  onClose: () => void;
}

function getRarityLabel(rarity: string) {
  switch (rarity) {
    case "legendary": return "LEGENDARY";
    case "epic": return "EPIC";
    case "rare": return "RARE";
    default: return "COMMON";
  }
}

export default function AgentCardDetail({ agent, userAgent, onClose }: AgentCardDetailProps) {
  const rarityColor = getRarityColor(agent.rarity);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90" />

      {/* Modal */}
      <div
        className="relative pixel-card-gold p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-[fade-in_0.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center font-pixel text-[8px] text-white hover:text-white transition-colors"
          style={{
            background: "#111",
            border: "2px solid #333",
            boxShadow: "inset -2px -2px 0 #222, inset 2px 2px 0 #444",
          }}
        >
          X
        </button>

        <div className="flex flex-col sm:flex-row gap-6">
          {/* Card */}
          <div className="flex justify-center shrink-0">
            <AgentCard agent={agent} size="lg" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h2 className="font-pixel text-[10px] sm:text-xs text-white mb-2 tracking-wider">
              {agent.name}
            </h2>
            <div className="flex items-center gap-2 mb-3">
              <span
                className="px-2 py-1 font-pixel text-[6px] tracking-wider"
                style={{
                  backgroundColor: rarityColor + "20",
                  color: rarityColor,
                  border: `2px solid ${rarityColor}`,
                  boxShadow: `inset -2px -2px 0 ${rarityColor}40`,
                }}
              >
                {getRarityLabel(agent.rarity)}
              </span>
              <span className="font-pixel text-[6px] text-white/50 tracking-wider">{agent.techStack}</span>
            </div>

            <p className="text-[10px] text-[#e0d6b8]/50 italic mb-4 leading-relaxed">
              &quot;{agent.flavorText}&quot;
            </p>

            {/* Stats */}
            <div className="space-y-2">
              <StatBar label="PAC" value={agent.stats.pace} />
              <StatBar label="SHO" value={agent.stats.shooting} />
              <StatBar label="PAS" value={agent.stats.passing} />
              <StatBar label="DRI" value={agent.stats.dribbling} />
              <StatBar label="DEF" value={agent.stats.defending} />
              <StatBar label="PHY" value={agent.stats.physical} />
            </div>

            {/* User agent info */}
            {userAgent && (
              <div className="mt-4 pt-4 border-t-2 border-[#333] space-y-2">
                <div className="flex justify-between">
                  <span className="font-pixel text-[6px] text-white/50">LEVEL</span>
                  <span className="font-pixel text-[7px] text-white">{userAgent.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-pixel text-[6px] text-white/50">XP</span>
                  <span className="font-pixel text-[7px] text-white">{userAgent.xp}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-pixel text-[6px] text-white/50">MINT</span>
                  <span className="font-pixel text-[5px] text-white/40 truncate ml-2 max-w-[120px]">
                    {userAgent.mintAddress}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
