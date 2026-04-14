/* ================================================================== */
/*  Deterministic Match Simulation Engine                              */
/*  Same seed + same inputs = same result, always                      */
/*  Stronger teams win proportionally more often                       */
/* ================================================================== */

// Mulberry32 seeded PRNG
function createRNG(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PlayerInput {
  slot: string;
  position: string;
  name: string;
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

export interface SquadInput {
  formation: string;
  players: PlayerInput[];
  managerBonus: number;
}

export interface MatchEvent {
  minute: number;
  type:
    | "kick_off"
    | "goal"
    | "shot_saved"
    | "shot_missed"
    | "tackle"
    | "pass"
    | "yellow_card"
    | "red_card"
    | "injury"
    | "half_time"
    | "full_time"
    | "possession_change";
  team: "home" | "away";
  playerName: string;
  targetPlayerName?: string;
  description: string;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  manOfTheMatch: { team: "home" | "away"; playerName: string; rating: number };
}

function getPlayers(squad: SquadInput, role: string): PlayerInput[] {
  const mb = squad.managerBonus;
  const adjust = (p: PlayerInput) => ({
    ...p,
    pace: Math.min(99, p.pace + mb),
    shooting: Math.min(99, p.shooting + mb),
    passing: Math.min(99, p.passing + mb),
    dribbling: Math.min(99, p.dribbling + mb),
    defending: Math.min(99, p.defending + mb),
    physical: Math.min(99, p.physical + mb),
  });

  return squad.players
    .filter((p) => {
      if (role === "GK") return p.position === "GK";
      if (role === "DEF") return ["CB", "LB", "RB"].includes(p.position);
      if (role === "MID") return ["CDM", "CM", "CAM"].includes(p.position);
      if (role === "FWD") return ["ST", "LW", "RW"].includes(p.position);
      return false;
    })
    .map(adjust);
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 50;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Stat-weighted roll: stronger stat = higher floor, less randomness can upset.
 * statRoll(90, rng) → range [40.5, 90]  (floor 45%)
 * statRoll(60, rng) → range [27, 60]    (floor 45%)
 */
function statRoll(stat: number, rng: () => number): number {
  return stat * (0.35 + rng() * 0.65);
}

/**
 * Power ratio: amplifies strength gaps (ratio^1.5 — moderate curve).
 * powerEdge(85, 65) → ~1.41 (solid advantage)
 * powerEdge(75, 75) → 1.0  (even)
 * powerEdge(65, 85) → ~0.71 (disadvantage)
 */
function powerEdge(myStr: number, theirStr: number): number {
  const ratio = myStr / Math.max(1, theirStr);
  return Math.pow(ratio, 1.3);
}

const ATTACK_VERBS = ["sprints past", "dribbles around", "beats", "outpaces", "nutmegs", "skips past"];
const SHOT_VERBS = ["fires a rocket", "unleashes a shot", "strikes from distance", "curls one", "volleys", "takes a shot"];
const SAVE_PHRASES = ["pulls off a brilliant save", "denies the shot", "parries it away", "makes an incredible stop", "dives to save"];
const MISS_PHRASES = ["blazes it over", "sends it wide", "skies the shot", "fires just past the post", "hits the crossbar"];
const GOAL_PHRASES = [
  "GOAL! The ball hits the back of the net!",
  "GOAL! What a finish!",
  "GOAL! Absolute screamer!",
  "GOAL! Cool as you like, slotted home!",
  "GOAL! Unstoppable strike into the top corner!",
  "GOAL! Tapped in from close range!",
];
const TACKLE_PHRASES = ["with a crunching tackle", "slides in to win the ball", "reads the play perfectly", "intercepts brilliantly"];
const PASS_PHRASES = ["plays a delightful through ball", "whips in a cross", "threads the needle", "picks out", "lofts a ball to"];
const FOUL_PHRASES = ["brings down", "fouls", "clips the heels of", "body-checks", "trips"];
const DRIBBLE_PHRASES = ["goes on a mazy run", "dances past defenders", "carries the ball forward", "surges down the wing", "drives into space"];
const MIDFIELD_PHRASES = ["wins the ball in midfield", "controls possession", "recycles play", "switches the ball to the other flank", "presses high up the pitch"];

export function simulateMatch(home: SquadInput, away: SquadInput, seed: number): MatchResult {
  const rng = createRNG(seed);
  const events: MatchEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;
  let homePossCount = 0;
  let awayPossCount = 0;
  let homeShots = 0;
  let awayShots = 0;
  let homeShotsOnTarget = 0;
  let awayShotsOnTarget = 0;

  // Performance tracking for MOTM
  const performance: Record<string, { team: "home" | "away"; name: string; score: number }> = {};
  function addPerf(team: "home" | "away", name: string, pts: number) {
    const key = `${team}-${name}`;
    if (!performance[key]) performance[key] = { team, name, score: 0 };
    performance[key].score += pts;
  }

  // Team strengths
  const homeGK = getPlayers(home, "GK");
  const homeDEF = getPlayers(home, "DEF");
  const homeMID = getPlayers(home, "MID");
  const homeFWD = getPlayers(home, "FWD");

  const awayGK = getPlayers(away, "GK");
  const awayDEF = getPlayers(away, "DEF");
  const awayMID = getPlayers(away, "MID");
  const awayFWD = getPlayers(away, "FWD");

  const homeAttack = avg(homeFWD.map((p) => (p.shooting + p.pace + p.dribbling) / 3));
  const homeMidfield = avg(homeMID.map((p) => (p.passing + p.dribbling + p.physical) / 3));
  const homeDefense = avg(homeDEF.map((p) => (p.defending + p.physical + p.pace) / 3));
  const homeKeeping = homeGK.length > 0 ? avg(homeGK.map((p) => (p.defending + p.physical) / 2)) : 50;

  const awayAttack = avg(awayFWD.map((p) => (p.shooting + p.pace + p.dribbling) / 3));
  const awayMidfield = avg(awayMID.map((p) => (p.passing + p.dribbling + p.physical) / 3));
  const awayDefense = avg(awayDEF.map((p) => (p.defending + p.physical + p.pace) / 3));
  const awayKeeping = awayGK.length > 0 ? avg(awayGK.map((p) => (p.defending + p.physical) / 2)) : 50;

  // Overall team power (0-99 scale)
  const homePower = (homeAttack + homeMidfield + homeDefense + homeKeeping) / 4;
  const awayPower = (awayAttack + awayMidfield + awayDefense + awayKeeping) / 4;

  // Power edge multipliers (squared ratio — big gaps = huge advantage)
  const homeEdge = powerEdge(homePower, awayPower);
  const awayEdge = powerEdge(awayPower, homePower);

  // Kick off
  events.push({
    minute: 0,
    type: "kick_off",
    team: "home",
    playerName: "",
    description: "The referee blows the whistle — the match begins!",
  });

  // Injury time calculation
  let cardCount = 0;
  let injuryCount = 0;

  // Simulate 90 minutes
  for (let minute = 1; minute <= 90; minute++) {
    // ─── Possession: stronger midfield dominates ───────────
    const possRoll = rng();
    const homeMidPower = homeMidfield * homeMidfield; // squared
    const awayMidPower = awayMidfield * awayMidfield;
    const homeChance = homeMidPower / (homeMidPower + awayMidPower) + (rng() - 0.5) * 0.15;
    const isHomePoss = possRoll < homeChance;

    if (isHomePoss) homePossCount++;
    else awayPossCount++;

    const attackTeam: "home" | "away" = isHomePoss ? "home" : "away";
    const defendTeam: "home" | "away" = isHomePoss ? "away" : "home";
    const attackMid = isHomePoss ? homeMID : awayMID;
    const attackFwd = isHomePoss ? homeFWD : awayFWD;
    const defMid = isHomePoss ? awayMID : homeMID;
    const defDEF = isHomePoss ? awayDEF : homeDEF;
    const defGK = isHomePoss ? awayGK : homeGK;
    const attackStr = isHomePoss ? homeAttack : awayAttack;
    const defStr = isHomePoss ? awayDefense : homeDefense;
    const keepStr = isHomePoss ? awayKeeping : homeKeeping;
    const midStr = isHomePoss ? homeMidfield : awayMidfield;
    const defMidStr = isHomePoss ? awayMidfield : homeMidfield;
    const teamEdge = isHomePoss ? homeEdge : awayEdge;

    // Half time
    if (minute === 45) {
      events.push({
        minute: 45,
        type: "half_time",
        team: "home",
        playerName: "",
        description: `Half time! ${homeScore} - ${awayScore}`,
      });
    }

    // ─── Midfield battle — stronger team creates more attacks ──
    // Base 38% + midfield edge (capped so max ~65% for dominant team)
    const midEdge = powerEdge(midStr, defMidStr);
    const attackChance = Math.min(0.60, 0.30 + 0.10 * midEdge);
    if (rng() > attackChance) {
      // Even when no attack develops, show midfield activity
      if (rng() < 0.40) {
        const allMid = isHomePoss ? homeMID : awayMID;
        const allDef = isHomePoss ? homeDEF : awayDEF;
        const pool = [...allMid, ...allDef];
        if (pool.length > 0) {
          const player = pickRandom(pool, rng);
          events.push({
            minute,
            type: "possession_change",
            team: attackTeam,
            playerName: player.name,
            description: `${player.name} ${pickRandom(MIDFIELD_PHRASES, rng)}`,
          });
        }
      }
      continue;
    }

    // ─── Attack phase ──────────────────────────────────────

    // Pass event
    if (attackMid.length > 0 && attackFwd.length > 0 && rng() < 0.55) {
      const passer = pickRandom(attackMid, rng);
      const target = pickRandom(attackFwd, rng);
      events.push({
        minute,
        type: "pass",
        team: attackTeam,
        playerName: passer.name,
        targetPlayerName: target.name,
        description: `${passer.name} ${pickRandom(PASS_PHRASES, rng)} ${target.name}`,
      });
      addPerf(attackTeam, passer.name, 1);
    }

    // Dribble event
    if (attackFwd.length > 0 && rng() < 0.25) {
      const dribbler = pickRandom(attackFwd, rng);
      events.push({
        minute,
        type: "pass",
        team: attackTeam,
        playerName: dribbler.name,
        description: `${dribbler.name} ${pickRandom(DRIBBLE_PHRASES, rng)}!`,
      });
      addPerf(attackTeam, dribbler.name, 1);
    }

    // Tackle / Foul event — stronger defenders stop attacks more reliably
    if (defDEF.length > 0 && rng() < 0.45) {
      const defender = pickRandom(defDEF, rng);
      const attacker = attackFwd.length > 0 ? pickRandom(attackFwd, rng) : pickRandom(attackMid, rng);
      const defRoll = statRoll(defender.defending, rng);
      const driRoll = statRoll(attacker.dribbling, rng);
      const tackleSuccess = defRoll > driRoll;

      if (tackleSuccess) {
        if (rng() < 0.3) {
          // Foul
          events.push({
            minute,
            type: "tackle",
            team: defendTeam,
            playerName: defender.name,
            targetPlayerName: attacker.name,
            description: `${defender.name} ${pickRandom(FOUL_PHRASES, rng)} ${attacker.name}. Free kick!`,
          });

          if (rng() < 0.12) {
            cardCount++;
            const isRed = rng() < 0.08;
            events.push({
              minute,
              type: isRed ? "red_card" : "yellow_card",
              team: defendTeam,
              playerName: defender.name,
              description: `${isRed ? "RED" : "YELLOW"} CARD for ${defender.name}! ${isRed ? "Sent off!" : "Goes into the book."}`,
            });
          }
          if (rng() > 0.4) continue;
        } else {
          // Clean tackle
          events.push({
            minute,
            type: "tackle",
            team: defendTeam,
            playerName: defender.name,
            targetPlayerName: attacker.name,
            description: `${defender.name} ${pickRandom(TACKLE_PHRASES, rng)} on ${attacker.name}`,
          });
          addPerf(defendTeam, defender.name, 2);
          continue; // Attack stopped
        }
      }
    }

    // ─── Attack vs Defense — stat-weighted rolls ─────────────
    const attackRoll = statRoll(attackStr, rng);
    const defenseRoll = statRoll(defStr, rng);

    // Stronger attack breaks through more easily (0.75 threshold instead of 0.7)
    if (attackRoll <= defenseRoll * 0.75) continue;

    // Shot!
    const shooter = attackFwd.length > 0 ? pickRandom(attackFwd, rng) : pickRandom(attackMid, rng);
    if (attackTeam === "home") homeShots++;
    else awayShots++;

    // Shot & save quality use statRoll (60% floor) — better stats = WAY more consistent
    const shotQuality = statRoll(shooter.shooting, rng) / 99;
    const saveQuality = statRoll(keepStr, rng) / 99;
    const keeper = defGK.length > 0 ? defGK[0] : { name: "Keeper" } as PlayerInput;

    // Apply team power edge to shot quality — stronger teams convert more
    const adjustedShot = shotQuality * (0.75 + 0.25 * teamEdge);

    if (adjustedShot > saveQuality * 0.88) {
      // Shot on target
      if (attackTeam === "home") homeShotsOnTarget++;
      else awayShotsOnTarget++;

      if (adjustedShot > saveQuality * 1.08 + 0.04) {
        // GOAL!
        if (attackTeam === "home") homeScore++;
        else awayScore++;

        const assister = attackMid.length > 0 ? pickRandom(attackMid, rng) : null;
        events.push({
          minute,
          type: "goal",
          team: attackTeam,
          playerName: shooter.name,
          targetPlayerName: assister?.name,
          description: `${shooter.name} ${pickRandom(SHOT_VERBS, rng)}... ${pickRandom(GOAL_PHRASES, rng)} ${homeScore} - ${awayScore}${assister ? ` (assist: ${assister.name})` : ""}`,
        });
        addPerf(attackTeam, shooter.name, 10);
        if (assister) addPerf(attackTeam, assister.name, 5);
      } else {
        // Save
        events.push({
          minute,
          type: "shot_saved",
          team: attackTeam,
          playerName: shooter.name,
          targetPlayerName: keeper.name,
          description: `${shooter.name} ${pickRandom(SHOT_VERBS, rng)}, but ${keeper.name} ${pickRandom(SAVE_PHRASES, rng)}!`,
        });
        addPerf(defendTeam, keeper.name, 3);
      }
    } else {
      // Miss
      events.push({
        minute,
        type: "shot_missed",
        team: attackTeam,
        playerName: shooter.name,
        description: `${shooter.name} ${pickRandom(SHOT_VERBS, rng)}, but ${pickRandom(MISS_PHRASES, rng)}!`,
      });
    }

    // Injury chance
    if (rng() < 0.008) {
      injuryCount++;
      const injuredPlayer = pickRandom(
        attackTeam === "home"
          ? [...homeDEF, ...homeMID, ...homeFWD]
          : [...awayDEF, ...awayMID, ...awayFWD],
        rng,
      );
      events.push({
        minute,
        type: "injury",
        team: attackTeam,
        playerName: injuredPlayer.name,
        description: `${injuredPlayer.name} goes down after a strong challenge. The physio rushes on.`,
      });
    }
  }

  // Injury time
  const injuryTime = Math.min(5, 1 + Math.floor(cardCount * 0.5 + injuryCount * 1.5 + rng() * 2));
  for (let minute = 91; minute <= 90 + injuryTime; minute++) {
    const possRoll = rng();
    const homeMidPower = homeMidfield * homeMidfield;
    const awayMidPower = awayMidfield * awayMidfield;
    const homeChance = homeMidPower / (homeMidPower + awayMidPower);
    const isHomePoss = possRoll < homeChance;
    const attackTeam: "home" | "away" = isHomePoss ? "home" : "away";
    const attackFwd = isHomePoss ? homeFWD : awayFWD;
    const attackMid = isHomePoss ? homeMID : awayMID;
    const defGK = isHomePoss ? awayGK : homeGK;
    const keepStr = isHomePoss ? awayKeeping : homeKeeping;
    const teamEdge = isHomePoss ? homeEdge : awayEdge;

    if (rng() < 0.12 && attackFwd.length > 0) {
      const shooter = pickRandom(attackFwd, rng);
      if (attackTeam === "home") homeShots++;
      else awayShots++;

      const shotQuality = statRoll(shooter.shooting, rng) / 99;
      const saveQuality = statRoll(keepStr, rng) / 99;
      const adjustedShot = shotQuality * (0.75 + 0.25 * teamEdge);

      if (adjustedShot > saveQuality * 1.08 + 0.04) {
        if (attackTeam === "home") { homeScore++; homeShotsOnTarget++; }
        else { awayScore++; awayShotsOnTarget++; }
        events.push({
          minute,
          type: "goal",
          team: attackTeam,
          playerName: shooter.name,
          description: `${minute}' LATE DRAMA! ${shooter.name} ${pickRandom(GOAL_PHRASES, rng)} ${homeScore} - ${awayScore}`,
        });
        addPerf(attackTeam, shooter.name, 10);
      }
    }
  }

  // Full time
  events.push({
    minute: 90 + injuryTime,
    type: "full_time",
    team: "home",
    playerName: "",
    description: `Full time! Final score: ${homeScore} - ${awayScore}`,
  });

  // Possession
  const totalPoss = homePossCount + awayPossCount || 1;
  const possession = {
    home: Math.round((homePossCount / totalPoss) * 100),
    away: Math.round((awayPossCount / totalPoss) * 100),
  };

  // Man of the Match
  let motm = { team: "home" as "home" | "away", playerName: "Unknown", rating: 6.0 };
  let bestScore = -1;
  for (const p of Object.values(performance)) {
    if (p.score > bestScore) {
      bestScore = p.score;
      motm = { team: p.team, playerName: p.name, rating: Math.min(10, 6 + p.score * 0.3) };
    }
  }

  return {
    homeScore,
    awayScore,
    events,
    possession,
    shots: { home: homeShots, away: awayShots },
    shotsOnTarget: { home: homeShotsOnTarget, away: awayShotsOnTarget },
    manOfTheMatch: motm,
  };
}
