"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { Agent, Formation, Position } from "@/types";
import { calculateChemistry } from "@/lib/utils";
import { getUser, updateTeamName, getSquads, createSquad, updateSquad } from "@/lib/api";
import { mapUserAgents, DbUserAgent } from "@/lib/mapAgent";
import FootballPitch from "@/components/squad/FootballPitch";
import { FORMATIONS } from "@/components/squad/FormationPositions";
import AgentCard from "@/components/cards/AgentCard";

const FORMATION_OPTIONS: Formation[] = ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1"];

function compatiblePositions(slotPosition: Position): Position[] {
  if (slotPosition === "GK") return ["GK"];
  if (slotPosition === "CB") return ["CB"];
  if (slotPosition === "LB") return ["LB", "CB"];
  if (slotPosition === "RB") return ["RB", "CB"];
  if (slotPosition === "CDM") return ["CDM", "CM"];
  if (slotPosition === "CM") return ["CM", "CDM", "CAM"];
  if (slotPosition === "CAM") return ["CAM", "CM"];
  if (slotPosition === "LW") return ["LW", "LB", "ST"];
  if (slotPosition === "RW") return ["RW", "RB", "ST"];
  if (slotPosition === "ST") return ["ST", "LW", "RW"];
  return [slotPosition];
}

export default function SquadPage() {
  const { address } = useAccount();
  const [ownedAgents, setOwnedAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [formation, setFormation] = useState<Formation>("4-3-3");
  const [positions, setPositions] = useState<Record<string, Agent | null>>({});
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  // Empty while loading — filled from the backend leaderboard row on
  // first paint. Every wallet gets a random team name assigned at
  // /api/users/connect ("Neon Wolves 42"-style) so the user sees
  // their real name pre-filled instead of the old "MY SQUAD"
  // placeholder. The input stays editable; saving still writes
  // whatever the user typed.
  const [squadName, setSquadName] = useState("");
  const [manager, setManager] = useState<Agent | null>(null);
  const [showManagerPicker, setShowManagerPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [squadId, setSquadId] = useState<string | null>(null);

  // Load owned agents + saved squad
  useEffect(() => {
    if (!address) {
      setOwnedAgents([]);
      return;
    }
    const wallet = address.toLowerCase();
    setLoading(true);

    Promise.all([getUser(wallet), getSquads(wallet)])
      .then(([userData, squadsData]: [unknown, unknown]) => {
        const user = userData as {
          agents?: DbUserAgent[];
          standing?: { team_name?: string | null } | null;
          username?: string | null;
        };
        const agents = mapUserAgents(user.agents || []);
        setOwnedAgents(agents);

        // Team name defaults to the wallet-slice form ("0x5A31…6568")
        // the backend seeds at /api/users/connect. If the leaderboard
        // row is somehow missing we synthesise the same format
        // client-side so the input never renders empty.
        const walletSlice = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
        const backendTeamName =
          user.standing?.team_name?.trim() ||
          user.username?.trim() ||
          walletSlice;

        // Load first saved squad if exists
        const squads = squadsData as { id: string; name: string; formation: string; positions: Record<string, string>; manager_id: string | null }[];
        if (squads && squads.length > 0) {
          const saved = squads[0];
          setSquadId(saved.id);
          setSquadName(saved.name?.trim() || backendTeamName);
          if (saved.formation) setFormation(saved.formation as Formation);

          // Rebuild positions — map agent IDs back to Agent objects
          // If an agent was sold, that slot stays empty
          if (saved.positions && typeof saved.positions === "object") {
            const rebuilt: Record<string, Agent | null> = {};
            for (const [slot, agentId] of Object.entries(saved.positions)) {
              const found = agents.find(a => a.id === agentId);
              if (found) rebuilt[slot] = found;
            }
            setPositions(rebuilt);
          }

          // Load manager
          if (saved.manager_id) {
            const mgr = agents.find(a => a.id === saved.manager_id);
            if (mgr) setManager(mgr);
          }
        } else {
          // No saved squad yet — surface the backend-assigned random
          // team name in the input so first-time users don't see an
          // empty field.
          setSquadName(backendTeamName);
        }
      })
      .catch(() => setOwnedAgents([]))
      .finally(() => setLoading(false));
  }, [address]);

  const managers = ownedAgents.filter((a) => a.position === "MGR");
  const playableAgents = ownedAgents.filter((a) => a.position !== "MGR");

  const slots = FORMATIONS[formation];
  const selectedSlotData = slots.find((s) => s.slot === selectedSlot);
  const assignedIds = new Set(Object.values(positions).filter(Boolean).map((a) => a!.id));

  const availableAgents = useMemo(() => {
    if (!selectedSlotData) return [];
    const compatible = compatiblePositions(selectedSlotData.position);
    return playableAgents
      .filter((a) => compatible.includes(a.position) && !assignedIds.has(a.id))
      .sort((a, b) => b.overall - a.overall);
  }, [selectedSlotData, assignedIds, playableAgents]);

  const assignedAgents = Object.values(positions).filter(Boolean) as Agent[];
  const chemistry = assignedAgents.length > 0 ? calculateChemistry(assignedAgents) : 0;

  const avgStats = useMemo(() => {
    if (assignedAgents.length === 0) return null;
    const sums = { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 };
    assignedAgents.forEach((a) => {
      (Object.keys(sums) as (keyof typeof sums)[]).forEach((k) => {
        sums[k] += a.stats[k];
      });
    });
    const n = assignedAgents.length;
    return {
      pace: Math.round(sums.pace / n),
      shooting: Math.round(sums.shooting / n),
      passing: Math.round(sums.passing / n),
      dribbling: Math.round(sums.dribbling / n),
      defending: Math.round(sums.defending / n),
      physical: Math.round(sums.physical / n),
    };
  }, [assignedAgents]);

  function handleSlotClick(slot: string) {
    setSelectedSlot(selectedSlot === slot ? null : slot);
    setShowManagerPicker(false);
  }

  function assignAgent(agent: Agent) {
    if (!selectedSlot) return;
    setPositions((prev) => ({ ...prev, [selectedSlot]: agent }));
    setSelectedSlot(null);
  }

  function removeAgent(slot: string) {
    setPositions((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }

  function handleFormationChange(f: Formation) {
    setFormation(f);
    setPositions({});
    setSelectedSlot(null);
  }

  const handleSave = useCallback(async () => {
    if (!address || !squadName.trim()) return;
    setSaving(true);
    setSaveMsg(null);

    // Build positions map: slot → agentId
    const posMap: Record<string, string> = {};
    for (const [slot, agent] of Object.entries(positions)) {
      if (agent) posMap[slot] = agent.id;
    }

    try {
      const wallet = address.toLowerCase();

      // Save squad (create or update)
      if (squadId) {
        await updateSquad(squadId, {
          name: squadName.trim(),
          formation,
          positions: posMap,
          managerId: manager?.id || null,
          chemistry,
        });
      } else {
        const result = await createSquad({
          walletAddress: wallet,
          name: squadName.trim(),
          formation,
          positions: posMap,
          managerId: manager?.id,
        }) as { id: string };
        setSquadId(result.id);
      }

      // Also update team name in leaderboard
      await updateTeamName(wallet, squadName.trim());

      setSaveMsg("SAVED!");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg("SAVE FAILED");
      setTimeout(() => setSaveMsg(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [address, squadName, positions, formation, manager, chemistry, squadId]);

  if (!address) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="font-pixel text-sm sm:text-base text-white tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
            SQUAD BUILDER
          </h1>
        </div>
        <div className="text-center py-20">
          <div className="font-pixel text-2xl text-white/30 mb-4">!</div>
          <h3 className="font-pixel text-[10px] text-white mb-2 tracking-wider">WALLET NOT CONNECTED</h3>
          <p className="font-pixel text-[7px] text-white/40 tracking-wider">
            CONNECT YOUR WALLET TO BUILD YOUR SQUAD
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="font-pixel text-sm sm:text-base text-white tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
            SQUAD BUILDER
          </h1>
        </div>
        <div className="text-center py-20">
          <div className="font-pixel text-lg text-white/30 mb-4 animate-pulse">...</div>
          <p className="font-pixel text-[7px] text-white/40 tracking-wider">LOADING YOUR AGENTS</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-pixel text-sm sm:text-base text-white tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
            SQUAD BUILDER
          </h1>
          <p className="font-pixel text-[7px] text-white/40 mt-2 tracking-wider">{assignedAgents.length}/11 PLAYERS</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={squadName}
            onChange={(e) => setSquadName(e.target.value)}
            className="pixel-input text-[8px]"
          />
          <button onClick={handleSave} disabled={saving} className="pixel-btn text-[8px] px-4 py-2 disabled:opacity-40">
            {saving ? "SAVING..." : saveMsg || "SAVE"}
          </button>
        </div>
      </div>

      {/* Formation selector */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <span className="font-pixel text-[7px] text-white/40 mr-2 tracking-wider">FORMATION:</span>
        {FORMATION_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => handleFormationChange(f)}
            className="font-pixel text-[7px] px-3 py-1.5 tracking-wider transition-colors"
            style={{
              background: formation === f ? "#1E8F4E" : "#111",
              color: formation === f ? "#000" : "#ffffff",
              border: `2px solid ${formation === f ? "#1E8F4E" : "#333"}`,
              boxShadow: formation === f
                ? "inset -2px -2px 0 #0B6623, inset 2px 2px 0 #2eb060"
                : "inset -2px -2px 0 #222, inset 2px 2px 0 #444",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pitch */}
        <div className="lg:col-span-2">
          {/* Chemistry + Manager bar */}
          <div className="pixel-card p-3 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div
                  className="font-pixel text-lg"
                  style={{
                    color: chemistry >= 80 ? "#1E8F4E" : chemistry >= 50 ? "#eab308" : "#ef4444",
                    textShadow: "2px 2px 0 rgba(0,0,0,0.8)",
                  }}
                >
                  {chemistry}
                </div>
                <div className="font-pixel text-[5px] text-white/40 uppercase tracking-wider">CHEM</div>
              </div>
            </div>

            {/* Manager */}
            <button
              onClick={() => { setShowManagerPicker(!showManagerPicker); setSelectedSlot(null); }}
              className="flex items-center gap-2 px-3 py-2 transition-colors"
              style={{
                background: "#111",
                border: "2px solid #333",
                boxShadow: "inset -2px -2px 0 #222, inset 2px 2px 0 #444",
              }}
            >
              {manager ? (
                <>
                  <div
                    className="w-8 h-8 overflow-hidden"
                    style={{ imageRendering: "pixelated" }}
                    dangerouslySetInnerHTML={{ __html: manager.avatarSvg }}
                  />
                  <div className="text-left">
                    <div className="font-pixel text-[6px] text-white tracking-wider">{manager.name}</div>
                    <div className="font-pixel text-[5px] text-white/30 tracking-wider">MGR +{Math.floor(manager.overall / 10)}</div>
                  </div>
                </>
              ) : (
                <span className="font-pixel text-[6px] text-white/40 tracking-wider">+ MANAGER</span>
              )}
            </button>
          </div>

          <FootballPitch
            formation={formation}
            positions={positions}
            onSlotClick={handleSlotClick}
            selectedSlot={selectedSlot}
          />

          {/* Avg stats */}
          {avgStats && (
            <div className="pixel-card p-4 mt-4">
              <h3 className="font-pixel text-[7px] text-white/50 uppercase tracking-wider mb-3">SQUAD AVERAGES</h3>
              <div className="grid grid-cols-6 gap-3 text-center">
                {(Object.entries(avgStats) as [string, number][]).map(([key, val]) => (
                  <div key={key}>
                    <div className="font-pixel text-sm text-white" style={{ textShadow: "2px 2px 0 #0B6623" }}>{val}</div>
                    <div className="font-pixel text-[5px] text-white/40 uppercase tracking-wider">{key.slice(0, 3)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Side panel: Agent picker */}
        <div className="pixel-card p-4 max-h-[350px] sm:max-h-[500px] lg:max-h-[700px] overflow-y-auto">
          {showManagerPicker ? (
            <>
              <h3 className="font-pixel text-[8px] text-white mb-3 tracking-wider">SELECT MANAGER</h3>
              {managers.length === 0 ? (
                <p className="font-pixel text-[7px] text-white/30 tracking-wider">NO MANAGERS IN YOUR COLLECTION</p>
              ) : (
                <div className="space-y-2">
                  {managers.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setManager(m); setShowManagerPicker(false); }}
                      className="w-full flex items-center gap-3 p-2 transition-colors hover:border-[#1E8F4E]"
                      style={{
                        background: "#0a0a0a",
                        border: "2px solid #333",
                        boxShadow: "inset -2px -2px 0 #222, inset 2px 2px 0 #444",
                      }}
                    >
                      <div
                        className="w-10 h-10 overflow-hidden shrink-0"
                        style={{ imageRendering: "pixelated" }}
                        dangerouslySetInnerHTML={{ __html: m.avatarSvg }}
                      />
                      <div className="text-left flex-1">
                        <div className="font-pixel text-[7px] text-white tracking-wider">{m.name}</div>
                        <div className="text-[9px] text-[#e0d6b8]/40 mt-0.5">{m.flavorText}</div>
                      </div>
                      <span className="font-pixel text-sm text-white" style={{ textShadow: "2px 2px 0 #0B6623" }}>{m.overall}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : selectedSlot && selectedSlotData ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-pixel text-[7px] text-white tracking-wider">
                  {selectedSlotData.position} - {selectedSlot}
                </h3>
                {positions[selectedSlot] && (
                  <button
                    onClick={() => removeAgent(selectedSlot)}
                    className="font-pixel text-[6px] text-[#ef4444] hover:text-[#ff6b6b] tracking-wider"
                  >
                    REMOVE
                  </button>
                )}
              </div>
              {availableAgents.length === 0 ? (
                <p className="font-pixel text-[7px] text-white/30 tracking-wider">
                  {playableAgents.length === 0 ? "OPEN PACKS TO GET AGENTS" : "NO COMPATIBLE AGENTS"}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableAgents.slice(0, 20).map((agent) => (
                    <div key={agent.id} className="cursor-pointer" onClick={() => assignAgent(agent)}>
                      <AgentCard agent={agent} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {playableAgents.length === 0 ? (
                <div className="text-center py-10">
                  <div className="font-pixel text-2xl text-white/20 mb-3">?</div>
                  <p className="font-pixel text-[7px] text-white/30 tracking-wider leading-relaxed">
                    YOUR COLLECTION IS EMPTY. OPEN PACKS TO GET AGENTS!
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="font-pixel text-[7px] text-white mb-3 tracking-wider">
                    YOUR AGENTS ({playableAgents.filter(a => !assignedIds.has(a.id)).length})
                  </h3>
                  {playableAgents.filter(a => !assignedIds.has(a.id)).length === 0 ? (
                    <p className="font-pixel text-[7px] text-white/30 tracking-wider">ALL AGENTS ASSIGNED</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {playableAgents
                        .filter(a => !assignedIds.has(a.id))
                        .sort((a, b) => b.overall - a.overall)
                        .slice(0, 30)
                        .map((agent) => (
                          <div key={agent.id}>
                            <AgentCard agent={agent} size="sm" />
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
