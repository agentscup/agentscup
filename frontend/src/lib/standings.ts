/* ================================================================== */
/*  Leaderboard Standings — persisted in localStorage                  */
/* ================================================================== */

export interface TeamStanding {
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  isPlayer?: boolean;
}

const STORAGE_KEY = "agents-cup-standings";

// Default AI teams to populate the leaderboard
const AI_TEAMS: Omit<TeamStanding, "played" | "won" | "drawn" | "lost" | "goalsFor" | "goalsAgainst" | "points">[] = [
  { name: "NEURAL FC" },
  { name: "DEEP LEARN UTD" },
  { name: "TENSOR CITY" },
  { name: "GRADIENT ROVERS" },
  { name: "BACKPROP ATHLETIC" },
  { name: "EPOCH WANDERERS" },
  { name: "KERNEL TOWN" },
  { name: "MATRIX RANGERS" },
  { name: "SIGMOID STARS" },
  { name: "DROPOUT FC" },
  { name: "BATCH NORM BOYS" },
];

function createBlankStanding(name: string, isPlayer?: boolean): TeamStanding {
  return {
    name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    isPlayer,
  };
}

// Seed AI teams with some random pre-played results
function seedAIStandings(): TeamStanding[] {
  return AI_TEAMS.map((t) => {
    const played = 3 + Math.floor(Math.random() * 5);
    const won = Math.floor(Math.random() * (played + 1));
    const remaining = played - won;
    const drawn = Math.floor(Math.random() * (remaining + 1));
    const lost = remaining - drawn;
    const goalsFor = won * 2 + drawn + Math.floor(Math.random() * 3);
    const goalsAgainst = lost * 2 + drawn + Math.floor(Math.random() * 2);
    return {
      ...createBlankStanding(t.name),
      played,
      won,
      drawn,
      lost,
      goalsFor,
      goalsAgainst,
      points: won * 3 + drawn,
    };
  });
}

export function getStandings(): TeamStanding[] {
  if (typeof window === "undefined") return [];

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as TeamStanding[];
    } catch {
      // corrupt data, reset
    }
  }

  // First time — seed
  const playerTeam = createBlankStanding("YOUR SQUAD", true);
  const aiTeams = seedAIStandings();
  const all = [playerTeam, ...aiTeams];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function recordMatchResult(
  homeScore: number,
  awayScore: number,
) {
  const standings = getStandings();

  const player = standings.find((s) => s.isPlayer);
  if (!player) return;

  player.played += 1;
  player.goalsFor += homeScore;
  player.goalsAgainst += awayScore;

  if (homeScore > awayScore) {
    player.won += 1;
    player.points += 3;
  } else if (homeScore === awayScore) {
    player.drawn += 1;
    player.points += 1;
  } else {
    player.lost += 1;
  }

  // Also simulate a round of AI matches to keep the table moving
  const aiTeams = standings.filter((s) => !s.isPlayer);
  for (let i = 0; i < aiTeams.length - 1; i += 2) {
    if (Math.random() < 0.6) {
      const a = aiTeams[i];
      const b = aiTeams[i + 1];
      const gA = Math.floor(Math.random() * 4);
      const gB = Math.floor(Math.random() * 4);
      a.played += 1;
      b.played += 1;
      a.goalsFor += gA;
      a.goalsAgainst += gB;
      b.goalsFor += gB;
      b.goalsAgainst += gA;
      if (gA > gB) { a.won += 1; a.points += 3; b.lost += 1; }
      else if (gA === gB) { a.drawn += 1; a.points += 1; b.drawn += 1; b.points += 1; }
      else { b.won += 1; b.points += 3; a.lost += 1; }
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(standings));
}

export function resetStandings() {
  localStorage.removeItem(STORAGE_KEY);
}

export function sortStandings(standings: TeamStanding[]): TeamStanding[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    return b.goalsFor - a.goalsFor;
  });
}
