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

/**
 * Follower-count → rarity points. Exported so the TaskList meter can
 * preview the exact same bonus the reveal will apply.
 *
 * Thresholds are calibrated for the Base ecosystem — the "whale"
 * bracket sits at 20k+ because accounts above that are genuinely
 * rare on-chain, not at 100k+ where most days have zero qualifying
 * sign-ups:
 *
 *   20k+ followers → 105  → whale tier (LEGENDARY + headroom)
 *   10k+ followers →  90  → LEGENDARY floor
 *    2k+ followers →  60  → EPIC floor
 *    1k+ followers →  30  → RARE floor
 *    <1k  followers →  0  → COMMON
 *
 * Completing tasks no longer contributes to the score — tasks are a
 * reveal gate, not a score modifier. A 500-follower account that
 * ticks every task still ends up COMMON unless they cross a real
 * follower milestone.
 */
export function followerTierBonus(followerCount: number | undefined): {
  label: string;
  points: number;
} {
  const n = followerCount ?? 0;
  if (n >= 20_000) return { label: "20k+ followers", points: 105 };
  if (n >= 10_000) return { label: "10k+ followers", points: 90 };
  if (n >= 2_000) return { label: "2k+ followers", points: 60 };
  if (n >= 1_000) return { label: "1k+ followers", points: 30 };
  return { label: "<1k followers", points: 0 };
}

/** Theoretical max of the overall score — used by the task meter to
 *  position tier markers correctly.
 *
 *    follower tier (max 105) + age bonus (5) + base bio (10) + jitter (10) = 130
 */
export const MAX_RARITY_SCORE = 105 + 5 + 10 + 10;

export function computeRarityScore(s: XSignals): {
  score: number;
  breakdown: Array<{ label: string; points: number }>;
} {
  const breakdown: Array<{ label: string; points: number }> = [];

  const tier = followerTierBonus(s.followerCount);
  if (tier.points > 0) {
    breakdown.push(tier);
  }

  if ((s.accountAgeDays ?? 0) >= 365) {
    breakdown.push({ label: "1yr+ account", points: 5 });
  }

  // Ecosystem signal — only picks up a bio mention (free, it's
  // already in the OAuth profile payload). Follow-checking @base
  // would need paging through /following at 75 req/15min, which
  // breaks the scale budget, so we skip it.
  if (s.bioMentionsBase) {
    breakdown.push({ label: "Base in bio", points: 10 });
  }

  // Deterministic flavour jitter (0-10) — small enough that it
  // cannot shove a user across the RARE/EPIC/LEGENDARY gates on
  // its own.
  const jitter = hashToInt(`jitter:${s.handle}`) % 11;
  if (jitter > 0) {
    breakdown.push({ label: "Founder flair", points: jitter });
  }

  const score = breakdown.reduce((sum, b) => sum + b.points, 0);
  return { score, breakdown };
}

/**
 * X-signal score → rarity tier. Score is follower-weighted so this
 * is the proportional-to-followers lookup players expect: 10k+
 * account reaches LEGENDARY floor, 2k+ reaches EPIC floor, etc.
 * Thresholds calibrated so the lowest qualifier in each tier is
 * someone who crosses the follower milestone with no other bonuses.
 */
export function scoreToRarity(score: number): Rarity {
  if (score >= 95) return "LEGENDARY"; //   10k+ followers + bonus, or 20k+
  if (score >= 65) return "EPIC";      //    2k+ followers + bonus
  if (score >= 35) return "RARE";      //    1k+ followers + bonus
  return "COMMON";
}

/**
 * Same tier lookup but keyed on the visible overall rating. Kept in
 * sync with `scoreToRarity` by design — because RARITY_FLOOR/CEIL
 * below are non-overlapping, `overallToRarity(overall)` always
 * equals `scoreToRarity(score)` for any card produced by
 * `generateCard`. Used on the display path so stale DB rows with a
 * drifted rarity column still render a coherent "82 OVR / LEGENDARY"
 * pill.
 */
export function overallToRarity(overall: number): Rarity {
  if (overall >= 82) return "LEGENDARY";
  if (overall >= 74) return "EPIC";
  if (overall >= 65) return "RARE";
  return "COMMON";
}

/** Score ranges per tier — used to pick a card's position WITHIN
 *  its tier so a score-95 LEGENDARY sits near the floor (82) and a
 *  score-125 whale sits near the ceil (92). Keeps OVR correlated
 *  with follower strength inside the same rarity. */
const RARITY_SCORE_FLOOR: Record<Rarity, number> = {
  COMMON: 0,
  RARE: 35,
  EPIC: 65,
  LEGENDARY: 95,
};
const RARITY_SCORE_CEIL: Record<Rarity, number> = {
  COMMON: 34,
  RARE: 64,
  EPIC: 94,
  LEGENDARY: 130, // == MAX_RARITY_SCORE
};

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

/** Base OVR floor + ceil per rarity. Non-overlapping by design:
 *
 *    COMMON    55 – 64     (smallacct / new accounts)
 *    RARE      65 – 73     (1k+ followers)
 *    EPIC      74 – 81     (2k+ followers, or 1k + bio)
 *    LEGENDARY 82 – 92     (10k+ followers / whales)
 *
 *  The `rollStat` helper below picks a base in [floor, ceil] weighted
 *  by where the user sits inside their tier's score range — so a
 *  just-qualified LEGENDARY (score 95) lands near 82, a whale
 *  (score 125) lands near 92. Keeps OVR monotonic with followers
 *  even within the same rarity tier. */
const RARITY_FLOOR: Record<Rarity, number> = {
  COMMON: 55,
  RARE: 65,
  EPIC: 74,
  LEGENDARY: 82,
};

const RARITY_CEIL: Record<Rarity, number> = {
  COMMON: 64,
  RARE: 73,
  EPIC: 81,
  LEGENDARY: 92,
};

export function generateCard(signals: XSignals): FounderCard {
  const handle = signals.handle.toLowerCase().replace(/^@/, "");
  const display = signals.displayName || handle;

  const { score, breakdown } = computeRarityScore({ ...signals, handle });
  const rarity = scoreToRarity(score);

  // Tier progress = how deep the user's score sits inside their
  // rarity's score band (0 = just qualified, 1 = near next tier).
  // Used below to bias stat base values up/down so a whale at the
  // ceiling of LEGENDARY lands near OVR 92 while someone who just
  // crossed the LEGENDARY floor lands near 82.
  const scoreFloor = RARITY_SCORE_FLOOR[rarity];
  const scoreCeil = RARITY_SCORE_CEIL[rarity];
  const scoreSpan = Math.max(1, scoreCeil - scoreFloor);
  const tierProgress = Math.max(
    0,
    Math.min(1, (score - scoreFloor) / scoreSpan)
  );

  // Pick position from a hash of the handle — stable across re-rolls.
  const positionIdx = hashToInt(`pos:${handle}`) % POSITIONS.length;
  const position = POSITIONS[positionIdx];

  // Six per-stat deterministic rolls in [floor, ceil], biased toward
  // the top of the band when tierProgress is high. Position weights
  // then tilt individual stats — the weighted average (OVR) stays
  // inside the rarity's OVR range thanks to the ceil clamp.
  const floor = RARITY_FLOOR[rarity];
  const ceil = RARITY_CEIL[rarity];
  const weights = POSITION_WEIGHTS[position];

  const raw: FounderStats = {
    pace:      rollStat(handle, "pace",      floor, ceil, weights.pace,      tierProgress),
    shooting:  rollStat(handle, "shooting",  floor, ceil, weights.shooting,  tierProgress),
    passing:   rollStat(handle, "passing",   floor, ceil, weights.passing,   tierProgress),
    dribbling: rollStat(handle, "dribbling", floor, ceil, weights.dribbling, tierProgress),
    defending: rollStat(handle, "defending", floor, ceil, weights.defending, tierProgress),
    physical:  rollStat(handle, "physical",  floor, ceil, weights.physical,  tierProgress),
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

function rollStat(
  handle: string,
  key: string,
  floor: number,
  ceil: number,
  weight: number,
  tierProgress: number
): number {
  const h = hashToInt(`${key}:${handle}`);
  const range = ceil - floor;
  // Split the rarity's OVR range into a SCORE-driven component (60%)
  // and a HANDLE-driven component (40%). Higher tierProgress pushes
  // the base up by a larger share; the handle hash still jiggles
  // each stat so two users in the exact same score tier don't end
  // up with identical cards.
  const scoreShare = Math.round(tierProgress * range * 0.6);
  const hashSpan = Math.max(1, Math.round(range * 0.4));
  const base = floor + scoreShare + (h % (hashSpan + 1));

  // Position tilt — pushes key stats up (pace for a winger,
  // defending for a CB). Clamp to ceil so tilt can't leak a stat
  // above the tier's OVR band.
  const tilt = Math.round((weight - 1) * 6);
  return clamp(base + tilt, floor, ceil);
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
