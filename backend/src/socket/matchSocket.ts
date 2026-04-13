import { Server, Socket } from "socket.io";
import { supabase } from "../lib/supabase";
import { simulateMatch, SquadInput, PlayerInput, MatchEvent, MatchResult } from "../engine/matchEngine";
import { calculateElo } from "../services/eloService";

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
}

// In-memory state
const matchmakingQueue = new Map<string, QueueEntry>();     // wallet → entry
const activeMatches = new Map<string, ActiveMatch>();        // matchId → match
const walletToSocket = new Map<string, string>();            // wallet → socketId
const socketToWallet = new Map<string, string>();            // socketId → wallet
const walletToMatch = new Map<string, string>();             // wallet → matchId

export function setupMatchSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`[MATCH] Player connected: ${socket.id}`);

    // ─── Join Queue ──────────────────────────────────────────
    socket.on("join_queue", async (data: {
      wallet: string;
      formation: string;
      positions: Record<string, string>; // slot → agentId
      managerId?: string;
    }) => {
      try {
        const { wallet, formation, positions, managerId } = data;
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
          return;
        }

        // Build & verify squad from DB
        const squad = await buildVerifiedSquad(wallet, user.id, formation, positions, managerId);
        if (!squad) {
          socket.emit("queue_error", { message: "Invalid squad. Make sure you own all agents." });
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
        };

        matchmakingQueue.set(wallet, entry);
        socket.emit("queue_joined", { position: matchmakingQueue.size });
        console.log(`[MATCH] ${wallet.slice(0, 8)} joined queue (${matchmakingQueue.size} in queue)`);

        // Try to find a match
        tryMatchPlayers(io);
      } catch (err) {
        console.error("[MATCH] join_queue error:", err);
        socket.emit("queue_error", { message: "Failed to join queue" });
      }
    });

    // ─── Leave Queue ─────────────────────────────────────────
    socket.on("leave_queue", () => {
      const wallet = socketToWallet.get(socket.id);
      if (wallet && matchmakingQueue.has(wallet)) {
        matchmakingQueue.delete(wallet);
        socket.emit("queue_left", {});
        console.log(`[MATCH] ${wallet.slice(0, 8)} left queue`);
      }
    });

    // ─── Disconnect ──────────────────────────────────────────
    socket.on("disconnect", () => {
      const wallet = socketToWallet.get(socket.id);
      if (wallet) {
        // Remove from queue
        matchmakingQueue.delete(wallet);

        // If in active match, handle forfeit
        const matchId = walletToMatch.get(wallet);
        if (matchId) {
          const match = activeMatches.get(matchId);
          if (match && match.interval) {
            // Don't end the match — let it play out. The disconnected player just won't see events.
            // They can reconnect later to see the result.
            console.log(`[MATCH] ${wallet.slice(0, 8)} disconnected during match ${matchId}`);
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

    // Notify both players
    const homePointsEarned = result.homeScore > result.awayScore ? 3 : result.homeScore === result.awayScore ? 1 : 0;
    const awayPointsEarned = result.awayScore > result.homeScore ? 3 : result.homeScore === result.awayScore ? 1 : 0;

    const finishPayload = (side: "home" | "away") => ({
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
    });

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
