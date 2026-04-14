import { Server, Socket } from "socket.io";
import { supabase } from "../lib/supabase";
import { simulateMatch, SquadInput, PlayerInput, MatchEvent, MatchResult } from "../engine/matchEngine";
import { calculateElo } from "../services/eloService";
import { verifyEntryFeeTransaction, sendPayout, MATCH_ENTRY_FEE_SOL } from "../lib/solana";
import { hasActiveStake } from "../services/stakeService";

/* ================================================================== */
/*  Online PvP Matchmaking + Real-time Match Streaming                 */
/* ================================================================== */

interface QueueEntry {
  wallet: string;
  socketId: string;
  squad: SquadInput;
  teamName: string;
  userId: string;
  joinedAt: number;
  txSignature: string;  // empty string for stakers
  isStaker: boolean;    // staked 5M $CUP → free entry
}

interface ActiveMatch {
  matchId: string;
  homeWallet: string;
  awayWallet: string;
  homeUserId: string;
  awayUserId: string;
  homeSocketId: string;
  awaySocketId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeSquad: SquadInput;
  awaySquad: SquadInput;
  result: MatchResult;
  seed: number;
  currentMinute: number;
  maxMinute: number;
  interval?: ReturnType<typeof setInterval>;
  homeIsStaker: boolean;
  awayIsStaker: boolean;
}

// In-memory state
const matchmakingQueue = new Map<string, QueueEntry>();     // wallet → entry
const activeMatches = new Map<string, ActiveMatch>();        // matchId → match
const walletToSocket = new Map<string, string>();            // wallet → socketId
const socketToWallet = new Map<string, string>();            // socketId → wallet
const walletToMatch = new Map<string, string>();             // wallet → matchId
const usedTxSignatures = new Set<string>();                  // prevent TX reuse

export function setupMatchSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`[MATCH] Player connected: ${socket.id}`);

    // ─── Join Queue ──────────────────────────────────────────
    socket.on("join_queue", async (data: {
      wallet: string;
      formation: string;
      positions: Record<string, string>; // slot → agentId
      managerId?: string;
      txSignature?: string;
      useStake?: boolean;
    }) => {
      try {
        const { wallet, formation, positions, managerId, txSignature, useStake } = data;
        if (!wallet || !formation || !positions) {
          socket.emit("queue_error", { message: "Missing wallet, formation, or positions" });
          return;
        }

        // Already in queue or match?
        if (matchmakingQueue.has(wallet)) {
          socket.emit("queue_error", { message: "Already in queue" });
          return;
        }
        if (walletToMatch.has(wallet)) {
          socket.emit("queue_error", { message: "Already in a match" });
          return;
        }

        let isStaker = false;

        if (useStake) {
          // ─── Staker path: verify active stake in DB ───
          const staked = await hasActiveStake(wallet);
          if (!staked) {
            socket.emit("queue_error", { message: "No active stake found. Stake 5M $CUP first." });
            return;
          }
          isStaker = true;
          console.log(`[MATCH] ${wallet.slice(0, 8)} entering as STAKER (free entry)`);
        } else {
          // ─── Normal SOL path ───
          if (!txSignature) {
            socket.emit("queue_error", { message: "Entry fee payment required" });
            return;
          }

          if (usedTxSignatures.has(txSignature)) {
            socket.emit("queue_error", { message: "Transaction already used" });
            return;
          }

          console.log(`[MATCH] Verifying entry fee for ${wallet.slice(0, 8)} tx=${txSignature.slice(0, 12)}`);
          const verification = await verifyEntryFeeTransaction(txSignature, wallet);
          if (!verification.valid) {
            console.log(`[MATCH] Entry fee verification failed: ${verification.error}`);
            socket.emit("queue_error", { message: `Payment verification failed: ${verification.error}` });
            return;
          }

          usedTxSignatures.add(txSignature);
        }

        // Track socket ↔ wallet mapping
        walletToSocket.set(wallet, socket.id);
        socketToWallet.set(socket.id, wallet);

        // Fetch user
        const { data: user } = await supabase
          .from("users")
          .select("id, username")
          .eq("wallet_address", wallet)
          .single();

        if (!user) {
          socket.emit("queue_error", { message: "User not found. Connect your wallet first." });
          if (!isStaker && txSignature) {
            sendPayout(wallet, MATCH_ENTRY_FEE_SOL).catch(e => console.error("[MATCH] Refund failed:", e));
          }
          return;
        }

        // Build & verify squad from DB
        const squad = await buildVerifiedSquad(wallet, user.id, formation, positions, managerId);
        if (!squad) {
          socket.emit("queue_error", { message: "Invalid squad. Make sure you own all agents." });
          if (!isStaker && txSignature) {
            sendPayout(wallet, MATCH_ENTRY_FEE_SOL).catch(e => console.error("[MATCH] Refund failed:", e));
          }
          return;
        }

        // Get team name from leaderboard
        const { data: lb } = await supabase
          .from("leaderboard")
          .select("team_name")
          .eq("user_id", user.id)
          .single();

        const entry: QueueEntry = {
          wallet,
          socketId: socket.id,
          squad,
          teamName: lb?.team_name || user.username || wallet.slice(0, 8),
          userId: user.id,
          joinedAt: Date.now(),
          txSignature: txSignature || "",
          isStaker,
        };

        matchmakingQueue.set(wallet, entry);
        socket.emit("queue_joined", { position: matchmakingQueue.size });
        const label = isStaker ? "STAKER (FREE)" : `PAID ${MATCH_ENTRY_FEE_SOL} SOL`;
        console.log(`[MATCH] ${wallet.slice(0, 8)} joined queue (${matchmakingQueue.size} in queue) [${label}]`);

        // Try to find a match
        tryMatchPlayers(io);
      } catch (err) {
        console.error("[MATCH] join_queue error:", err);
        socket.emit("queue_error", { message: "Failed to join queue" });
      }
    });

    // ─── Leave Queue ─────────────────────────────────────────
    socket.on("leave_queue", async () => {
      const wallet = socketToWallet.get(socket.id);
      if (wallet && matchmakingQueue.has(wallet)) {
        const entry = matchmakingQueue.get(wallet)!;
        matchmakingQueue.delete(wallet);

        // Refund entry fee (only if they paid SOL, not stakers)
        if (!entry.isStaker) {
          console.log(`[MATCH] ${wallet.slice(0, 8)} left queue — refunding ${MATCH_ENTRY_FEE_SOL} SOL`);
          const refund = await sendPayout(wallet, MATCH_ENTRY_FEE_SOL);
          if (!refund.success) {
            console.error(`[MATCH] REFUND FAILED for ${wallet}: ${refund.error}`);
          }
        } else {
          console.log(`[MATCH] ${wallet.slice(0, 8)} (staker) left queue — no refund needed`);
        }

        socket.emit("queue_left", {});
      }
    });

    // ─── Disconnect ──────────────────────────────────────────
    socket.on("disconnect", async () => {
      const wallet = socketToWallet.get(socket.id);
      if (wallet) {
        // Refund if was in queue (not yet matched)
        if (matchmakingQueue.has(wallet)) {
          const entry = matchmakingQueue.get(wallet)!;
          matchmakingQueue.delete(wallet);
          if (!entry.isStaker) {
            console.log(`[MATCH] ${wallet.slice(0, 8)} disconnected from queue — refunding`);
            const refund = await sendPayout(wallet, MATCH_ENTRY_FEE_SOL);
            if (!refund.success) {
              console.error(`[MATCH] DISCONNECT REFUND FAILED for ${wallet}: ${refund.error}`);
            }
          } else {
            console.log(`[MATCH] ${wallet.slice(0, 8)} (staker) disconnected from queue`);
          }
        }

        // If in active match, let it play out (no refund — match continues)
        const matchId = walletToMatch.get(wallet);
        if (matchId) {
          const match = activeMatches.get(matchId);
          if (match && match.interval) {
            console.log(`[MATCH] ${wallet.slice(0, 8)} disconnected during match ${matchId} — match continues`);
          }
        }

        walletToSocket.delete(wallet);
        socketToWallet.delete(socket.id);
      }
      console.log(`[MATCH] Player disconnected: ${socket.id}`);
    });

    // ─── Reconnect to active match ───────────────────────────
    socket.on("reconnect_match", (data: { wallet: string }) => {
      const { wallet } = data;
      if (!wallet) return;

      // Update socket mappings
      const oldSocketId = walletToSocket.get(wallet);
      if (oldSocketId) socketToWallet.delete(oldSocketId);
      walletToSocket.set(wallet, socket.id);
      socketToWallet.set(socket.id, wallet);

      const matchId = walletToMatch.get(wallet);
      if (matchId) {
        const match = activeMatches.get(matchId);
        if (match) {
          // Update socket ID in match
          if (match.homeWallet === wallet) match.homeSocketId = socket.id;
          else match.awaySocketId = socket.id;

          // Send current state: all events up to current minute
          const eventsUpToNow = match.result.events.filter(e => e.minute <= match.currentMinute);
          const side = match.homeWallet === wallet ? "home" : "away";
          socket.emit("match_reconnected", {
            matchId,
            side,
            opponent: {
              wallet: side === "home" ? match.awayWallet : match.homeWallet,
              teamName: side === "home" ? match.awayTeamName : match.homeTeamName,
            },
            currentMinute: match.currentMinute,
            events: eventsUpToNow,
            homeScore: eventsUpToNow.filter(e => e.type === "goal" && e.team === "home").length,
            awayScore: eventsUpToNow.filter(e => e.type === "goal" && e.team === "away").length,
          });
          console.log(`[MATCH] ${wallet.slice(0, 8)} reconnected to match ${matchId}`);
        }
      }
    });

    // ─── Get queue status ────────────────────────────────────
    socket.on("queue_status", () => {
      const wallet = socketToWallet.get(socket.id);
      socket.emit("queue_status", {
        inQueue: wallet ? matchmakingQueue.has(wallet) : false,
        queueSize: matchmakingQueue.size,
        inMatch: wallet ? walletToMatch.has(wallet) : false,
      });
    });
  });
}

/* ================================================================== */
/*  Matchmaking Logic                                                  */
/* ================================================================== */

function tryMatchPlayers(io: Server) {
  if (matchmakingQueue.size < 2) return;

  // Pick first two players in queue (FIFO)
  const entries = Array.from(matchmakingQueue.values());
  const home = entries[0];
  const away = entries[1];

  // Remove from queue
  matchmakingQueue.delete(home.wallet);
  matchmakingQueue.delete(away.wallet);

  // Start the match
  startMatch(io, home, away);
}

async function startMatch(io: Server, home: QueueEntry, away: QueueEntry) {
  const seed = Date.now();
  const result = simulateMatch(home.squad, away.squad, seed);

  // Find max minute from events
  const maxMinute = result.events.length > 0
    ? result.events[result.events.length - 1].minute
    : 90;

  const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const match: ActiveMatch = {
    matchId,
    homeWallet: home.wallet,
    awayWallet: away.wallet,
    homeUserId: home.userId,
    awayUserId: away.userId,
    homeSocketId: home.socketId,
    awaySocketId: away.socketId,
    homeTeamName: home.teamName,
    awayTeamName: away.teamName,
    homeSquad: home.squad,
    awaySquad: away.squad,
    result,
    seed,
    currentMinute: 0,
    maxMinute,
    homeIsStaker: home.isStaker,
    awayIsStaker: away.isStaker,
  };

  activeMatches.set(matchId, match);
  walletToMatch.set(home.wallet, matchId);
  walletToMatch.set(away.wallet, matchId);

  // Notify both players
  const homeSocket = io.sockets.sockets.get(home.socketId);
  const awaySocket = io.sockets.sockets.get(away.socketId);

  const matchFoundPayload = (side: "home" | "away") => ({
    matchId,
    side,
    opponent: {
      wallet: side === "home" ? away.wallet : home.wallet,
      teamName: side === "home" ? away.teamName : home.teamName,
    },
    homeTeamName: home.teamName,
    awayTeamName: away.teamName,
  });

  homeSocket?.emit("match_found", matchFoundPayload("home"));
  awaySocket?.emit("match_found", matchFoundPayload("away"));

  console.log(`[MATCH] Match started: ${home.wallet.slice(0, 8)} vs ${away.wallet.slice(0, 8)} (${matchId})`);

  // Short delay before starting event stream (let clients show pre-match screen)
  setTimeout(() => {
    streamMatchEvents(io, match);
  }, 3000);
}

/* ================================================================== */
/*  Event Streaming                                                    */
/* ================================================================== */

function streamMatchEvents(io: Server, match: ActiveMatch) {
  let gameMinute = 0;

  match.interval = setInterval(() => {
    gameMinute++;
    match.currentMinute = gameMinute;

    // Get events for this minute
    const minuteEvents = match.result.events.filter(e => e.minute === gameMinute);

    if (minuteEvents.length > 0) {
      const payload = {
        minute: gameMinute,
        events: minuteEvents,
        homeScore: match.result.events
          .filter(e => e.type === "goal" && e.team === "home" && e.minute <= gameMinute).length,
        awayScore: match.result.events
          .filter(e => e.type === "goal" && e.team === "away" && e.minute <= gameMinute).length,
      };

      // Send to both players
      const homeSocket = io.sockets.sockets.get(match.homeSocketId);
      const awaySocket = io.sockets.sockets.get(match.awaySocketId);
      homeSocket?.emit("match_event", payload);
      awaySocket?.emit("match_event", payload);
    }

    // Check if match is over
    if (gameMinute >= match.maxMinute) {
      clearInterval(match.interval);
      finishMatch(io, match);
    }
  }, 650); // ~650ms per game minute → ~60 seconds total
}

/* ================================================================== */
/*  Match Completion — DB writes + leaderboard + ELO                  */
/* ================================================================== */

async function finishMatch(io: Server, match: ActiveMatch) {
  const { result } = match;

  try {
    // Save match to DB
    const { data: dbMatch, error: matchError } = await supabase.from("matches").insert({
      home_player_id: match.homeUserId,
      away_player_id: match.awayUserId,
      home_squad: match.homeSquad,
      away_squad: match.awaySquad,
      home_score: result.homeScore,
      away_score: result.awayScore,
      status: "finished",
      events: result.events,
      seed: match.seed,
      finished_at: new Date().toISOString(),
    }).select().single();

    if (matchError) {
      console.error("[MATCH] Failed to save match:", matchError);
    }

    // Update leaderboard for BOTH players
    if (dbMatch) {
      await supabase.rpc("record_pvp_match_result", {
        p_match_id: dbMatch.id,
        p_home_user_id: match.homeUserId,
        p_away_user_id: match.awayUserId,
        p_home_score: result.homeScore,
        p_away_score: result.awayScore,
      });
    }

    // Update ELO for both players
    const { data: homeUser } = await supabase
      .from("users").select("elo, xp").eq("id", match.homeUserId).single();
    const { data: awayUser } = await supabase
      .from("users").select("elo, xp").eq("id", match.awayUserId).single();

    let homeEloChange = 0;
    let awayEloChange = 0;

    if (homeUser && awayUser) {
      const isDraw = result.homeScore === result.awayScore;
      const homeWon = result.homeScore > result.awayScore;

      if (isDraw) {
        const { newWinnerElo, newLoserElo } = calculateElo(homeUser.elo, awayUser.elo, true);
        homeEloChange = newWinnerElo - homeUser.elo;
        awayEloChange = newLoserElo - awayUser.elo;
        await supabase.from("users").update({ elo: newWinnerElo }).eq("id", match.homeUserId);
        await supabase.from("users").update({ elo: newLoserElo }).eq("id", match.awayUserId);
      } else {
        const winnerId = homeWon ? match.homeUserId : match.awayUserId;
        const loserId = homeWon ? match.awayUserId : match.homeUserId;
        const winnerElo = homeWon ? homeUser.elo : awayUser.elo;
        const loserElo = homeWon ? awayUser.elo : homeUser.elo;

        const { newWinnerElo, newLoserElo } = calculateElo(winnerElo, loserElo);
        homeEloChange = homeWon ? newWinnerElo - winnerElo : newLoserElo - loserElo;
        awayEloChange = homeWon ? newLoserElo - loserElo : newWinnerElo - winnerElo;

        await supabase.from("users").update({ elo: newWinnerElo }).eq("id", winnerId);
        await supabase.from("users").update({ elo: newLoserElo }).eq("id", loserId);
      }

      // Grant XP: 30 win, 15 draw, 5 loss
      const homeXp = homeWon ? 30 : isDraw ? 15 : 5;
      const awayXp = !homeWon && !isDraw ? 30 : isDraw ? 15 : 5;
      await supabase.from("users").update({ xp: (homeUser.xp || 0) + homeXp }).eq("id", match.homeUserId);
      await supabase.from("users").update({ xp: (awayUser.xp || 0) + awayXp }).eq("id", match.awayUserId);
    }

    // ─── Prize Payout ──────────────────────────────────────
    // Staker logic:
    //   Staker vs Normal: staker free, normal paid 0.01
    //     - Staker wins → staker gets 0.01 SOL (from opponent entry)
    //     - Staker loses → treasury pays 0.01 SOL to winner (normal player)
    //     - Draw → normal player gets refund, staker gets nothing
    //   Staker vs Staker: no SOL moves at all
    //   Normal vs Normal: standard 0.01+0.01 → winner gets 0.02
    const isDraw = result.homeScore === result.awayScore;
    const homeWon = result.homeScore > result.awayScore;
    const bothStakers = match.homeIsStaker && match.awayIsStaker;
    const bothNormal = !match.homeIsStaker && !match.awayIsStaker;
    let payoutTx: string | undefined;
    let homePrizeSol = 0;
    let awayPrizeSol = 0;

    if (bothStakers) {
      // ─── Staker vs Staker: no SOL movement ───
      console.log(`[MATCH] Staker vs Staker — no SOL movement`);
    } else if (bothNormal) {
      // ─── Normal vs Normal: standard payout ───
      const prizePot = MATCH_ENTRY_FEE_SOL * 2;
      if (isDraw) {
        console.log(`[MATCH] Draw — refunding both players ${MATCH_ENTRY_FEE_SOL} SOL each`);
        const [homeRefund, awayRefund] = await Promise.allSettled([
          sendPayout(match.homeWallet, MATCH_ENTRY_FEE_SOL),
          sendPayout(match.awayWallet, MATCH_ENTRY_FEE_SOL),
        ]);
        if (homeRefund.status === "fulfilled" && !homeRefund.value.success) {
          console.error(`[MATCH] HOME REFUND FAILED: ${homeRefund.value.error}`);
        }
        if (awayRefund.status === "fulfilled" && !awayRefund.value.success) {
          console.error(`[MATCH] AWAY REFUND FAILED: ${awayRefund.value.error}`);
        }
      } else {
        const winnerWallet = homeWon ? match.homeWallet : match.awayWallet;
        console.log(`[MATCH] Paying winner ${winnerWallet.slice(0, 8)} → ${prizePot} SOL`);
        const payout = await sendPayout(winnerWallet, prizePot);
        if (payout.success) {
          payoutTx = payout.signature;
          if (homeWon) homePrizeSol = prizePot; else awayPrizeSol = prizePot;
        } else {
          console.error(`[MATCH] PAYOUT FAILED for ${winnerWallet}: ${payout.error}`);
        }
      }
    } else {
      // ─── Staker vs Normal (mixed) ───
      const stakerIsHome = match.homeIsStaker;
      const stakerWallet = stakerIsHome ? match.homeWallet : match.awayWallet;
      const normalWallet = stakerIsHome ? match.awayWallet : match.homeWallet;
      const stakerWon = (stakerIsHome && homeWon) || (!stakerIsHome && !homeWon && !isDraw);
      const normalWon = !stakerWon && !isDraw;

      if (isDraw) {
        // Draw: refund the normal player, staker had no cost
        console.log(`[MATCH] Draw (staker vs normal) — refunding normal player ${normalWallet.slice(0, 8)}`);
        const refund = await sendPayout(normalWallet, MATCH_ENTRY_FEE_SOL);
        if (!refund.success) console.error(`[MATCH] REFUND FAILED: ${refund.error}`);
      } else if (stakerWon) {
        // Staker won: staker gets the normal player's entry fee (already in treasury)
        console.log(`[MATCH] Staker ${stakerWallet.slice(0, 8)} won — sending ${MATCH_ENTRY_FEE_SOL} SOL from opponent entry`);
        const payout = await sendPayout(stakerWallet, MATCH_ENTRY_FEE_SOL);
        if (payout.success) {
          payoutTx = payout.signature;
          if (stakerIsHome) homePrizeSol = MATCH_ENTRY_FEE_SOL; else awayPrizeSol = MATCH_ENTRY_FEE_SOL;
        } else {
          console.error(`[MATCH] STAKER PAYOUT FAILED: ${payout.error}`);
        }
      } else if (normalWon) {
        // Normal won: normal gets their entry back + treasury pays 0.01 SOL (staker's penalty)
        const totalPayout = MATCH_ENTRY_FEE_SOL * 2;
        console.log(`[MATCH] Normal ${normalWallet.slice(0, 8)} won vs staker — sending ${totalPayout} SOL (entry + treasury match)`);
        const payout = await sendPayout(normalWallet, totalPayout);
        if (payout.success) {
          payoutTx = payout.signature;
          if (!stakerIsHome) homePrizeSol = totalPayout; else awayPrizeSol = totalPayout;
        } else {
          console.error(`[MATCH] NORMAL WINNER PAYOUT FAILED: ${payout.error}`);
        }
      }
    }

    // Notify both players
    const homePointsEarned = result.homeScore > result.awayScore ? 3 : result.homeScore === result.awayScore ? 1 : 0;
    const awayPointsEarned = result.awayScore > result.homeScore ? 3 : result.homeScore === result.awayScore ? 1 : 0;

    const finishPayload = (side: "home" | "away") => {
      const iWon = (side === "home" && homeWon) || (side === "away" && !homeWon && !isDraw);
      const myIsStaker = side === "home" ? match.homeIsStaker : match.awayIsStaker;
      const myPrizeSol = side === "home" ? homePrizeSol : awayPrizeSol;
      return {
        matchId: match.matchId,
        result: {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          possession: result.possession,
          shots: result.shots,
          shotsOnTarget: result.shotsOnTarget,
          manOfTheMatch: result.manOfTheMatch,
        },
        pointsEarned: side === "home" ? homePointsEarned : awayPointsEarned,
        eloChange: side === "home" ? homeEloChange : awayEloChange,
        xpGain: side === "home"
          ? (result.homeScore > result.awayScore ? 30 : result.homeScore === result.awayScore ? 15 : 5)
          : (result.awayScore > result.homeScore ? 30 : result.homeScore === result.awayScore ? 15 : 5),
        prizeSol: myPrizeSol,
        payoutTx: iWon ? payoutTx : undefined,
        entryFeeSol: myIsStaker ? 0 : MATCH_ENTRY_FEE_SOL,
        isStaker: myIsStaker,
      };
    };

    const homeSocket = io.sockets.sockets.get(match.homeSocketId);
    const awaySocket = io.sockets.sockets.get(match.awaySocketId);
    homeSocket?.emit("match_finished", finishPayload("home"));
    awaySocket?.emit("match_finished", finishPayload("away"));

    console.log(`[MATCH] Match finished: ${result.homeScore}-${result.awayScore} (${match.matchId})`);
  } catch (err) {
    console.error("[MATCH] finishMatch error:", err);
  }

  // Cleanup
  activeMatches.delete(match.matchId);
  walletToMatch.delete(match.homeWallet);
  walletToMatch.delete(match.awayWallet);
}

/* ================================================================== */
/*  Squad Verification — builds SquadInput from DB data                */
/* ================================================================== */

async function buildVerifiedSquad(
  wallet: string,
  userId: string,
  formation: string,
  positions: Record<string, string>, // slot → agentId
  managerId?: string
): Promise<SquadInput | null> {
  try {
    const agentIds = Object.values(positions);
    if (agentIds.length === 0) return null;

    // Fetch user's owned agents and verify ownership
    const { data: userAgents } = await supabase
      .from("user_agents")
      .select("agent_id, agents(*)")
      .eq("user_id", userId)
      .in("agent_id", agentIds);

    if (!userAgents || userAgents.length < agentIds.length) {
      return null; // Not all agents are owned
    }

    // Build agent lookup
    const agentMap = new Map<string, Record<string, unknown>>();
    for (const ua of userAgents) {
      const agent = ua.agents as unknown as Record<string, unknown>;
      if (agent) agentMap.set(ua.agent_id, agent);
    }

    // Build players array
    const players: PlayerInput[] = [];
    for (const [slot, agentId] of Object.entries(positions)) {
      const agent = agentMap.get(agentId);
      if (!agent) return null;

      players.push({
        slot,
        position: agent.position as string,
        name: agent.name as string,
        overall: agent.overall as number,
        pace: agent.pace as number,
        shooting: agent.shooting as number,
        passing: agent.passing as number,
        dribbling: agent.dribbling as number,
        defending: agent.defending as number,
        physical: agent.physical as number,
      });
    }

    // Manager bonus
    let managerBonus = 0;
    if (managerId) {
      const { data: managerUA } = await supabase
        .from("user_agents")
        .select("agents(overall)")
        .eq("user_id", userId)
        .eq("agent_id", managerId)
        .single();

      if (managerUA) {
        const mgrAgent = managerUA.agents as unknown as Record<string, unknown>;
        managerBonus = Math.floor((mgrAgent?.overall as number || 0) / 10);
      }
    }

    return { formation, players, managerBonus };
  } catch (err) {
    console.error("[MATCH] buildVerifiedSquad error:", err);
    return null;
  }
}
