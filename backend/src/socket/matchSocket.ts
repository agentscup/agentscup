import { Server, Socket } from "socket.io";
import { supabase } from "../lib/supabase";
import { simulateMatch, SquadInput, PlayerInput, MatchEvent, MatchResult } from "../engine/matchEngine";
import { calculateElo } from "../services/eloService";
import {
  verifyMatchEntry,
  forfeitMatch,
  transferCup,
  treasuryAddress,
  MATCH_ENTRY_FEE_WEI,
  isEvmAddress,
} from "../lib/evm";

/* ================================================================== */
/*  Online PvP Matchmaking + Real-time Match Streaming                 */
/*  Economy: native ETH on Base                                        */
/*  Entry: 0.001 ETH each · Winner takes: 0.002 ETH                    */
/* ================================================================== */

interface QueueEntry {
  wallet: string;
  socketId: string;
  squad: SquadInput;
  teamName: string;
  userId: string;
  joinedAt: number;
  /** Hex txHash of the player's AgentsCupMatchEscrow.depositEntry call. */
  txHash: string;
  /** bytes32 matchId the player used when calling depositEntry. Every
   *  player picks a fresh random id per queue attempt, so two paired
   *  players hold two independent on-chain escrow buckets. */
  escrowMatchId: string;
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
  /** On-chain escrow matchIds (bytes32 hex). `awayEscrowMatchId` is
   *  `null` for bot matches — the bot's half of the prize pot comes
   *  from the treasury wallet directly. */
  homeEscrowMatchId: string;
  awayEscrowMatchId: string | null;
  result: MatchResult;
  seed: number;
  currentMinute: number;
  maxMinute: number;
  interval?: ReturnType<typeof setInterval>;
  isBotMatch?: boolean;
}

/** Bigint-bounded ETH entry fee expressed as a human-readable
 *  number for legacy/socket payloads that want JS-safe numeric
 *  values. 0.001 ETH = 1_000_000_000_000_000 wei. */
const MATCH_ENTRY_FEE_WEI_STR = MATCH_ENTRY_FEE_WEI.toString();

// In-memory state
const matchmakingQueue = new Map<string, QueueEntry>();     // wallet → entry
const activeMatches = new Map<string, ActiveMatch>();        // matchId → match
const walletToSocket = new Map<string, string>();            // wallet → socketId
const socketToWallet = new Map<string, string>();            // socketId → wallet
const walletToMatch = new Map<string, string>();             // wallet → matchId
const usedTxSignatures = new Set<string>();                  // prevent TX reuse
const botFallbackTimers = new Map<string, ReturnType<typeof setTimeout>>(); // wallet → bot match timer

// Wait this long for a real opponent before falling back to a bot
// match. Sampled per-queue-entry from a 30-40 s window so two
// players arriving back-to-back don't fall through to bots at the
// same instant — gives real-opponent matching a slightly wider
// runway while keeping the max queue time under a minute.
const BOT_FALLBACK_MIN_MS = 30_000;
const BOT_FALLBACK_MAX_MS = 40_000;
function randomBotFallbackMs(): number {
  const span = BOT_FALLBACK_MAX_MS - BOT_FALLBACK_MIN_MS;
  return BOT_FALLBACK_MIN_MS + Math.floor(Math.random() * (span + 1));
}

// Bot match outcome distribution — 45% player wins / 45% bot wins /
// 10% draw. Variable naming is historical ("BOT_WIN_CHANCE" means the
// chance the PLAYER wins against the bot); kept as-is to avoid a big
// rename diff.
const BOT_WIN_CHANCE = 0.45;   // player wins
const BOT_LOSS_CHANCE = 0.45;  // player loses (bot wins)
// draw = 1 - WIN - LOSS = 0.10

// Competitive-score guardrails. Rejection sampling only accepts a
// simulated result if the margin AND total-goal count fall inside
// these windows — otherwise you get 10-2 blowouts that make the
// in-game economy feel like play-money. A 1-3 goal margin with
// ≤ 6 total goals is what most real football matches look like.
const BOT_MAX_MARGIN = 3;
const BOT_MAX_TOTAL_GOALS = 6;

export function setupMatchSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`[MATCH] Player connected: ${socket.id}`);

    // ─── Join Queue ──────────────────────────────────────────
    socket.on("join_queue", async (data: {
      wallet: string;
      formation: string;
      positions: Record<string, string>; // slot → agentId
      managerId?: string;
      /** Hex tx hash of the player's depositEntry() call. */
      txHash: string;
      /** bytes32 matchId used in that deposit. */
      escrowMatchId: string;
    }) => {
      try {
        const { wallet, formation, positions, managerId, txHash, escrowMatchId } = data;
        if (!wallet || !formation || !positions) {
          socket.emit("queue_error", { message: "Missing wallet, formation, or positions" });
          return;
        }
        if (!isEvmAddress(wallet)) {
          socket.emit("queue_error", { message: "Wallet must be a 0x-prefixed EVM address" });
          return;
        }
        const walletLower = wallet.toLowerCase();

        // Already in queue or match?
        if (matchmakingQueue.has(walletLower)) {
          socket.emit("queue_error", { message: "Already in queue" });
          return;
        }
        if (walletToMatch.has(walletLower)) {
          socket.emit("queue_error", { message: "Already in a match" });
          return;
        }

        if (!txHash || !escrowMatchId) {
          socket.emit("queue_error", { message: "Entry fee deposit required" });
          return;
        }
        if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
          socket.emit("queue_error", { message: "txHash must be a 0x-prefixed keccak hash" });
          return;
        }
        if (!/^0x[a-fA-F0-9]{64}$/.test(escrowMatchId)) {
          socket.emit("queue_error", { message: "escrowMatchId must be a bytes32 (0x + 64 hex)" });
          return;
        }

        // Dedup against re-submitted tx hashes within this process
        // lifetime. The on-chain contract also guards against slot
        // reuse, so this is belt-plus-braces.
        if (usedTxSignatures.has(txHash.toLowerCase())) {
          socket.emit("queue_error", { message: "Transaction already used" });
          return;
        }

        console.log(
          `[MATCH] Verifying entry deposit for ${walletLower.slice(0, 10)} tx=${txHash.slice(0, 12)}`
        );
        const verification = await verifyMatchEntry(
          txHash,
          walletLower,
          escrowMatchId.toLowerCase(),
          0,
          MATCH_ENTRY_FEE_WEI
        );
        if (!verification.valid) {
          console.log(`[MATCH] Deposit verification failed: ${verification.reason}`);
          socket.emit("queue_error", {
            message: `Payment verification failed: ${verification.reason}`,
          });
          return;
        }

        usedTxSignatures.add(txHash.toLowerCase());

        // Track socket ↔ wallet mapping
        walletToSocket.set(walletLower, socket.id);
        socketToWallet.set(socket.id, walletLower);

        // Fetch user keyed on the EVM address. `wallet_address` is the
        // chain-agnostic column; new Base users write their 0x address
        // into it directly. Legacy Solana rows stay unreachable from
        // this path (their address format won't match).
        const { data: user } = await supabase
          .from("users")
          .select("id, username")
          .eq("wallet_address", walletLower)
          .maybeSingle();

        if (!user) {
          socket.emit("queue_error", { message: "User not found. Connect your wallet first." });
          // Refund by draining their escrow slot back to them.
          forfeitMatch(escrowMatchId.toLowerCase(), walletLower).catch((e) =>
            console.error("[MATCH] Refund failed:", e)
          );
          return;
        }

        // Build & verify squad from DB
        const squad = await buildVerifiedSquad(
          walletLower,
          user.id,
          formation,
          positions,
          managerId
        );
        if (!squad) {
          socket.emit("queue_error", {
            message: "Invalid squad. Make sure you own all agents.",
          });
          forfeitMatch(escrowMatchId.toLowerCase(), walletLower).catch((e) =>
            console.error("[MATCH] Refund failed:", e)
          );
          return;
        }

        // Get team name from leaderboard
        const { data: lb } = await supabase
          .from("leaderboard")
          .select("team_name")
          .eq("user_id", user.id)
          .single();

        const entry: QueueEntry = {
          wallet: walletLower,
          socketId: socket.id,
          squad,
          // Fallback chain mirrors the squad page: stored team
          // name → username → wallet slice ("0x5a31…6568"). New
          // players always have `lb.team_name` seeded by
          // /api/users/connect, so the tail cases are only relevant
          // for pre-migration rows or edge failures.
          teamName:
            lb?.team_name ||
            user.username ||
            `${walletLower.slice(0, 6)}…${walletLower.slice(-4)}`,
          userId: user.id,
          joinedAt: Date.now(),
          txHash: txHash.toLowerCase(),
          escrowMatchId: escrowMatchId.toLowerCase(),
        };

        matchmakingQueue.set(walletLower, entry);
        socket.emit("queue_joined", { position: matchmakingQueue.size });
        console.log(
          `[MATCH] ${walletLower.slice(0, 10)} joined queue (${matchmakingQueue.size} in queue) [paid 0.001 ETH]`
        );

        // Try to find a match
        tryMatchPlayers(io);

        // If still in queue (no opponent yet), schedule bot fallback
        if (matchmakingQueue.has(walletLower)) {
          scheduleBotFallback(io, walletLower);
        }
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
        cancelBotFallback(wallet);

        // Refund the player's own escrow deposit back to them.
        console.log(`[MATCH] ${wallet.slice(0, 10)} left queue — refunding escrow`);
        const refund = await forfeitMatch(entry.escrowMatchId, wallet);
        if (!refund.success) {
          console.error(`[MATCH] REFUND FAILED for ${wallet}: ${refund.error}`);
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
          cancelBotFallback(wallet);
          console.log(`[MATCH] ${wallet.slice(0, 10)} disconnected from queue — refunding escrow`);
          const refund = await forfeitMatch(entry.escrowMatchId, wallet);
          if (!refund.success) {
            console.error(
              `[MATCH] DISCONNECT REFUND FAILED for ${wallet}: ${refund.error}`
            );
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

  // Cancel pending bot fallbacks — these two are about to play each other
  cancelBotFallback(home.wallet);
  cancelBotFallback(away.wallet);

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
    homeEscrowMatchId: home.escrowMatchId,
    awayEscrowMatchId: away.escrowMatchId,
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
      if (match.isBotMatch) {
        finishBotMatch(io, match);
      } else {
        finishMatch(io, match);
      }
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

    // ─── Prize Payout (native ETH via MatchEscrow) ────────────
    //   Draw: each player's own escrow slot is refunded to them.
    //   Win:  the winner drains BOTH escrow matchIds back to
    //         themselves, collecting the combined 0.002 ETH pot.
    //
    // We call forfeitAll() twice per settlement — once per escrow
    // matchId. It's a contract method we hold OPERATOR_ROLE on,
    // which cleanly drains whatever's funded in a slot to any
    // beneficiary. Base gas on two forfeitAll txs is pennies.
    const isDraw = result.homeScore === result.awayScore;
    const homeWon = result.homeScore > result.awayScore;
    const ENTRY_WEI = MATCH_ENTRY_FEE_WEI;
    const PRIZE_POT_WEI = ENTRY_WEI * 2n;
    let payoutTx: string | undefined;
    let homePrizeWei = 0n;
    let awayPrizeWei = 0n;

    if (isDraw) {
      console.log(`[MATCH] Draw — refunding both players their escrow slots`);
      // Both refunds are signed by the treasury EOA so they share
      // one nonce stream — run sequentially. Running in parallel
      // causes the second tx to race the first with the same nonce
      // and hit "replacement transaction underpriced".
      const homeRefund = await forfeitMatch(
        match.homeEscrowMatchId,
        match.homeWallet
      );
      if (!homeRefund.success) {
        console.error(`[MATCH] HOME REFUND FAILED: ${homeRefund.error}`);
      }
      if (match.awayEscrowMatchId) {
        const awayRefund = await forfeitMatch(
          match.awayEscrowMatchId,
          match.awayWallet
        );
        if (!awayRefund.success) {
          console.error(`[MATCH] AWAY REFUND FAILED: ${awayRefund.error}`);
        }
      }
      homePrizeWei = ENTRY_WEI;
      awayPrizeWei = ENTRY_WEI;
    } else {
      const winnerWallet = homeWon ? match.homeWallet : match.awayWallet;
      console.log(
        `[MATCH] Paying winner ${winnerWallet.slice(0, 10)} → 0.002 ETH (2 escrow drains)`
      );
      // Drain both escrow buckets to the winner. Sequential for the
      // same nonce-race reason as the draw branch above. If either
      // drain fails the next still runs (the try/catch surrounds
      // the whole settle block so partial success is recorded).
      const homeDrain = await forfeitMatch(
        match.homeEscrowMatchId,
        winnerWallet
      );
      if (homeDrain.success) {
        payoutTx = homeDrain.txHash ?? payoutTx;
      } else {
        console.error(`[MATCH] HOME DRAIN FAILED: ${homeDrain.error}`);
      }
      if (match.awayEscrowMatchId) {
        const awayDrain = await forfeitMatch(
          match.awayEscrowMatchId,
          winnerWallet
        );
        if (awayDrain.success) {
          payoutTx = awayDrain.txHash ?? payoutTx;
        } else {
          console.error(`[MATCH] AWAY DRAIN FAILED: ${awayDrain.error}`);
        }
      }
      if (homeWon) homePrizeWei = PRIZE_POT_WEI;
      else awayPrizeWei = PRIZE_POT_WEI;
    }

    // Notify both players
    const homePointsEarned = result.homeScore > result.awayScore ? 3 : result.homeScore === result.awayScore ? 1 : 0;
    const awayPointsEarned = result.awayScore > result.homeScore ? 3 : result.homeScore === result.awayScore ? 1 : 0;

    const finishPayload = (side: "home" | "away") => {
      const iWon = (side === "home" && homeWon) || (side === "away" && !homeWon && !isDraw);
      const myPrizeWei = side === "home" ? homePrizeWei : awayPrizeWei;
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
        prizeWei: myPrizeWei.toString(),
        payoutTx: iWon ? payoutTx : undefined,
        entryFeeWei: MATCH_ENTRY_FEE_WEI_STR,
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
// Wallet param kept in signature for future use
void buildVerifiedSquad;

/* ================================================================== */
/*  Bot Fallback — play against CPU when no human opponent arrives    */
/*  Distribution: 45% win · 45% loss · 10% draw                        */
/*  Economy: identical to PvP (100k entry, 200k winner payout,         */
/*           100k refund on draw). ELO / leaderboard NOT affected.     */
/* ================================================================== */

const BOT_TEAM_NAMES = [
  "CPU XI", "BINARY BULLS", "AI WARRIORS", "MACHINE MINUTES",
  "NEURAL NETS", "DIGITAL DYNAMOS", "ROBOTIC ROVERS", "PIXEL PHANTOMS",
  "QUANTUM KNIGHTS", "BYTE BRIGADE", "SILICON SPARTANS", "DATA DRAGONS",
];

const BOT_FIRST_NAMES = [
  "MAX", "ZARA", "LIAM", "NOVA", "KAI", "ORION", "LYRA", "JAX",
  "MILO", "NYX", "REX", "FINN", "AXEL", "VEGA", "JUNO", "ATLAS",
  "IRIS", "ZANE", "RYN", "ODIN",
];

const BOT_LAST_NAMES = [
  "BYTE", "VOLT", "CORE", "FLUX", "NODE", "SYNC", "PIXEL", "FORGE",
  "BLAZE", "SHADOW", "FROST", "WAVE", "STORM", "ECHO", "RUSH", "FLARE",
  "QUANTUM", "VECTOR", "CIRCUIT", "HEX",
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function scheduleBotFallback(io: Server, wallet: string) {
  cancelBotFallback(wallet);
  const delay = randomBotFallbackMs();
  const timer = setTimeout(() => {
    botFallbackTimers.delete(wallet);
    const entry = matchmakingQueue.get(wallet);
    if (!entry) return; // already matched or left queue
    matchmakingQueue.delete(wallet);
    void startBotMatch(io, entry);
  }, delay);
  botFallbackTimers.set(wallet, timer);
}

function cancelBotFallback(wallet: string) {
  const t = botFallbackTimers.get(wallet);
  if (t) {
    clearTimeout(t);
    botFallbackTimers.delete(wallet);
  }
}

/**
 * Build a synthetic bot squad mirroring the player's formation, with stats
 * centered around (playerAvg + overallOffset). Offset pushes outcome probability
 * in the engine's rejection sampling:
 *   offset < 0 → bot weaker → player more likely to win
 *   offset > 0 → bot stronger → player more likely to lose
 *   offset = 0 → similar strength → draw/close match more likely
 */
function buildBotSquad(playerSquad: SquadInput, overallOffset: number): SquadInput {
  const avgOverall =
    playerSquad.players.length > 0
      ? Math.round(
          playerSquad.players.reduce((sum, p) => sum + p.overall, 0) / playerSquad.players.length
        )
      : 75;
  const target = Math.max(45, Math.min(95, avgOverall + overallOffset));

  const jitter = () => Math.round((Math.random() - 0.5) * 8); // ±4
  const stat = (base: number) => Math.max(40, Math.min(99, base + jitter()));

  const players: PlayerInput[] = playerSquad.players.map(({ slot, position }) => {
    const base = target + jitter();
    const overall = Math.max(40, Math.min(99, base));
    return {
      slot,
      position,
      name: `${pickRandom(BOT_FIRST_NAMES)} ${pickRandom(BOT_LAST_NAMES)}`,
      overall,
      pace: stat(overall),
      shooting: stat(overall),
      passing: stat(overall),
      dribbling: stat(overall),
      defending: stat(overall),
      physical: stat(overall),
    };
  });

  return {
    formation: playerSquad.formation,
    players,
    managerBonus: 0,
  };
}

async function startBotMatch(io: Server, player: QueueEntry) {
  // 1. Roll predetermined outcome
  const roll = Math.random();
  const desiredOutcome: "win" | "loss" | "draw" =
    roll < BOT_WIN_CHANCE
      ? "win"
      : roll < BOT_WIN_CHANCE + BOT_LOSS_CHANCE
        ? "loss"
        : "draw";

  // 2. Build bot squad biased toward desired outcome. Offsets are
  //    intentionally small (±3) so even win/loss rolls produce close
  //    matches. Earlier ±10 offsets meant the player's squad was much
  //    stronger / weaker than the bot's, which dominated the engine's
  //    power-ratio math (powerEdge is ratio^1.3) and blew scores out
  //    to 10-2, 11-0, etc. ±3 keeps teams within ~4% of each other and
  //    leaves outcome to the rejection sampler below.
  const offsetMap = { win: -3, loss: +3, draw: 0 };
  const botSquad = buildBotSquad(player.squad, offsetMap[desiredOutcome]);

  // 3. Rejection-sample seeds until the engine produces the desired
  //    outcome AND a competitive scoreline. First pass: strict margin
  //    + total-goal filter. Second pass (if we can't find one in
  //    maxAttempts): drop to just the outcome filter so we don't
  //    stall the match-find flow when the engine is in a high-scoring
  //    mood. Either way we never ship a 10-2 score to the frontend.
  let result: MatchResult | null = null;
  let seed = Date.now();
  const maxAttempts = desiredOutcome === "draw" ? 1500 : 600;

  const outcomeMatches = (r: MatchResult): boolean => {
    const isDraw = r.homeScore === r.awayScore;
    const playerWon = r.homeScore > r.awayScore;
    if (desiredOutcome === "win") return playerWon && !isDraw;
    if (desiredOutcome === "loss") return !playerWon && !isDraw;
    return isDraw;
  };
  const isCompetitive = (r: MatchResult): boolean => {
    const margin = Math.abs(r.homeScore - r.awayScore);
    const total = r.homeScore + r.awayScore;
    return margin <= BOT_MAX_MARGIN && total <= BOT_MAX_TOTAL_GOALS;
  };

  for (let i = 0; i < maxAttempts; i++) {
    const testSeed = Date.now() + i * 7919 + Math.floor(Math.random() * 999_983);
    const r = simulateMatch(player.squad, botSquad, testSeed);
    if (outcomeMatches(r) && isCompetitive(r)) {
      result = r;
      seed = testSeed;
      break;
    }
  }

  // 4. Fallback: outcome-only sampling if competitive version couldn't
  //    land one. Rare but guards against infinite stalls on edge-case
  //    squads where the engine refuses to produce a close game.
  if (!result) {
    for (let i = 0; i < maxAttempts; i++) {
      const testSeed = Date.now() + i * 104729 + Math.floor(Math.random() * 999_983);
      const r = simulateMatch(player.squad, botSquad, testSeed);
      if (outcomeMatches(r)) {
        result = r;
        seed = testSeed;
        break;
      }
    }
  }

  // 5. Safety net — still no result, accept whatever comes out.
  if (!result) {
    seed = Date.now();
    result = simulateMatch(player.squad, botSquad, seed);
    console.warn(
      `[BOT] Could not achieve desired=${desiredOutcome} for ${player.wallet.slice(0, 8)} — using fallback (${result.homeScore}-${result.awayScore})`
    );
  }

  const matchId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const maxMinute =
    result.events.length > 0 ? result.events[result.events.length - 1].minute : 90;
  const botTeamName = pickRandom(BOT_TEAM_NAMES);

  const match: ActiveMatch = {
    matchId,
    homeWallet: player.wallet,
    awayWallet: "__BOT__",
    homeUserId: player.userId,
    awayUserId: "__BOT__",
    homeSocketId: player.socketId,
    awaySocketId: "__BOT__",
    homeTeamName: player.teamName,
    awayTeamName: botTeamName,
    homeSquad: player.squad,
    awaySquad: botSquad,
    homeEscrowMatchId: player.escrowMatchId,
    awayEscrowMatchId: null, // no opponent deposit — treasury tops up on win
    result,
    seed,
    currentMinute: 0,
    maxMinute,
    isBotMatch: true,
  };

  activeMatches.set(matchId, match);
  walletToMatch.set(player.wallet, matchId);

  const playerSocket = io.sockets.sockets.get(player.socketId);
  // Bot matches are indistinguishable from real matches on the client —
  // no `vsBot` flag leaks out so the player sees a normal "MATCH FOUND" flow.
  playerSocket?.emit("match_found", {
    matchId,
    side: "home",
    opponent: {
      wallet: "__BOT__",
      teamName: botTeamName,
    },
    homeTeamName: player.teamName,
    awayTeamName: botTeamName,
  });

  console.log(
    `[BOT] Match started: ${player.wallet.slice(0, 8)} vs ${botTeamName} (${matchId}) predetermined=${desiredOutcome} final=${result.homeScore}-${result.awayScore}`
  );

  // Pre-match delay, then start streaming events
  setTimeout(() => {
    streamMatchEvents(io, match);
  }, 3000);
}

async function finishBotMatch(io: Server, match: ActiveMatch) {
  const { result } = match;
  const isDraw = result.homeScore === result.awayScore;
  const playerWon = result.homeScore > result.awayScore;

  let payoutTx: string | undefined;
  let playerPrizeWei = 0n;

  try {
    // ── Prize / refund (native ETH) ─────────────────────────────
    // Bot matches have only one real escrow deposit — the player's.
    // The opposing half of the prize pot comes from the treasury's
    // operating budget when the player wins.
    //
    //   Draw: drain player's escrow back to them (0.001 ETH).
    //   Win:  drain escrow back + treasury tops up 0.001 ETH
    //         so total payout is 0.002 ETH.
    //   Loss: drain escrow to treasury.
    if (isDraw) {
      console.log(
        `[BOT] Draw — refunding ${match.homeWallet.slice(0, 10)} 0.001 ETH from escrow`
      );
      const refund = await forfeitMatch(match.homeEscrowMatchId, match.homeWallet);
      if (refund.success) {
        payoutTx = refund.txHash;
        playerPrizeWei = MATCH_ENTRY_FEE_WEI;
      } else {
        console.error(`[BOT] DRAW REFUND FAILED: ${refund.error}`);
      }
    } else if (playerWon) {
      console.log(
        `[BOT] Player won — refund escrow + treasury top-up to ${match.homeWallet.slice(0, 10)}`
      );
      // SEQUENTIAL, not parallel — both txs are signed by the
      // treasury EOA so they share a nonce. Running them in parallel
      // ("replacement transaction underpriced") caused the top-up
      // leg to drop, leaving winners with only their 0.001 ETH
      // refund and no real prize.
      const refund = await forfeitMatch(match.homeEscrowMatchId, match.homeWallet);
      if (refund.success) {
        payoutTx = refund.txHash;
        playerPrizeWei += MATCH_ENTRY_FEE_WEI;
      } else {
        console.error(`[BOT] WIN REFUND FAILED: ${refund.error}`);
      }

      const topUp = await transferCup(match.homeWallet, MATCH_ENTRY_FEE_WEI);
      if (topUp.success) {
        payoutTx = topUp.txHash ?? payoutTx;
        playerPrizeWei += MATCH_ENTRY_FEE_WEI;
      } else {
        console.error(`[BOT] WIN TOP-UP FAILED: ${topUp.error}`);
      }
    } else {
      console.log(`[BOT] Player lost — draining escrow to treasury`);
      const treasury = treasuryAddress();
      if (treasury) {
        const drain = await forfeitMatch(match.homeEscrowMatchId, treasury);
        if (!drain.success) {
          console.error(`[BOT] LOSS DRAIN FAILED: ${drain.error}`);
        }
      } else {
        console.warn(
          "[BOT] Loss drain skipped — no treasury address configured"
        );
      }
    }

    // ── ELO + XP ──────────────────────────────────────────────
    //   Bot matches grant a much smaller ELO share than real PvP
    //   so the ladder stays meaningful:
    //     Win  → +3 ELO   (PvP win would be ~+16)
    //     Draw → +1 ELO   (PvP draw is ~0)
    //     Loss →  0 ELO   (no penalty — player was routed to bot)
    const xpGain = playerWon ? 30 : isDraw ? 15 : 5;
    const pointsEarned = playerWon ? 3 : isDraw ? 1 : 0;
    const eloChange = playerWon ? 3 : isDraw ? 1 : 0;

    const { data: user } = await supabase
      .from("users")
      .select("xp, elo")
      .eq("id", match.homeUserId)
      .single();
    if (user) {
      await supabase
        .from("users")
        .update({
          xp: (user.xp || 0) + xpGain,
          elo: (user.elo || 1000) + eloChange,
        })
        .eq("id", match.homeUserId);
    }

    // ── Notify the player ─────────────────────────────────────
    const playerSocket = io.sockets.sockets.get(match.homeSocketId);
    playerSocket?.emit("match_finished", {
      matchId: match.matchId,
      result: {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        possession: result.possession,
        shots: result.shots,
        shotsOnTarget: result.shotsOnTarget,
        manOfTheMatch: result.manOfTheMatch,
      },
      pointsEarned,
      eloChange,
      xpGain,
      prizeWei: playerPrizeWei.toString(),
      payoutTx,
      entryFeeWei: MATCH_ENTRY_FEE_WEI_STR,
    });

    console.log(
      `[BOT] Match finished: ${result.homeScore}-${result.awayScore} prize=${playerPrizeWei}wei (${match.matchId})`
    );
  } catch (err) {
    console.error("[BOT] finishBotMatch error:", err);
  }

  // Cleanup
  activeMatches.delete(match.matchId);
  walletToMatch.delete(match.homeWallet);
}
