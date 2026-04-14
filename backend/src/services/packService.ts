import { supabase } from "../lib/supabase";
import crypto from "crypto";

export const PACK_CONFIGS = {
  starter: {
    name: "Starter Pack",
    priceSol: 0.1,
    cardCount: 5,
    rareGuarantee: 0,
    epicChance: 0.02,
    legendaryChance: 0.003,
    description: "5 cards — mostly common, small rare chance",
  },
  pro: {
    name: "Pro Pack",
    priceSol: 0.25,
    cardCount: 8,
    rareGuarantee: 1,
    epicChance: 0.05,
    legendaryChance: 0.008,
    description: "8 cards with 1 guaranteed rare+",
  },
  elite: {
    name: "Elite Pack",
    priceSol: 0.5,
    cardCount: 12,
    rareGuarantee: 3,
    epicChance: 0.2,
    legendaryChance: 0.05,
    description: "12 cards with 3 guaranteed rare+",
  },
  legendary: {
    name: "Legendary Pack",
    priceSol: 1.0,
    cardCount: 15,
    rareGuarantee: 5,
    epicChance: 0.35,
    legendaryChance: 0.15,
    description: "15 cards with 5 guaranteed rare+ and high legendary chance",
  },
} as const;

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
