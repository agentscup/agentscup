/**
 * Deterministic founder-card generation for early-access claims.
 *
 * Given a set of X-account signals, we:
 *   1. Compute a rarity score (heavily boosted by Base engagement).
 *   2. Hash the handle to pick a position + stat profile.
 *   3. Scale the stats by rarity so legendaries feel legendary.
 *
 * Everything is pure and deterministic — the same X handle always gets
 * the same card back (subject to their updated Base signals).
 */

export type Rarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

export type Position = "GK" | "CB" | "LB" | "RB" | "CDM" | "CM" | "CAM" | "LW" | "RW" | "ST";

export interface XSignals {
  handle: string;              // lowercase, no @
  displayName?: string;
  avatarUrl?: string;
  followerCount?: number;
  accountAgeDays?: number;
  followsBase?: boolean;
  bioMentionsBase?: boolean;
  /** Count of recent tweets mentioning base / basechain / onbase / etc. */
  baseTweetHits?: number;
}

export interface FounderStats {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

export interface FounderCard {
  handle: string;
  displayName: string;
  avatarUrl?: string;
  position: Position;
  rarity: Rarity;
  score: number;
  overall: number;
  stats: FounderStats;
  /** Human-readable breakdown of the signals that drove the rarity. */
  signalBreakdown: Array<{ label: string; points: number }>;
}

// ─────────────────────────────────────────────────────────────────────
// Rarity
// ─────────────────────────────────────────────────────────────────────

export function computeRarityScore(s: XSignals): {
  score: number;
  breakdown: Array<{ label: string; points: number }>;
} {
  const breakdown: Array<{ label: string; points: number }> = [];

  if (s.followsBase) {
    breakdown.push({ label: "Follows @base", points: 50 });
  }
  if (s.bioMentionsBase) {
    breakdown.push({ label: "Base in bio", points: 25 });
  }
  const tweetHits = Math.min(s.baseTweetHits ?? 0, 10);
  if (tweetHits > 0) {
    breakdown.push({ label: `${tweetHits} Base tweet${tweetHits === 1 ? "" : "s"}`, points: tweetHits * 3 });
  }
  const followers = s.followerCount ?? 0;
  if (followers >= 10_000) {
    breakdown.push({ label: "10k+ followers", points: 10 });
  } else if (followers >= 1_000) {
    breakdown.push({ label: "1k+ followers", points: 5 });
  }
  if ((s.accountAgeDays ?? 0) >= 365) {
    breakdown.push({ label: "1yr+ account", points: 5 });
  }

  // Deterministic jitter from handle hash so two users with identical
  // signals still get unique-feeling cards.
  const jitter = hashToInt(`jitter:${s.handle}`) % 16;
  if (jitter > 0) {
    breakdown.push({ label: "Founder bonus", points: jitter });
  }

  const score = breakdown.reduce((sum, b) => sum + b.points, 0);
  return { score, breakdown };
}

export function scoreToRarity(score: number): Rarity {
  if (score >= 90) return "LEGENDARY";
  if (score >= 60) return "EPIC";
  if (score >= 30) return "RARE";
  return "COMMON";
}

// ─────────────────────────────────────────────────────────────────────
// Position + stats
// ─────────────────────────────────────────────────────────────────────

const POSITIONS: Position[] = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];

/**
 * Per-position stat weights (sum ≈ 6). We keep keepers defensive,
 * wingers fast/creative, strikers clinical, etc.
 */
const POSITION_WEIGHTS: Record<Position, FounderStats> = {
  GK:  { pace: 0.4, shooting: 0.2, passing: 0.6, dribbling: 0.3, defending: 1.8, physical: 1.2 },
  CB:  { pace: 0.7, shooting: 0.3, passing: 0.7, dribbling: 0.5, defending: 1.6, physical: 1.5 },
  LB:  { pace: 1.3, shooting: 0.5, passing: 0.9, dribbling: 0.8, defending: 1.2, physical: 1.0 },
  RB:  { pace: 1.3, shooting: 0.5, passing: 0.9, dribbling: 0.8, defending: 1.2, physical: 1.0 },
  CDM: { pace: 0.9, shooting: 0.7, passing: 1.1, dribbling: 0.8, defending: 1.4, physical: 1.4 },
  CM:  { pace: 1.0, shooting: 1.0, passing: 1.3, dribbling: 1.1, defending: 1.0, physical: 1.0 },
  CAM: { pace: 1.1, shooting: 1.2, passing: 1.4, dribbling: 1.4, defending: 0.5, physical: 0.8 },
  LW:  { pace: 1.5, shooting: 1.2, passing: 1.0, dribbling: 1.5, defending: 0.4, physical: 0.8 },
  RW:  { pace: 1.5, shooting: 1.2, passing: 1.0, dribbling: 1.5, defending: 0.4, physical: 0.8 },
  ST:  { pace: 1.3, shooting: 1.7, passing: 0.9, dribbling: 1.3, defending: 0.3, physical: 1.1 },
};

/** Base floor stats per rarity — legendaries never roll bad. */
const RARITY_FLOOR: Record<Rarity, number> = {
  COMMON: 55,
  RARE: 65,
  EPIC: 75,
  LEGENDARY: 85,
};

const RARITY_CEIL: Record<Rarity, number> = {
  COMMON: 74,
  RARE: 82,
  EPIC: 89,
  LEGENDARY: 96,
};

export function generateCard(signals: XSignals): FounderCard {
  const handle = signals.handle.toLowerCase().replace(/^@/, "");
  const display = signals.displayName || handle;

  const { score, breakdown } = computeRarityScore({ ...signals, handle });
  const rarity = scoreToRarity(score);

  // Pick position from a hash of the handle — stable across re-rolls.
  const positionIdx = hashToInt(`pos:${handle}`) % POSITIONS.length;
  const position = POSITIONS[positionIdx];

  // Six per-stat deterministic rolls in [floor, ceil], then tilt toward
  // position weights so the card has a clear identity.
  const floor = RARITY_FLOOR[rarity];
  const ceil = RARITY_CEIL[rarity];
  const weights = POSITION_WEIGHTS[position];

  const raw: FounderStats = {
    pace:      rollStat(handle, "pace",      floor, ceil, weights.pace),
    shooting:  rollStat(handle, "shooting",  floor, ceil, weights.shooting),
    passing:   rollStat(handle, "passing",   floor, ceil, weights.passing),
    dribbling: rollStat(handle, "dribbling", floor, ceil, weights.dribbling),
    defending: rollStat(handle, "defending", floor, ceil, weights.defending),
    physical:  rollStat(handle, "physical",  floor, ceil, weights.physical),
  };

  const overall = computeOverall(raw, position);

  return {
    handle,
    displayName: display,
    avatarUrl: signals.avatarUrl,
    position,
    rarity,
    score,
    overall,
    stats: raw,
    signalBreakdown: breakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function rollStat(handle: string, key: string, floor: number, ceil: number, weight: number): number {
  const h = hashToInt(`${key}:${handle}`);
  const range = ceil - floor;
  const base = floor + (h % (range + 1));
  // Weighted tilt: pull the stat toward the ceiling when the position
  // values it highly, toward the floor when it doesn't.
  const tilt = Math.round((weight - 1) * 8);
  return clamp(base + tilt, floor, 99);
}

function computeOverall(s: FounderStats, pos: Position): number {
  // Position-aware weighted average. Mirror the in-game agent overall
  // calc so founder cards feel compatible with the existing squad UI.
  const w = POSITION_WEIGHTS[pos];
  const total =
    s.pace * w.pace +
    s.shooting * w.shooting +
    s.passing * w.passing +
    s.dribbling * w.dribbling +
    s.defending * w.defending +
    s.physical * w.physical;
  const weightSum =
    w.pace + w.shooting + w.passing + w.dribbling + w.defending + w.physical;
  return Math.round(total / weightSum);
}

/** FNV-1a 32-bit hash → positive int. Deterministic and fast. */
function hashToInt(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ─────────────────────────────────────────────────────────────────────
// X profile image helper — bumps the 48x48 `_normal` URL to 400x400.
// ─────────────────────────────────────────────────────────────────────

export function upgradeAvatarUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url
    .replace(/_normal\.(jpg|jpeg|png)$/i, "_400x400.$1")
    .replace(/_bigger\.(jpg|jpeg|png)$/i, "_400x400.$1");
}
