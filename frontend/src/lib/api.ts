/* ================================================================== */
/*  API Client — talks to the Express backend at /api/*                */
/* ================================================================== */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }

  return res.json();
}

// ─── Users ──────────────────────────────────────────────────────────
export async function connectUser(walletAddress: string) {
  return request("/users/connect", {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
  });
}

export async function getUser(walletAddress: string) {
  return request(`/users/${walletAddress}`);
}

export async function getUserStats(walletAddress: string) {
  return request(`/users/${walletAddress}/stats`);
}

// ─── Stats ──────────────────────────────────────────────────────────
export async function getSiteStats(): Promise<{
  agents: number;
  players: number;
  users: number;
  packTiers: number;
  liveMatches: number;
}> {
  return request("/agents/stats");
}

// ─── Agents ─────────────────────────────────────────────────────────
export async function getAgents(filters?: {
  position?: string;
  rarity?: string;
  techStack?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.position) params.set("position", filters.position);
  if (filters?.rarity) params.set("rarity", filters.rarity);
  if (filters?.techStack) params.set("techStack", filters.techStack);
  if (filters?.search) params.set("search", filters.search);

  const qs = params.toString();
  return request(`/agents${qs ? `?${qs}` : ""}`);
}

export async function seedAgents(agents: unknown[]) {
  return request("/agents/seed", {
    method: "POST",
    body: JSON.stringify({ agents }),
  });
}

// ─── Packs ──────────────────────────────────────────────────────────
/**
 * Called after the frontend has already submitted
 * AgentsCupPackStore.buyPack() on-chain. `txHash` is the keccak hash
 * of that tx — the backend decodes the PackPurchased event, verifies
 * buyer + amount match, then rolls cards.
 */
export async function openPack(
  walletAddress: string,
  packType: string,
  txHash: string
) {
  return request<{ cards: unknown[]; already_processed?: boolean }>(
    "/packs/open",
    {
      method: "POST",
      body: JSON.stringify({ walletAddress, packType, txHash }),
    }
  );
}

export async function getPackTypes() {
  return request("/packs/types");
}

// ─── Squads ─────────────────────────────────────────────────────────
export async function getSquads(walletAddress: string) {
  return request(`/squads/${walletAddress}`);
}

export async function createSquad(data: {
  walletAddress: string;
  name?: string;
  formation?: string;
  positions?: Record<string, string>;
  managerId?: string;
}) {
  return request("/squads", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSquad(
  id: string,
  data: Record<string, unknown>
) {
  return request(`/squads/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ─── Matches ────────────────────────────────────────────────────────
export async function simulateMatch(data: {
  walletAddress: string;
  homeSquad: unknown;
  awaySquad: unknown;
  seed?: number;
}) {
  return request("/matches/simulate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getMatch(id: string) {
  return request(`/matches/${id}`);
}

export async function getUserMatches(walletAddress: string) {
  return request(`/matches/user/${walletAddress}`);
}

// ─── Marketplace ────────────────────────────────────────────────────
export async function getListings() {
  return request("/marketplace/listings");
}

export async function getMarketplaceStats(): Promise<{
  activeListings: number;
  totalTrades: number;
  totalVolume: number;
  floorPrice: number;
}> {
  return request("/marketplace/stats");
}

export interface TradeHistoryRow {
  id: string;
  seller_wallet: string;
  seller_evm_address: string | null;
  /** Legacy col — holds wei on Base, $CUP base units on Solana rows. */
  price_cup: number | null;
  /** Canonical wei price string (Base only). */
  price_wei: string | null;
  tx_signature: string;
  created_at: string;
  user_agents?: {
    agents?: {
      name: string;
      rarity: string;
      position: string;
      overall: number;
      image_url?: string;
    };
  };
}

export async function getTradeHistory(limit = 20): Promise<TradeHistoryRow[]> {
  return request(`/marketplace/history?limit=${limit}`);
}

/**
 * Creates the DB mirror of a listing the seller just posted on-chain.
 * `listingIdHex` is the same bytes32 the seller passed to
 * AgentsCupMarketplace.listAgent — it's how buyers later resolve the
 * DB row back to the on-chain slot.
 */
export async function listAgent(data: {
  walletAddress: string;
  userAgentId: string;
  /** Wei price as a decimal string (JSON-safe bigint). */
  priceWei: string;
  /** 0x-prefixed 32-byte hex string. */
  listingIdHex: string;
  listingType?: string;
}) {
  return request("/marketplace/list", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function buyAgent(data: {
  buyerWallet: string;
  listingId: string;
  txHash: string;
}) {
  return request("/marketplace/buy", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function cancelListing(
  id: string,
  walletAddress: string
) {
  return request(`/marketplace/cancel/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ walletAddress }),
  });
}

// ─── Leaderboard ────────────────────────────────────────────────────
export async function getLeaderboard() {
  return request("/leaderboard");
}

export async function updateTeamName(
  walletAddress: string,
  teamName: string
) {
  return request("/leaderboard/team-name", {
    method: "PUT",
    body: JSON.stringify({ walletAddress, teamName }),
  });
}
