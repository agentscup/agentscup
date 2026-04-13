"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Agent, Formation, Position } from "@/types";
import { FORMATIONS } from "@/components/squad/FormationPositions";
import { getUser, getSquads } from "@/lib/api";
import { mapUserAgents, DbUserAgent } from "@/lib/mapAgent";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import AgentCard from "@/components/cards/AgentCard";
import type { Socket } from "socket.io-client";

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function isCompatible(agentPos: string, slotPos: string): boolean {
  if (agentPos === slotPos) return true;
  const map: Record<string, string[]> = {
    GK: ["GK"], CB: ["CB"], LB: ["LB", "CB"], RB: ["RB", "CB"],
    CDM: ["CDM", "CM"], CM: ["CM", "CDM", "CAM"], CAM: ["CAM", "CM"],
    LW: ["LW", "ST", "LB"], RW: ["RW", "ST", "RB"], ST: ["ST", "LW", "RW"],
  };
  return map[slotPos]?.includes(agentPos) ?? false;
}

function getEventIcon(type: string): string {
  switch (type) {
    case "goal": return "[GOL]";
    case "shot_saved": return "[SAV]";
    case "shot_missed": return "[MIS]";
    case "yellow_card": return "[YEL]";
    case "red_card": return "[RED]";
    case "tackle": return "[TKL]";
    case "injury": return "[INJ]";
    case "half_time": case "full_time": case "kick_off": return "[---]";
    default: return "[...]";
  }
}

function getEventColor(type: string): string {
  switch (type) {
    case "goal": return "#1E8F4E";
    case "shot_saved": return "#00E5FF";
    case "shot_missed": return "#555";
    case "yellow_card": return "#eab308";
    case "red_card": return "#ef4444";
    case "tackle": return "#1E8F4E";
    case "injury": return "#f97316";
    case "half_time": case "full_time": case "kick_off": return "#ffffff";
    default: return "#444";
  }
}

interface MatchEventData {
  minute: number;
  type: string;
  team: "home" | "away";
  playerName: string;
  targetPlayerName?: string;
  description: string;
}

interface MatchFinishData {
  result: {
    homeScore: number;
    awayScore: number;
    possession: { home: number; away: number };
    shots: { home: number; away: number };
    shotsOnTarget: { home: number; away: number };
    manOfTheMatch: { team: "home" | "away"; playerName: string; rating: number };
  };
  pointsEarned: number;
  eloChange: number;
  xpGain: number;
}

/* ================================================================== */
/*  Match Page Component                                               */
/* ================================================================== */

export default function MatchPage() {
  const { publicKey } = useWallet();
  const socketRef = useRef<Socket | null>(null);

  // Page state
  type PageState = "squad-select" | "queue" | "pre-match" | "playing" | "finished";
  const [pageState, setPageState] = useState<PageState>("squad-select");

  // Squad building state
  const [ownedAgents, setOwnedAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [formation, setFormation] = useState<Formation>("4-3-3");
  const [positions, setPositions] = useState<Record<string, Agent | null>>({});
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [manager, setManager] = useState<Agent | null>(null);

  // Match state
  const [mySide, setMySide] = useState<"home" | "away">("home");
  const [opponentName, setOpponentName] = useState("");
  const [myTeamName, setMyTeamName] = useState("");
  const [displayedEvents, setDisplayedEvents] = useState<MatchEventData[]>([]);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [currentMinute, setCurrentMinute] = useState(0);
  const [matchResult, setMatchResult] = useState<MatchFinishData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueTime, setQueueTime] = useState(0);
  const queueTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Fetch owned agents + saved squad on wallet connect
  useEffect(() => {
    if (!publicKey) {
      setOwnedAgents([]);
      return;
    }
    const wallet = publicKey.toBase58();
    setLoading(true);

    Promise.all([getUser(wallet), getSquads(wallet)])
      .then(([userData, squadsData]: [unknown, unknown]) => {
        const user = userData as { agents?: DbUserAgent[] };
        const agents = mapUserAgents(user.agents || []);
        setOwnedAgents(agents);

        // Load saved squad into match page
        const squads = squadsData as { formation: string; positions: Record<string, string>; manager_id: string | null }[];
        if (squads && squads.length > 0) {
          const saved = squads[0];
          if (saved.formation) setFormation(saved.formation as Formation);

          // Rebuild positions — skip agents that were sold
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
        }
      })
      .catch(() => setOwnedAgents([]))
      .finally(() => setLoading(false));
  }, [publicKey]);

  // Socket setup
  useEffect(() => {
    if (!publicKey) return;

    const socket = connectSocket();
    socketRef.current = socket;

    socket.on("queue_joined", () => {
      setPageState("queue");
      setError(null);
    });

    socket.on("queue_left", () => {
      setPageState("squad-select");
    });

    socket.on("queue_error", (data: { message: string }) => {
      setError(data.message);
      setPageState("squad-select");
    });

    socket.on("match_found", (data: {
      matchId: string;
      side: "home" | "away";
      opponent: { wallet: string; teamName: string };
      homeTeamName: string;
      awayTeamName: string;
    }) => {
      setMySide(data.side);
      setOpponentName(data.opponent.teamName);
      setMyTeamName(data.side === "home" ? data.homeTeamName : data.awayTeamName);
      setDisplayedEvents([]);
      setHomeScore(0);
      setAwayScore(0);
      setCurrentMinute(0);
      setMatchResult(null);
      setPageState("pre-match");

      // After 3 seconds (pre-match screen), switch to playing
      setTimeout(() => setPageState("playing"), 3000);
    });

    socket.on("match_event", (data: {
      minute: number;
      events: MatchEventData[];
      homeScore: number;
      awayScore: number;
    }) => {
      setCurrentMinute(data.minute);
      setHomeScore(data.homeScore);
      setAwayScore(data.awayScore);
      setDisplayedEvents(prev => [...prev, ...data.events]);
    });

    socket.on("match_finished", (data: MatchFinishData) => {
      setHomeScore(data.result.homeScore);
      setAwayScore(data.result.awayScore);
      setMatchResult(data);
      setPageState("finished");
    });

    socket.on("match_reconnected", (data: {
      matchId: string;
      side: "home" | "away";
      opponent: { wallet: string; teamName: string };
      currentMinute: number;
      events: MatchEventData[];
      homeScore: number;
      awayScore: number;
    }) => {
      setMySide(data.side);
      setOpponentName(data.opponent.teamName);
      setDisplayedEvents(data.events);
      setHomeScore(data.homeScore);
      setAwayScore(data.awayScore);
      setCurrentMinute(data.currentMinute);
      setPageState("playing");
    });

    // Try to reconnect to active match
    socket.emit("reconnect_match", { wallet: publicKey.toBase58() });

    return () => {
      socket.off("queue_joined");
      socket.off("queue_left");
      socket.off("queue_error");
      socket.off("match_found");
      socket.off("match_event");
      socket.off("match_finished");
      socket.off("match_reconnected");
    };
  }, [publicKey]);

  // Queue timer
  useEffect(() => {
    if (pageState === "queue") {
      setQueueTime(0);
      queueTimerRef.current = setInterval(() => {
        setQueueTime(t => t + 1);
      }, 1000);
    } else {
      if (queueTimerRef.current) {
        clearInterval(queueTimerRef.current);
        queueTimerRef.current = null;
      }
    }
    return () => {
      if (queueTimerRef.current) clearInterval(queueTimerRef.current);
    };
  }, [pageState]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [displayedEvents]);

  // Squad building helpers
  const playableAgents = useMemo(() => ownedAgents.filter(a => a.position !== "MGR"), [ownedAgents]);
  const managers = useMemo(() => ownedAgents.filter(a => a.position === "MGR"), [ownedAgents]);
  const slots = FORMATIONS[formation];
  const assignedIds = new Set(Object.values(positions).filter(Boolean).map(a => a!.id));
  const assignedCount = Object.values(positions).filter(Boolean).length;

  const selectedSlotData = slots.find(s => s.slot === selectedSlot);
  const availableAgents = useMemo(() => {
    if (!selectedSlotData) return [];
    const compatible = getCompatible(selectedSlotData.position);
    return playableAgents
      .filter(a => compatible.includes(a.position) && !assignedIds.has(a.id))
      .sort((a, b) => b.overall - a.overall);
  }, [selectedSlotData, assignedIds, playableAgents]);

  function getCompatible(slotPos: Position): Position[] {
    if (slotPos === "GK") return ["GK"];
    if (slotPos === "CB") return ["CB"];
    if (slotPos === "LB") return ["LB", "CB"];
    if (slotPos === "RB") return ["RB", "CB"];
    if (slotPos === "CDM") return ["CDM", "CM"];
    if (slotPos === "CM") return ["CM", "CDM", "CAM"];
    if (slotPos === "CAM") return ["CAM", "CM"];
    if (slotPos === "LW") return ["LW", "LB", "ST"];
    if (slotPos === "RW") return ["RW", "RB", "ST"];
    if (slotPos === "ST") return ["ST", "LW", "RW"];
    return [slotPos];
  }

  // Auto-fill squad from best available agents
  const autoFillSquad = useCallback(() => {
    const newPositions: Record<string, Agent | null> = {};
    const used = new Set<string>();

    for (const slot of slots) {
      const compatible = getCompatible(slot.position);
      const best = playableAgents
        .filter(a => compatible.includes(a.position) && !used.has(a.id))
        .sort((a, b) => b.overall - a.overall)[0];

      if (best) {
        newPositions[slot.slot] = best;
        used.add(best.id);
      }
    }
    setPositions(newPositions);
    setSelectedSlot(null);
  }, [slots, playableAgents]);

  // Find match
  const findMatch = useCallback(() => {
    if (!publicKey || !socketRef.current) return;

    // Build positions map: slot → agentId
    const posMap: Record<string, string> = {};
    for (const [slot, agent] of Object.entries(positions)) {
      if (agent) posMap[slot] = agent.id;
    }

    if (Object.keys(posMap).length < 11) {
      setError("You need 11 players in your squad to start a match");
      return;
    }

    setError(null);
    socketRef.current.emit("join_queue", {
      wallet: publicKey.toBase58(),
      formation,
      positions: posMap,
      managerId: manager?.id,
    });
  }, [publicKey, positions, formation, manager]);

  const cancelQueue = useCallback(() => {
    socketRef.current?.emit("leave_queue");
    setPageState("squad-select");
  }, []);

  const backToLobby = useCallback(() => {
    setPageState("squad-select");
    setMatchResult(null);
    setDisplayedEvents([]);
    setHomeScore(0);
    setAwayScore(0);
    setCurrentMinute(0);
  }, []);

  // ─── Not connected ──────────────────────────────────────────
  if (!publicKey) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center py-16">
          <h1 className="font-pixel text-sm sm:text-base text-white mb-4 tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
            MATCH CENTER
          </h1>
          <div className="font-pixel text-2xl text-white/30 mb-4">!</div>
          <p className="font-pixel text-[7px] text-white/40 tracking-wider">
            CONNECT YOUR WALLET TO PLAY ONLINE MATCHES
          </p>
        </div>
      </div>
    );
  }

  // ─── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center py-16">
          <h1 className="font-pixel text-sm sm:text-base text-white mb-4 tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
            MATCH CENTER
          </h1>
          <div className="font-pixel text-lg text-white/30 mb-4 animate-pulse">...</div>
          <p className="font-pixel text-[7px] text-white/40 tracking-wider">LOADING YOUR AGENTS</p>
        </div>
      </div>
    );
  }

  // ─── Squad Selection ───────────────────────────────────────
  if (pageState === "squad-select") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-8">
          <h1 className="font-pixel text-sm sm:text-base text-white mb-3 tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
            MATCH CENTER
          </h1>
          <p className="font-pixel text-[7px] text-white/40 tracking-wider">
            BUILD YOUR SQUAD AND FIND AN OPPONENT
          </p>
        </div>

        {error && (
          <div className="pixel-card p-3 mb-6 text-center" style={{ borderColor: "#ef4444" }}>
            <p className="font-pixel text-[7px] text-[#ef4444] tracking-wider">{error}</p>
          </div>
        )}

        {playableAgents.length === 0 ? (
          <div className="text-center py-16">
            <div className="font-pixel text-2xl text-white/20 mb-4">?</div>
            <h3 className="font-pixel text-[10px] text-white mb-2 tracking-wider">NO AGENTS FOUND</h3>
            <p className="font-pixel text-[7px] text-white/40 tracking-wider">
              OPEN PACKS TO GET AGENTS BEFORE PLAYING MATCHES
            </p>
          </div>
        ) : (
          <>
            {/* Formation + Controls */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className="font-pixel text-[7px] text-white/40 tracking-wider">FORMATION:</span>
              {(["4-3-3", "4-4-2", "3-5-2", "4-2-3-1"] as Formation[]).map(f => (
                <button
                  key={f}
                  onClick={() => { setFormation(f); setPositions({}); setSelectedSlot(null); }}
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

              <button onClick={autoFillSquad} className="pixel-btn-outline text-[7px] px-3 py-1.5 ml-auto">
                AUTO-FILL
              </button>
            </div>

            {/* Manager selector */}
            {managers.length > 0 && (
              <div className="pixel-card p-3 mb-4 flex items-center gap-3">
                <span className="font-pixel text-[6px] text-white/40 tracking-wider">MANAGER:</span>
                {manager ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 overflow-hidden" style={{ imageRendering: "pixelated" }}
                      dangerouslySetInnerHTML={{ __html: manager.avatarSvg }} />
                    <span className="font-pixel text-[7px] text-white tracking-wider">{manager.name}</span>
                    <button onClick={() => setManager(null)} className="font-pixel text-[6px] text-[#ef4444] tracking-wider ml-2">X</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {managers.map(m => (
                      <button key={m.id} onClick={() => setManager(m)}
                        className="flex items-center gap-1 px-2 py-1"
                        style={{ background: "#0a0a0a", border: "1px solid #333" }}>
                        <div className="w-5 h-5 overflow-hidden" style={{ imageRendering: "pixelated" }}
                          dangerouslySetInnerHTML={{ __html: m.avatarSvg }} />
                        <span className="font-pixel text-[6px] text-white/60 tracking-wider">{m.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Mini Pitch */}
              <div className="lg:col-span-2">
                <div className="relative w-full aspect-[3/2] overflow-hidden"
                  style={{
                    background: "linear-gradient(180deg, #0d3b0d 0%, #0a2f0a 50%, #072407 100%)",
                    border: "3px solid #333",
                    boxShadow: "inset -3px -3px 0 #222, inset 3px 3px 0 #444, 6px 6px 0 rgba(0,0,0,0.5)",
                  }}>
                  {/* Pitch lines */}
                  <div className="absolute inset-[8%] border border-white/10" />
                  <div className="absolute top-1/2 left-[8%] right-[8%] h-px bg-white/10" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/10" />

                  {/* Slots */}
                  {slots.map(slot => {
                    const agent = positions[slot.slot];
                    const isSelected = selectedSlot === slot.slot;
                    return (
                      <button
                        key={slot.slot}
                        onClick={() => setSelectedSlot(isSelected ? null : slot.slot)}
                        className="absolute -translate-x-1/2 -translate-y-1/2 transition-all"
                        style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                      >
                        {agent ? (
                          <div className={`text-center ${isSelected ? "scale-110" : ""}`}>
                            <div className="w-8 h-8 sm:w-10 sm:h-10 mx-auto overflow-hidden border-2"
                              style={{
                                borderColor: isSelected ? "#1E8F4E" : "#333",
                                imageRendering: "pixelated",
                              }}
                              dangerouslySetInnerHTML={{ __html: agent.avatarSvg }} />
                            <div className="font-pixel text-[4px] sm:text-[5px] text-white/80 mt-0.5 tracking-wider max-w-[60px] truncate">
                              {agent.name}
                            </div>
                            <div className="font-pixel text-[5px] sm:text-[6px] text-white">{agent.overall}</div>
                          </div>
                        ) : (
                          <div className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center border-2 border-dashed
                            ${isSelected ? "border-[#1E8F4E] bg-[#1E8F4E]/10" : "border-white/20 bg-black/30"}`}>
                            <span className="font-pixel text-[5px] sm:text-[6px] text-white/40">{slot.position}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-4">
                  <span className="font-pixel text-[7px] text-white/40 tracking-wider">
                    {assignedCount}/11 PLAYERS
                  </span>
                  <button
                    onClick={findMatch}
                    disabled={assignedCount < 11}
                    className="pixel-btn text-[10px] px-8 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {assignedCount < 11 ? `NEED ${11 - assignedCount} MORE` : "FIND MATCH"}
                  </button>
                </div>
              </div>

              {/* Agent Picker */}
              <div className="pixel-card p-4 max-h-[300px] sm:max-h-[400px] lg:max-h-[500px] overflow-y-auto">
                {selectedSlot && selectedSlotData ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-pixel text-[7px] text-white tracking-wider">
                        {selectedSlotData.position} - {selectedSlot}
                      </h3>
                      {positions[selectedSlot] && (
                        <button onClick={() => {
                          setPositions(prev => { const n = { ...prev }; delete n[selectedSlot!]; return n; });
                        }} className="font-pixel text-[6px] text-[#ef4444] tracking-wider">
                          REMOVE
                        </button>
                      )}
                    </div>
                    {availableAgents.length === 0 ? (
                      <p className="font-pixel text-[7px] text-white/30 tracking-wider">NO COMPATIBLE AGENTS</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {availableAgents.slice(0, 20).map(agent => (
                          <div key={agent.id} className="cursor-pointer" onClick={() => {
                            setPositions(prev => ({ ...prev, [selectedSlot!]: agent }));
                            setSelectedSlot(null);
                          }}>
                            <AgentCard agent={agent} size="sm" />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
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
                          .map(agent => (
                            <div key={agent.id}>
                              <AgentCard agent={agent} size="sm" />
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── Queue ─────────────────────────────────────────────────
  if (pageState === "queue") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center py-16">
          <h1 className="font-pixel text-sm sm:text-base text-white mb-6 tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
            MATCH CENTER
          </h1>

          <div className="pixel-card-gold p-8 max-w-md mx-auto">
            <div className="font-pixel text-3xl text-white mb-4 animate-pulse" style={{ textShadow: "3px 3px 0 #0B6623" }}>
              ...
            </div>
            <h2 className="font-pixel text-[10px] text-white mb-2 tracking-wider">
              SEARCHING FOR OPPONENT
            </h2>
            <p className="font-pixel text-[7px] text-white/40 tracking-wider mb-6">
              WAITING FOR ANOTHER PLAYER TO JOIN
            </p>

            <div className="font-pixel text-lg text-white/60 mb-6">
              {Math.floor(queueTime / 60)}:{String(queueTime % 60).padStart(2, "0")}
            </div>

            <button onClick={cancelQueue} className="pixel-btn-outline text-[8px] px-6 py-2">
              CANCEL
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Pre-match ─────────────────────────────────────────────
  if (pageState === "pre-match") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center py-16">
          <h1 className="font-pixel text-sm sm:text-base text-white mb-8 tracking-wider" style={{ textShadow: "3px 3px 0 #0B6623" }}>
            MATCH FOUND!
          </h1>

          <div className="flex items-center justify-center gap-8 max-w-lg mx-auto">
            <div className="pixel-card p-6 flex-1 text-center animate-[slide-up_0.5s_ease-out]">
              <div className="font-pixel text-[6px] text-white/40 mb-2 tracking-wider">
                {mySide === "home" ? "HOME" : "AWAY"}
              </div>
              <div className="font-pixel text-[9px] text-white tracking-wider">
                {myTeamName || "YOU"}
              </div>
            </div>

            <div className="font-pixel text-xl text-white animate-pulse" style={{ textShadow: "3px 3px 0 #0B6623" }}>
              VS
            </div>

            <div className="pixel-card p-6 flex-1 text-center animate-[slide-up_0.5s_ease-out_0.2s_both]">
              <div className="font-pixel text-[6px] text-white/40 mb-2 tracking-wider">
                {mySide === "home" ? "AWAY" : "HOME"}
              </div>
              <div className="font-pixel text-[9px] text-white tracking-wider">
                {opponentName}
              </div>
            </div>
          </div>

          <p className="font-pixel text-[7px] text-white/30 mt-8 tracking-wider animate-pulse">
            MATCH STARTING...
          </p>
        </div>
      </div>
    );
  }

  // ─── Playing / Finished ────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Scoreboard */}
      <div className="pixel-card-gold p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <div className="font-pixel text-[6px] text-white/40 mb-1 tracking-wider">
              {mySide === "home" ? "YOU" : "OPPONENT"}
            </div>
            <div className="font-pixel text-[8px] text-white tracking-wider">
              {mySide === "home" ? (myTeamName || "YOUR SQUAD") : opponentName}
            </div>
          </div>
          <div className="text-center px-6">
            <div className="font-pixel text-2xl sm:text-3xl text-white" style={{ textShadow: "3px 3px 0 #0B6623" }}>
              {homeScore}
              <span className="text-white/30 mx-2">-</span>
              {awayScore}
            </div>
            <div className="font-pixel text-[7px] text-white/50 mt-1 tracking-wider">
              {pageState === "playing" ? `${currentMinute}'` : "FT"}
            </div>
          </div>
          <div className="text-center flex-1">
            <div className="font-pixel text-[6px] text-white/40 mb-1 tracking-wider">
              {mySide === "away" ? "YOU" : "OPPONENT"}
            </div>
            <div className="font-pixel text-[8px] text-white tracking-wider">
              {mySide === "away" ? (myTeamName || "YOUR SQUAD") : opponentName}
            </div>
          </div>
        </div>

        {pageState === "playing" && (
          <div className="mt-4 w-full h-[4px] bg-[#222]" style={{ imageRendering: "pixelated" }}>
            <div
              className="h-full bg-[#1E8F4E] transition-all duration-300"
              style={{ width: `${(currentMinute / 95) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Live feed */}
      <div className="mb-6 overflow-hidden"
        style={{
          background: "#0a0a0a",
          border: "3px solid #333",
          boxShadow: "inset -3px -3px 0 #222, inset 3px 3px 0 #444, 6px 6px 0 rgba(0,0,0,0.5)",
        }}>
        <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: "2px solid #333" }}>
          <div className="w-2 h-2"
            style={{
              backgroundColor: pageState === "playing" ? "#00AEEF" : "#555",
              boxShadow: pageState === "playing" ? "0 0 6px #00AEEF" : "none",
            }} />
          <span className="font-pixel text-[7px] text-white/50 tracking-wider">
            {pageState === "playing" ? "LIVE — PVP" : "MATCH ENDED"}
          </span>
        </div>
        <div ref={feedRef} className="p-4 max-h-96 overflow-y-auto space-y-1.5">
          {displayedEvents.map((event, i) => (
            <div key={i} className="flex gap-3 animate-[fade-in_0.3s_ease-out]">
              <span className="font-pixel text-[6px] text-white/30 w-6 text-right shrink-0">{event.minute}&apos;</span>
              <span className="font-pixel text-[6px] shrink-0" style={{ color: getEventColor(event.type) }}>
                {getEventIcon(event.type)}
              </span>
              <span className="text-[10px] break-words" style={{ color: getEventColor(event.type) }}>
                {event.description}
              </span>
            </div>
          ))}
          {pageState === "playing" && (
            <div className="flex gap-3">
              <span className="font-pixel text-[6px] text-white/30 w-6 text-right shrink-0">&nbsp;</span>
              <span className="font-pixel text-[6px] text-white/30 pixel-blink">_</span>
            </div>
          )}
        </div>
      </div>

      {/* Post-match stats */}
      {pageState === "finished" && matchResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Stats */}
          <div className="pixel-card p-4">
            <h3 className="font-pixel text-[8px] text-white mb-4 tracking-wider">MATCH STATS</h3>
            {[
              { label: "POSSESSION", home: `${matchResult.result.possession.home}%`, away: `${matchResult.result.possession.away}%` },
              { label: "SHOTS", home: matchResult.result.shots.home, away: matchResult.result.shots.away },
              { label: "ON TARGET", home: matchResult.result.shotsOnTarget.home, away: matchResult.result.shotsOnTarget.away },
            ].map(stat => (
              <div key={stat.label} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #222" }}>
                <span className="font-pixel text-[7px] text-white w-10 text-left">{String(stat.home)}</span>
                <span className="font-pixel text-[6px] text-white/40 flex-1 text-center tracking-wider">{stat.label}</span>
                <span className="font-pixel text-[7px] text-white w-10 text-right">{String(stat.away)}</span>
              </div>
            ))}

            {/* Points + ELO */}
            <div className="mt-4 pt-3 space-y-2" style={{ borderTop: "2px solid #333" }}>
              <div className="flex items-center justify-center gap-2">
                <span className="font-pixel text-[7px] text-white/50 tracking-wider">POINTS:</span>
                <span className="font-pixel text-sm text-white" style={{ textShadow: "2px 2px 0 #0B6623" }}>
                  +{matchResult.pointsEarned}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="font-pixel text-[7px] text-white/50 tracking-wider">ELO:</span>
                <span className="font-pixel text-[9px]" style={{
                  color: matchResult.eloChange >= 0 ? "#1E8F4E" : "#ef4444",
                  textShadow: "1px 1px 0 rgba(0,0,0,0.8)",
                }}>
                  {matchResult.eloChange >= 0 ? "+" : ""}{matchResult.eloChange}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="font-pixel text-[7px] text-white/50 tracking-wider">XP:</span>
                <span className="font-pixel text-[9px] text-[#00E5FF]">
                  +{matchResult.xpGain}
                </span>
              </div>
            </div>
          </div>

          {/* MOTM + Play Again */}
          <div className="pixel-card-gold p-4">
            <h3 className="font-pixel text-[8px] text-white mb-3 tracking-wider">MAN OF THE MATCH</h3>
            <div className="text-center">
              <div className="font-pixel text-lg text-white mb-2" style={{ textShadow: "2px 2px 0 #0B6623" }}>*</div>
              <div className="font-pixel text-[9px] text-white tracking-wider">
                {matchResult.result.manOfTheMatch.playerName}
              </div>
              <div className="font-pixel text-[6px] text-white/40 mt-1 tracking-wider">
                {matchResult.result.manOfTheMatch.team === mySide ? "YOUR TEAM" : "OPPONENT"}
              </div>
              <div className="font-pixel text-lg text-white mt-2" style={{ textShadow: "2px 2px 0 #0B6623" }}>
                {matchResult.result.manOfTheMatch.rating.toFixed(1)}
              </div>

              {/* Result banner */}
              <div className="mt-4 mb-4">
                {(() => {
                  const myScore = mySide === "home" ? homeScore : awayScore;
                  const theirScore = mySide === "home" ? awayScore : homeScore;
                  if (myScore > theirScore) return (
                    <div className="font-pixel text-sm text-[#1E8F4E] tracking-wider" style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.8)" }}>
                      VICTORY!
                    </div>
                  );
                  if (myScore === theirScore) return (
                    <div className="font-pixel text-sm text-[#eab308] tracking-wider" style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.8)" }}>
                      DRAW
                    </div>
                  );
                  return (
                    <div className="font-pixel text-sm text-[#ef4444] tracking-wider" style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.8)" }}>
                      DEFEAT
                    </div>
                  );
                })()}
              </div>

              <button onClick={backToLobby} className="pixel-btn text-[8px] w-full">
                PLAY AGAIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
