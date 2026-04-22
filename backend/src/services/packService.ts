import { supabase } from "../lib/supabase";
import crypto from "crypto";

/**
 * Pack prices are stored twice: once as human-readable ETH for
 * display, and once as wei (BigInt-safe string) for on-chain
 * verification. The frontend sends the wei amount when it calls
 * AgentsCupPackStore.buyPack, and the backend's verifier compares
 * bit-for-bit against `priceWei` below.
 *
 * Tune these numbers by editing this file + bumping tiers; no
 * redeploy of the smart contract is needed since the PackStore
 * contract accepts any amount (the event records what was paid,
 * we validate the amount matches the tier's configured price).
 */
export const PACK_CONFIGS = {
  starter: {
    name: "Starter Pack",
    tier: 1,
    priceEth: "0.002",
    priceWei: "2000000000000000", // 0.002 ETH
    cardCount: 4,
    rareGuarantee: 0,
    epicChance: 0.02,
    legendaryChance: 0.003,
    description: "4 cards — mostly common, small rare chance",
  },
  pro: {
    name: "Pro Pack",
    tier: 2,
    priceEth: "0.004",
    priceWei: "4000000000000000", // 0.004 ETH
    cardCount: 7,
    rareGuarantee: 1,
    epicChance: 0.05,
    legendaryChance: 0.008,
    description: "7 cards with 1 guaranteed rare+",
  },
  elite: {
    name: "Elite Pack",
    tier: 3,
    priceEth: "0.015",
    priceWei: "15000000000000000", // 0.015 ETH
    cardCount: 12,
    rareGuarantee: 3,
    epicChance: 0.25,
    legendaryChance: 0.05,
    description: "12 cards with 3 guaranteed rare+ and 25% epic odds",
  },
  legendary: {
    name: "Legendary Pack",
    tier: 4,
    priceEth: "0.05",
    priceWei: "50000000000000000", // 0.05 ETH
    cardCount: 15,
    rareGuarantee: 5,
    epicChance: 0.35,
    legendaryChance: 0.2,
    description: "15 cards with 5 guaranteed rare+ and 20% legendary odds",
  },
} as const;

export type PackType = keyof typeof PACK_CONFIGS;

/** Reverse-lookup: given a numeric on-chain pack tier, return the key. */
export function packTypeFromTier(tier: number): PackType | null {
  for (const [key, cfg] of Object.entries(PACK_CONFIGS)) {
    if (cfg.tier === tier) return key as PackType;
  }
  return null;
}

interface AgentRow {
  id: string;
  rarity: string;
}

/**
 * Select random agent IDs based on pack rarity distribution.
 * This is a PURE function — no DB writes. DB writes happen atomically in the PostgreSQL function.
 */
export async function selectPackCards(
  packType: string
): Promise<{ agentIds: string[]; mintAddresses: string[] }> {
  const config = PACK_CONFIGS[packType as keyof typeof PACK_CONFIGS];
  if (!config) throw new Error("Invalid pack type");

  // Fetch all agents (including managers) from DB
  const { data: allAgents, error } = await supabase
    .from("agents")
    .select("id, rarity");

  if (error || !allAgents || allAgents.length === 0) {
    throw new Error("No agents found in database. Run seed first.");
  }

  const byRarity: Record<string, AgentRow[]> = {
    common: allAgents.filter((a) => a.rarity === "common"),
    rare: allAgents.filter((a) => a.rarity === "rare"),
    epic: allAgents.filter((a) => a.rarity === "epic"),
    legendary: allAgents.filter((a) => a.rarity === "legendary"),
  };

  const agentIds: string[] = [];
  const mintAddresses: string[] = [];

  for (let i = 0; i < config.cardCount; i++) {
    let rarity: string;

    if (i < config.rareGuarantee) {
      const roll = Math.random();
      if (roll < config.legendaryChance) rarity = "legendary";
      else if (roll < config.epicChance) rarity = "epic";
      else rarity = "rare";
    } else {
      const roll = Math.random();
      // Non-guaranteed slots: halved epic/legendary chance, rare chance scales with pack tier
      const rareFloor = packType === "starter" ? 0.12
                      : packType === "pro"     ? 0.18
                      : packType === "elite"   ? 0.30
                      : 0.35;
      if (roll < config.legendaryChance * 0.5) rarity = "legendary";
      else if (roll < config.epicChance * 0.5) rarity = "epic";
      else if (roll < rareFloor) rarity = "rare";
      else rarity = "common";
    }

    const pool = byRarity[rarity];
    if (pool.length === 0) {
      const fallback = byRarity.common;
      agentIds.push(fallback[Math.floor(Math.random() * fallback.length)].id);
    } else {
      agentIds.push(pool[Math.floor(Math.random() * pool.length)].id);
    }

    mintAddresses.push(`mint_${crypto.randomBytes(16).toString("hex")}`);
  }

  return { agentIds, mintAddresses };
}
