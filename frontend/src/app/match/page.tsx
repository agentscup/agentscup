"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Agent, Formation, Position } from "@/types";
import { FORMATIONS } from "@/components/squad/FormationPositions";
import { getUser, getSquads } from "@/lib/api";
import { mapUserAgents, DbUserAgent } from "@/lib/mapAgent";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import {
  sendSolPayment,
  connection as solConnection,
  getSolBalance,
  sendStakeTransaction,
  getTokenBalance,
  STAKE_AMOUNT,
} from "@/lib/solana";
import { getStakeInfo, stakeTokens, unstakeTokens } from "@/lib/api";
import dynamic from "next/dynamic";
import AgentCard from "@/components/cards/AgentCard";

const MATCH_ENTRY_FEE_SOL = 0.01;

const LiveMatchPitch = dynamic(() => import("@/components/match/LiveMatchPitch"), {
  ssr: false,
});
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
    case "goal": return "⚽";
    case "shot_saved": return "🧤";
    case "shot_missed": return "💨";
    case "yellow_card": return "🟨";
    case "red_card": return "🟥";
    case "tackle": return "💪";
    case "foul": return "⚠️";
    case "dribble": return "🏃";
    case "injury": return "🏥";
    case "possession_change": return "🔄";
    case "half_time": case "full_time": case "kick_off": return "📣";
    default: return "•";
  }
}

function getEventColor(type: string): string {
  switch (type) {
    case "goal": return "#FFD700";
    case "shot_saved": return "#00E5FF";
    case "shot_missed": return "#666";
    case "yellow_card": return "#eab308";
    case "red_card": return "#ef4444";
    case "tackle": return "#1E8F4E";
    case "foul": return "#f59e0b";
    case "dribble": return "#8B5CF6";
    case "injury": return "#f97316";
    case "possession_change": return "#555";
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
  prizeSol?: number;
  payoutTx?: string;
  entryFeeSol?: number;
  isStaker?: boolean;
}

/* ================================================================== */
/*  Match Page Component                                               */
/* ================================================================== */

export default function MatchPage() {
  const { publicKey, signTransaction } = useWallet();
  const socketRef = useRef<Socket | null>(null);

  // Page state
  type PageState = "squad-select" | "queue" | "pre-match" | "playing" | "finished";
  const [pageState, setPageState] = useState<PageState>("squad-select");
  const [isPaying, setIsPaying] = useState(false);

  // Staking state
  const [isStaker, setIsStaker] = useState(false);
  const [stakingLoading, setStakingLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);

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

  // Check staker status on wallet connect
  useEffect(() => {
    if (!publicKey) { setIsStaker(false); return; }
    const wallet = publicKey.toBase58();
    getStakeInfo(wallet)
      .then((info) => setIsStaker(info.isStaker))
      .catch(() => setIsStaker(false));
    getTokenBalance(wallet)
      .then(setTokenBalance)
      .catch(() => setTokenBalance(0));
  }, [publicKey]);

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

  // Stable serialization for memo deps
  const assignedIdsList = useMemo(() => {
    return Object.values(positions).filter(Boolean).map(a => a!.id);
  }, [positions]);
  const assignedIds = useMemo(() => new Set(assignedIdsList), [assignedIdsList]);
  const assignedCount = assignedIdsList.length;

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

  const selectedSlotData = slots.find(s => s.slot === selectedSlot);
  const availableAgents = useMemo(() => {
    if (!selectedSlotData) return [];
    const compatible = getCompatible(selectedSlotData.position);
    return playableAgents
      .filter(a => compatible.includes(a.position) && !assignedIds.has(a.id))
      .sort((a, b) => b.overall - a.overall);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlotData?.slot, assignedIdsList, playableAgents]);

  // Auto-assign agent to first empty compatible slot (when no slot selected)
  const autoAssignAgent = useCallback((agent: Agent) => {
    for (const slot of slots) {
      // Skip filled slots
      if (positions[slot.slot]) continue;
      // Check compatibility
      const compatible = getCompatible(slot.position);
      if (compatible.includes(agent.position as Position)) {
        setPositions(prev => ({ ...prev, [slot.slot]: agent }));
        return;
      }
    }
    // No empty compatible slot found — select the first compatible slot (replace)
    for (const slot of slots) {
      const compatible = getCompatible(slot.position);
      if (compatible.includes(agent.position as Position)) {
        setSelectedSlot(slot.slot);
        return;
      }
    }
  }, [slots, positions]);

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

  // Stake $CUP tokens
  const handleStake = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setStakingLoading(true);
    setError(null);
    try {
      const bal = await getTokenBalance(publicKey.toBase58());
      if (bal < STAKE_AMOUNT) {
        setError(`Need ${STAKE_AMOUNT.toLocaleString()} $CUP to stake. You have ${bal.toLocaleString()}.`);
        return;
      }
      const txSig = await sendStakeTransaction(solConnection, publicKey, signTransaction, STAKE_AMOUNT);
      await stakeTokens(publicKey.toBase58(), txSig);
      setIsStaker(true);
      setTokenBalance(bal - STAKE_AMOUNT);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Stake failed";
      if (msg.includes("User rejected")) setError("Stake cancelled");
      else setError(`Stake error: ${msg}`);
    } finally {
      setStakingLoading(false);
    }
  }, [publicKey, signTransaction]);

  // Unstake $CUP tokens
  const handleUnstake = useCallback(async () => {
    if (!publicKey) return;
    setStakingLoading(true);
    setError(null);
    try {
      await unstakeTokens(publicKey.toBase58());
      setIsStaker(false);
      const bal = await getTokenBalance(publicKey.toBase58());
      setTokenBalance(bal);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unstake failed";
      setError(`Unstake error: ${msg}`);
    } finally {
      setStakingLoading(false);
    }
  }, [publicKey]);

  // Find match — pay entry fee then join queue
  const findMatch = useCallback(async () => {
    if (!publicKey || !socketRef.current || !signTransaction) return;

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
    setIsPaying(true);

    try {
      if (isStaker) {
        // Staker: no payment needed, join directly
        socketRef.current.emit("join_queue", {
          wallet: publicKey.toBase58(),
          formation,
          positions: posMap,
          managerId: manager?.id,
          useStake: true,
        });
      } else {
        // Normal: pay 0.01 SOL entry fee
        const balance = await getSolBalance(publicKey.toBase58());
        if (balance < MATCH_ENTRY_FEE_SOL + 0.001) {
          setError(`Insufficient balance. Need ${MATCH_ENTRY_FEE_SOL} SOL + fees. You have ${balance.toFixed(4)} SOL.`);
          setIsPaying(false);
          return;
        }

        const txSignature = await sendSolPayment(
          solConnection,
          publicKey,
          signTransaction,
          MATCH_ENTRY_FEE_SOL
        );

        socketRef.current.emit("join_queue", {
          wallet: publicKey.toBase58(),
          formation,
          positions: posMap,
          managerId: manager?.id,
          txSignature,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      if (msg.includes("User rejected")) {
        setError("Payment cancelled");
      } else {
        setError(`Payment error: ${msg}`);
      }
    } finally {
      setIsPaying(false);
    }
  }, [publicKey, signTransaction, positions, formation, manager, isStaker]);

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
                        onClick={() => {
                          if (isSelected && !agent) {
                            // Don't toggle off empty slot — keep it selected so user can pick agent
                            return;
                          }
                          if (isSelected && agent) {
                            // Clicking a filled slot toggles it off (to allow removal)
                            setSelectedSlot(null);
                          } else {
                            setSelectedSlot(slot.slot);
                          }
                        }}
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

                {/* Staking Card */}
                <div className="mt-4 p-3" style={{
                  background: isStaker ? "rgba(147,51,234,0.08)" : "rgba(255,255,255,0.02)",
                  border: `2px solid ${isStaker ? "#9333EA50" : "#333"}`,
                  boxShadow: isStaker ? "inset -2px -2px 0 #6B21A830, inset 2px 2px 0 #A855F730" : "inset -2px -2px 0 #222, inset 2px 2px 0 #444",
                }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-pixel text-[7px] tracking-wider" style={{ color: isStaker ? "#A855F7" : "#fff" }}>
                          {isStaker ? "⚡ STAKER — FREE ENTRY" : "$CUP STAKING"}
                        </span>
                      </div>
                      <p className="font-pixel text-[5px] text-white/30 tracking-wider">
                        {isStaker
                          ? "You play for free. Win → earn opponent's 0.01 SOL. Lose → treasury covers your entry."
                          : `Stake ${STAKE_AMOUNT.toLocaleString()} $CUP to play matches for free`}
                      </p>
                    </div>
                    <button
                      onClick={isStaker ? handleUnstake : handleStake}
                      disabled={stakingLoading}
                      className="font-pixel text-[7px] px-4 py-2 tracking-wider shrink-0 transition-colors disabled:opacity-50"
                      style={{
                        background: isStaker ? "#111" : "#9333EA",
                        color: isStaker ? "#A855F7" : "#fff",
                        border: `2px solid ${isStaker ? "#9333EA" : "#A855F7"}`,
                        boxShadow: isStaker
                          ? "inset -2px -2px 0 #222, inset 2px 2px 0 #444"
                          : "inset -2px -2px 0 #6B21A8, inset 2px 2px 0 #C084FC",
                      }}
                    >
                      {stakingLoading ? "..." : isStaker ? "UNSTAKE" : "STAKE 5M"}
                    </button>
                  </div>
                </div>

                {/* Find Match + Entry Fee */}
                <div className="flex items-center justify-between mt-3">
                  <span className="font-pixel text-[7px] text-white/40 tracking-wider">
                    {assignedCount}/11 PLAYERS
                  </span>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={findMatch}
                      disabled={assignedCount < 11 || isPaying}
                      className="pixel-btn text-[10px] px-8 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isPaying
                        ? (isStaker ? "JOINING..." : "PAYING...")
                        : assignedCount < 11
                          ? `NEED ${11 - assignedCount} MORE`
                          : "FIND MATCH"}
                    </button>
                    {assignedCount >= 11 && (
                      <span className="font-pixel text-[6px] tracking-wider" style={{
                        color: isStaker ? "#A855F7" : "#FFD700",
                        opacity: 0.6,
                      }}>
                        {isStaker ? "FREE ENTRY (STAKER)" : `ENTRY FEE: ${MATCH_ENTRY_FEE_SOL} SOL`}
                      </span>
                    )}
                  </div>
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
                    <h3 className="font-pixel text-[7px] text-white mb-2 tracking-wider">
                      YOUR AGENTS ({playableAgents.filter(a => !assignedIds.has(a.id)).length})
                    </h3>
                    <p className="font-pixel text-[5px] text-white/25 tracking-wider mb-3">
                      TAP AN AGENT TO AUTO-PLACE OR SELECT A SLOT FIRST
                    </p>
                    {playableAgents.filter(a => !assignedIds.has(a.id)).length === 0 ? (
                      <p className="font-pixel text-[7px] text-white/30 tracking-wider">ALL AGENTS ASSIGNED</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {playableAgents
                          .filter(a => !assignedIds.has(a.id))
                          .sort((a, b) => b.overall - a.overall)
                          .slice(0, 30)
                          .map(agent => (
                            <div key={agent.id} className="cursor-pointer" onClick={() => autoAssignAgent(agent)}>
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
        <div className="text-center py-16 relative">
          {/* Background pitch silhouette */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
            <div className="w-64 h-40 border-2 border-white relative">
              <div className="absolute left-1/2 top-0 w-[2px] h-full bg-white" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-white" />
            </div>
          </div>

          <h1 className="font-pixel text-sm sm:text-base text-white mb-6 tracking-wider relative" style={{ textShadow: "3px 3px 0 #0B6623" }}>
            MATCH CENTER
          </h1>

          <div className="pixel-card-gold p-8 max-w-md mx-auto relative">
            {/* Pulsing radar animation */}
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-[#1E8F4E]/30 animate-ping" />
              <div className="absolute inset-2 rounded-full border-2 border-[#1E8F4E]/50 animate-ping" style={{ animationDelay: "0.5s" }} />
              <div className="absolute inset-4 rounded-full border-2 border-[#1E8F4E] animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 bg-[#1E8F4E] rounded-full" style={{ boxShadow: "0 0 10px #1E8F4E" }} />
              </div>
            </div>

            <h2 className="font-pixel text-[10px] text-white mb-2 tracking-wider">
              SEARCHING FOR OPPONENT
            </h2>
            <p className="font-pixel text-[7px] text-white/40 tracking-wider mb-6">
              WAITING FOR ANOTHER PLAYER TO JOIN
            </p>

            <div className="font-pixel text-lg text-white/60 mb-6" style={{ textShadow: "1px 1px 0 #0B6623" }}>
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
        <div className="relative">
          {/* Background pitch */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              background: "linear-gradient(180deg, #0B6623 0%, #0a5a1f 50%, #0B6623 100%)",
              border: "2px solid #1E8F4E20",
            }}
          >
            <div className="absolute left-1/2 top-0 w-[1px] h-full bg-white/20" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-white/20" />
          </div>

          <div className="text-center py-12 relative">
            <div className="font-pixel text-[7px] text-[#00AEEF] mb-4 tracking-[0.3em] animate-pulse">
              MATCH FOUND
            </div>

            <div className="flex items-center justify-center gap-3 sm:gap-10 max-w-lg mx-auto mb-8 px-2">
              {/* Home */}
              <div className="flex-1 min-w-0 animate-[slide-up_0.4s_ease-out]">
                <div
                  className="pixel-card p-3 sm:p-6 text-center"
                  style={{ borderColor: "#1E8F4E" }}
                >
                  <div className="font-pixel text-[5px] sm:text-[6px] text-[#1E8F4E] mb-1 sm:mb-2 tracking-wider">
                    {mySide === "home" ? "YOU" : "OPPONENT"}
                  </div>
                  <div className="font-pixel text-[7px] sm:text-[10px] text-white tracking-wider truncate">
                    {mySide === "home" ? (myTeamName || "YOUR SQUAD") : opponentName}
                  </div>
                  <div className="mt-2 sm:mt-3 flex justify-center gap-0.5 sm:gap-1">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="w-1 h-1.5 sm:w-1.5 sm:h-2 bg-[#1E8F4E]" style={{ opacity: 0.4 + i * 0.15 }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* VS */}
              <div className="text-center shrink-0 px-1">
                <div
                  className="font-pixel text-base sm:text-xl text-white"
                  style={{
                    textShadow: "0 0 20px #1E8F4E, 3px 3px 0 #0B6623",
                    animation: "pulse 1s ease-in-out infinite",
                  }}
                >
                  VS
                </div>
              </div>

              {/* Away */}
              <div className="flex-1 min-w-0 animate-[slide-up_0.4s_ease-out_0.15s_both]">
                <div
                  className="pixel-card p-3 sm:p-6 text-center"
                  style={{ borderColor: "#FF3B3B" }}
                >
                  <div className="font-pixel text-[5px] sm:text-[6px] text-[#FF3B3B] mb-1 sm:mb-2 tracking-wider">
                    {mySide === "away" ? "YOU" : "OPPONENT"}
                  </div>
                  <div className="font-pixel text-[7px] sm:text-[10px] text-white tracking-wider truncate">
                    {mySide === "away" ? (myTeamName || "YOUR SQUAD") : opponentName}
                  </div>
                  <div className="mt-2 sm:mt-3 flex justify-center gap-0.5 sm:gap-1">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="w-1 h-1.5 sm:w-1.5 sm:h-2 bg-[#FF3B3B]" style={{ opacity: 0.4 + i * 0.15 }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="font-pixel text-[7px] mb-3 tracking-wider" style={{
              color: isStaker ? "#A855F7" : "#FFD700",
              textShadow: isStaker ? "0 0 8px #A855F730" : "0 0 8px #FFD70030",
            }}>
              {isStaker ? "STAKER — FREE ENTRY" : `PRIZE POT: ${MATCH_ENTRY_FEE_SOL * 2} SOL`}
            </div>
            <div className="font-pixel text-[8px] text-white/30 tracking-[0.2em] animate-pulse">
              KICK OFF IN 3...
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Playing / Finished ────────────────────────────────────
  const homeName = mySide === "home" ? (myTeamName || "YOUR SQUAD") : opponentName;
  const awayName = mySide === "away" ? (myTeamName || "YOUR SQUAD") : opponentName;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* Live pitch */}
      <LiveMatchPitch
        events={displayedEvents}
        homeScore={homeScore}
        awayScore={awayScore}
        currentMinute={currentMinute}
        homeName={homeName}
        awayName={awayName}
        isPlaying={pageState === "playing"}
        mySide={mySide}
      />

      {/* Event feed */}
      <div className="mt-4 mb-6 overflow-hidden"
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
            {pageState === "playing" ? "LIVE COMMENTARY" : "MATCH ENDED"}
          </span>
        </div>
        <div ref={feedRef} className="p-3 max-h-48 overflow-y-auto space-y-1">
          {displayedEvents.map((event, i) => (
            <div key={i} className="flex gap-2 animate-[fade-in_0.3s_ease-out]">
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
            <div className="flex gap-2">
              <span className="font-pixel text-[6px] text-white/30 w-6 text-right shrink-0">&nbsp;</span>
              <span className="font-pixel text-[6px] text-white/30 pixel-blink">_</span>
            </div>
          )}
        </div>
      </div>

      {/* Post-match stats */}
      {pageState === "finished" && matchResult && (() => {
        const myScore = mySide === "home" ? homeScore : awayScore;
        const theirScore = mySide === "home" ? awayScore : homeScore;
        const resultText = myScore > theirScore ? "VICTORY!" : myScore < theirScore ? "DEFEAT" : "DRAW";
        const resultColor = myScore > theirScore ? "#1E8F4E" : myScore < theirScore ? "#ef4444" : "#eab308";
        const maxShots = Math.max(matchResult.result.shots.home, matchResult.result.shots.away, 1);

        return (
          <div className="space-y-4 animate-[fade-in_0.5s_ease-out]">
            {/* Stats with visual bars */}
            <div className="pixel-card p-4">
              <h3 className="font-pixel text-[8px] text-white mb-4 tracking-wider">MATCH STATS</h3>

              {/* Possession bar */}
              <div className="mb-4">
                <div className="flex justify-between mb-1.5">
                  <span className="font-pixel text-[8px] text-white">{matchResult.result.possession.home}%</span>
                  <span className="font-pixel text-[6px] text-white/40 tracking-wider">POSSESSION</span>
                  <span className="font-pixel text-[8px] text-white">{matchResult.result.possession.away}%</span>
                </div>
                <div className="flex h-[6px] overflow-hidden" style={{ imageRendering: "pixelated" }}>
                  <div className="h-full bg-[#1E8F4E] transition-all duration-1000" style={{ width: `${matchResult.result.possession.home}%` }} />
                  <div className="h-full bg-[#FF3B3B] transition-all duration-1000" style={{ width: `${matchResult.result.possession.away}%` }} />
                </div>
              </div>

              {/* Shots */}
              <div className="mb-3">
                <div className="flex justify-between mb-1.5">
                  <span className="font-pixel text-[8px] text-white">{matchResult.result.shots.home}</span>
                  <span className="font-pixel text-[6px] text-white/40 tracking-wider">SHOTS</span>
                  <span className="font-pixel text-[8px] text-white">{matchResult.result.shots.away}</span>
                </div>
                <div className="flex gap-1 h-[6px]" style={{ imageRendering: "pixelated" }}>
                  <div className="flex-1 flex justify-end">
                    <div className="h-full bg-[#1E8F4E] transition-all duration-1000" style={{ width: `${(matchResult.result.shots.home / maxShots) * 100}%` }} />
                  </div>
                  <div className="flex-1">
                    <div className="h-full bg-[#FF3B3B] transition-all duration-1000" style={{ width: `${(matchResult.result.shots.away / maxShots) * 100}%` }} />
                  </div>
                </div>
              </div>

              {/* Shots on target */}
              <div className="mb-3">
                <div className="flex justify-between mb-1.5">
                  <span className="font-pixel text-[8px] text-white">{matchResult.result.shotsOnTarget.home}</span>
                  <span className="font-pixel text-[6px] text-white/40 tracking-wider">ON TARGET</span>
                  <span className="font-pixel text-[8px] text-white">{matchResult.result.shotsOnTarget.away}</span>
                </div>
                <div className="flex gap-1 h-[6px]" style={{ imageRendering: "pixelated" }}>
                  <div className="flex-1 flex justify-end">
                    <div className="h-full bg-[#1E8F4E] transition-all duration-1000" style={{ width: `${(matchResult.result.shotsOnTarget.home / maxShots) * 100}%` }} />
                  </div>
                  <div className="flex-1">
                    <div className="h-full bg-[#FF3B3B] transition-all duration-1000" style={{ width: `${(matchResult.result.shotsOnTarget.away / maxShots) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Result + Rewards + MOTM row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Result + Rewards */}
              <div className="pixel-card p-3 sm:p-4 text-center">
                <div
                  className="font-pixel text-sm sm:text-base tracking-[0.2em] mb-2 sm:mb-3"
                  style={{ color: resultColor, textShadow: `0 0 15px ${resultColor}40, 2px 2px 0 rgba(0,0,0,0.8)` }}
                >
                  {resultText}
                </div>

                {/* Prize display */}
                {matchResult.prizeSol !== undefined && matchResult.prizeSol > 0 && (
                  <div className="mb-3 py-2 px-3" style={{ background: "rgba(255,215,0,0.08)", border: "2px solid #FFD70050" }}>
                    <div className="font-pixel text-[6px] text-[#FFD700]/60 tracking-wider mb-1">PRIZE WON</div>
                    <div className="font-pixel text-base text-[#FFD700]" style={{ textShadow: "0 0 10px #FFD70040, 2px 2px 0 rgba(0,0,0,0.8)" }}>
                      +{matchResult.prizeSol} SOL
                    </div>
                  </div>
                )}
                {matchResult.prizeSol === 0 && resultText === "DRAW" && (
                  <div className="mb-3 py-2 px-3" style={{ background: "rgba(234,179,8,0.08)", border: "2px solid #eab30850" }}>
                    <div className="font-pixel text-[6px] text-[#eab308]/60 tracking-wider">
                      {matchResult.isStaker ? "STAKER — NO COST" : "ENTRY FEE REFUNDED"}
                    </div>
                  </div>
                )}
                {matchResult.isStaker && matchResult.prizeSol === 0 && resultText === "DEFEAT" && (
                  <div className="mb-3 py-2 px-3" style={{ background: "rgba(147,51,234,0.06)", border: "2px solid #9333EA30" }}>
                    <div className="font-pixel text-[6px] text-[#A855F7]/50 tracking-wider">STAKER — TREASURY COVERED YOUR LOSS</div>
                  </div>
                )}

                <div className="flex sm:flex-col items-center justify-center gap-3 sm:gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-pixel text-[5px] sm:text-[6px] text-white/40 tracking-wider">PTS</span>
                    <span className="font-pixel text-[9px] sm:text-[10px] text-white" style={{ textShadow: "1px 1px 0 #0B6623" }}>
                      +{matchResult.pointsEarned}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-pixel text-[5px] sm:text-[6px] text-white/40 tracking-wider">ELO</span>
                    <span className="font-pixel text-[9px] sm:text-[10px]" style={{
                      color: matchResult.eloChange >= 0 ? "#1E8F4E" : "#ef4444",
                    }}>
                      {matchResult.eloChange >= 0 ? "+" : ""}{matchResult.eloChange}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-pixel text-[5px] sm:text-[6px] text-white/40 tracking-wider">XP</span>
                    <span className="font-pixel text-[9px] sm:text-[10px] text-[#00E5FF]">+{matchResult.xpGain}</span>
                  </div>
                </div>
              </div>

              {/* MOTM */}
              <div className="pixel-card-gold p-4 text-center">
                <h3 className="font-pixel text-[7px] text-white/60 mb-2 tracking-wider">MAN OF THE MATCH</h3>
                <div className="font-pixel text-lg text-[#FFD700] mb-1" style={{ textShadow: "0 0 10px #FFD70040, 2px 2px 0 #0B6623" }}>
                  *
                </div>
                <div className="font-pixel text-[9px] text-white tracking-wider">
                  {matchResult.result.manOfTheMatch.playerName}
                </div>
                <div className="font-pixel text-[5px] text-white/30 mt-1 tracking-wider">
                  {matchResult.result.manOfTheMatch.team === mySide ? "YOUR TEAM" : "OPPONENT"}
                </div>
                <div className="font-pixel text-base text-[#FFD700] mt-2" style={{ textShadow: "2px 2px 0 #0B6623" }}>
                  {matchResult.result.manOfTheMatch.rating.toFixed(1)}
                </div>
              </div>

              {/* Goal scorers */}
              <div className="pixel-card p-4">
                <h3 className="font-pixel text-[7px] text-white/60 mb-3 tracking-wider">GOAL SCORERS</h3>
                {displayedEvents.filter(e => e.type === "goal").length === 0 ? (
                  <div className="font-pixel text-[7px] text-white/20 text-center tracking-wider">NO GOALS</div>
                ) : (
                  <div className="space-y-1.5">
                    {displayedEvents.filter(e => e.type === "goal").map((e, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 shrink-0" style={{ backgroundColor: e.team === "home" ? "#1E8F4E" : "#FF3B3B" }} />
                        <span className="font-pixel text-[6px] text-white tracking-wider truncate">{e.playerName}</span>
                        <span className="font-pixel text-[5px] text-white/30 ml-auto shrink-0">{e.minute}&apos;</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Play again */}
            <div className="text-center">
              <button onClick={backToLobby} className="pixel-btn text-[9px] px-10 py-3">
                PLAY AGAIN
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
